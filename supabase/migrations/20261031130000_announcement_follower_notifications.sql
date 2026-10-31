-- Deliver new announcement alerts to users who follow the source channel.
-- Delivery happens in the database so clients cannot omit or duplicate notifications.
create or replace function public.notify_announcement_followers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_channel_name text;
  v_server_id uuid;
  v_title text;
  v_author_name text;
begin
  select c.name, c.server_id, t.title
    into v_channel_name, v_server_id, v_title
  from public.channels c
  join public.messages m on m.id = new.message_id
  join public.channel_threads t on t.id = m.thread_id
  where c.id = new.channel_id
    and c.channel_type = 'announcement';

  if not found then
    return new;
  end if;

  select coalesce(nullif(btrim(p.username), ''), 'A member')
    into v_author_name
  from public.profiles p
  where p.id = new.published_by;

  insert into public.notifications (
    recipient_id,
    actor_id,
    type,
    title,
    body,
    entity_id,
    interruptive
  )
  select
    follower.user_id,
    new.published_by,
    'announcement',
    'New announcement in #' || v_channel_name,
    coalesce(v_author_name, 'A member') || ': ' || v_title,
    (select m.thread_id from public.messages m where m.id = new.message_id),
    true
  from public.announcement_followers follower
  where follower.channel_id = new.channel_id
    and follower.user_id <> new.published_by
    and not exists (
      select 1
      from public.user_notification_blocks blocked
      where blocked.user_id = follower.user_id
        and blocked.blocked_actor_id = new.published_by
    )
    and coalesce(
      (
        select channel_override.mode
        from public.notification_overrides channel_override
        where channel_override.user_id = follower.user_id
          and channel_override.scope_type = 'channel'
          and channel_override.scope_id = new.channel_id
        limit 1
      ),
      (
        select server_override.mode
        from public.notification_overrides server_override
        where server_override.user_id = follower.user_id
          and server_override.scope_type = 'server'
          and server_override.scope_id = v_server_id
        limit 1
      ),
      'all'
    ) not in ('none', 'muted', 'mentions');

  return new;
end;
$function$;

revoke all on function public.notify_announcement_followers() from public;
revoke all on function public.notify_announcement_followers() from anon;

drop trigger if exists notify_announcement_followers on public.announcement_publications;
create trigger notify_announcement_followers
after insert on public.announcement_publications
for each row execute function public.notify_announcement_followers();
