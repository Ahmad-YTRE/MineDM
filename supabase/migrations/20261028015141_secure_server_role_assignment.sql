drop policy if exists "admins update member roles" on public.server_members;
create policy "admins update member roles"
on public.server_members
for update
to authenticated
using (public.is_server_admin(server_id) and user_id <> (select auth.uid()))
with check (
  public.is_server_admin(server_id)
  and user_id <> (select auth.uid())
  and role in ('admin', 'member')
  and (
    role = 'member'
    or exists (
      select 1 from public.servers s
      where s.id = server_members.server_id
        and s.created_by = (select auth.uid())
    )
  )
);
