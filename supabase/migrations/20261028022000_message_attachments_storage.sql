alter table public.messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments',
  'message-attachments',
  false,
  20971520,
  array[
    'image/jpeg','image/png','image/webp','image/gif',
    'video/mp4','video/webm','audio/mpeg','audio/ogg','audio/wav',
    'application/pdf','text/plain','application/zip','application/x-zip-compressed'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = 20971520,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Conversation members can read attachments" on storage.objects;
create policy "Conversation members can read attachments"
on storage.objects for select to authenticated
using (
  bucket_id = 'message-attachments'
  and (
    (
      (storage.foldername(name))[1] = 'channels'
      and exists (
        select 1 from public.channels c
        where c.id::text = (storage.foldername(name))[2]
          and public.is_server_member(c.server_id)
      )
    )
    or (
      (storage.foldername(name))[1] = 'conversations'
      and exists (
        select 1 from public.conversation_members cm
        where cm.conversation_id::text = (storage.foldername(name))[2]
          and cm.user_id = auth.uid()
      )
    )
  )
);

drop policy if exists "Members upload their own attachments" on storage.objects;
create policy "Members upload their own attachments"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'message-attachments'
  and (storage.foldername(name))[3] = auth.uid()::text
  and (
    (
      (storage.foldername(name))[1] = 'channels'
      and exists (
        select 1 from public.channels c
        where c.id::text = (storage.foldername(name))[2]
          and public.is_server_member(c.server_id)
      )
    )
    or (
      (storage.foldername(name))[1] = 'conversations'
      and exists (
        select 1 from public.conversation_members cm
        where cm.conversation_id::text = (storage.foldername(name))[2]
          and cm.user_id = auth.uid()
      )
    )
  )
);

drop policy if exists "Users delete their own attachments" on storage.objects;
create policy "Users delete their own attachments"
on storage.objects for delete to authenticated
using (
  bucket_id = 'message-attachments'
  and (storage.foldername(name))[3] = auth.uid()::text
);
