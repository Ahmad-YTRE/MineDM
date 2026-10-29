drop policy if exists "admins assign server roles" on public.server_member_roles;
create policy "admins assign server roles"
on public.server_member_roles
for insert
to authenticated
with check (
  public.has_server_permission(server_id, 'manage_roles')
  and (
    user_id <> (select auth.uid())
    or exists (
      select 1
      from public.servers s
      where s.id = server_member_roles.server_id
        and s.created_by = (select auth.uid())
    )
  )
  and exists (
    select 1
    from public.server_roles r
    where r.id = server_member_roles.role_id
      and r.server_id = server_member_roles.server_id
      and (
        not (
          coalesce((r.permissions ->> 'manage_roles')::boolean, false)
          or coalesce((r.permissions ->> 'manage_server')::boolean, false)
        )
        or exists (
          select 1
          from public.servers s
          where s.id = server_member_roles.server_id
            and s.created_by = (select auth.uid())
        )
      )
  )
);

drop policy if exists "role managers delete assigned roles" on public.server_member_roles;
create policy "role managers delete assigned roles"
on public.server_member_roles
for delete
to authenticated
using (
  public.has_server_permission(server_id, 'manage_roles')
  and (
    user_id <> (select auth.uid())
    or exists (
      select 1
      from public.servers s
      where s.id = server_member_roles.server_id
        and s.created_by = (select auth.uid())
    )
  )
);
