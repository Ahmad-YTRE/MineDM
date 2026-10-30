drop policy if exists server_discovery_owner_insert on public.server_discovery;
create policy server_discovery_owner_insert
on public.server_discovery
for insert
to authenticated
with check (
  owner_id = (select s.created_by from public.servers s where s.id = server_discovery.server_id)
  and exists (
    select 1 from public.server_members sm
    where sm.server_id = server_discovery.server_id
      and sm.user_id = (select auth.uid())
      and sm.role in ('owner','admin')
  )
);

drop policy if exists server_discovery_banner_owner_insert on storage.objects;
create policy server_discovery_banner_owner_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'server-discovery-banners'
  and exists (
    select 1 from public.server_members sm
    where sm.server_id::text = (storage.foldername(name))[1]
      and sm.user_id = (select auth.uid())
      and sm.role in ('owner','admin')
  )
);

drop policy if exists server_discovery_banner_owner_update on storage.objects;
create policy server_discovery_banner_owner_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'server-discovery-banners'
  and exists (
    select 1 from public.server_members sm
    where sm.server_id::text = (storage.foldername(name))[1]
      and sm.user_id = (select auth.uid())
      and sm.role in ('owner','admin')
  )
)
with check (
  bucket_id = 'server-discovery-banners'
  and exists (
    select 1 from public.server_members sm
    where sm.server_id::text = (storage.foldername(name))[1]
      and sm.user_id = (select auth.uid())
      and sm.role in ('owner','admin')
  )
);

drop policy if exists server_discovery_banner_owner_delete on storage.objects;
create policy server_discovery_banner_owner_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'server-discovery-banners'
  and exists (
    select 1 from public.server_members sm
    where sm.server_id::text = (storage.foldername(name))[1]
      and sm.user_id = (select auth.uid())
      and sm.role in ('owner','admin')
  )
);
