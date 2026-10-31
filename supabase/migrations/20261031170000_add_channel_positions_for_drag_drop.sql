-- Persist the order of channels within each server/category for drag-and-drop navigation.
alter table public.channels
  add column if not exists position integer not null default 0;

with ranked as (
  select id,
    row_number() over (
      partition by server_id, coalesce(category_id::text, category)
      order by created_at, id
    ) - 1 as new_position
  from public.channels
)
update public.channels as channel
set position = ranked.new_position
from ranked
where ranked.id = channel.id;

-- New channels should appear at the end of their selected category.
create or replace function public.create_server_channel(
  p_server_id uuid,
  p_name text,
  p_category text default 'Text Channels',
  p_category_id uuid default null,
  p_channel_type text default 'text',
  p_description text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_user_id uuid := auth.uid();
  v_channel public.channels;
  v_category text := coalesce(nullif(btrim(p_category), ''), 'Text Channels');
  v_position integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required to create a channel.' using errcode = '42501';
  end if;
  if p_server_id is null then
    raise exception 'A server is required.' using errcode = '22004';
  end if;
  if not public.has_server_permission(p_server_id, 'manage_channels') then
    raise exception 'You do not have permission to create channels in this server.' using errcode = '42501';
  end if;
  if p_name is null or length(btrim(p_name)) < 1 or length(p_name) > 80 then
    raise exception 'Channel name must be between 1 and 80 characters.' using errcode = '22023';
  end if;
  if p_channel_type not in ('text','announcement','forum') then
    raise exception 'Invalid channel type.' using errcode = '22023';
  end if;
  if p_category_id is not null and not exists (
    select 1 from public.channel_categories cc
    where cc.id = p_category_id and cc.server_id = p_server_id
  ) then
    raise exception 'The selected category does not belong to this server.' using errcode = '22023';
  end if;

  select coalesce(max(position), -1) + 1 into v_position
  from public.channels
  where server_id = p_server_id and category = v_category;

  insert into public.channels(
    server_id, name, category, category_id, channel_type,
    permissions_synced, description, created_by, position
  )
  values(
    p_server_id, btrim(p_name), v_category, p_category_id, p_channel_type,
    true, coalesce(p_description, ''), v_user_id, v_position
  )
  returning * into v_channel;

  return to_jsonb(v_channel);
end;
$function$;

revoke all on function public.create_server_channel(uuid,text,text,uuid,text,text) from public, anon;
grant execute on function public.create_server_channel(uuid,text,text,uuid,text,text) to authenticated;
notify pgrst, 'reload schema';
