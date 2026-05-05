-- Fix workspace update policy and allow workspace deletion by owners.

DROP POLICY IF EXISTS "groups_update_owner_admin" ON "expensio"."et_groups";

CREATE POLICY "groups_update_owner_admin"
ON "expensio"."et_groups"
FOR UPDATE
TO "authenticated"
USING (
  EXISTS (
    SELECT 1
    FROM "expensio"."et_group_members" AS "gm"
    WHERE "gm"."group_id" = "et_groups"."id"
      AND "gm"."user_id" = "auth"."uid"()
      AND "gm"."role" = ANY (ARRAY['owner'::text, 'admin'::text])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "expensio"."et_group_members" AS "gm"
    WHERE "gm"."group_id" = "et_groups"."id"
      AND "gm"."user_id" = "auth"."uid"()
      AND "gm"."role" = ANY (ARRAY['owner'::text, 'admin'::text])
  )
);

DROP POLICY IF EXISTS "groups_delete_owner" ON "expensio"."et_groups";

CREATE POLICY "groups_delete_owner"
ON "expensio"."et_groups"
FOR DELETE
TO "authenticated"
USING (
  EXISTS (
    SELECT 1
    FROM "expensio"."et_group_members" AS "gm"
    WHERE "gm"."group_id" = "et_groups"."id"
      AND "gm"."user_id" = "auth"."uid"()
      AND "gm"."role" = 'owner'::text
  )
);
