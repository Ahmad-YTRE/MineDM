-- Atomic, permission-checked ordering operations for the Discord-style sidebar.
create or replace function public.reorder_server_categories(p_server_id uuid,p_category_ids uuid[])
returns void language plpgsql security definer set search_path=public,auth as $function$
declare v_user_id uuid:=auth.uid(); v_expected integer;
begin
 if v_user_id is null then raise exception 'Authentication required.' using errcode='42501'; end if;
 if p_server_id is null or not public.has_server_permission(p_server_id,'manage_channels') then raise exception 'You do not have permission to reorder categories.' using errcode='42501'; end if;
 perform 1 from public.channel_categories where server_id=p_server_id order by id for update;
 select count(*) into v_expected from public.channel_categories where server_id=p_server_id and name<>'Text Channels';
 if cardinality(coalesce(p_category_ids,'{}'::uuid[]))<>v_expected or cardinality(coalesce(p_category_ids,'{}'::uuid[]))<>(select count(distinct requested.id) from unnest(coalesce(p_category_ids,'{}'::uuid[])) as requested(id)) then raise exception 'The category order is incomplete or contains duplicates.' using errcode='22023'; end if;
 if exists(select 1 from unnest(coalesce(p_category_ids,'{}'::uuid[])) as requested(id) left join public.channel_categories category on category.id=requested.id and category.server_id=p_server_id where category.id is null or category.name='Text Channels') then raise exception 'One or more categories do not belong to this server.' using errcode='22023'; end if;
 update public.channel_categories category set position=requested.ordinality-1 from unnest(coalesce(p_category_ids,'{}'::uuid[])) with ordinality as requested(id,ordinality) where category.id=requested.id and category.server_id=p_server_id;
end;$function$;

create or replace function public.move_server_channel(p_server_id uuid,p_channel_id uuid,p_target_category_id uuid,p_target_category_name text,p_destination_channel_ids uuid[])
returns void language plpgsql security definer set search_path=public,auth as $function$
declare v_user_id uuid:=auth.uid(); v_source_category text; v_source_category_id uuid; v_target_name text:=coalesce(nullif(btrim(p_target_category_name),''),'Text Channels'); v_expected integer;
begin
 if v_user_id is null then raise exception 'Authentication required.' using errcode='42501'; end if;
 if p_server_id is null or not public.has_server_permission(p_server_id,'manage_channels') then raise exception 'You do not have permission to move channels.' using errcode='42501'; end if;
 perform 1 from public.channels where server_id=p_server_id order by id for update;
 select category,category_id into v_source_category,v_source_category_id from public.channels where id=p_channel_id and server_id=p_server_id;
 if not found then raise exception 'Channel not found in this server.' using errcode='22023'; end if;
 if p_target_category_id is null then
  if v_target_name<>'Text Channels' then raise exception 'Choose a valid destination category.' using errcode='22023'; end if;
 elsif not exists(select 1 from public.channel_categories where id=p_target_category_id and server_id=p_server_id and name=v_target_name) then raise exception 'The destination category does not belong to this server.' using errcode='22023';
 end if;
 select count(*) into v_expected from public.channels where server_id=p_server_id and (id=p_channel_id or (category_id is not distinct from p_target_category_id and category=v_target_name));
 if cardinality(coalesce(p_destination_channel_ids,'{}'::uuid[]))<>v_expected or cardinality(coalesce(p_destination_channel_ids,'{}'::uuid[]))<>(select count(distinct requested.id) from unnest(coalesce(p_destination_channel_ids,'{}'::uuid[])) as requested(id)) then raise exception 'The destination order is incomplete or contains duplicates.' using errcode='22023'; end if;
 if exists(select 1 from unnest(coalesce(p_destination_channel_ids,'{}'::uuid[])) as requested(id) left join public.channels channel on channel.id=requested.id and channel.server_id=p_server_id where channel.id is null or (requested.id<>p_channel_id and (channel.category_id is distinct from p_target_category_id or channel.category<>v_target_name))) then raise exception 'The destination order contains an unrelated channel.' using errcode='22023'; end if;
 update public.channels set category=v_target_name,category_id=p_target_category_id where id=p_channel_id and server_id=p_server_id;
 update public.channels channel set position=requested.ordinality-1 from unnest(p_destination_channel_ids) with ordinality as requested(id,ordinality) where channel.id=requested.id and channel.server_id=p_server_id;
 if v_source_category is distinct from v_target_name or v_source_category_id is distinct from p_target_category_id then
  with ranked as(select id,row_number() over(order by position,created_at,id)-1 as new_position from public.channels where server_id=p_server_id and id<>p_channel_id and category=v_source_category and category_id is not distinct from v_source_category_id)
  update public.channels channel set position=ranked.new_position from ranked where channel.id=ranked.id;
 end if;
end;$function$;
revoke all on function public.reorder_server_categories(uuid,uuid[]) from public,anon;
revoke all on function public.move_server_channel(uuid,uuid,uuid,text,uuid[]) from public,anon;
grant execute on function public.reorder_server_categories(uuid,uuid[]) to authenticated;
grant execute on function public.move_server_channel(uuid,uuid,uuid,text,uuid[]) to authenticated;
notify pgrst,'reload schema';
