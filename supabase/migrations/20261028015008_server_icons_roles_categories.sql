alter table public.servers add column if not exists icon_url text;
alter table public.channels add column if not exists category text not null default 'Text Channels';

drop policy if exists "admins update member roles" on public.server_members;
create policy "admins update member roles"
on public.server_members
for update
to authenticated
using (
  public.is_server_admin(server_id)
  and user_id <> auth.uid()
)
with check (
  public.is_server_admin(server_id)
  and user_id <> auth.uid()
  and role in ('admin', 'member')
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('server-icons', 'server-icons', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

drop policy if exists "Server icons are publicly readable" on storage.objects;
create policy "Server icons are publicly readable"
on storage.objects for select to public
using (bucket_id = 'server-icons');

drop policy if exists "Server admins upload server icons" on storage.objects;
create policy "Server admins upload server icons"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'server-icons'
  and exists (
    select 1 from public.servers s
    where s.id::text = (storage.foldername(name))[1]
      and (s.created_by = auth.uid() or public.is_server_admin(s.id))
  )
);

drop policy if exists "Server admins update server icons" on storage.objects;
create policy "Server admins update server icons"
on storage.objects for update to authenticated
using (
  bucket_id = 'server-icons'
  and exists (
    select 1 from public.servers s
    where s.id::text = (storage.foldername(name))[1]
      and (s.created_by = auth.uid() or public.is_server_admin(s.id))
  )
)
with check (
  bucket_id = 'server-icons'
  and exists (
    select 1 from public.servers s
    where s.id::text = (storage.foldername(name))[1]
      and (s.created_by = auth.uid() or public.is_server_admin(s.id))
  )
);

drop policy if exists "Server admins delete server icons" on storage.objects;
create policy "Server admins delete server icons"
on storage.objects for delete to authenticated
using (
  bucket_id = 'server-icons'
  and exists (
    select 1 from public.servers s
    where s.id::text = (storage.foldername(name))[1]
      and (s.created_by = auth.uid() or public.is_server_admin(s.id))
  )
);
