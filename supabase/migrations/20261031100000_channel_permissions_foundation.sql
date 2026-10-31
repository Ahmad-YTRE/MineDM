-- Channel permissions foundation: category syncing, channel overrides, and private visibility.
-- This migration is additive. Existing channels remain text channels and retain member visibility.

alter table public.channels
  add column if not exists category_id uuid references public.channel_categories(id) on delete set null,
  add column if not exists channel_type text not null default 'text',
  add column if not exists permissions_synced boolean not null default true;

alter table public.channels
  drop constraint if exists channels_channel_type_check;
alter table public.channels
  add constraint channels_channel_type_check
  check (channel_type in ('text', 'announcement', 'forum'));

-- Link legacy category names to category records where a matching category exists.
update public.channels c
set category_id = cc.id
from public.channel_categories cc
where c.server_id = cc.server_id
  and c.category = cc.name
  and c.category_id is null;

create index if not exists channels_category_id_idx
  on public.channels(category_id)
  where category_id is not null;

create table if not exists public.channel_permission_overwrites (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  category_id uuid references public.channel_categories(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete cascade,
  target_type text not null check (target_type in ('everyone', 'role', 'member')),
  target_id uuid,
  allow_permissions text[] not null default '{}',
  deny_permissions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint channel_permission_overwrites_one_scope
    check (((category_id is not null)::integer + (channel_id is not null)::integer) = 1),
  constraint channel_permission_overwrites_target_shape
    check (
      (target_type = 'everyone' and target_id is null)
      or (target_type in ('role', 'member') and target_id is not null)
    ),
  constraint channel_permission_overwrites_no_conflicts
    check (not (allow_permissions && deny_permissions))
);

create unique index if not exists channel_permission_overwrites_category_target_uidx
  on public.channel_permission_overwrites(category_id, target_type, coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where category_id is not null;

create unique index if not exists channel_permission_overwrites_channel_target_uidx
  on public.channel_permission_overwrites(channel_id, target_type, coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where channel_id is not null;

create index if not exists channel_permission_overwrites_server_idx
  on public.channel_permission_overwrites(server_id);

alter table public.channel_permission_overwrites enable row level security;
grant select, insert, update, delete on public.channel_permission_overwrites to authenticated;

-- The overwrite table is a configuration surface. Only members with channel-management
-- authority can inspect or change it; ordinary members receive the resolved result only.
drop policy if exists "channel overwrite managers read" on public.channel_permission_overwrites;
create policy "channel overwrite managers read"
on public.channel_permission_overwrites for select to authenticated
using (public.has_server_permission(server_id, 'manage_channels'));

drop policy if exists "channel overwrite managers insert" on public.channel_permission_overwrites;
create policy "channel overwrite managers insert"
on public.channel_permission_overwrites for insert to authenticated
with check (
  public.has_server_permission(server_id, 'manage_channels')
  and (
    (category_id is not null and exists (
      select 1 from public.channel_categories cc
      where cc.id = category_id and cc.server_id = channel_permission_overwrites.server_id
    ))
    or
    (channel_id is not null and exists (
      select 1 from public.channels c
      where c.id = channel_id and c.server_id = channel_permission_overwrites.server_id
    ))
  )
  and (
    target_type = 'everyone'
    or (target_type = 'role' and exists (
      select 1 from public.server_roles r
      where r.id = target_id and r.server_id = channel_permission_overwrites.server_id
    ))
    or (target_type = 'member' and exists (
      select 1 from public.server_members sm
      where sm.user_id = target_id and sm.server_id = channel_permission_overwrites.server_id
    ))
  )
);

drop policy if exists "channel overwrite managers update" on public.channel_permission_overwrites;
create policy "channel overwrite managers update"
on public.channel_permission_overwrites for update to authenticated
using (public.has_server_permission(server_id, 'manage_channels'))
with check (
  public.has_server_permission(server_id, 'manage_channels')
  and (
    (category_id is not null and exists (
      select 1 from public.channel_categories cc
      where cc.id = category_id and cc.server_id = channel_permission_overwrites.server_id
    ))
    or
    (channel_id is not null and exists (
      select 1 from public.channels c
      where c.id = channel_id and c.server_id = channel_permission_overwrites.server_id
    ))
  )
  and (
    target_type = 'everyone'
    or (target_type = 'role' and exists (
      select 1 from public.server_roles r
      where r.id = target_id and r.server_id = channel_permission_overwrites.server_id
    ))
    or (target_type = 'member' and exists (
      select 1 from public.server_members sm
      where sm.user_id = target_id and sm.server_id = channel_permission_overwrites.server_id
    ))
  )
);

drop policy if exists "channel overwrite managers delete" on public.channel_permission_overwrites;
create policy "channel overwrite managers delete"
on public.channel_permission_overwrites for delete to authenticated
using (public.has_server_permission(server_id, 'manage_channels'));

create or replace function public.has_channel_permission(target_channel uuid, permission_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $function$
declare
  v_uid uuid := auth.uid();
  v_server_id uuid;
  v_category_id uuid;
  v_synced boolean;
  v_role_ids uuid[] := '{}'::uuid[];
  v_overwrite_scope text;
  v_allowed boolean;
begin
  if v_uid is null then return false; end if;

  select c.server_id, c.category_id, c.permissions_synced
    into v_server_id, v_category_id, v_synced
  from public.channels c
  where c.id = target_channel;

  if v_server_id is null or not public.is_server_member(v_server_id) then
    return false;
  end if;

  -- Server owners/admins and members with the corresponding server-level authority
  -- retain their administrative access.
  if public.is_server_admin(v_server_id)
     or public.has_server_permission(v_server_id, 'manage_server')
     or (permission_name = 'manage_channels' and public.has_server_permission(v_server_id, 'manage_channels'))
     or (permission_name = 'manage_messages' and public.has_server_permission(v_server_id, 'manage_messages')) then
    return true;
  end if;

  select coalesce(array_agg(smr.role_id), '{}'::uuid[])
    into v_role_ids
  from public.server_member_roles smr
  where smr.server_id = v_server_id and smr.user_id = v_uid;

  -- Ordinary members may use standard channel capabilities unless explicitly denied.
  -- Management capabilities are opt-in through server roles or channel overwrites.
  v_allowed := permission_name not in (
    'manage_channels', 'manage_messages', 'manage_threads',
    'publish_announcements', 'manage_announcements'
  );

  if v_synced and v_category_id is not null then
    v_overwrite_scope := 'category';
  else
    v_overwrite_scope := 'channel';
  end if;

  -- @everyone deny, then allow.
  if exists (
    select 1 from public.channel_permission_overwrites o
    where o.server_id = v_server_id
      and o.target_type = 'everyone'
      and permission_name = any(o.deny_permissions)
      and ((v_overwrite_scope = 'category' and o.category_id = v_category_id)
        or (v_overwrite_scope = 'channel' and o.channel_id = target_channel))
  ) then v_allowed := false; end if;

  if exists (
    select 1 from public.channel_permission_overwrites o
    where o.server_id = v_server_id
      and o.target_type = 'everyone'
      and permission_name = any(o.allow_permissions)
      and ((v_overwrite_scope = 'category' and o.category_id = v_category_id)
        or (v_overwrite_scope = 'channel' and o.channel_id = target_channel))
  ) then v_allowed := true; end if;

  -- Role denies are applied before role allows. An allow from any assigned role
  -- wins over a deny from another assigned role, matching Discord's role merge.
  if exists (
    select 1 from public.channel_permission_overwrites o
    where o.server_id = v_server_id
      and o.target_type = 'role'
      and o.target_id = any(v_role_ids)
      and permission_name = any(o.deny_permissions)
      and ((v_overwrite_scope = 'category' and o.category_id = v_category_id)
        or (v_overwrite_scope = 'channel' and o.channel_id = target_channel))
  ) then v_allowed := false; end if;

  if exists (
    select 1 from public.channel_permission_overwrites o
    where o.server_id = v_server_id
      and o.target_type = 'role'
      and o.target_id = any(v_role_ids)
      and permission_name = any(o.allow_permissions)
      and ((v_overwrite_scope = 'category' and o.category_id = v_category_id)
        or (v_overwrite_scope = 'channel' and o.channel_id = target_channel))
  ) then v_allowed := true; end if;

  -- A member-specific overwrite is applied last.
  if exists (
    select 1 from public.channel_permission_overwrites o
    where o.server_id = v_server_id
      and o.target_type = 'member'
      and o.target_id = v_uid
      and permission_name = any(o.deny_permissions)
      and ((v_overwrite_scope = 'category' and o.category_id = v_category_id)
        or (v_overwrite_scope = 'channel' and o.channel_id = target_channel))
  ) then v_allowed := false; end if;

  if exists (
    select 1 from public.channel_permission_overwrites o
    where o.server_id = v_server_id
      and o.target_type = 'member'
      and o.target_id = v_uid
      and permission_name = any(o.allow_permissions)
      and ((v_overwrite_scope = 'category' and o.category_id = v_category_id)
        or (v_overwrite_scope = 'channel' and o.channel_id = target_channel))
  ) then v_allowed := true; end if;

  return coalesce(v_allowed, false);
end;
$function$;

revoke all on function public.has_channel_permission(uuid, text) from public;
revoke all on function public.has_channel_permission(uuid, text) from anon;
grant execute on function public.has_channel_permission(uuid, text) to authenticated;

-- Replace membership-only visibility with permission-aware visibility.
drop policy if exists "channels visible to members" on public.channels;
create policy "channels visible with view permission"
on public.channels for select to authenticated
using (public.has_channel_permission(id, 'view_channel'));

drop policy if exists "members read messages" on public.messages;
create policy "members read permitted channel messages"
on public.messages for select to authenticated
using (
  (channel_id is not null and public.has_channel_permission(channel_id, 'view_channel')
    and public.has_channel_permission(channel_id, 'read_message_history'))
  or
  (conversation_id is not null and public.is_conversation_member(conversation_id))
);

drop policy if exists "members send messages" on public.messages;
create policy "members send permitted channel messages"
on public.messages for insert to authenticated
with check (
  author_id = (select auth.uid())
  and (
    (channel_id is not null and public.has_channel_permission(channel_id, 'view_channel')
      and public.has_channel_permission(channel_id, 'send_messages'))
    or
    (conversation_id is not null and public.is_conversation_member(conversation_id))
  )
);

-- SECURITY DEFINER message RPCs bypass table RLS. This trigger applies the same
-- send permission check to RPC inserts and direct inserts.
create or replace function public.enforce_channel_send_permission()
returns trigger
language plpgsql
security invoker
set search_path = public, auth
as $function$
begin
  if new.channel_id is not null then
    if not public.has_channel_permission(new.channel_id, 'view_channel')
       or not public.has_channel_permission(new.channel_id, 'send_messages') then
      raise exception 'You do not have permission to send messages in this channel.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists enforce_channel_send_permission on public.messages;
create trigger enforce_channel_send_permission
before insert on public.messages
for each row execute function public.enforce_channel_send_permission();

comment on column public.channels.permissions_synced is
  'When true and category_id is set, the channel resolves permission overwrites from its category. When false, it uses channel-specific overwrites.';
comment on column public.channels.channel_type is
  'Channel behavior: text, announcement, or forum. Thread-specific tables are introduced separately.';


-- Preserve the effective category configuration when a channel is unsynced.
-- Re-syncing removes local overrides so the category becomes authoritative again.
create or replace function public.sync_channel_permission_overwrites()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $function$
begin
  if new.permissions_synced is distinct from old.permissions_synced then
    if not public.has_server_permission(old.server_id, 'manage_channels') then
      raise exception 'You do not have permission to change channel permission syncing.'
        using errcode = '42501';
    end if;

    if old.permissions_synced and not new.permissions_synced then
      delete from public.channel_permission_overwrites
      where channel_id = new.id;

      if old.category_id is not null then
        insert into public.channel_permission_overwrites (
          server_id, channel_id, target_type, target_id,
          allow_permissions, deny_permissions
        )
        select
          server_id, new.id, target_type, target_id,
          allow_permissions, deny_permissions
        from public.channel_permission_overwrites
        where category_id = old.category_id;
      end if;
    elsif not old.permissions_synced and new.permissions_synced then
      delete from public.channel_permission_overwrites
      where channel_id = new.id;
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.sync_channel_permission_overwrites() from public;
revoke all on function public.sync_channel_permission_overwrites() from anon;

drop trigger if exists sync_channel_permission_overwrites on public.channels;
create trigger sync_channel_permission_overwrites
before update of permissions_synced on public.channels
for each row
when (old.permissions_synced is distinct from new.permissions_synced)
execute function public.sync_channel_permission_overwrites();


-- Deleting a category must not silently make its private channels public.
-- Unsync each channel first; the channel sync trigger snapshots the category
-- overwrites before the category's cascading delete removes them.
create or replace function public.preserve_channel_permissions_before_category_delete()
returns trigger
language plpgsql
security invoker
set search_path = public
as $function$
begin
  update public.channels
  set permissions_synced = false
  where category_id = old.id
    and server_id = old.server_id
    and permissions_synced = true;

  return old;
end;
$function$;

drop trigger if exists preserve_channel_permissions_before_category_delete on public.channel_categories;
create trigger preserve_channel_permissions_before_category_delete
before delete on public.channel_categories
for each row
execute function public.preserve_channel_permissions_before_category_delete();

-- Keep attachment access aligned with channel visibility. The previous bucket
-- policies allowed every server member to read channel attachments, even when
-- the parent channel becomes private.
drop policy if exists "Conversation members can read attachments" on storage.objects;
create policy "Members can read permitted channel attachments"
on storage.objects for select to authenticated
using (
  bucket_id = 'message-attachments'
  and (
    (
      (storage.foldername(name))[1] = 'channels'
      and exists (
        select 1 from public.channels c
        where c.id::text = (storage.foldername(objects.name))[2]
          and public.has_channel_permission(c.id, 'view_channel')
          and public.has_channel_permission(c.id, 'read_message_history')
      )
    )
    or
    (
      (storage.foldername(name))[1] = 'conversations'
      and exists (
        select 1 from public.conversation_members cm
        where cm.conversation_id::text = (storage.foldername(objects.name))[2]
          and cm.user_id = (select auth.uid())
      )
    )
  )
);

drop policy if exists "Members upload their own attachments" on storage.objects;
create policy "Members upload permitted channel attachments"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'message-attachments'
  and (storage.foldername(name))[3] = (select auth.uid())::text
  and (
    (
      (storage.foldername(name))[1] = 'channels'
      and exists (
        select 1 from public.channels c
        where c.id::text = (storage.foldername(objects.name))[2]
          and public.has_channel_permission(c.id, 'view_channel')
          and public.has_channel_permission(c.id, 'send_messages')
      )
    )
    or
    (
      (storage.foldername(name))[1] = 'conversations'
      and exists (
        select 1 from public.conversation_members cm
        where cm.conversation_id::text = (storage.foldername(objects.name))[2]
          and cm.user_id = (select auth.uid())
      )
    )
  )
);
