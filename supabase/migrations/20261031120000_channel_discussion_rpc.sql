-- Atomic APIs used by the forum and announcement channel views.
create or replace function public.create_channel_thread(
  p_channel_id uuid,
  p_title text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_user uuid := auth.uid();
  v_type text;
  v_thread_id uuid;
  v_message_id uuid;
begin
  if v_user is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 100 then
    raise exception 'Post titles must be between 1 and 100 characters.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_body, '')) > 10000 then
    raise exception 'Post body is too long.' using errcode = '22023';
  end if;

  select channel_type into v_type
  from public.channels where id = p_channel_id;

  if v_type is null or v_type not in ('forum', 'announcement') then
    raise exception 'This channel does not support posts.' using errcode = '22023';
  end if;
  if not public.has_channel_permission(p_channel_id, 'view_channel')
     or not public.has_channel_permission(p_channel_id, 'send_messages') then
    raise exception 'You do not have permission to post here.' using errcode = '42501';
  end if;
  if v_type = 'announcement'
     and not (
       public.has_channel_permission(p_channel_id, 'publish_announcements')
       or public.has_channel_permission(p_channel_id, 'manage_channels')
     ) then
    raise exception 'You do not have permission to publish announcements.' using errcode = '42501';
  end if;

  insert into public.channel_threads(channel_id, author_id, title, body)
  values (p_channel_id, v_user, btrim(p_title), coalesce(p_body, ''))
  returning id into v_thread_id;

  if v_type = 'announcement' then
    insert into public.messages(channel_id, author_id, body, thread_id)
    values (p_channel_id, v_user, coalesce(p_body, ''), v_thread_id)
    returning id into v_message_id;

    insert into public.announcement_publications(channel_id, message_id, published_by)
    values (p_channel_id, v_message_id, v_user);
  end if;

  return v_thread_id;
end;
$function$;

create or replace function public.send_channel_thread_reply(
  p_thread_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_user uuid := auth.uid();
  v_channel_id uuid;
  v_message_id uuid;
begin
  if v_user is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 4000 then
    raise exception 'Replies must contain between 1 and 4000 characters.' using errcode = '22023';
  end if;

  select channel_id into v_channel_id
  from public.channel_threads
  where id = p_thread_id and status = 'open' and locked = false;

  if v_channel_id is null then
    raise exception 'This discussion is closed.' using errcode = '42501';
  end if;
  if not public.has_channel_permission(v_channel_id, 'view_channel')
     or not public.has_channel_permission(v_channel_id, 'send_messages') then
    raise exception 'You do not have permission to reply here.' using errcode = '42501';
  end if;

  insert into public.messages(channel_id, author_id, body, thread_id)
  values (v_channel_id, v_user, btrim(p_body), p_thread_id)
  returning id into v_message_id;

  return v_message_id;
end;
$function$;

revoke all on function public.create_channel_thread(uuid, text, text) from public;
revoke all on function public.create_channel_thread(uuid, text, text) from anon;
grant execute on function public.create_channel_thread(uuid, text, text) to authenticated;

revoke all on function public.send_channel_thread_reply(uuid, text) from public;
revoke all on function public.send_channel_thread_reply(uuid, text) from anon;
grant execute on function public.send_channel_thread_reply(uuid, text) to authenticated;
