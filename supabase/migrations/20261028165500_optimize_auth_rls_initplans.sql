-- Drop the duplicate DELETE policy; the remaining policy has the same predicate.
DROP POLICY IF EXISTS "admins remove assigned roles" ON public.server_member_roles;

-- Hoist auth.uid() into initplans throughout public-schema policies.
-- Rebuild policies with the same command, roles, permissiveness and predicates; only
-- auth.uid() call placement changes to avoid per-row evaluation.
DO $$
DECLARE
  p record;
  using_expr text;
  check_expr text;
  role_list text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        coalesce(qual, '') ~* 'auth\.uid\(\)'
        OR coalesce(with_check, '') ~* 'auth\.uid\(\)'
      )
  LOOP
    using_expr := CASE WHEN p.qual IS NULL THEN NULL
      ELSE regexp_replace(p.qual, 'auth\.uid\(\)', '(select auth.uid())', 'gi') END;
    check_expr := CASE WHEN p.with_check IS NULL THEN NULL
      ELSE regexp_replace(p.with_check, 'auth\.uid\(\)', '(select auth.uid())', 'gi') END;
    role_list := array_to_string(p.roles, ', ');

    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s',
      p.policyname, p.schemaname, p.tablename, lower(p.permissive), lower(p.cmd), role_list,
      CASE WHEN using_expr IS NOT NULL THEN format(' USING (%s)', using_expr) ELSE '' END,
      CASE WHEN check_expr IS NOT NULL THEN format(' WITH CHECK (%s)', check_expr) ELSE '' END
    );
  END LOOP;
END $$;
