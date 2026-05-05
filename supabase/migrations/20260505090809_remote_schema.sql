


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "api";


ALTER SCHEMA "api" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "expensio";


ALTER SCHEMA "expensio" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "printq";


ALTER SCHEMA "printq" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "postgres_fdw" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "expensio"."expensio_assert_expense_payload"("p_workspace_id" "uuid", "p_category_id" "uuid", "p_paid_by_user_id" "uuid", "p_description" "text", "p_amount_minor" bigint, "p_currency_code" "text", "p_expense_date" "date", "p_actor" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'expensio', 'public'
    AS $_$
DECLARE
  normalized_currency TEXT;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.';
  END IF;

  IF NOT expensio.expensio_is_workspace_member(p_workspace_id, p_actor) THEN
    RAISE EXCEPTION 'You are not an active member of this workspace.';
  END IF;

  IF NOT expensio.expensio_is_workspace_member(p_workspace_id, p_paid_by_user_id) THEN
    RAISE EXCEPTION 'The payer must be an active workspace member.';
  END IF;

  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM expensio.expensio_categories c
    WHERE c.id = p_category_id
      AND (c.workspace_id = p_workspace_id OR c.workspace_id IS NULL)
      AND c.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Category does not belong to this workspace.';
  END IF;

  IF p_description IS NULL OR char_length(trim(p_description)) = 0 THEN
    RAISE EXCEPTION 'Description is required.';
  END IF;

  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'Expense amount must be greater than zero.';
  END IF;

  IF p_expense_date IS NULL THEN
    RAISE EXCEPTION 'Expense date is required.';
  END IF;

  normalized_currency := upper(trim(COALESCE(p_currency_code, '')));
  IF normalized_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency code must be a 3-letter ISO code.';
  END IF;

  RETURN normalized_currency;
END;
$_$;


ALTER FUNCTION "expensio"."expensio_assert_expense_payload"("p_workspace_id" "uuid", "p_category_id" "uuid", "p_paid_by_user_id" "uuid", "p_description" "text", "p_amount_minor" bigint, "p_currency_code" "text", "p_expense_date" "date", "p_actor" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."expensio_can_manage_workspace"("p_workspace_id" "uuid", "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'expensio', 'public'
    AS $$
  SELECT expensio.expensio_workspace_role(p_workspace_id, p_user_id) IN ('owner', 'admin')
    AND expensio.expensio_has_product_access(p_user_id);
$$;


ALTER FUNCTION "expensio"."expensio_can_manage_workspace"("p_workspace_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."expensio_can_mutate_expense"("p_expense_id" "uuid", "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'expensio', 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM expensio.expensio_expenses e
    WHERE e.id = p_expense_id
      AND e.deleted_at IS NULL
      AND (
        e.created_by = p_user_id
        OR expensio.expensio_can_manage_workspace(e.workspace_id, p_user_id)
      )
      AND expensio.expensio_is_workspace_member(e.workspace_id, p_user_id)
  );
$$;


ALTER FUNCTION "expensio"."expensio_can_mutate_expense"("p_expense_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."expensio_create_expense"("p_workspace_id" "uuid", "p_category_id" "uuid", "p_paid_by_user_id" "uuid", "p_description" "text", "p_note" "text", "p_amount_minor" bigint, "p_currency_code" "text", "p_expense_date" "date", "p_split_type" "text", "p_splits" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'expensio', 'public'
    AS $$
DECLARE
  actor UUID := auth.uid();
  expense_id UUID;
  normalized_currency TEXT;
  normalized_split_type TEXT := COALESCE(NULLIF(trim(p_split_type), ''), 'exact');
BEGIN
  normalized_currency := expensio.expensio_assert_expense_payload(
    p_workspace_id,
    p_category_id,
    p_paid_by_user_id,
    p_description,
    p_amount_minor,
    p_currency_code,
    p_expense_date,
    actor
  );

  IF normalized_split_type NOT IN ('equal', 'selected_equal', 'percentage', 'exact', 'ratio', 'shares') THEN
    RAISE EXCEPTION 'Unsupported split type.';
  END IF;

  INSERT INTO expensio.expensio_expenses (
    workspace_id,
    category_id,
    paid_by_user_id,
    description,
    note,
    amount_minor,
    currency_code,
    expense_date,
    split_type,
    created_by,
    updated_by
  )
  VALUES (
    p_workspace_id,
    p_category_id,
    p_paid_by_user_id,
    trim(p_description),
    NULLIF(trim(COALESCE(p_note, '')), ''),
    p_amount_minor,
    normalized_currency,
    p_expense_date,
    normalized_split_type,
    actor,
    actor
  )
  RETURNING id INTO expense_id;

  PERFORM expensio.expensio_replace_expense_splits(expense_id, p_workspace_id, p_amount_minor, p_splits);

  INSERT INTO expensio.expensio_activities (workspace_id, actor_user_id, entity_type, entity_id, action, metadata)
  VALUES (
    p_workspace_id,
    actor,
    'expense',
    expense_id,
    'created',
    jsonb_build_object(
      'amount_minor', p_amount_minor,
      'currency_code', normalized_currency,
      'split_type', normalized_split_type
    )
  );

  RETURN expense_id;
END;
$$;


ALTER FUNCTION "expensio"."expensio_create_expense"("p_workspace_id" "uuid", "p_category_id" "uuid", "p_paid_by_user_id" "uuid", "p_description" "text", "p_note" "text", "p_amount_minor" bigint, "p_currency_code" "text", "p_expense_date" "date", "p_split_type" "text", "p_splits" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."expensio_create_invite"("p_workspace_id" "uuid", "p_expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval), "p_max_uses" integer DEFAULT NULL::integer) RETURNS TABLE("id" "uuid", "code" "text", "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'expensio', 'public'
    AS $$
DECLARE
  v_id UUID;
  v_code TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT expensio.expensio_can_manage_workspace(p_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only workspace owners and admins can create invites.';
  END IF;

  LOOP
    v_code := upper(encode(gen_random_bytes(6), 'hex'));
    BEGIN
      INSERT INTO expensio.expensio_workspace_invites (workspace_id, code, created_by, expires_at, max_uses)
      VALUES (p_workspace_id, v_code, auth.uid(), p_expires_at, p_max_uses)
      RETURNING expensio_workspace_invites.id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- Retry on the extremely unlikely chance of a random code collision.
    END;
  END LOOP;

  RETURN QUERY SELECT v_id, v_code, p_expires_at;
END;
$$;


ALTER FUNCTION "expensio"."expensio_create_invite"("p_workspace_id" "uuid", "p_expires_at" timestamp with time zone, "p_max_uses" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."expensio_create_personal_workspace"("p_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'expensio', 'public'
    AS $$
DECLARE
  workspace_id UUID;
  user_name TEXT;
BEGIN
  SELECT id INTO workspace_id
  FROM expensio.expensio_workspaces
  WHERE owner_id = p_user_id
    AND workspace_type = 'personal'
    AND archived_at IS NULL
  LIMIT 1;

  IF workspace_id IS NOT NULL THEN
    RETURN workspace_id;
  END IF;

  SELECT COALESCE(NULLIF(trim(full_name), ''), split_part(email, '@', 1), 'Personal')
  INTO user_name
  FROM public.profiles
  WHERE id = p_user_id;

  INSERT INTO expensio.expensio_workspaces (owner_id, name, workspace_type)
  VALUES (p_user_id, user_name || '''s Personal Workspace', 'personal')
  RETURNING id INTO workspace_id;

  INSERT INTO expensio.expensio_workspace_members (workspace_id, user_id, role, status, joined_at)
  VALUES (workspace_id, p_user_id, 'owner', 'active', now());

  PERFORM expensio.expensio_seed_default_categories(workspace_id, p_user_id);

  INSERT INTO expensio.expensio_activities (workspace_id, actor_user_id, entity_type, entity_id, action, metadata)
  VALUES (
    workspace_id,
    p_user_id,
    'workspace',
    workspace_id,
    'created',
    jsonb_build_object('workspace_type', 'personal', 'source', 'profile_trigger')
  );

  RETURN workspace_id;
END;
$$;


ALTER FUNCTION "expensio"."expensio_create_personal_workspace"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."expensio_create_settlement"("p_workspace_id" "uuid", "p_from_user_id" "uuid", "p_to_user_id" "uuid", "p_amount_minor" bigint, "p_currency_code" "text", "p_note" "text" DEFAULT NULL::"text", "p_settled_at" timestamp with time zone DEFAULT "now"()) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'expensio', 'public'
    AS $_$
DECLARE
  actor UUID := auth.uid();
  settlement_id UUID;
  normalized_currency TEXT;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.';
  END IF;

  IF NOT expensio.expensio_is_workspace_member(p_workspace_id, actor) THEN
    RAISE EXCEPTION 'You are not an active member of this workspace.';
  END IF;

  IF NOT expensio.expensio_is_workspace_member(p_workspace_id, p_from_user_id) THEN
    RAISE EXCEPTION 'Settlement payer must be an active workspace member.';
  END IF;

  IF NOT expensio.expensio_is_workspace_member(p_workspace_id, p_to_user_id) THEN
    RAISE EXCEPTION 'Settlement receiver must be an active workspace member.';
  END IF;

  IF p_from_user_id = p_to_user_id THEN
    RAISE EXCEPTION 'Settlement payer and receiver must be different.';
  END IF;

  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'Settlement amount must be greater than zero.';
  END IF;

  normalized_currency := upper(trim(COALESCE(p_currency_code, '')));
  IF normalized_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency code must be a 3-letter ISO code.';
  END IF;

  INSERT INTO expensio.expensio_settlements (
    workspace_id,
    from_user_id,
    to_user_id,
    amount_minor,
    currency_code,
    note,
    settled_at,
    created_by
  )
  VALUES (
    p_workspace_id,
    p_from_user_id,
    p_to_user_id,
    p_amount_minor,
    normalized_currency,
    NULLIF(trim(COALESCE(p_note, '')), ''),
    COALESCE(p_settled_at, now()),
    actor
  )
  RETURNING id INTO settlement_id;

  INSERT INTO expensio.expensio_activities (workspace_id, actor_user_id, entity_type, entity_id, action, metadata)
  VALUES (
    p_workspace_id,
    actor,
    'settlement',
    settlement_id,
    'created',
    jsonb_build_object(
      'from_user_id', p_from_user_id,
      'to_user_id', p_to_user_id,
      'amount_minor', p_amount_minor,
      'currency_code', normalized_currency
    )
  );

  RETURN settlement_id;
END;
$_$;


ALTER FUNCTION "expensio"."expensio_create_settlement"("p_workspace_id" "uuid", "p_from_user_id" "uuid", "p_to_user_id" "uuid", "p_amount_minor" bigint, "p_currency_code" "text", "p_note" "text", "p_settled_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."expensio_create_workspace"("p_name" "text", "p_currency_code" "text" DEFAULT 'INR'::"text", "p_timezone" "text" DEFAULT 'Asia/Kolkata'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'expensio', 'public'
    AS $_$
DECLARE
  actor UUID := auth.uid();
  workspace_id UUID;
  normalized_currency TEXT;
  normalized_timezone TEXT;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.';
  END IF;

  IF NOT expensio.expensio_has_product_access(actor) THEN
    RAISE EXCEPTION 'Expensio product access is required.';
  END IF;

  IF p_name IS NULL OR char_length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Workspace name is required.';
  END IF;

  normalized_currency := upper(trim(COALESCE(p_currency_code, 'INR')));
  IF normalized_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency code must be a 3-letter ISO code.';
  END IF;

  normalized_timezone := NULLIF(trim(COALESCE(p_timezone, '')), '');
  IF normalized_timezone IS NULL THEN
    normalized_timezone := 'Asia/Kolkata';
  END IF;

  INSERT INTO expensio.expensio_workspaces (owner_id, name, workspace_type, currency_code, timezone)
  VALUES (actor, trim(p_name), 'group', normalized_currency, normalized_timezone)
  RETURNING id INTO workspace_id;

  INSERT INTO expensio.expensio_workspace_members (workspace_id, user_id, role, status, display_name, joined_at)
  VALUES (
    workspace_id,
    actor,
    'owner',
    'active',
    expensio.expensio_profile_display_name(actor),
    now()
  );

  PERFORM expensio.expensio_seed_default_categories(workspace_id, actor);

  INSERT INTO expensio.expensio_activities (workspace_id, actor_user_id, entity_type, entity_id, action, metadata)
  VALUES (
    workspace_id,
    actor,
    'workspace',
    workspace_id,
    'created',
    jsonb_build_object('workspace_type', 'group')
  );

  RETURN workspace_id;
END;
$_$;


ALTER FUNCTION "expensio"."expensio_create_workspace"("p_name" "text", "p_currency_code" "text", "p_timezone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."expensio_delete_expense"("p_expense_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'expensio', 'public'
    AS $$
DECLARE
  actor UUID := auth.uid();
  existing_expense expensio.expensio_expenses%ROWTYPE;
BEGIN
  SELECT *
  INTO existing_expense
  FROM expensio.expensio_expenses
  WHERE id = p_expense_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found.';
  END IF;

  IF NOT expensio.expensio_can_mutate_expense(p_expense_id, actor) THEN
    RAISE EXCEPTION 'You cannot delete this expense.';
  END IF;

  UPDATE expensio.expensio_expenses
  SET deleted_at = now(),
      updated_by = actor
  WHERE id = p_expense_id;

  INSERT INTO expensio.expensio_activities (workspace_id, actor_user_id, entity_type, entity_id, action, metadata)
  VALUES (
    existing_expense.workspace_id,
    actor,
    'expense',
    p_expense_id,
    'deleted',
    jsonb_build_object(
      'amount_minor', existing_expense.amount_minor,
      'currency_code', existing_expense.currency_code
    )
  );

  RETURN p_expense_id;
END;
$$;


ALTER FUNCTION "expensio"."expensio_delete_expense"("p_expense_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."expensio_delete_settlement"("p_settlement_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'expensio', 'public'
    AS $$
DECLARE
  actor UUID := auth.uid();
  existing_settlement expensio.expensio_settlements%ROWTYPE;
BEGIN
  SELECT *
  INTO existing_settlement
  FROM expensio.expensio_settlements
  WHERE id = p_settlement_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement not found.';
  END IF;

  IF actor IS NULL OR NOT expensio.expensio_is_workspace_member(existing_settlement.workspace_id, actor) THEN
    RAISE EXCEPTION 'You are not an active member of this workspace.';
  END IF;

  IF existing_settlement.created_by <> actor
    AND NOT expensio.expensio_can_manage_workspace(existing_settlement.workspace_id, actor) THEN
    RAISE EXCEPTION 'Only the creator or workspace admins can delete this settlement.';
  END IF;

  UPDATE expensio.expensio_settlements
  SET deleted_at = now()
  WHERE id = p_settlement_id;

  INSERT INTO expensio.expensio_activities (workspace_id, actor_user_id, entity_type, entity_id, action, metadata)
  VALUES (
    existing_settlement.workspace_id,
    actor,
    'settlement',
    p_settlement_id,
    'deleted',
    jsonb_build_object(
      'from_user_id', existing_settlement.from_user_id,
      'to_user_id', existing_settlement.to_user_id,
      'amount_minor', existing_settlement.amount_minor,
      'currency_code', existing_settlement.currency_code
    )
  );

  RETURN p_settlement_id;
END;
$$;


ALTER FUNCTION "expensio"."expensio_delete_settlement"("p_settlement_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."expensio_handle_new_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'expensio', 'public'
    AS $$
BEGIN
  PERFORM expensio.expensio_create_personal_workspace(NEW.id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "expensio"."expensio_handle_new_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."expensio_has_product_access"("target_user" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'expensio', 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.product_memberships pm
    JOIN public.products p ON p.id = pm.product_id
    WHERE pm.user_id = target_user
      AND p.name = 'expensio'
      AND p.active = true
      AND pm.status = 'active'
  );
$$;


ALTER FUNCTION "expensio"."expensio_has_product_access"("target_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."expensio_is_workspace_member"("p_workspace_id" "uuid", "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'expensio', 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM expensio.expensio_workspace_members m
    JOIN expensio.expensio_workspaces w ON w.id = m.workspace_id
    WHERE m.workspace_id = p_workspace_id
      AND m.user_id = p_user_id
      AND m.status = 'active'
      AND w.archived_at IS NULL
      AND expensio.expensio_has_product_access(p_user_id)
  );
$$;


ALTER FUNCTION "expensio"."expensio_is_workspace_member"("p_workspace_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."expensio_join_workspace"("p_code" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'expensio', 'public'
    AS $$
DECLARE
  v_invite expensio.expensio_workspace_invites%ROWTYPE;
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.';
  END IF;

  IF NOT expensio.expensio_has_product_access(v_user) THEN
    RAISE EXCEPTION 'Expensio product access is required.';
  END IF;

  SELECT *
  INTO v_invite
  FROM expensio.expensio_workspace_invites
  WHERE code = upper(trim(p_code))
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite code is invalid.';
  END IF;

  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    UPDATE expensio.expensio_workspace_invites
    SET status = 'expired', updated_at = now()
    WHERE id = v_invite.id;
    RAISE EXCEPTION 'Invite code has expired.';
  END IF;

  IF v_invite.max_uses IS NOT NULL AND v_invite.uses_count >= v_invite.max_uses THEN
    UPDATE expensio.expensio_workspace_invites
    SET status = 'expired', updated_at = now()
    WHERE id = v_invite.id;
    RAISE EXCEPTION 'Invite code has no remaining uses.';
  END IF;

  INSERT INTO expensio.expensio_workspace_members (
    workspace_id,
    user_id,
    role,
    status,
    display_name,
    joined_at,
    removed_at
  )
  VALUES (
    v_invite.workspace_id,
    v_user,
    'member',
    'active',
    expensio.expensio_profile_display_name(v_user),
    now(),
    NULL
  )
  ON CONFLICT (workspace_id, user_id)
  DO UPDATE SET
    status = 'active',
    display_name = COALESCE(expensio.expensio_workspace_members.display_name, expensio.expensio_profile_display_name(v_user)),
    role = CASE
      WHEN expensio.expensio_workspace_members.role = 'owner' THEN 'owner'
      ELSE 'member'
    END,
    joined_at = COALESCE(expensio.expensio_workspace_members.joined_at, now()),
    removed_at = NULL,
    updated_at = now();

  UPDATE expensio.expensio_workspace_invites
  SET uses_count = uses_count + 1,
      updated_at = now()
  WHERE id = v_invite.id;

  INSERT INTO expensio.expensio_activities (workspace_id, actor_user_id, entity_type, entity_id, action, metadata)
  VALUES (
    v_invite.workspace_id,
    v_user,
    'member',
    v_user,
    'joined',
    jsonb_build_object('invite_id', v_invite.id)
  );

  RETURN v_invite.workspace_id;
END;
$$;


ALTER FUNCTION "expensio"."expensio_join_workspace"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."expensio_log_activity"("p_workspace_id" "uuid", "p_entity_type" "text", "p_entity_id" "uuid", "p_action" "text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'expensio', 'public'
    AS $$
DECLARE
  activity_id UUID;
  actor UUID := auth.uid();
BEGIN
  IF actor IS NULL OR NOT expensio.expensio_is_workspace_member(p_workspace_id, actor) THEN
    RAISE EXCEPTION 'Not allowed to log activity for this workspace.';
  END IF;

  INSERT INTO expensio.expensio_activities (workspace_id, actor_user_id, entity_type, entity_id, action, metadata)
  VALUES (p_workspace_id, actor, p_entity_type, p_entity_id, p_action, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO activity_id;

  RETURN activity_id;
END;
$$;


ALTER FUNCTION "expensio"."expensio_log_activity"("p_workspace_id" "uuid", "p_entity_type" "text", "p_entity_id" "uuid", "p_action" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."expensio_prevent_last_owner_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  active_owner_count INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'owner' AND OLD.status = 'active' THEN
      SELECT count(*) INTO active_owner_count
      FROM expensio.expensio_workspace_members
      WHERE workspace_id = OLD.workspace_id
        AND role = 'owner'
        AND status = 'active'
        AND id <> OLD.id;

      IF active_owner_count = 0 THEN
        RAISE EXCEPTION 'A workspace must keep at least one active owner.';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.role = 'owner'
    AND OLD.status = 'active'
    AND (NEW.role <> 'owner' OR NEW.status <> 'active') THEN
    SELECT count(*) INTO active_owner_count
    FROM expensio.expensio_workspace_members
    WHERE workspace_id = OLD.workspace_id
      AND role = 'owner'
      AND status = 'active'
      AND id <> OLD.id;

    IF active_owner_count = 0 THEN
      RAISE EXCEPTION 'A workspace must keep at least one active owner.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "expensio"."expensio_prevent_last_owner_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."expensio_profile_display_name"("p_user_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'expensio', 'public'
    AS $$
  SELECT COALESCE(NULLIF(trim(full_name), ''), split_part(email, '@', 1), 'Member')
  FROM public.profiles
  WHERE id = p_user_id;
$$;


ALTER FUNCTION "expensio"."expensio_profile_display_name"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."expensio_remove_member"("p_workspace_id" "uuid", "p_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'expensio', 'public'
    AS $$
DECLARE
  actor UUID := auth.uid();
  actor_role TEXT;
  target_role TEXT;
  target_workspace_type TEXT;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.';
  END IF;

  SELECT workspace_type
  INTO target_workspace_type
  FROM expensio.expensio_workspaces
  WHERE id = p_workspace_id
    AND archived_at IS NULL;

  IF target_workspace_type IS NULL THEN
    RAISE EXCEPTION 'Workspace not found.';
  END IF;

  IF target_workspace_type = 'personal' THEN
    RAISE EXCEPTION 'Personal workspace members cannot be removed.';
  END IF;

  actor_role := expensio.expensio_workspace_role(p_workspace_id, actor);
  target_role := expensio.expensio_workspace_role(p_workspace_id, p_user_id);

  IF actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners and admins can remove members.';
  END IF;

  IF target_role IS NULL THEN
    RAISE EXCEPTION 'Target member is not active in this workspace.';
  END IF;

  IF actor_role <> 'owner' AND target_role IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Admins can only remove regular members.';
  END IF;

  UPDATE expensio.expensio_workspace_members
  SET status = 'removed',
      removed_at = now()
  WHERE workspace_id = p_workspace_id
    AND user_id = p_user_id
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found.';
  END IF;

  INSERT INTO expensio.expensio_activities (workspace_id, actor_user_id, entity_type, entity_id, action, metadata)
  VALUES (
    p_workspace_id,
    actor,
    'member',
    p_user_id,
    'removed',
    jsonb_build_object('previous_role', target_role)
  );

  RETURN p_user_id;
END;
$$;


ALTER FUNCTION "expensio"."expensio_remove_member"("p_workspace_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."expensio_replace_expense_splits"("p_expense_id" "uuid", "p_workspace_id" "uuid", "p_amount_minor" bigint, "p_splits" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'expensio', 'public'
    AS $$
DECLARE
  split_row JSONB;
  split_user UUID;
  split_amount BIGINT;
  split_total BIGINT := 0;
  seen_users UUID[] := ARRAY[]::UUID[];
  percentage_basis_points INTEGER;
  ratio_parts INTEGER;
BEGIN
  IF p_splits IS NULL OR jsonb_typeof(p_splits) <> 'array' OR jsonb_array_length(p_splits) = 0 THEN
    RAISE EXCEPTION 'At least one split is required.';
  END IF;

  DELETE FROM expensio.expensio_expense_splits
  WHERE expense_id = p_expense_id;

  FOR split_row IN SELECT value FROM jsonb_array_elements(p_splits)
  LOOP
    IF NOT split_row ? 'user_id' OR NOT split_row ? 'amount_minor' THEN
      RAISE EXCEPTION 'Every split requires user_id and amount_minor.';
    END IF;

    split_user := (split_row->>'user_id')::uuid;
    split_amount := (split_row->>'amount_minor')::bigint;
    percentage_basis_points := NULLIF(split_row->>'percentage_basis_points', '')::integer;
    ratio_parts := NULLIF(split_row->>'ratio_parts', '')::integer;

    IF split_user = ANY(seen_users) THEN
      RAISE EXCEPTION 'A user can only appear once in an expense split.';
    END IF;

    IF split_amount < 0 THEN
      RAISE EXCEPTION 'Split amounts cannot be negative.';
    END IF;

    IF percentage_basis_points IS NOT NULL
      AND (percentage_basis_points < 0 OR percentage_basis_points > 10000) THEN
      RAISE EXCEPTION 'Percentage split values must be between 0 and 10000 basis points.';
    END IF;

    IF ratio_parts IS NOT NULL AND ratio_parts <= 0 THEN
      RAISE EXCEPTION 'Ratio/share split parts must be greater than zero.';
    END IF;

    IF NOT expensio.expensio_is_workspace_member(p_workspace_id, split_user) THEN
      RAISE EXCEPTION 'Every split participant must be an active workspace member.';
    END IF;

    INSERT INTO expensio.expensio_expense_splits (
      expense_id,
      user_id,
      amount_minor,
      percentage_basis_points,
      ratio_parts
    )
    VALUES (
      p_expense_id,
      split_user,
      split_amount,
      percentage_basis_points,
      ratio_parts
    );

    seen_users := array_append(seen_users, split_user);
    split_total := split_total + split_amount;
  END LOOP;

  IF split_total <> p_amount_minor THEN
    RAISE EXCEPTION 'Split amounts must equal the expense total.';
  END IF;
END;
$$;


ALTER FUNCTION "expensio"."expensio_replace_expense_splits"("p_expense_id" "uuid", "p_workspace_id" "uuid", "p_amount_minor" bigint, "p_splits" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."expensio_seed_default_categories"("p_workspace_id" "uuid", "p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'expensio', 'public'
    AS $$
BEGIN
  INSERT INTO expensio.expensio_categories (workspace_id, name, color, icon, is_default, created_by)
  VALUES
    (p_workspace_id, 'Food', '#f97316', 'utensils', true, p_user_id),
    (p_workspace_id, 'Travel', '#0ea5e9', 'plane', true, p_user_id),
    (p_workspace_id, 'Stay', '#8b5cf6', 'bed', true, p_user_id),
    (p_workspace_id, 'Shopping', '#ec4899', 'shopping-bag', true, p_user_id),
    (p_workspace_id, 'Bills', '#22c55e', 'receipt', true, p_user_id),
    (p_workspace_id, 'Other', '#64748b', 'circle-ellipsis', true, p_user_id)
  ON CONFLICT DO NOTHING;
END;
$$;


ALTER FUNCTION "expensio"."expensio_seed_default_categories"("p_workspace_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."expensio_storage_first_folder_uuid"("object_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  first_folder TEXT;
BEGIN
  first_folder := (storage.foldername(object_name))[1];
  RETURN first_folder::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;


ALTER FUNCTION "expensio"."expensio_storage_first_folder_uuid"("object_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."expensio_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "expensio"."expensio_touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."expensio_update_expense"("p_expense_id" "uuid", "p_category_id" "uuid", "p_paid_by_user_id" "uuid", "p_description" "text", "p_note" "text", "p_amount_minor" bigint, "p_currency_code" "text", "p_expense_date" "date", "p_split_type" "text", "p_splits" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'expensio', 'public'
    AS $$
DECLARE
  actor UUID := auth.uid();
  existing_expense expensio.expensio_expenses%ROWTYPE;
  normalized_currency TEXT;
  normalized_split_type TEXT := COALESCE(NULLIF(trim(p_split_type), ''), 'exact');
BEGIN
  SELECT *
  INTO existing_expense
  FROM expensio.expensio_expenses
  WHERE id = p_expense_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found.';
  END IF;

  IF NOT expensio.expensio_can_mutate_expense(p_expense_id, actor) THEN
    RAISE EXCEPTION 'You cannot edit this expense.';
  END IF;

  normalized_currency := expensio.expensio_assert_expense_payload(
    existing_expense.workspace_id,
    p_category_id,
    p_paid_by_user_id,
    p_description,
    p_amount_minor,
    p_currency_code,
    p_expense_date,
    actor
  );

  IF normalized_split_type NOT IN ('equal', 'selected_equal', 'percentage', 'exact', 'ratio', 'shares') THEN
    RAISE EXCEPTION 'Unsupported split type.';
  END IF;

  UPDATE expensio.expensio_expenses
  SET category_id = p_category_id,
      paid_by_user_id = p_paid_by_user_id,
      description = trim(p_description),
      note = NULLIF(trim(COALESCE(p_note, '')), ''),
      amount_minor = p_amount_minor,
      currency_code = normalized_currency,
      expense_date = p_expense_date,
      split_type = normalized_split_type,
      updated_by = actor
  WHERE id = p_expense_id;

  PERFORM expensio.expensio_replace_expense_splits(
    p_expense_id,
    existing_expense.workspace_id,
    p_amount_minor,
    p_splits
  );

  INSERT INTO expensio.expensio_activities (workspace_id, actor_user_id, entity_type, entity_id, action, metadata)
  VALUES (
    existing_expense.workspace_id,
    actor,
    'expense',
    p_expense_id,
    'updated',
    jsonb_build_object(
      'previous_amount_minor', existing_expense.amount_minor,
      'amount_minor', p_amount_minor,
      'currency_code', normalized_currency,
      'split_type', normalized_split_type
    )
  );

  RETURN p_expense_id;
END;
$$;


ALTER FUNCTION "expensio"."expensio_update_expense"("p_expense_id" "uuid", "p_category_id" "uuid", "p_paid_by_user_id" "uuid", "p_description" "text", "p_note" "text", "p_amount_minor" bigint, "p_currency_code" "text", "p_expense_date" "date", "p_split_type" "text", "p_splits" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."expensio_update_member_role"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_role" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'expensio', 'public'
    AS $$
DECLARE
  actor UUID := auth.uid();
  actor_role TEXT;
  target_role TEXT;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.';
  END IF;

  actor_role := expensio.expensio_workspace_role(p_workspace_id, actor);
  target_role := expensio.expensio_workspace_role(p_workspace_id, p_user_id);

  IF actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners and admins can update member roles.';
  END IF;

  IF target_role IS NULL THEN
    RAISE EXCEPTION 'Target member is not active in this workspace.';
  END IF;

  IF p_role NOT IN ('owner', 'admin', 'member') THEN
    RAISE EXCEPTION 'Unsupported workspace role.';
  END IF;

  IF actor_role <> 'owner' AND (p_role = 'owner' OR target_role = 'owner') THEN
    RAISE EXCEPTION 'Only owners can change owner roles.';
  END IF;

  IF actor_role <> 'owner' AND p_role = 'admin' AND target_role <> 'member' THEN
    RAISE EXCEPTION 'Admins can only promote members to admin.';
  END IF;

  UPDATE expensio.expensio_workspace_members
  SET role = p_role,
      display_name = COALESCE(display_name, expensio.expensio_profile_display_name(user_id))
  WHERE workspace_id = p_workspace_id
    AND user_id = p_user_id
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found.';
  END IF;

  INSERT INTO expensio.expensio_activities (workspace_id, actor_user_id, entity_type, entity_id, action, metadata)
  VALUES (
    p_workspace_id,
    actor,
    'member',
    p_user_id,
    'role_updated',
    jsonb_build_object('previous_role', target_role, 'role', p_role)
  );

  RETURN p_user_id;
END;
$$;


ALTER FUNCTION "expensio"."expensio_update_member_role"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."expensio_update_workspace"("p_workspace_id" "uuid", "p_name" "text", "p_currency_code" "text", "p_timezone" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'expensio', 'public'
    AS $_$
DECLARE
  actor UUID := auth.uid();
  normalized_currency TEXT;
  normalized_timezone TEXT;
BEGIN
  IF actor IS NULL OR NOT expensio.expensio_can_manage_workspace(p_workspace_id, actor) THEN
    RAISE EXCEPTION 'Only workspace owners and admins can update workspace settings.';
  END IF;

  IF p_name IS NULL OR char_length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Workspace name is required.';
  END IF;

  normalized_currency := upper(trim(COALESCE(p_currency_code, 'INR')));
  IF normalized_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency code must be a 3-letter ISO code.';
  END IF;

  normalized_timezone := NULLIF(trim(COALESCE(p_timezone, '')), '');
  IF normalized_timezone IS NULL THEN
    normalized_timezone := 'Asia/Kolkata';
  END IF;

  UPDATE expensio.expensio_workspaces
  SET name = trim(p_name),
      currency_code = normalized_currency,
      timezone = normalized_timezone
  WHERE id = p_workspace_id
    AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workspace not found.';
  END IF;

  INSERT INTO expensio.expensio_activities (workspace_id, actor_user_id, entity_type, entity_id, action, metadata)
  VALUES (
    p_workspace_id,
    actor,
    'workspace',
    p_workspace_id,
    'updated',
    jsonb_build_object('currency_code', normalized_currency, 'timezone', normalized_timezone)
  );

  RETURN p_workspace_id;
END;
$_$;


ALTER FUNCTION "expensio"."expensio_update_workspace"("p_workspace_id" "uuid", "p_name" "text", "p_currency_code" "text", "p_timezone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."expensio_validate_expense_amount_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  PERFORM expensio.expensio_validate_expense_splits(NEW.id);
  RETURN NULL;
END;
$$;


ALTER FUNCTION "expensio"."expensio_validate_expense_amount_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."expensio_validate_expense_splits"("p_expense_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'expensio', 'public'
    AS $$
DECLARE
  expected_amount BIGINT;
  actual_amount BIGINT;
  split_count INTEGER;
BEGIN
  SELECT amount_minor
  INTO expected_amount
  FROM expensio.expensio_expenses
  WHERE id = p_expense_id
    AND deleted_at IS NULL;

  IF expected_amount IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(sum(amount_minor), 0), count(*)
  INTO actual_amount, split_count
  FROM expensio.expensio_expense_splits
  WHERE expense_id = p_expense_id;

  IF split_count = 0 OR actual_amount <> expected_amount THEN
    RAISE EXCEPTION 'Expense splits must exist and equal the expense total.';
  END IF;
END;
$$;


ALTER FUNCTION "expensio"."expensio_validate_expense_splits"("p_expense_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."expensio_validate_expense_splits_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  PERFORM expensio.expensio_validate_expense_splits(COALESCE(NEW.expense_id, OLD.expense_id));
  RETURN NULL;
END;
$$;


ALTER FUNCTION "expensio"."expensio_validate_expense_splits_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."expensio_workspace_role"("p_workspace_id" "uuid", "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'expensio', 'public'
    AS $$
  SELECT m.role
  FROM expensio.expensio_workspace_members m
  WHERE m.workspace_id = p_workspace_id
    AND m.user_id = p_user_id
    AND m.status = 'active'
  LIMIT 1;
$$;


ALTER FUNCTION "expensio"."expensio_workspace_role"("p_workspace_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'expensio', 'public'
    AS $$
declare
  personal_group_id uuid;
begin
  insert into expensio.et_profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;

  insert into expensio.et_groups (name, kind, created_by)
  values ('Personal', 'personal', new.id)
  returning id into personal_group_id;

  insert into expensio.et_group_members (group_id, user_id, role)
  values (personal_group_id, new.id, 'owner')
  on conflict (group_id, user_id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "expensio"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."has_group_role"("p_group_id" "uuid", "p_roles" "text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'expensio', 'public'
    AS $$
  select exists (
    select 1 from expensio.et_group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = auth.uid()
      and gm.role = any(p_roles)
  );
$$;


ALTER FUNCTION "expensio"."has_group_role"("p_group_id" "uuid", "p_roles" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."is_group_member"("p_group_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1
    from expensio.et_group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "expensio"."is_group_member"("p_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."join_group_with_token"("p_token" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'expensio', 'public'
    AS $$
declare
  v_uid uuid;
  v_invite expensio.et_group_invites%rowtype;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return false;
  end if;

  select * into v_invite
  from expensio.et_group_invites
  where token = p_token
    and active = true
    and expires_at > now()
    and uses_count < max_uses
  for update;

  if not found then
    return false;
  end if;

  insert into expensio.et_group_members (group_id, user_id, role)
  values (v_invite.group_id, v_uid, 'member')
  on conflict (group_id, user_id) do nothing;

  update expensio.et_group_invites
  set uses_count = uses_count + 1,
      active = case when uses_count + 1 >= max_uses then false else active end
  where id = v_invite.id;

  return true;
end;
$$;


ALTER FUNCTION "expensio"."join_group_with_token"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "expensio"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "expensio"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_product_access"("product_name" "text", "user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS TABLE("has_access" boolean, "role" "text", "status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
BEGIN
    RETURN QUERY
    SELECT 
        (pm.status = 'active') as has_access,
        pm.role,
        pm.status
    FROM public.product_memberships pm
    JOIN public.products p ON p.id = pm.product_id
    WHERE pm.user_id = $2 AND p.name = $1;
END;
$_$;


ALTER FUNCTION "public"."check_product_access"("product_name" "text", "user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');
    
    -- Grant access to all active products initially (or specific ones)
    INSERT INTO public.product_memberships (user_id, product_id, status)
    SELECT new.id, id, 'active'
    FROM public.products
    WHERE active = true;
    
    RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
new.updated_at = now();
return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "expensio"."et_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "description" "text" NOT NULL,
    "user" "text" NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "details" "text",
    "created_by_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "et_activities_type_check" CHECK (("type" = ANY (ARRAY['expense_added'::"text", 'expense_edited'::"text", 'expense_deleted'::"text", 'info_added'::"text", 'info_edited'::"text", 'info_deleted'::"text"])))
);


ALTER TABLE "expensio"."et_activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "expensio"."et_expense_splits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "expense_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "split_type" "text" DEFAULT 'equal'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "et_expense_splits_amount_check" CHECK (("amount" >= (0)::numeric))
);


ALTER TABLE "expensio"."et_expense_splits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "expensio"."et_expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "category" "text" DEFAULT 'Other'::"text" NOT NULL,
    "paid_by_user_id" "uuid" NOT NULL,
    "created_by_user_id" "uuid" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attachments" "text"[] DEFAULT '{}'::"text"[],
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "et_expenses_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "expensio"."et_expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "expensio"."et_group_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "max_uses" integer DEFAULT 50 NOT NULL,
    "uses_count" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "expensio"."et_group_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "expensio"."et_group_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "et_group_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"])))
);


ALTER TABLE "expensio"."et_group_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "expensio"."et_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "et_groups_kind_check" CHECK (("kind" = ANY (ARRAY['shared'::"text", 'personal'::"text"])))
);


ALTER TABLE "expensio"."et_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "expensio"."et_profiles" (
    "user_id" "uuid" NOT NULL,
    "display_name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "expensio"."et_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "expensio"."et_settlements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "from_user_id" "uuid" NOT NULL,
    "to_user_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "settled_at" timestamp with time zone,
    "created_by_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "et_settlements_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "et_settlements_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "expensio"."et_settlements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "expensio"."et_theme_settings" (
    "user_id" "uuid" NOT NULL,
    "is_dark" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "expensio"."et_theme_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "expensio"."et_trip_info" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "last_edited_by" "text" NOT NULL,
    "last_edited_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attachments" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "pinned" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "expensio"."et_trip_info" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "expensio"."expensio_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "actor_user_id" "uuid",
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "action" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "expensio"."expensio_activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "expensio"."expensio_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid",
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#f97316'::"text" NOT NULL,
    "icon" "text" DEFAULT 'circle-dollar-sign'::"text" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "expensio_categories_name_check" CHECK ((("char_length"(TRIM(BOTH FROM "name")) >= 1) AND ("char_length"(TRIM(BOTH FROM "name")) <= 80)))
);


ALTER TABLE "expensio"."expensio_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "expensio"."expensio_expense_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "expense_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "size_bytes" bigint,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "expensio_expense_attachments_size_bytes_check" CHECK ((("size_bytes" IS NULL) OR ("size_bytes" >= 0)))
);


ALTER TABLE "expensio"."expensio_expense_attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "expensio"."expensio_expense_splits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "expense_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount_minor" bigint NOT NULL,
    "percentage_basis_points" integer,
    "ratio_parts" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "expensio_expense_splits_amount_minor_check" CHECK (("amount_minor" >= 0)),
    CONSTRAINT "expensio_expense_splits_percentage_basis_points_check" CHECK ((("percentage_basis_points" IS NULL) OR (("percentage_basis_points" >= 0) AND ("percentage_basis_points" <= 10000)))),
    CONSTRAINT "expensio_expense_splits_ratio_parts_check" CHECK ((("ratio_parts" IS NULL) OR ("ratio_parts" > 0)))
);


ALTER TABLE "expensio"."expensio_expense_splits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "expensio"."expensio_expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "category_id" "uuid",
    "paid_by_user_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "note" "text",
    "amount_minor" bigint NOT NULL,
    "currency_code" character(3) DEFAULT 'INR'::"bpchar" NOT NULL,
    "expense_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_by" "uuid" NOT NULL,
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "split_type" "text" DEFAULT 'exact'::"text" NOT NULL,
    CONSTRAINT "expensio_expenses_amount_minor_check" CHECK (("amount_minor" > 0)),
    CONSTRAINT "expensio_expenses_description_check" CHECK ((("char_length"(TRIM(BOTH FROM "description")) >= 1) AND ("char_length"(TRIM(BOTH FROM "description")) <= 160))),
    CONSTRAINT "expensio_expenses_split_type_check" CHECK (("split_type" = ANY (ARRAY['equal'::"text", 'selected_equal'::"text", 'percentage'::"text", 'exact'::"text", 'ratio'::"text", 'shares'::"text"])))
);


ALTER TABLE "expensio"."expensio_expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "expensio"."expensio_settlements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "from_user_id" "uuid" NOT NULL,
    "to_user_id" "uuid" NOT NULL,
    "amount_minor" bigint NOT NULL,
    "currency_code" character(3) DEFAULT 'INR'::"bpchar" NOT NULL,
    "note" "text",
    "settled_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "expensio_settlements_amount_minor_check" CHECK (("amount_minor" > 0)),
    CONSTRAINT "expensio_settlements_check" CHECK (("from_user_id" <> "to_user_id"))
);


ALTER TABLE "expensio"."expensio_settlements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "expensio"."expensio_trip_note_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "note_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "size_bytes" bigint,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "expensio_trip_note_attachments_size_bytes_check" CHECK ((("size_bytes" IS NULL) OR ("size_bytes" >= 0)))
);


ALTER TABLE "expensio"."expensio_trip_note_attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "expensio"."expensio_trip_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text",
    "pinned" boolean DEFAULT false NOT NULL,
    "created_by" "uuid" NOT NULL,
    "updated_by" "uuid",
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "expensio_trip_notes_title_check" CHECK ((("char_length"(TRIM(BOTH FROM "title")) >= 1) AND ("char_length"(TRIM(BOTH FROM "title")) <= 160)))
);


ALTER TABLE "expensio"."expensio_trip_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "expensio"."expensio_workspace_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "expires_at" timestamp with time zone,
    "max_uses" integer,
    "uses_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "expensio_workspace_invites_max_uses_check" CHECK ((("max_uses" IS NULL) OR ("max_uses" > 0))),
    CONSTRAINT "expensio_workspace_invites_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'revoked'::"text", 'expired'::"text"]))),
    CONSTRAINT "expensio_workspace_invites_uses_count_check" CHECK (("uses_count" >= 0))
);


ALTER TABLE "expensio"."expensio_workspace_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "expensio"."expensio_workspace_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "display_name" "text",
    "joined_at" timestamp with time zone,
    "removed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "expensio_workspace_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"]))),
    CONSTRAINT "expensio_workspace_members_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'invited'::"text", 'removed'::"text"])))
);


ALTER TABLE "expensio"."expensio_workspace_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "expensio"."expensio_workspaces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "workspace_type" "text" NOT NULL,
    "currency_code" character(3) DEFAULT 'INR'::"bpchar" NOT NULL,
    "timezone" "text" DEFAULT 'Asia/Kolkata'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    CONSTRAINT "expensio_workspaces_name_check" CHECK ((("char_length"(TRIM(BOTH FROM "name")) >= 1) AND ("char_length"(TRIM(BOTH FROM "name")) <= 120))),
    CONSTRAINT "expensio_workspaces_workspace_type_check" CHECK (("workspace_type" = ANY (ARRAY['personal'::"text", 'group'::"text"])))
);


ALTER TABLE "expensio"."expensio_workspaces" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "printq"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token" "text" NOT NULL,
    "file_url" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "pages" integer NOT NULL,
    "copies" integer NOT NULL,
    "print_type" "text" NOT NULL,
    "binding" "text" NOT NULL,
    "status" "text" DEFAULT 'QUEUED'::"text" NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "payment_id" "text" NOT NULL,
    "order_id" "text" NOT NULL,
    "payment_status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "orders_binding_check" CHECK (("binding" = ANY (ARRAY['NONE'::"text", 'SPIRAL'::"text", 'HARD'::"text"]))),
    CONSTRAINT "orders_copies_check" CHECK (("copies" > 0)),
    CONSTRAINT "orders_pages_check" CHECK (("pages" > 0)),
    CONSTRAINT "orders_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['PAID'::"text", 'FAILED'::"text"]))),
    CONSTRAINT "orders_price_check" CHECK (("price" >= (0)::numeric)),
    CONSTRAINT "orders_print_type_check" CHECK (("print_type" = ANY (ARRAY['BW'::"text", 'COLOR'::"text"]))),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['QUEUED'::"text", 'PRINTING'::"text", 'BINDING'::"text", 'READY'::"text", 'COMPLETED'::"text"])))
);

ALTER TABLE ONLY "printq"."orders" REPLICA IDENTITY FULL;


ALTER TABLE "printq"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."active_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "session_id" "text" NOT NULL,
    "device_info" "jsonb",
    "last_active" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."active_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_requests" (
    "id" bigint NOT NULL,
    "request_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "country_code" "text" NOT NULL,
    "phone" "text",
    "contact_type" "text" NOT NULL,
    "description" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ip_address" "text"
);


ALTER TABLE "public"."contact_requests" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."contact_requests_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."contact_requests_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."contact_requests_id_seq" OWNED BY "public"."contact_requests"."id";



CREATE TABLE IF NOT EXISTS "public"."newsletter_subscribers" (
    "id" bigint NOT NULL,
    "email" "text" NOT NULL,
    "source" "text" DEFAULT 'website-newsletter'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "subscribed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ip_address" "text"
);


ALTER TABLE "public"."newsletter_subscribers" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."newsletter_subscribers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."newsletter_subscribers_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."newsletter_subscribers_id_seq" OWNED BY "public"."newsletter_subscribers"."id";



CREATE TABLE IF NOT EXISTS "public"."product_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'inactive'::"text",
    "first_activated_at" timestamp with time zone,
    "role" "text" DEFAULT 'user'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "product_memberships_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'pending'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."product_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "subdomain" "text" NOT NULL,
    "description" "text",
    "icon_url" "text",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_content" (
    "key" "text" NOT NULL,
    "value" "text" DEFAULT ''::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."site_content" OWNER TO "postgres";


ALTER TABLE ONLY "public"."contact_requests" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."contact_requests_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."newsletter_subscribers" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."newsletter_subscribers_id_seq"'::"regclass");



ALTER TABLE ONLY "expensio"."et_activities"
    ADD CONSTRAINT "et_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "expensio"."et_expense_splits"
    ADD CONSTRAINT "et_expense_splits_expense_id_user_id_key" UNIQUE ("expense_id", "user_id");



ALTER TABLE ONLY "expensio"."et_expense_splits"
    ADD CONSTRAINT "et_expense_splits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "expensio"."et_expenses"
    ADD CONSTRAINT "et_expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "expensio"."et_group_invites"
    ADD CONSTRAINT "et_group_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "expensio"."et_group_invites"
    ADD CONSTRAINT "et_group_invites_token_key" UNIQUE ("token");



ALTER TABLE ONLY "expensio"."et_group_members"
    ADD CONSTRAINT "et_group_members_group_id_user_id_key" UNIQUE ("group_id", "user_id");



ALTER TABLE ONLY "expensio"."et_group_members"
    ADD CONSTRAINT "et_group_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "expensio"."et_groups"
    ADD CONSTRAINT "et_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "expensio"."et_profiles"
    ADD CONSTRAINT "et_profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "expensio"."et_settlements"
    ADD CONSTRAINT "et_settlements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "expensio"."et_theme_settings"
    ADD CONSTRAINT "et_theme_settings_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "expensio"."et_trip_info"
    ADD CONSTRAINT "et_trip_info_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "expensio"."expensio_activities"
    ADD CONSTRAINT "expensio_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "expensio"."expensio_categories"
    ADD CONSTRAINT "expensio_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "expensio"."expensio_expense_attachments"
    ADD CONSTRAINT "expensio_expense_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "expensio"."expensio_expense_splits"
    ADD CONSTRAINT "expensio_expense_splits_expense_id_user_id_key" UNIQUE ("expense_id", "user_id");



ALTER TABLE ONLY "expensio"."expensio_expense_splits"
    ADD CONSTRAINT "expensio_expense_splits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "expensio"."expensio_expenses"
    ADD CONSTRAINT "expensio_expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "expensio"."expensio_settlements"
    ADD CONSTRAINT "expensio_settlements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "expensio"."expensio_trip_note_attachments"
    ADD CONSTRAINT "expensio_trip_note_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "expensio"."expensio_trip_notes"
    ADD CONSTRAINT "expensio_trip_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "expensio"."expensio_workspace_invites"
    ADD CONSTRAINT "expensio_workspace_invites_code_key" UNIQUE ("code");



ALTER TABLE ONLY "expensio"."expensio_workspace_invites"
    ADD CONSTRAINT "expensio_workspace_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "expensio"."expensio_workspace_members"
    ADD CONSTRAINT "expensio_workspace_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "expensio"."expensio_workspace_members"
    ADD CONSTRAINT "expensio_workspace_members_workspace_id_user_id_key" UNIQUE ("workspace_id", "user_id");



ALTER TABLE ONLY "expensio"."expensio_workspaces"
    ADD CONSTRAINT "expensio_workspaces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "printq"."orders"
    ADD CONSTRAINT "orders_payment_id_key" UNIQUE ("payment_id");



ALTER TABLE ONLY "printq"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "printq"."orders"
    ADD CONSTRAINT "orders_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."active_sessions"
    ADD CONSTRAINT "active_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_requests"
    ADD CONSTRAINT "contact_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_requests"
    ADD CONSTRAINT "contact_requests_request_id_key" UNIQUE ("request_id");



ALTER TABLE ONLY "public"."newsletter_subscribers"
    ADD CONSTRAINT "newsletter_subscribers_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."newsletter_subscribers"
    ADD CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_memberships"
    ADD CONSTRAINT "product_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_memberships"
    ADD CONSTRAINT "product_memberships_user_id_product_id_key" UNIQUE ("user_id", "product_id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_subdomain_key" UNIQUE ("subdomain");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_content"
    ADD CONSTRAINT "site_content_pkey" PRIMARY KEY ("key");



CREATE INDEX "expensio_activities_filter_idx" ON "expensio"."expensio_activities" USING "btree" ("workspace_id", "entity_type", "action", "actor_user_id", "created_at" DESC);



CREATE INDEX "expensio_activities_workspace_idx" ON "expensio"."expensio_activities" USING "btree" ("workspace_id", "created_at" DESC);



CREATE INDEX "expensio_categories_workspace_idx" ON "expensio"."expensio_categories" USING "btree" ("workspace_id", "archived_at");



CREATE UNIQUE INDEX "expensio_categories_workspace_name_idx" ON "expensio"."expensio_categories" USING "btree" ("workspace_id", "lower"("name")) WHERE ("archived_at" IS NULL);



CREATE INDEX "expensio_expense_attachments_expense_idx" ON "expensio"."expensio_expense_attachments" USING "btree" ("expense_id");



CREATE INDEX "expensio_expense_splits_user_idx" ON "expensio"."expensio_expense_splits" USING "btree" ("user_id");



CREATE INDEX "expensio_expenses_paid_by_idx" ON "expensio"."expensio_expenses" USING "btree" ("paid_by_user_id");



CREATE INDEX "expensio_expenses_workspace_date_idx" ON "expensio"."expensio_expenses" USING "btree" ("workspace_id", "expense_date" DESC) WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "expensio_one_personal_workspace_per_owner_idx" ON "expensio"."expensio_workspaces" USING "btree" ("owner_id") WHERE (("workspace_type" = 'personal'::"text") AND ("archived_at" IS NULL));



CREATE INDEX "expensio_settlements_workspace_idx" ON "expensio"."expensio_settlements" USING "btree" ("workspace_id", "settled_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "expensio_trip_note_attachments_note_idx" ON "expensio"."expensio_trip_note_attachments" USING "btree" ("note_id");



CREATE INDEX "expensio_trip_notes_workspace_idx" ON "expensio"."expensio_trip_notes" USING "btree" ("workspace_id", "pinned" DESC, "updated_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "expensio_workspace_invites_lookup_idx" ON "expensio"."expensio_workspace_invites" USING "btree" ("code", "status", "expires_at");



CREATE INDEX "expensio_workspace_members_user_idx" ON "expensio"."expensio_workspace_members" USING "btree" ("user_id", "status");



CREATE INDEX "expensio_workspace_members_workspace_idx" ON "expensio"."expensio_workspace_members" USING "btree" ("workspace_id", "status", "role");



CREATE INDEX "expensio_workspaces_owner_idx" ON "expensio"."expensio_workspaces" USING "btree" ("owner_id");



CREATE INDEX "idx_et_activities_group_id" ON "expensio"."et_activities" USING "btree" ("group_id");



CREATE INDEX "idx_et_activities_timestamp" ON "expensio"."et_activities" USING "btree" ("timestamp" DESC);



CREATE INDEX "idx_et_expense_splits_expense_id" ON "expensio"."et_expense_splits" USING "btree" ("expense_id");



CREATE INDEX "idx_et_expenses_group_id" ON "expensio"."et_expenses" USING "btree" ("group_id");



CREATE INDEX "idx_et_expenses_paid_by_user_id" ON "expensio"."et_expenses" USING "btree" ("paid_by_user_id");



CREATE INDEX "idx_et_group_invites_group_id" ON "expensio"."et_group_invites" USING "btree" ("group_id");



CREATE INDEX "idx_et_group_invites_token" ON "expensio"."et_group_invites" USING "btree" ("token");



CREATE INDEX "idx_et_group_members_group_id" ON "expensio"."et_group_members" USING "btree" ("group_id");



CREATE INDEX "idx_et_group_members_user_id" ON "expensio"."et_group_members" USING "btree" ("user_id");



CREATE INDEX "idx_et_settlements_group_id" ON "expensio"."et_settlements" USING "btree" ("group_id");



CREATE INDEX "idx_et_trip_info_created_at" ON "expensio"."et_trip_info" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_et_trip_info_group_id" ON "expensio"."et_trip_info" USING "btree" ("group_id");



CREATE INDEX "orders_created_at_idx" ON "printq"."orders" USING "btree" ("created_at" DESC);



CREATE INDEX "orders_status_idx" ON "printq"."orders" USING "btree" ("status");



CREATE INDEX "idx_contact_requests_created_at" ON "public"."contact_requests" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_contact_requests_email" ON "public"."contact_requests" USING "btree" ("email");



CREATE OR REPLACE TRIGGER "expensio_categories_touch" BEFORE UPDATE ON "expensio"."expensio_categories" FOR EACH ROW EXECUTE FUNCTION "expensio"."expensio_touch_updated_at"();



CREATE OR REPLACE TRIGGER "expensio_expense_splits_touch" BEFORE UPDATE ON "expensio"."expensio_expense_splits" FOR EACH ROW EXECUTE FUNCTION "expensio"."expensio_touch_updated_at"();



CREATE OR REPLACE TRIGGER "expensio_expenses_touch" BEFORE UPDATE ON "expensio"."expensio_expenses" FOR EACH ROW EXECUTE FUNCTION "expensio"."expensio_touch_updated_at"();



CREATE OR REPLACE TRIGGER "expensio_prevent_last_owner_update" BEFORE DELETE OR UPDATE ON "expensio"."expensio_workspace_members" FOR EACH ROW EXECUTE FUNCTION "expensio"."expensio_prevent_last_owner_change"();



CREATE OR REPLACE TRIGGER "expensio_settlements_touch" BEFORE UPDATE ON "expensio"."expensio_settlements" FOR EACH ROW EXECUTE FUNCTION "expensio"."expensio_touch_updated_at"();



CREATE OR REPLACE TRIGGER "expensio_trip_notes_touch" BEFORE UPDATE ON "expensio"."expensio_trip_notes" FOR EACH ROW EXECUTE FUNCTION "expensio"."expensio_touch_updated_at"();



CREATE CONSTRAINT TRIGGER "expensio_validate_expense_amount_change" AFTER INSERT OR UPDATE OF "amount_minor", "deleted_at" ON "expensio"."expensio_expenses" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "expensio"."expensio_validate_expense_amount_trigger"();



CREATE CONSTRAINT TRIGGER "expensio_validate_expense_splits_change" AFTER INSERT OR DELETE OR UPDATE ON "expensio"."expensio_expense_splits" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "expensio"."expensio_validate_expense_splits_trigger"();



CREATE OR REPLACE TRIGGER "expensio_workspace_invites_touch" BEFORE UPDATE ON "expensio"."expensio_workspace_invites" FOR EACH ROW EXECUTE FUNCTION "expensio"."expensio_touch_updated_at"();



CREATE OR REPLACE TRIGGER "expensio_workspace_members_touch" BEFORE UPDATE ON "expensio"."expensio_workspace_members" FOR EACH ROW EXECUTE FUNCTION "expensio"."expensio_touch_updated_at"();



CREATE OR REPLACE TRIGGER "expensio_workspaces_touch" BEFORE UPDATE ON "expensio"."expensio_workspaces" FOR EACH ROW EXECUTE FUNCTION "expensio"."expensio_touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_et_expenses_updated_at" BEFORE UPDATE ON "expensio"."et_expenses" FOR EACH ROW EXECUTE FUNCTION "expensio"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_et_groups_updated_at" BEFORE UPDATE ON "expensio"."et_groups" FOR EACH ROW EXECUTE FUNCTION "expensio"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_et_profiles_updated_at" BEFORE UPDATE ON "expensio"."et_profiles" FOR EACH ROW EXECUTE FUNCTION "expensio"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_et_theme_settings_updated_at" BEFORE UPDATE ON "expensio"."et_theme_settings" FOR EACH ROW EXECUTE FUNCTION "expensio"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_et_trip_info_updated_at" BEFORE UPDATE ON "expensio"."et_trip_info" FOR EACH ROW EXECUTE FUNCTION "expensio"."set_updated_at"();



CREATE OR REPLACE TRIGGER "expensio_on_profile_created" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "expensio"."expensio_handle_new_profile"();



CREATE OR REPLACE TRIGGER "trg_newsletter_updated_at" BEFORE UPDATE ON "public"."newsletter_subscribers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_site_content_updated_at" BEFORE UPDATE ON "public"."site_content" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "expensio"."et_activities"
    ADD CONSTRAINT "et_activities_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "expensio"."et_activities"
    ADD CONSTRAINT "et_activities_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "expensio"."et_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "expensio"."et_expense_splits"
    ADD CONSTRAINT "et_expense_splits_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expensio"."et_expenses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "expensio"."et_expense_splits"
    ADD CONSTRAINT "et_expense_splits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "expensio"."et_expenses"
    ADD CONSTRAINT "et_expenses_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "expensio"."et_expenses"
    ADD CONSTRAINT "et_expenses_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "expensio"."et_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "expensio"."et_expenses"
    ADD CONSTRAINT "et_expenses_paid_by_user_id_fkey" FOREIGN KEY ("paid_by_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "expensio"."et_group_invites"
    ADD CONSTRAINT "et_group_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "expensio"."et_group_invites"
    ADD CONSTRAINT "et_group_invites_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "expensio"."et_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "expensio"."et_group_members"
    ADD CONSTRAINT "et_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "expensio"."et_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "expensio"."et_group_members"
    ADD CONSTRAINT "et_group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "expensio"."et_groups"
    ADD CONSTRAINT "et_groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "expensio"."et_profiles"
    ADD CONSTRAINT "et_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "expensio"."et_settlements"
    ADD CONSTRAINT "et_settlements_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "expensio"."et_settlements"
    ADD CONSTRAINT "et_settlements_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "expensio"."et_settlements"
    ADD CONSTRAINT "et_settlements_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "expensio"."et_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "expensio"."et_settlements"
    ADD CONSTRAINT "et_settlements_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "expensio"."et_theme_settings"
    ADD CONSTRAINT "et_theme_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "expensio"."et_trip_info"
    ADD CONSTRAINT "et_trip_info_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "expensio"."et_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "expensio"."expensio_activities"
    ADD CONSTRAINT "expensio_activities_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "expensio"."expensio_activities"
    ADD CONSTRAINT "expensio_activities_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "expensio"."expensio_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "expensio"."expensio_categories"
    ADD CONSTRAINT "expensio_categories_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "expensio"."expensio_categories"
    ADD CONSTRAINT "expensio_categories_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "expensio"."expensio_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "expensio"."expensio_expense_attachments"
    ADD CONSTRAINT "expensio_expense_attachments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "expensio"."expensio_expense_attachments"
    ADD CONSTRAINT "expensio_expense_attachments_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expensio"."expensio_expenses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "expensio"."expensio_expense_attachments"
    ADD CONSTRAINT "expensio_expense_attachments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "expensio"."expensio_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "expensio"."expensio_expense_splits"
    ADD CONSTRAINT "expensio_expense_splits_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expensio"."expensio_expenses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "expensio"."expensio_expense_splits"
    ADD CONSTRAINT "expensio_expense_splits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "expensio"."expensio_expenses"
    ADD CONSTRAINT "expensio_expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expensio"."expensio_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "expensio"."expensio_expenses"
    ADD CONSTRAINT "expensio_expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "expensio"."expensio_expenses"
    ADD CONSTRAINT "expensio_expenses_paid_by_user_id_fkey" FOREIGN KEY ("paid_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "expensio"."expensio_expenses"
    ADD CONSTRAINT "expensio_expenses_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "expensio"."expensio_expenses"
    ADD CONSTRAINT "expensio_expenses_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "expensio"."expensio_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "expensio"."expensio_settlements"
    ADD CONSTRAINT "expensio_settlements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "expensio"."expensio_settlements"
    ADD CONSTRAINT "expensio_settlements_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "expensio"."expensio_settlements"
    ADD CONSTRAINT "expensio_settlements_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "expensio"."expensio_settlements"
    ADD CONSTRAINT "expensio_settlements_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "expensio"."expensio_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "expensio"."expensio_trip_note_attachments"
    ADD CONSTRAINT "expensio_trip_note_attachments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "expensio"."expensio_trip_note_attachments"
    ADD CONSTRAINT "expensio_trip_note_attachments_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "expensio"."expensio_trip_notes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "expensio"."expensio_trip_note_attachments"
    ADD CONSTRAINT "expensio_trip_note_attachments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "expensio"."expensio_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "expensio"."expensio_trip_notes"
    ADD CONSTRAINT "expensio_trip_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "expensio"."expensio_trip_notes"
    ADD CONSTRAINT "expensio_trip_notes_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "expensio"."expensio_trip_notes"
    ADD CONSTRAINT "expensio_trip_notes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "expensio"."expensio_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "expensio"."expensio_workspace_invites"
    ADD CONSTRAINT "expensio_workspace_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "expensio"."expensio_workspace_invites"
    ADD CONSTRAINT "expensio_workspace_invites_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "expensio"."expensio_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "expensio"."expensio_workspace_members"
    ADD CONSTRAINT "expensio_workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "expensio"."expensio_workspace_members"
    ADD CONSTRAINT "expensio_workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "expensio"."expensio_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "expensio"."expensio_workspaces"
    ADD CONSTRAINT "expensio_workspaces_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."active_sessions"
    ADD CONSTRAINT "active_sessions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."active_sessions"
    ADD CONSTRAINT "active_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_memberships"
    ADD CONSTRAINT "product_memberships_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_memberships"
    ADD CONSTRAINT "product_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Expensio admins can add workspace members" ON "expensio"."expensio_workspace_members" FOR INSERT WITH CHECK (("expensio"."expensio_can_manage_workspace"("workspace_id") AND "expensio"."expensio_has_product_access"("user_id")));



CREATE POLICY "Expensio admins can create invites" ON "expensio"."expensio_workspace_invites" FOR INSERT WITH CHECK ((("created_by" = "auth"."uid"()) AND "expensio"."expensio_can_manage_workspace"("workspace_id")));



CREATE POLICY "Expensio admins can delete invites" ON "expensio"."expensio_workspace_invites" FOR DELETE USING ("expensio"."expensio_can_manage_workspace"("workspace_id"));



CREATE POLICY "Expensio admins can delete workspace members" ON "expensio"."expensio_workspace_members" FOR DELETE USING ("expensio"."expensio_can_manage_workspace"("workspace_id"));



CREATE POLICY "Expensio admins can update invites" ON "expensio"."expensio_workspace_invites" FOR UPDATE USING ("expensio"."expensio_can_manage_workspace"("workspace_id")) WITH CHECK ("expensio"."expensio_can_manage_workspace"("workspace_id"));



CREATE POLICY "Expensio admins can update workspace members" ON "expensio"."expensio_workspace_members" FOR UPDATE USING ("expensio"."expensio_can_manage_workspace"("workspace_id")) WITH CHECK ("expensio"."expensio_can_manage_workspace"("workspace_id"));



CREATE POLICY "Expensio admins can update workspaces" ON "expensio"."expensio_workspaces" FOR UPDATE USING ("expensio"."expensio_can_manage_workspace"("id")) WITH CHECK ("expensio"."expensio_can_manage_workspace"("id"));



CREATE POLICY "Expensio admins can view invites" ON "expensio"."expensio_workspace_invites" FOR SELECT USING ("expensio"."expensio_can_manage_workspace"("workspace_id"));



CREATE POLICY "Expensio category owners can delete categories" ON "expensio"."expensio_categories" FOR DELETE USING ((("workspace_id" IS NOT NULL) AND ("is_default" = false) AND (("created_by" = "auth"."uid"()) OR "expensio"."expensio_can_manage_workspace"("workspace_id"))));



CREATE POLICY "Expensio category owners can update categories" ON "expensio"."expensio_categories" FOR UPDATE USING ((("workspace_id" IS NOT NULL) AND (("created_by" = "auth"."uid"()) OR "expensio"."expensio_can_manage_workspace"("workspace_id")))) WITH CHECK ((("workspace_id" IS NOT NULL) AND (("created_by" = "auth"."uid"()) OR "expensio"."expensio_can_manage_workspace"("workspace_id"))));



CREATE POLICY "Expensio creators and admins can delete expenses" ON "expensio"."expensio_expenses" FOR DELETE USING (("expensio"."expensio_is_workspace_member"("workspace_id") AND (("created_by" = "auth"."uid"()) OR "expensio"."expensio_can_manage_workspace"("workspace_id"))));



CREATE POLICY "Expensio creators and admins can update expenses" ON "expensio"."expensio_expenses" FOR UPDATE USING (("expensio"."expensio_is_workspace_member"("workspace_id") AND (("created_by" = "auth"."uid"()) OR "expensio"."expensio_can_manage_workspace"("workspace_id")))) WITH CHECK (("expensio"."expensio_is_workspace_member"("workspace_id") AND (("created_by" = "auth"."uid"()) OR "expensio"."expensio_can_manage_workspace"("workspace_id"))));



CREATE POLICY "Expensio expense mutators can create expense attachments" ON "expensio"."expensio_expense_attachments" FOR INSERT WITH CHECK ((("created_by" = "auth"."uid"()) AND "expensio"."expensio_is_workspace_member"("workspace_id") AND "expensio"."expensio_can_mutate_expense"("expense_id") AND (EXISTS ( SELECT 1
   FROM "expensio"."expensio_expenses" "e"
  WHERE (("e"."id" = "expensio_expense_attachments"."expense_id") AND ("e"."workspace_id" = "e"."workspace_id"))))));



CREATE POLICY "Expensio expense mutators can create splits" ON "expensio"."expensio_expense_splits" FOR INSERT WITH CHECK (("expensio"."expensio_can_mutate_expense"("expense_id") AND (EXISTS ( SELECT 1
   FROM "expensio"."expensio_expenses" "e"
  WHERE (("e"."id" = "expensio_expense_splits"."expense_id") AND "expensio"."expensio_is_workspace_member"("e"."workspace_id", "expensio_expense_splits"."user_id"))))));



CREATE POLICY "Expensio expense mutators can delete expense attachments" ON "expensio"."expensio_expense_attachments" FOR DELETE USING ("expensio"."expensio_can_mutate_expense"("expense_id"));



CREATE POLICY "Expensio expense mutators can delete splits" ON "expensio"."expensio_expense_splits" FOR DELETE USING ("expensio"."expensio_can_mutate_expense"("expense_id"));



CREATE POLICY "Expensio expense mutators can update splits" ON "expensio"."expensio_expense_splits" FOR UPDATE USING ("expensio"."expensio_can_mutate_expense"("expense_id")) WITH CHECK (("expensio"."expensio_can_mutate_expense"("expense_id") AND (EXISTS ( SELECT 1
   FROM "expensio"."expensio_expenses" "e"
  WHERE (("e"."id" = "expensio_expense_splits"."expense_id") AND "expensio"."expensio_is_workspace_member"("e"."workspace_id", "expensio_expense_splits"."user_id"))))));



CREATE POLICY "Expensio members can create activities" ON "expensio"."expensio_activities" FOR INSERT WITH CHECK ((("actor_user_id" = "auth"."uid"()) AND "expensio"."expensio_is_workspace_member"("workspace_id")));



CREATE POLICY "Expensio members can create categories" ON "expensio"."expensio_categories" FOR INSERT WITH CHECK ((("workspace_id" IS NOT NULL) AND ("created_by" = "auth"."uid"()) AND "expensio"."expensio_is_workspace_member"("workspace_id")));



CREATE POLICY "Expensio members can create expenses" ON "expensio"."expensio_expenses" FOR INSERT WITH CHECK ((("created_by" = "auth"."uid"()) AND "expensio"."expensio_is_workspace_member"("workspace_id") AND "expensio"."expensio_is_workspace_member"("workspace_id", "paid_by_user_id")));



CREATE POLICY "Expensio members can create settlements" ON "expensio"."expensio_settlements" FOR INSERT WITH CHECK ((("created_by" = "auth"."uid"()) AND "expensio"."expensio_is_workspace_member"("workspace_id") AND "expensio"."expensio_is_workspace_member"("workspace_id", "from_user_id") AND "expensio"."expensio_is_workspace_member"("workspace_id", "to_user_id")));



CREATE POLICY "Expensio members can create trip notes" ON "expensio"."expensio_trip_notes" FOR INSERT WITH CHECK ((("created_by" = "auth"."uid"()) AND "expensio"."expensio_is_workspace_member"("workspace_id")));



CREATE POLICY "Expensio members can view activities" ON "expensio"."expensio_activities" FOR SELECT USING ("expensio"."expensio_is_workspace_member"("workspace_id"));



CREATE POLICY "Expensio members can view categories" ON "expensio"."expensio_categories" FOR SELECT USING ((("workspace_id" IS NULL) OR "expensio"."expensio_is_workspace_member"("workspace_id")));



CREATE POLICY "Expensio members can view expense attachments" ON "expensio"."expensio_expense_attachments" FOR SELECT USING ("expensio"."expensio_is_workspace_member"("workspace_id"));



CREATE POLICY "Expensio members can view expenses" ON "expensio"."expensio_expenses" FOR SELECT USING ("expensio"."expensio_is_workspace_member"("workspace_id"));



CREATE POLICY "Expensio members can view settlements" ON "expensio"."expensio_settlements" FOR SELECT USING ("expensio"."expensio_is_workspace_member"("workspace_id"));



CREATE POLICY "Expensio members can view splits" ON "expensio"."expensio_expense_splits" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "expensio"."expensio_expenses" "e"
  WHERE (("e"."id" = "expensio_expense_splits"."expense_id") AND "expensio"."expensio_is_workspace_member"("e"."workspace_id")))));



CREATE POLICY "Expensio members can view trip note attachments" ON "expensio"."expensio_trip_note_attachments" FOR SELECT USING ("expensio"."expensio_is_workspace_member"("workspace_id"));



CREATE POLICY "Expensio members can view trip notes" ON "expensio"."expensio_trip_notes" FOR SELECT USING ("expensio"."expensio_is_workspace_member"("workspace_id"));



CREATE POLICY "Expensio members can view workspace members" ON "expensio"."expensio_workspace_members" FOR SELECT USING ("expensio"."expensio_is_workspace_member"("workspace_id"));



CREATE POLICY "Expensio members can view workspaces" ON "expensio"."expensio_workspaces" FOR SELECT USING ("expensio"."expensio_is_workspace_member"("id"));



CREATE POLICY "Expensio note creators and admins can delete trip notes" ON "expensio"."expensio_trip_notes" FOR DELETE USING (("expensio"."expensio_is_workspace_member"("workspace_id") AND (("created_by" = "auth"."uid"()) OR "expensio"."expensio_can_manage_workspace"("workspace_id"))));



CREATE POLICY "Expensio note creators and admins can update trip notes" ON "expensio"."expensio_trip_notes" FOR UPDATE USING (("expensio"."expensio_is_workspace_member"("workspace_id") AND (("created_by" = "auth"."uid"()) OR "expensio"."expensio_can_manage_workspace"("workspace_id")))) WITH CHECK (("expensio"."expensio_is_workspace_member"("workspace_id") AND (("created_by" = "auth"."uid"()) OR "expensio"."expensio_can_manage_workspace"("workspace_id"))));



CREATE POLICY "Expensio note mutators can create trip note attachments" ON "expensio"."expensio_trip_note_attachments" FOR INSERT WITH CHECK ((("created_by" = "auth"."uid"()) AND "expensio"."expensio_is_workspace_member"("workspace_id") AND (EXISTS ( SELECT 1
   FROM "expensio"."expensio_trip_notes" "n"
  WHERE (("n"."id" = "expensio_trip_note_attachments"."note_id") AND ("n"."workspace_id" = "n"."workspace_id") AND (("n"."created_by" = "auth"."uid"()) OR "expensio"."expensio_can_manage_workspace"("n"."workspace_id")))))));



CREATE POLICY "Expensio note mutators can delete trip note attachments" ON "expensio"."expensio_trip_note_attachments" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "expensio"."expensio_trip_notes" "n"
  WHERE (("n"."id" = "expensio_trip_note_attachments"."note_id") AND (("n"."created_by" = "auth"."uid"()) OR "expensio"."expensio_can_manage_workspace"("n"."workspace_id"))))));



CREATE POLICY "Expensio owners can delete workspaces" ON "expensio"."expensio_workspaces" FOR DELETE USING ((("expensio"."expensio_workspace_role"("id") = 'owner'::"text") AND "expensio"."expensio_has_product_access"("auth"."uid"())));



CREATE POLICY "Expensio settlement creators and admins can delete settlements" ON "expensio"."expensio_settlements" FOR DELETE USING (("expensio"."expensio_is_workspace_member"("workspace_id") AND (("created_by" = "auth"."uid"()) OR "expensio"."expensio_can_manage_workspace"("workspace_id"))));



CREATE POLICY "Expensio settlement creators and admins can update settlements" ON "expensio"."expensio_settlements" FOR UPDATE USING (("expensio"."expensio_is_workspace_member"("workspace_id") AND (("created_by" = "auth"."uid"()) OR "expensio"."expensio_can_manage_workspace"("workspace_id")))) WITH CHECK (("expensio"."expensio_is_workspace_member"("workspace_id") AND "expensio"."expensio_is_workspace_member"("workspace_id", "from_user_id") AND "expensio"."expensio_is_workspace_member"("workspace_id", "to_user_id") AND (("created_by" = "auth"."uid"()) OR "expensio"."expensio_can_manage_workspace"("workspace_id"))));



CREATE POLICY "Expensio users can create owned workspaces" ON "expensio"."expensio_workspaces" FOR INSERT WITH CHECK ((("owner_id" = "auth"."uid"()) AND "expensio"."expensio_has_product_access"("auth"."uid"())));



CREATE POLICY "activities_insert_if_member" ON "expensio"."et_activities" FOR INSERT TO "authenticated" WITH CHECK (("expensio"."is_group_member"("group_id") AND ("created_by_user_id" = "auth"."uid"())));



CREATE POLICY "activities_select_if_member" ON "expensio"."et_activities" FOR SELECT TO "authenticated" USING ("expensio"."is_group_member"("group_id"));



ALTER TABLE "expensio"."et_activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "expensio"."et_expense_splits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "expensio"."et_expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "expensio"."et_group_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "expensio"."et_group_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "expensio"."et_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "expensio"."et_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "expensio"."et_settlements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "expensio"."et_theme_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "expensio"."et_trip_info" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expenses_delete_owner_or_creator" ON "expensio"."et_expenses" FOR DELETE TO "authenticated" USING ((("created_by_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "expensio"."et_group_members" "gm"
  WHERE (("gm"."group_id" = "et_expenses"."group_id") AND ("gm"."user_id" = "auth"."uid"()) AND ("gm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))));



CREATE POLICY "expenses_insert_if_member" ON "expensio"."et_expenses" FOR INSERT TO "authenticated" WITH CHECK (("expensio"."is_group_member"("group_id") AND ("created_by_user_id" = "auth"."uid"())));



CREATE POLICY "expenses_select_if_member" ON "expensio"."et_expenses" FOR SELECT TO "authenticated" USING ("expensio"."is_group_member"("group_id"));



CREATE POLICY "expenses_update_if_member" ON "expensio"."et_expenses" FOR UPDATE TO "authenticated" USING ("expensio"."is_group_member"("group_id"));



ALTER TABLE "expensio"."expensio_activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "expensio"."expensio_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "expensio"."expensio_expense_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "expensio"."expensio_expense_splits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "expensio"."expensio_expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "expensio"."expensio_settlements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "expensio"."expensio_trip_note_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "expensio"."expensio_trip_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "expensio"."expensio_workspace_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "expensio"."expensio_workspace_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "expensio"."expensio_workspaces" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "group_invites_insert_owner_admin" ON "expensio"."et_group_invites" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "expensio"."et_group_members" "gm"
  WHERE (("gm"."group_id" = "et_group_invites"."group_id") AND ("gm"."user_id" = "auth"."uid"()) AND ("gm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))) AND ("created_by" = "auth"."uid"())));



CREATE POLICY "group_invites_select_if_member" ON "expensio"."et_group_invites" FOR SELECT TO "authenticated" USING ("expensio"."is_group_member"("group_id"));



CREATE POLICY "group_invites_update_owner_admin" ON "expensio"."et_group_invites" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "expensio"."et_group_members" "gm"
  WHERE (("gm"."group_id" = "et_group_invites"."group_id") AND ("gm"."user_id" = "auth"."uid"()) AND ("gm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "group_members_delete_auth_safe" ON "expensio"."et_group_members" FOR DELETE TO "authenticated" USING (("user_id" <> "auth"."uid"()));



CREATE POLICY "group_members_delete_owner_admin" ON "expensio"."et_group_members" FOR DELETE TO "authenticated" USING ((("user_id" <> "auth"."uid"()) AND ((EXISTS ( SELECT 1
   FROM "expensio"."et_groups" "g"
  WHERE (("g"."id" = "et_group_members"."group_id") AND ("g"."created_by" = "auth"."uid"())))) OR "expensio"."has_group_role"("group_id", ARRAY['owner'::"text", 'admin'::"text"]))));



CREATE POLICY "group_members_insert_auth_safe" ON "expensio"."et_group_members" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "group_members_insert_owner_admin" ON "expensio"."et_group_members" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "expensio"."et_groups" "g"
  WHERE (("g"."id" = "et_group_members"."group_id") AND ("g"."created_by" = "auth"."uid"())))) OR "expensio"."has_group_role"("group_id", ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "group_members_select_auth_safe" ON "expensio"."et_group_members" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "group_members_select_if_member" ON "expensio"."et_group_members" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "expensio"."et_groups" "g"
  WHERE (("g"."id" = "et_group_members"."group_id") AND ("g"."created_by" = "auth"."uid"())))) OR "expensio"."has_group_role"("group_id", ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "group_members_update_auth_safe" ON "expensio"."et_group_members" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "group_members_update_owner_admin" ON "expensio"."et_group_members" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "expensio"."et_groups" "g"
  WHERE (("g"."id" = "et_group_members"."group_id") AND ("g"."created_by" = "auth"."uid"())))) OR "expensio"."has_group_role"("group_id", ARRAY['owner'::"text", 'admin'::"text"]))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "expensio"."et_groups" "g"
  WHERE (("g"."id" = "et_group_members"."group_id") AND ("g"."created_by" = "auth"."uid"())))) OR "expensio"."has_group_role"("group_id", ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "groups_delete_owner" ON "expensio"."et_groups" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "expensio"."et_group_members" "gm"
  WHERE (("gm"."group_id" = "et_groups"."id") AND ("gm"."user_id" = "auth"."uid"()) AND ("gm"."role" = 'owner'::"text")))));



CREATE POLICY "groups_insert_auth_safe" ON "expensio"."et_groups" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "groups_insert_owner" ON "expensio"."et_groups" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "groups_select_auth_safe" ON "expensio"."et_groups" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "groups_select_if_member" ON "expensio"."et_groups" FOR SELECT TO "authenticated" USING ("expensio"."is_group_member"("id"));



CREATE POLICY "groups_update_auth_safe" ON "expensio"."et_groups" FOR UPDATE TO "authenticated" USING (("created_by" = "auth"."uid"())) WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "groups_update_owner_admin" ON "expensio"."et_groups" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "expensio"."et_group_members" "gm"
  WHERE (("gm"."group_id" = "et_groups"."id") AND ("gm"."user_id" = "auth"."uid"()) AND ("gm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "expensio"."et_group_members" "gm"
  WHERE (("gm"."group_id" = "et_groups"."id") AND ("gm"."user_id" = "auth"."uid"()) AND ("gm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "profiles_insert_self" ON "expensio"."et_profiles" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "profiles_select_self_or_group_member" ON "expensio"."et_profiles" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("expensio"."et_group_members" "gm_self"
     JOIN "expensio"."et_group_members" "gm_target" ON (("gm_target"."group_id" = "gm_self"."group_id")))
  WHERE (("gm_self"."user_id" = "auth"."uid"()) AND ("gm_target"."user_id" = "et_profiles"."user_id"))))));



CREATE POLICY "profiles_update_self" ON "expensio"."et_profiles" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "settlements_select_if_member" ON "expensio"."et_settlements" FOR SELECT TO "authenticated" USING ("expensio"."is_group_member"("group_id"));



CREATE POLICY "settlements_write_if_member" ON "expensio"."et_settlements" TO "authenticated" USING ("expensio"."is_group_member"("group_id")) WITH CHECK (("expensio"."is_group_member"("group_id") AND ("created_by_user_id" = "auth"."uid"())));



CREATE POLICY "splits_select_if_member" ON "expensio"."et_expense_splits" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "expensio"."et_expenses" "e"
  WHERE (("e"."id" = "et_expense_splits"."expense_id") AND "expensio"."is_group_member"("e"."group_id")))));



CREATE POLICY "splits_write_if_member" ON "expensio"."et_expense_splits" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "expensio"."et_expenses" "e"
  WHERE (("e"."id" = "et_expense_splits"."expense_id") AND "expensio"."is_group_member"("e"."group_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "expensio"."et_expenses" "e"
  WHERE (("e"."id" = "et_expense_splits"."expense_id") AND "expensio"."is_group_member"("e"."group_id")))));



CREATE POLICY "theme_settings_insert_self" ON "expensio"."et_theme_settings" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "theme_settings_select_self" ON "expensio"."et_theme_settings" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "theme_settings_update_self" ON "expensio"."et_theme_settings" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "trip_info_select_if_member" ON "expensio"."et_trip_info" FOR SELECT TO "authenticated" USING ("expensio"."is_group_member"("group_id"));



CREATE POLICY "trip_info_write_if_member" ON "expensio"."et_trip_info" TO "authenticated" USING ("expensio"."is_group_member"("group_id")) WITH CHECK ("expensio"."is_group_member"("group_id"));



CREATE POLICY "Public can read orders" ON "printq"."orders" FOR SELECT USING (true);



ALTER TABLE "printq"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Allow insert contact requests" ON "public"."contact_requests" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow insert newsletter" ON "public"."newsletter_subscribers" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow insert newsletter subscribers" ON "public"."newsletter_subscribers" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Allow read site content" ON "public"."site_content" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow write site content" ON "public"."site_content" TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Anyone can view active products" ON "public"."products" FOR SELECT USING (("active" = true));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own memberships" ON "public"."product_memberships" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."active_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."newsletter_subscribers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_content" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "printq"."orders";



GRANT USAGE ON SCHEMA "api" TO "anon";
GRANT USAGE ON SCHEMA "api" TO "authenticated";



GRANT USAGE ON SCHEMA "expensio" TO "anon";
GRANT USAGE ON SCHEMA "expensio" TO "authenticated";
GRANT USAGE ON SCHEMA "expensio" TO "service_role";



GRANT USAGE ON SCHEMA "printq" TO "anon";
GRANT USAGE ON SCHEMA "printq" TO "authenticated";
GRANT USAGE ON SCHEMA "printq" TO "service_role";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "expensio"."expensio_assert_expense_payload"("p_workspace_id" "uuid", "p_category_id" "uuid", "p_paid_by_user_id" "uuid", "p_description" "text", "p_amount_minor" bigint, "p_currency_code" "text", "p_expense_date" "date", "p_actor" "uuid") TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_assert_expense_payload"("p_workspace_id" "uuid", "p_category_id" "uuid", "p_paid_by_user_id" "uuid", "p_description" "text", "p_amount_minor" bigint, "p_currency_code" "text", "p_expense_date" "date", "p_actor" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_assert_expense_payload"("p_workspace_id" "uuid", "p_category_id" "uuid", "p_paid_by_user_id" "uuid", "p_description" "text", "p_amount_minor" bigint, "p_currency_code" "text", "p_expense_date" "date", "p_actor" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "expensio"."expensio_can_manage_workspace"("p_workspace_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_can_manage_workspace"("p_workspace_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_can_manage_workspace"("p_workspace_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "expensio"."expensio_can_mutate_expense"("p_expense_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_can_mutate_expense"("p_expense_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_can_mutate_expense"("p_expense_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "expensio"."expensio_create_expense"("p_workspace_id" "uuid", "p_category_id" "uuid", "p_paid_by_user_id" "uuid", "p_description" "text", "p_note" "text", "p_amount_minor" bigint, "p_currency_code" "text", "p_expense_date" "date", "p_split_type" "text", "p_splits" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "expensio"."expensio_create_expense"("p_workspace_id" "uuid", "p_category_id" "uuid", "p_paid_by_user_id" "uuid", "p_description" "text", "p_note" "text", "p_amount_minor" bigint, "p_currency_code" "text", "p_expense_date" "date", "p_split_type" "text", "p_splits" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_create_expense"("p_workspace_id" "uuid", "p_category_id" "uuid", "p_paid_by_user_id" "uuid", "p_description" "text", "p_note" "text", "p_amount_minor" bigint, "p_currency_code" "text", "p_expense_date" "date", "p_split_type" "text", "p_splits" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_create_expense"("p_workspace_id" "uuid", "p_category_id" "uuid", "p_paid_by_user_id" "uuid", "p_description" "text", "p_note" "text", "p_amount_minor" bigint, "p_currency_code" "text", "p_expense_date" "date", "p_split_type" "text", "p_splits" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "expensio"."expensio_create_invite"("p_workspace_id" "uuid", "p_expires_at" timestamp with time zone, "p_max_uses" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "expensio"."expensio_create_invite"("p_workspace_id" "uuid", "p_expires_at" timestamp with time zone, "p_max_uses" integer) TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_create_invite"("p_workspace_id" "uuid", "p_expires_at" timestamp with time zone, "p_max_uses" integer) TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_create_invite"("p_workspace_id" "uuid", "p_expires_at" timestamp with time zone, "p_max_uses" integer) TO "service_role";



GRANT ALL ON FUNCTION "expensio"."expensio_create_personal_workspace"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_create_personal_workspace"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_create_personal_workspace"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "expensio"."expensio_create_settlement"("p_workspace_id" "uuid", "p_from_user_id" "uuid", "p_to_user_id" "uuid", "p_amount_minor" bigint, "p_currency_code" "text", "p_note" "text", "p_settled_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "expensio"."expensio_create_settlement"("p_workspace_id" "uuid", "p_from_user_id" "uuid", "p_to_user_id" "uuid", "p_amount_minor" bigint, "p_currency_code" "text", "p_note" "text", "p_settled_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_create_settlement"("p_workspace_id" "uuid", "p_from_user_id" "uuid", "p_to_user_id" "uuid", "p_amount_minor" bigint, "p_currency_code" "text", "p_note" "text", "p_settled_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_create_settlement"("p_workspace_id" "uuid", "p_from_user_id" "uuid", "p_to_user_id" "uuid", "p_amount_minor" bigint, "p_currency_code" "text", "p_note" "text", "p_settled_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "expensio"."expensio_create_workspace"("p_name" "text", "p_currency_code" "text", "p_timezone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "expensio"."expensio_create_workspace"("p_name" "text", "p_currency_code" "text", "p_timezone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_create_workspace"("p_name" "text", "p_currency_code" "text", "p_timezone" "text") TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_create_workspace"("p_name" "text", "p_currency_code" "text", "p_timezone" "text") TO "service_role";



REVOKE ALL ON FUNCTION "expensio"."expensio_delete_expense"("p_expense_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "expensio"."expensio_delete_expense"("p_expense_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_delete_expense"("p_expense_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_delete_expense"("p_expense_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "expensio"."expensio_delete_settlement"("p_settlement_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "expensio"."expensio_delete_settlement"("p_settlement_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_delete_settlement"("p_settlement_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_delete_settlement"("p_settlement_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "expensio"."expensio_handle_new_profile"() TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_handle_new_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_handle_new_profile"() TO "service_role";



GRANT ALL ON FUNCTION "expensio"."expensio_has_product_access"("target_user" "uuid") TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_has_product_access"("target_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_has_product_access"("target_user" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "expensio"."expensio_is_workspace_member"("p_workspace_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_is_workspace_member"("p_workspace_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_is_workspace_member"("p_workspace_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "expensio"."expensio_join_workspace"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "expensio"."expensio_join_workspace"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_join_workspace"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_join_workspace"("p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "expensio"."expensio_log_activity"("p_workspace_id" "uuid", "p_entity_type" "text", "p_entity_id" "uuid", "p_action" "text", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_log_activity"("p_workspace_id" "uuid", "p_entity_type" "text", "p_entity_id" "uuid", "p_action" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_log_activity"("p_workspace_id" "uuid", "p_entity_type" "text", "p_entity_id" "uuid", "p_action" "text", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "expensio"."expensio_prevent_last_owner_change"() TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_prevent_last_owner_change"() TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_prevent_last_owner_change"() TO "service_role";



GRANT ALL ON FUNCTION "expensio"."expensio_profile_display_name"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_profile_display_name"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_profile_display_name"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "expensio"."expensio_remove_member"("p_workspace_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "expensio"."expensio_remove_member"("p_workspace_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_remove_member"("p_workspace_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_remove_member"("p_workspace_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "expensio"."expensio_replace_expense_splits"("p_expense_id" "uuid", "p_workspace_id" "uuid", "p_amount_minor" bigint, "p_splits" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_replace_expense_splits"("p_expense_id" "uuid", "p_workspace_id" "uuid", "p_amount_minor" bigint, "p_splits" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_replace_expense_splits"("p_expense_id" "uuid", "p_workspace_id" "uuid", "p_amount_minor" bigint, "p_splits" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "expensio"."expensio_seed_default_categories"("p_workspace_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_seed_default_categories"("p_workspace_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_seed_default_categories"("p_workspace_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "expensio"."expensio_storage_first_folder_uuid"("object_name" "text") TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_storage_first_folder_uuid"("object_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_storage_first_folder_uuid"("object_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "expensio"."expensio_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_touch_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "expensio"."expensio_update_expense"("p_expense_id" "uuid", "p_category_id" "uuid", "p_paid_by_user_id" "uuid", "p_description" "text", "p_note" "text", "p_amount_minor" bigint, "p_currency_code" "text", "p_expense_date" "date", "p_split_type" "text", "p_splits" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "expensio"."expensio_update_expense"("p_expense_id" "uuid", "p_category_id" "uuid", "p_paid_by_user_id" "uuid", "p_description" "text", "p_note" "text", "p_amount_minor" bigint, "p_currency_code" "text", "p_expense_date" "date", "p_split_type" "text", "p_splits" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_update_expense"("p_expense_id" "uuid", "p_category_id" "uuid", "p_paid_by_user_id" "uuid", "p_description" "text", "p_note" "text", "p_amount_minor" bigint, "p_currency_code" "text", "p_expense_date" "date", "p_split_type" "text", "p_splits" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_update_expense"("p_expense_id" "uuid", "p_category_id" "uuid", "p_paid_by_user_id" "uuid", "p_description" "text", "p_note" "text", "p_amount_minor" bigint, "p_currency_code" "text", "p_expense_date" "date", "p_split_type" "text", "p_splits" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "expensio"."expensio_update_member_role"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "expensio"."expensio_update_member_role"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_update_member_role"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_update_member_role"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "expensio"."expensio_update_workspace"("p_workspace_id" "uuid", "p_name" "text", "p_currency_code" "text", "p_timezone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "expensio"."expensio_update_workspace"("p_workspace_id" "uuid", "p_name" "text", "p_currency_code" "text", "p_timezone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_update_workspace"("p_workspace_id" "uuid", "p_name" "text", "p_currency_code" "text", "p_timezone" "text") TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_update_workspace"("p_workspace_id" "uuid", "p_name" "text", "p_currency_code" "text", "p_timezone" "text") TO "service_role";



GRANT ALL ON FUNCTION "expensio"."expensio_validate_expense_amount_trigger"() TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_validate_expense_amount_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_validate_expense_amount_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "expensio"."expensio_validate_expense_splits"("p_expense_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_validate_expense_splits"("p_expense_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_validate_expense_splits"("p_expense_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "expensio"."expensio_validate_expense_splits_trigger"() TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_validate_expense_splits_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_validate_expense_splits_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "expensio"."expensio_workspace_role"("p_workspace_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "expensio"."expensio_workspace_role"("p_workspace_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."expensio_workspace_role"("p_workspace_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "expensio"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "expensio"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "expensio"."has_group_role"("p_group_id" "uuid", "p_roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."has_group_role"("p_group_id" "uuid", "p_roles" "text"[]) TO "service_role";
GRANT ALL ON FUNCTION "expensio"."has_group_role"("p_group_id" "uuid", "p_roles" "text"[]) TO "anon";



GRANT ALL ON FUNCTION "expensio"."is_group_member"("p_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "expensio"."is_group_member"("p_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."is_group_member"("p_group_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "expensio"."join_group_with_token"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."join_group_with_token"("p_token" "text") TO "service_role";
GRANT ALL ON FUNCTION "expensio"."join_group_with_token"("p_token" "text") TO "anon";



GRANT ALL ON FUNCTION "expensio"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "expensio"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."set_updated_at"() TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."check_product_access"("product_name" "text", "user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_product_access"("product_name" "text", "user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_product_access"("product_name" "text", "user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgres_fdw_disconnect"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgres_fdw_disconnect"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."postgres_fdw_disconnect"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgres_fdw_disconnect"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgres_fdw_disconnect_all"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgres_fdw_disconnect_all"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgres_fdw_disconnect_all"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgres_fdw_disconnect_all"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgres_fdw_get_connections"(OUT "server_name" "text", OUT "valid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."postgres_fdw_get_connections"(OUT "server_name" "text", OUT "valid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."postgres_fdw_get_connections"(OUT "server_name" "text", OUT "valid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgres_fdw_get_connections"(OUT "server_name" "text", OUT "valid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgres_fdw_handler"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgres_fdw_handler"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgres_fdw_handler"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgres_fdw_handler"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgres_fdw_validator"("text"[], "oid") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgres_fdw_validator"("text"[], "oid") TO "anon";
GRANT ALL ON FUNCTION "public"."postgres_fdw_validator"("text"[], "oid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgres_fdw_validator"("text"[], "oid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";















GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_activities" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_activities" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_activities" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_expense_splits" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_expense_splits" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_expense_splits" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_expenses" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_expenses" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_expenses" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_group_invites" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_group_invites" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_group_invites" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_group_members" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_group_members" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_group_members" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_groups" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_groups" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_groups" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_profiles" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_profiles" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_profiles" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_settlements" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_settlements" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_settlements" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_theme_settings" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_theme_settings" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_theme_settings" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_trip_info" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_trip_info" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_trip_info" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_activities" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_activities" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_activities" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_categories" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_categories" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_categories" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_expense_attachments" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_expense_attachments" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_expense_attachments" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_expense_splits" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_expense_splits" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_expense_splits" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_expenses" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_expenses" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_expenses" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_settlements" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_settlements" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_settlements" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_trip_note_attachments" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_trip_note_attachments" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_trip_note_attachments" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_trip_notes" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_trip_notes" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_trip_notes" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_workspace_invites" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_workspace_invites" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_workspace_invites" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_workspace_members" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_workspace_members" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_workspace_members" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_workspaces" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_workspaces" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."expensio_workspaces" TO "service_role";









GRANT SELECT ON TABLE "printq"."orders" TO "anon";
GRANT SELECT ON TABLE "printq"."orders" TO "authenticated";
GRANT ALL ON TABLE "printq"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."active_sessions" TO "anon";
GRANT ALL ON TABLE "public"."active_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."active_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."contact_requests" TO "anon";
GRANT ALL ON TABLE "public"."contact_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_requests" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contact_requests_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."contact_requests_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."contact_requests_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."newsletter_subscribers" TO "anon";
GRANT ALL ON TABLE "public"."newsletter_subscribers" TO "authenticated";
GRANT ALL ON TABLE "public"."newsletter_subscribers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."newsletter_subscribers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."newsletter_subscribers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."newsletter_subscribers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."product_memberships" TO "anon";
GRANT ALL ON TABLE "public"."product_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."product_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."site_content" TO "anon";
GRANT ALL ON TABLE "public"."site_content" TO "authenticated";
GRANT ALL ON TABLE "public"."site_content" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "expensio" GRANT SELECT,USAGE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "expensio" GRANT SELECT,USAGE ON SEQUENCES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "expensio" GRANT SELECT ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "expensio" GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "expensio" GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































drop extension if exists "pg_net";

drop policy "Allow insert contact requests" on "public"."contact_requests";

drop policy "Allow insert newsletter subscribers" on "public"."newsletter_subscribers";

drop policy "Allow insert newsletter" on "public"."newsletter_subscribers";

drop policy "Allow read site content" on "public"."site_content";

drop policy "Allow write site content" on "public"."site_content";


  create policy "Allow insert contact requests"
  on "public"."contact_requests"
  as permissive
  for insert
  to anon, authenticated
with check (true);



  create policy "Allow insert newsletter subscribers"
  on "public"."newsletter_subscribers"
  as permissive
  for insert
  to anon, authenticated
with check (true);



  create policy "Allow insert newsletter"
  on "public"."newsletter_subscribers"
  as permissive
  for insert
  to anon, authenticated
with check (true);



  create policy "Allow read site content"
  on "public"."site_content"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "Allow write site content"
  on "public"."site_content"
  as permissive
  for all
  to anon, authenticated
using (true)
with check (true);


CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER on_auth_user_created_expensio AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION expensio.handle_new_user();


  create policy "Expensio avatars are visible to authenticated users"
  on "storage"."objects"
  as permissive
  for select
  to public
using (((bucket_id = 'expensio-avatars'::text) AND (auth.role() = 'authenticated'::text)));



  create policy "Expensio users can delete own avatar"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'expensio-avatars'::text) AND (expensio.expensio_storage_first_folder_uuid(name) = auth.uid())));



  create policy "Expensio users can update own avatar"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'expensio-avatars'::text) AND (expensio.expensio_storage_first_folder_uuid(name) = auth.uid())))
with check (((bucket_id = 'expensio-avatars'::text) AND (expensio.expensio_storage_first_folder_uuid(name) = auth.uid())));



  create policy "Expensio users can upload own avatar"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'expensio-avatars'::text) AND (expensio.expensio_storage_first_folder_uuid(name) = auth.uid())));



  create policy "Expensio workspace files are visible to members"
  on "storage"."objects"
  as permissive
  for select
  to public
using (((bucket_id = ANY (ARRAY['expensio-receipts'::text, 'expensio-trip-images'::text])) AND expensio.expensio_is_workspace_member(expensio.expensio_storage_first_folder_uuid(name))));



  create policy "Expensio workspace members can delete files"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = ANY (ARRAY['expensio-receipts'::text, 'expensio-trip-images'::text])) AND expensio.expensio_is_workspace_member(expensio.expensio_storage_first_folder_uuid(name))));



  create policy "Expensio workspace members can update files"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = ANY (ARRAY['expensio-receipts'::text, 'expensio-trip-images'::text])) AND expensio.expensio_is_workspace_member(expensio.expensio_storage_first_folder_uuid(name))))
with check (((bucket_id = ANY (ARRAY['expensio-receipts'::text, 'expensio-trip-images'::text])) AND expensio.expensio_is_workspace_member(expensio.expensio_storage_first_folder_uuid(name))));



  create policy "Expensio workspace members can upload files"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = ANY (ARRAY['expensio-receipts'::text, 'expensio-trip-images'::text])) AND expensio.expensio_is_workspace_member(expensio.expensio_storage_first_folder_uuid(name))));



  create policy "expensio_receipts_delete_authenticated"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using ((bucket_id = 'expensio-receipts'::text));



  create policy "expensio_receipts_insert_authenticated"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'expensio-receipts'::text));



  create policy "expensio_receipts_select_authenticated"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'expensio-receipts'::text));



  create policy "expensio_receipts_update_authenticated"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((bucket_id = 'expensio-receipts'::text))
with check ((bucket_id = 'expensio-receipts'::text));



