grant usage on schema private to anon;
grant execute on function private.is_voax_admin() to anon;
drop policy server_discovery_read_visible_or_owned on public.server_discovery;
create policy server_discovery_read_visible_or_owned on public.server_discovery
for select to anon, authenticated
using (
  (listing_status = 'approved' and listing_enabled = true)
  or owner_id = (select auth.uid())
  or (select private.is_voax_admin())
  or (
    auth.uid() is not null
    and exists (
      select 1 from public.server_members sm
      where sm.server_id = server_discovery.server_id
        and sm.user_id = (select auth.uid())
        and sm.role in ('owner','admin')
    )
  )
);
