


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


CREATE SCHEMA IF NOT EXISTS "expensio";


ALTER SCHEMA "expensio" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






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



CREATE OR REPLACE TRIGGER "trg_et_expenses_updated_at" BEFORE UPDATE ON "expensio"."et_expenses" FOR EACH ROW EXECUTE FUNCTION "expensio"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_et_groups_updated_at" BEFORE UPDATE ON "expensio"."et_groups" FOR EACH ROW EXECUTE FUNCTION "expensio"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_et_profiles_updated_at" BEFORE UPDATE ON "expensio"."et_profiles" FOR EACH ROW EXECUTE FUNCTION "expensio"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_et_theme_settings_updated_at" BEFORE UPDATE ON "expensio"."et_theme_settings" FOR EACH ROW EXECUTE FUNCTION "expensio"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_et_trip_info_updated_at" BEFORE UPDATE ON "expensio"."et_trip_info" FOR EACH ROW EXECUTE FUNCTION "expensio"."set_updated_at"();



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



CREATE POLICY "group_invites_insert_owner_admin" ON "expensio"."et_group_invites" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "expensio"."et_group_members" "gm"
  WHERE (("gm"."group_id" = "et_group_invites"."group_id") AND ("gm"."user_id" = "auth"."uid"()) AND ("gm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))) AND ("created_by" = "auth"."uid"())));



CREATE POLICY "group_invites_select_if_member" ON "expensio"."et_group_invites" FOR SELECT TO "authenticated" USING ("expensio"."is_group_member"("group_id"));



CREATE POLICY "group_invites_update_owner_admin" ON "expensio"."et_group_invites" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "expensio"."et_group_members" "gm"
  WHERE (("gm"."group_id" = "et_group_invites"."group_id") AND ("gm"."user_id" = "auth"."uid"()) AND ("gm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "group_members_delete_owner_admin" ON "expensio"."et_group_members" FOR DELETE TO "authenticated" USING ((("user_id" <> "auth"."uid"()) AND ((EXISTS ( SELECT 1
   FROM "expensio"."et_groups" "g"
  WHERE (("g"."id" = "et_group_members"."group_id") AND ("g"."created_by" = "auth"."uid"())))) OR "expensio"."has_group_role"("group_id", ARRAY['owner'::"text", 'admin'::"text"]))));



CREATE POLICY "group_members_insert_owner_admin" ON "expensio"."et_group_members" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "expensio"."et_groups" "g"
  WHERE (("g"."id" = "et_group_members"."group_id") AND ("g"."created_by" = "auth"."uid"())))) OR "expensio"."has_group_role"("group_id", ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "group_members_select_if_member" ON "expensio"."et_group_members" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "expensio"."et_groups" "g"
  WHERE (("g"."id" = "et_group_members"."group_id") AND ("g"."created_by" = "auth"."uid"())))) OR "expensio"."has_group_role"("group_id", ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "group_members_update_owner_admin" ON "expensio"."et_group_members" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "expensio"."et_groups" "g"
  WHERE (("g"."id" = "et_group_members"."group_id") AND ("g"."created_by" = "auth"."uid"())))) OR "expensio"."has_group_role"("group_id", ARRAY['owner'::"text", 'admin'::"text"]))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "expensio"."et_groups" "g"
  WHERE (("g"."id" = "et_group_members"."group_id") AND ("g"."created_by" = "auth"."uid"())))) OR "expensio"."has_group_role"("group_id", ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "groups_insert_owner" ON "expensio"."et_groups" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "groups_select_if_member" ON "expensio"."et_groups" FOR SELECT TO "authenticated" USING ("expensio"."is_group_member"("id"));



CREATE POLICY "groups_update_owner_admin" ON "expensio"."et_groups" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "expensio"."et_group_members" "gm"
  WHERE (("gm"."group_id" = "gm"."id") AND ("gm"."user_id" = "auth"."uid"()) AND ("gm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



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





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "expensio" TO "anon";
GRANT USAGE ON SCHEMA "expensio" TO "authenticated";
GRANT USAGE ON SCHEMA "expensio" TO "service_role";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "expensio"."has_group_role"("p_group_id" "uuid", "p_roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."has_group_role"("p_group_id" "uuid", "p_roles" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "expensio"."join_group_with_token"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "expensio"."join_group_with_token"("p_token" "text") TO "service_role";








































































































































































GRANT SELECT ON TABLE "expensio"."et_activities" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_activities" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_activities" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_expense_splits" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_expense_splits" TO "service_role";
GRANT SELECT ON TABLE "expensio"."et_expense_splits" TO "anon";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_expenses" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_expenses" TO "service_role";
GRANT SELECT ON TABLE "expensio"."et_expenses" TO "anon";



GRANT SELECT ON TABLE "expensio"."et_group_invites" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_group_invites" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_group_invites" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_group_members" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_group_members" TO "service_role";
GRANT SELECT ON TABLE "expensio"."et_group_members" TO "anon";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_groups" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_groups" TO "service_role";
GRANT SELECT ON TABLE "expensio"."et_groups" TO "anon";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_profiles" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_profiles" TO "service_role";
GRANT SELECT ON TABLE "expensio"."et_profiles" TO "anon";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_settlements" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_settlements" TO "service_role";
GRANT SELECT ON TABLE "expensio"."et_settlements" TO "anon";



GRANT SELECT ON TABLE "expensio"."et_theme_settings" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_theme_settings" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_theme_settings" TO "service_role";



GRANT SELECT ON TABLE "expensio"."et_trip_info" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_trip_info" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "expensio"."et_trip_info" TO "service_role";















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
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































--
-- Dumped schema changes for auth and storage
--

CREATE OR REPLACE TRIGGER "on_auth_user_created_expensio" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "expensio"."handle_new_user"();



CREATE POLICY "expensio_receipts_delete_authenticated" ON "storage"."objects" FOR DELETE TO "authenticated" USING (("bucket_id" = 'expensio-receipts'::"text"));



CREATE POLICY "expensio_receipts_insert_authenticated" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK (("bucket_id" = 'expensio-receipts'::"text"));



CREATE POLICY "expensio_receipts_select_authenticated" ON "storage"."objects" FOR SELECT TO "authenticated" USING (("bucket_id" = 'expensio-receipts'::"text"));



CREATE POLICY "expensio_receipts_update_authenticated" ON "storage"."objects" FOR UPDATE TO "authenticated" USING (("bucket_id" = 'expensio-receipts'::"text")) WITH CHECK (("bucket_id" = 'expensio-receipts'::"text"));



