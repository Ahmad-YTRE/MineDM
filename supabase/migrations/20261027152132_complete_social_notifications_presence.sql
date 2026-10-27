create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('message', 'friend_request', 'friend_accepted')),
  title text not null,
  body text not null default '',
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, public;
grant select, update on public.notifications to authenticated;
drop policy if exists "Users read their own notifications" on public.notifications;
create policy "Users read their own notifications" on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));
drop policy if exists "Users mark their own notifications read" on public.notifications;
create policy "Users mark their own notifications read" on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

create or replace function public.notify_conversation_message()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare sender_name text;
begin
  if new.conversation_id is null then return new; end if;
  select coalesce(username, 'Player') into sender_name from public.profiles where id = new.author_id;
  insert into public.notifications (recipient_id, actor_id, type, title, body, entity_id)
  select cm.user_id, new.author_id, 'message', coalesce(sender_name, 'Someone') || ' sent you a message',
         left(new.body, 160), new.conversation_id
  from public.conversation_members cm
  where cm.conversation_id = new.conversation_id and cm.user_id <> new.author_id;
  return new;
end;
$$;
revoke all on function public.notify_conversation_message() from public, anon, authenticated;
drop trigger if exists minedm_notify_conversation_message on public.messages;
create trigger minedm_notify_conversation_message after insert on public.messages
  for each row execute function public.notify_conversation_message();

create or replace function public.notify_friendship_activity()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare actor_name text;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    select coalesce(username, 'Player') into actor_name from public.profiles where id = new.requester_id;
    insert into public.notifications (recipient_id, actor_id, type, title, body, entity_id)
    values (new.addressee_id, new.requester_id, 'friend_request',
            coalesce(actor_name, 'Someone') || ' sent you a friend request',
            'Accept or decline this request from your Friends page.', new.id);
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    select coalesce(username, 'Player') into actor_name from public.profiles where id = new.addressee_id;
    insert into public.notifications (recipient_id, actor_id, type, title, body, entity_id)
    values (new.requester_id, new.addressee_id, 'friend_accepted',
            coalesce(actor_name, 'Someone') || ' accepted your friend request',
            'You are now friends on MineDM.', new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.notify_friendship_activity() from public, anon, authenticated;
drop trigger if exists minedm_notify_friendship_activity on public.friendships;
create trigger minedm_notify_friendship_activity after insert or update of status on public.friendships
  for each row execute function public.notify_friendship_activity();

drop policy if exists "Users can read their own message reactions" on public.message_reactions;
drop policy if exists "Users can read reactions on readable messages" on public.message_reactions;
create policy "Users can read reactions on readable messages" on public.message_reactions for select to authenticated
  using (exists (
    select 1 from public.messages m where m.id = message_reactions.message_id
      and ((m.channel_id is not null and exists (
        select 1 from public.channels c where c.id = m.channel_id and public.is_server_member(c.server_id)
      )) or (m.conversation_id is not null and public.is_conversation_member(m.conversation_id)))
  ));
create unique index if not exists message_reactions_unique_user_emoji
  on public.message_reactions (message_id, user_id, emoji);

drop policy if exists "recipients respond and requesters cancel" on public.friendships;
create policy "Recipients respond to pending requests" on public.friendships for update to authenticated
  using (addressee_id = (select auth.uid()) and status = 'pending')
  with check (addressee_id = (select auth.uid()) and status in ('accepted', 'rejected'));

drop policy if exists "members create channels" on public.channels;
create policy "admins create channels" on public.channels for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_server_admin(server_id));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions') then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end $$;
