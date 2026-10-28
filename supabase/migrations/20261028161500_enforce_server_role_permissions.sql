revoke all on function public.has_server_permission(uuid,text) from anon;
revoke all on function public.has_server_permission(uuid,text) from public;
grant execute on function public.has_server_permission(uuid,text) to authenticated;
drop policy if exists "admins assign server roles" on public.server_member_roles;
create policy "admins assign server roles" on public.server_member_roles for insert to authenticated with check (
  public.has_server_permission(server_member_roles.server_id,'manage_roles')
  and server_member_roles.user_id <> auth.uid()
  and exists (
    select 1 from public.server_roles r
    where r.id=server_member_roles.role_id and r.server_id=server_member_roles.server_id
      and (
        not (coalesce((r.permissions->>'manage_roles')::boolean,false) or coalesce((r.permissions->>'manage_server')::boolean,false))
        or exists(select 1 from public.servers s where s.id=server_member_roles.server_id and s.created_by=auth.uid())
      )
  )
);
drop policy if exists "role managers delete assigned roles" on public.server_member_roles;
create policy "role managers delete assigned roles" on public.server_member_roles for delete to authenticated using (public.has_server_permission(server_member_roles.server_id,'manage_roles') and server_member_roles.user_id <> auth.uid());
drop policy if exists "role managers edit channel messages" on public.messages;
create policy "role managers edit channel messages" on public.messages for update to authenticated
using (channel_id is not null and exists(select 1 from public.channels c where c.id=messages.channel_id and public.has_server_permission(c.server_id,'manage_messages')))
with check (channel_id is not null and exists(select 1 from public.channels c where c.id=messages.channel_id and public.has_server_permission(c.server_id,'manage_messages')));
drop policy if exists "role managers delete channel messages" on public.messages;
create policy "role managers delete channel messages" on public.messages for delete to authenticated
using (channel_id is not null and exists(select 1 from public.channels c where c.id=messages.channel_id and public.has_server_permission(c.server_id,'manage_messages')));
