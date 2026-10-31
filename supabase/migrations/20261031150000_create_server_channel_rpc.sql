-- Create channels through a narrowly scoped RPC so permission checks are
-- evaluated explicitly before the SECURITY DEFINER insert.
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
as $$
declare
  v_user_id uuid := auth.uid();
  v_channel public.channels;
begin
  if v_user_id is null then
    raise exception 'Authentication required to create a channel.'
      using errcode = '42501';
  end if;

  if p_server_id is null then
    raise exception 'A server is required.'
      using errcode = '22004';
  end if;

  if not public.has_server_permission(p_server_id, 'manage_channels') then
    raise exception 'You do not have permission to create channels in this server.'
      using errcode = '42501';
  end if;

  if p_name is null or length(btrim(p_name)) < 1 or length(p_name) > 80 then
    raise exception 'Channel name must be between 1 and 80 characters.'
      using errcode = '22023';
  end if;

  if p_channel_type not in ('text', 'announcement', 'forum') then
    raise exception 'Invalid channel type.'
      using errcode = '22023';
  end if;

  if p_category_id is not null and not exists (
    select 1
    from public.channel_categories cc
    where cc.id = p_category_id
      and cc.server_id = p_server_id
  ) then
    raise exception 'The selected category does not belong to this server.'
      using errcode = '22023';
  end if;

  insert into public.channels (
    server_id, name, category, category_id, channel_type,
    permissions_synced, description, created_by
  )
  values (
    p_server_id,
    btrim(p_name),
    coalesce(nullif(btrim(p_category), ''), 'Text Channels'),
    p_category_id,
    p_channel_type,
    true,
    coalesce(p_description, ''),
    v_user_id
  )
  returning * into v_channel;

  return to_jsonb(v_channel);
end;
$$;

revoke all on function public.create_server_channel(uuid, text, text, uuid, text, text)
  from public, anon;
grant execute on function public.create_server_channel(uuid, text, text, uuid, text, text)
  to authenticated;

notify pgrst, 'reload schema';
