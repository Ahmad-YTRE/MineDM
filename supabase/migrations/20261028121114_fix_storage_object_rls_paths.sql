-- Repair storage RLS policies to validate the actual uploaded object path.
-- Server icon objects are stored as: <server UUID>/<file name>
drop policy if exists "Server admins upload server icons" on storage.objects;
create policy "Server admins upload server icons"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'server-icons'
  and exists (
    select 1
    from public.servers s
    where s.id::text = (storage.foldername(storage.objects.name))[1]
      and (s.created_by = (select auth.uid()) or public.is_server_admin(s.id))
  )
);

drop policy if exists "Server admins update server icons" on storage.objects;
create policy "Server admins update server icons"
on storage.objects for update to authenticated
using (
  bucket_id = 'server-icons'
  and exists (
    select 1
    from public.servers s
    where s.id::text = (storage.foldername(storage.objects.name))[1]
      and (s.created_by = (select auth.uid()) or public.is_server_admin(s.id))
  )
)
with check (
  bucket_id = 'server-icons'
  and exists (
    select 1
    from public.servers s
    where s.id::text = (storage.foldername(storage.objects.name))[1]
      and (s.created_by = (select auth.uid()) or public.is_server_admin(s.id))
  )
);

drop policy if exists "Server admins delete server icons" on storage.objects;
create policy "Server admins delete server icons"
on storage.objects for delete to authenticated
using (
  bucket_id = 'server-icons'
  and exists (
    select 1
    from public.servers s
    where s.id::text = (storage.foldername(storage.objects.name))[1]
      and (s.created_by = (select auth.uid()) or public.is_server_admin(s.id))
  )
);

-- Attachment objects are stored as:
-- channels/<channel UUID>/<user UUID>/<file name>
-- conversations/<conversation UUID>/<user UUID>/<file name>
drop policy if exists "Members upload their own attachments" on storage.objects;
create policy "Members upload their own attachments"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'message-attachments'
  and (storage.foldername(storage.objects.name))[3] = (select auth.uid())::text
  and (
    (
      (storage.foldername(storage.objects.name))[1] = 'channels'
      and exists (
        select 1
        from public.channels c
        where c.id::text = (storage.foldername(storage.objects.name))[2]
          and public.is_server_member(c.server_id)
      )
    )
    or
    (
      (storage.foldername(storage.objects.name))[1] = 'conversations'
      and exists (
        select 1
        from public.conversation_members cm
        where cm.conversation_id::text = (storage.foldername(storage.objects.name))[2]
          and cm.user_id = (select auth.uid())
      )
    )
  )
);

drop policy if exists "Conversation members can read attachments" on storage.objects;
create policy "Conversation members can read attachments"
on storage.objects for select to authenticated
using (
  bucket_id = 'message-attachments'
  and (
    (
      (storage.foldername(storage.objects.name))[1] = 'channels'
      and exists (
        select 1
        from public.channels c
        where c.id::text = (storage.foldername(storage.objects.name))[2]
          and public.is_server_member(c.server_id)
      )
    )
    or
    (
      (storage.foldername(storage.objects.name))[1] = 'conversations'
      and exists (
        select 1
        from public.conversation_members cm
        where cm.conversation_id::text = (storage.foldername(storage.objects.name))[2]
          and cm.user_id = (select auth.uid())
      )
    )
  )
);
