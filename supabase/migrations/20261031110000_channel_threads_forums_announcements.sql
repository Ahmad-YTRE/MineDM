-- Shared thread foundation for forum posts and announcement discussions.
create table if not exists public.channel_threads (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  body text not null default '',
  status text not null default 'open' check (status in ('open', 'archived')),
  locked boolean not null default false,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null
);

create index if not exists channel_threads_channel_activity_idx
  on public.channel_threads(channel_id, last_activity_at desc);
create index if not exists channel_threads_channel_status_idx
  on public.channel_threads(channel_id, status, pinned desc, last_activity_at desc);

alter table public.messages
  add column if not exists thread_id uuid references public.channel_threads(id) on delete cascade;
create index if not exists messages_thread_created_idx
  on public.messages(thread_id, created_at) where thread_id is not null;

alter table public.channel_threads enable row level security;
grant select, insert, update, delete on public.channel_threads to authenticated;

drop policy if exists "Members read permitted channel threads" on public.channel_threads;
create policy "Members read permitted channel threads"
on public.channel_threads for select to authenticated
using (
  public.has_channel_permission(channel_id, 'view_channel')
  and public.has_channel_permission(channel_id, 'read_message_history')
);

drop policy if exists "Members create forum posts and discussions" on public.channel_threads;
create policy "Members create forum posts and discussions"
on public.channel_threads for insert to authenticated
with check (
  author_id = (select auth.uid())
  and public.has_channel_permission(channel_id, 'view_channel')
  and public.has_channel_permission(channel_id, 'send_messages')
  and exists (
    select 1 from public.channels c
    where c.id = channel_id and c.channel_type in ('forum', 'announcement')
  )
);

drop policy if exists "Authors and channel managers update threads" on public.channel_threads;
create policy "Authors and channel managers update threads"
on public.channel_threads for update to authenticated
using (
  public.has_channel_permission(channel_id, 'manage_threads')
  or public.has_channel_permission(channel_id, 'manage_channels')
  or (author_id = (select auth.uid()) and status = 'open')
)
with check (
  public.has_channel_permission(channel_id, 'manage_threads')
  or public.has_channel_permission(channel_id, 'manage_channels')
  or (author_id = (select auth.uid()) and status = 'open')
);

drop policy if exists "Authors and channel managers delete threads" on public.channel_threads;
create policy "Authors and channel managers delete threads"
on public.channel_threads for delete to authenticated
using (
  author_id = (select auth.uid())
  or public.has_channel_permission(channel_id, 'manage_threads')
  or public.has_channel_permission(channel_id, 'manage_channels')
);

-- Authors can edit the title/body of their open thread, but cannot self-pin,
-- lock, or archive it. Those controls belong to channel managers.
create or replace function public.guard_channel_thread_updates()
returns trigger
language plpgsql
security invoker
set search_path = public, auth
as $function$
begin
  if old.author_id = auth.uid()
     and not public.has_channel_permission(old.channel_id, 'manage_threads')
     and not public.has_channel_permission(old.channel_id, 'manage_channels') then
    if new.channel_id is distinct from old.channel_id
       or new.author_id is distinct from old.author_id
       or new.status is distinct from old.status
       or new.locked is distinct from old.locked
       or new.pinned is distinct from old.pinned
       or new.archived_at is distinct from old.archived_at
       or new.archived_by is distinct from old.archived_by
       or old.status <> 'open' then
      raise exception 'Thread authors may only edit the title and body of an open thread.'
        using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists guard_channel_thread_updates on public.channel_threads;
create trigger guard_channel_thread_updates
before update on public.channel_threads
for each row execute function public.guard_channel_thread_updates();

-- Replies remain ordinary messages, but must belong to the parent channel and
-- cannot be added to locked or archived threads.
create or replace function public.enforce_thread_reply_permissions()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_thread_channel uuid;
  v_status text;
  v_locked boolean;
begin
  if new.thread_id is null then return new; end if;

  select t.channel_id, t.status, t.locked
    into v_thread_channel, v_status, v_locked
  from public.channel_threads t
  where t.id = new.thread_id;

  if v_thread_channel is null or new.channel_id is distinct from v_thread_channel then
    raise exception 'The reply does not belong to this channel thread.'
      using errcode = '23514';
  end if;

  if v_status <> 'open' or v_locked then
    raise exception 'This thread is locked or archived.'
      using errcode = '42501';
  end if;

  if not public.has_channel_permission(v_thread_channel, 'view_channel')
     or not public.has_channel_permission(v_thread_channel, 'send_messages') then
    raise exception 'You do not have permission to reply in this thread.'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_thread_reply_permissions() from public;
revoke all on function public.enforce_thread_reply_permissions() from anon;

drop trigger if exists enforce_thread_reply_permissions on public.messages;
create trigger enforce_thread_reply_permissions
before insert or update on public.messages
for each row execute function public.enforce_thread_reply_permissions();

create or replace function public.bump_channel_thread_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.thread_id is not null then
    update public.channel_threads
    set last_activity_at = new.created_at
    where id = new.thread_id;
  end if;
  return new;
end;
$function$;

revoke all on function public.bump_channel_thread_activity() from public;
revoke all on function public.bump_channel_thread_activity() from anon;

drop trigger if exists bump_channel_thread_activity on public.messages;
create trigger bump_channel_thread_activity
after insert on public.messages
for each row execute function public.bump_channel_thread_activity();

create table if not exists public.forum_tags (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 20),
  color text not null default '#8b95a7',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique(channel_id, name),
  unique(channel_id, id)
);

create table if not exists public.channel_thread_tags (
  thread_id uuid not null references public.channel_threads(id) on delete cascade,
  tag_id uuid not null references public.forum_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(thread_id, tag_id)
);

create index if not exists forum_tags_channel_position_idx
  on public.forum_tags(channel_id, position);

alter table public.forum_tags enable row level security;
alter table public.channel_thread_tags enable row level security;
grant select, insert, update, delete on public.forum_tags to authenticated;
grant select, insert, delete on public.channel_thread_tags to authenticated;

drop policy if exists "Members read forum tags" on public.forum_tags;
create policy "Members read forum tags"
on public.forum_tags for select to authenticated
using (public.has_channel_permission(channel_id, 'view_channel'));

drop policy if exists "Channel managers manage forum tags" on public.forum_tags;
create policy "Channel managers manage forum tags"
on public.forum_tags for all to authenticated
using (
  public.has_channel_permission(channel_id, 'manage_channels')
  or public.has_channel_permission(channel_id, 'manage_threads')
)
with check (
  (
    public.has_channel_permission(channel_id, 'manage_channels')
    or public.has_channel_permission(channel_id, 'manage_threads')
  )
  and exists (
    select 1 from public.channels c
    where c.id = channel_id and c.channel_type = 'forum'
  )
);

drop policy if exists "Members read thread tags" on public.channel_thread_tags;
create policy "Members read thread tags"
on public.channel_thread_tags for select to authenticated
using (
  exists (
    select 1 from public.channel_threads t
    where t.id = thread_id
      and public.has_channel_permission(t.channel_id, 'view_channel')
  )
);

drop policy if exists "Authors and managers assign thread tags" on public.channel_thread_tags;
create policy "Authors and managers assign thread tags"
on public.channel_thread_tags for insert to authenticated
with check (
  exists (
    select 1
    from public.channel_threads t
    join public.forum_tags ft on ft.id = tag_id and ft.channel_id = t.channel_id
    where t.id = thread_id
      and (
        t.author_id = (select auth.uid())
        or public.has_channel_permission(t.channel_id, 'manage_channels')
      )
  )
);

drop policy if exists "Authors and managers remove thread tags" on public.channel_thread_tags;
create policy "Authors and managers remove thread tags"
on public.channel_thread_tags for delete to authenticated
using (
  exists (
    select 1 from public.channel_threads t
    where t.id = thread_id
      and (
        t.author_id = (select auth.uid())
        or public.has_channel_permission(t.channel_id, 'manage_channels')
      )
  )
);

-- Announcement follows are scoped to the follower's own account.
create table if not exists public.announcement_followers (
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(channel_id, user_id)
);

alter table public.announcement_followers enable row level security;
grant select, insert, delete on public.announcement_followers to authenticated;

drop policy if exists "Users read their announcement follows" on public.announcement_followers;
create policy "Users read their announcement follows"
on public.announcement_followers for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users follow visible announcement channels" on public.announcement_followers;
create policy "Users follow visible announcement channels"
on public.announcement_followers for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.has_channel_permission(channel_id, 'view_channel')
  and exists (
    select 1 from public.channels c
    where c.id = channel_id and c.channel_type = 'announcement'
  )
);

drop policy if exists "Users unfollow announcement channels" on public.announcement_followers;
create policy "Users unfollow announcement channels"
on public.announcement_followers for delete to authenticated
using (user_id = (select auth.uid()));

-- Publication records distinguish a published announcement from a draft
-- message in an announcement channel. Cross-server delivery can be layered on
-- this stable source record without duplicating message bodies.
create table if not exists public.announcement_publications (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  message_id uuid not null unique references public.messages(id) on delete cascade,
  published_by uuid not null references auth.users(id) on delete restrict,
  published_at timestamptz not null default now()
);

create index if not exists announcement_publications_channel_date_idx
  on public.announcement_publications(channel_id, published_at desc);

alter table public.announcement_publications enable row level security;
grant select, insert, delete on public.announcement_publications to authenticated;

drop policy if exists "Members read visible announcement publications" on public.announcement_publications;
create policy "Members read visible announcement publications"
on public.announcement_publications for select to authenticated
using (public.has_channel_permission(channel_id, 'view_channel'));

drop policy if exists "Authorized members publish announcements" on public.announcement_publications;
create policy "Authorized members publish announcements"
on public.announcement_publications for insert to authenticated
with check (
  published_by = (select auth.uid())
  and public.has_channel_permission(channel_id, 'view_channel')
  and (
    public.has_channel_permission(channel_id, 'publish_announcements')
    or public.has_channel_permission(channel_id, 'manage_channels')
  )
  and exists (
    select 1 from public.channels c
    join public.messages m on m.id = message_id and m.channel_id = c.id
    where c.id = channel_id and c.channel_type = 'announcement'
  )
);

drop policy if exists "Authorized members unpublish announcements" on public.announcement_publications;
create policy "Authorized members unpublish announcements"
on public.announcement_publications for delete to authenticated
using (
  public.has_channel_permission(channel_id, 'manage_announcements')
  or public.has_channel_permission(channel_id, 'manage_channels')
);
