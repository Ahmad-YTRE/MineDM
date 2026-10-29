-- Harden mention syntax, use recent presence for @here, and keep admin mass-ping access owner-controlled.
create table if not exists public.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'Online' check (status in ('Online','Idle','Do not disturb','Offline')),
  last_seen_at timestamptz not null default now()
);
alter table public.user_presence enable row level security;
drop policy if exists "users publish their own presence" on public.user_presence;
create policy "users publish their own presence" on public.user_presence for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update,delete on public.user_presence to authenticated;

create or replace function public.ping_token_present(p_body text,p_label text)
returns boolean language plpgsql immutable set search_path=pg_catalog
as $function$
declare
 v_text text:=coalesce(p_body,'');
 v_needle text:='@'||lower(coalesce(p_label,''));
 v_search integer:=1;
 v_pos integer;
 v_before text;
 v_after text;
 v_slashes integer;
 v_i integer;
begin
 if v_needle='@' then return false; end if;
 v_text:=regexp_replace(v_text,chr(96)||chr(96)||chr(96)||'.*?'||chr(96)||chr(96)||chr(96),' ','gs');
 v_text:=regexp_replace(v_text,chr(96)||'[^'||chr(96)||']*'||chr(96),' ','g');
 while v_search<=length(v_text) loop
  v_pos:=strpos(lower(substring(v_text from v_search)),v_needle);
  if v_pos=0 then return false; end if;
  v_pos:=v_pos+v_search-1;
  v_before:=case when v_pos>1 then substring(v_text from v_pos-1 for 1) else '' end;
  v_after:=substring(v_text from v_pos+length(v_needle) for 1);
  v_slashes:=0; v_i:=v_pos-1;
  while v_i>0 and substring(v_text from v_i for 1)=chr(92) loop v_slashes:=v_slashes+1; v_i:=v_i-1; end loop;
  if (v_before='' or v_before !~ '[[:alnum:]_]') and (v_after='' or v_after !~ '[[:alnum:]_]') and v_slashes%2=0 then return true; end if;
  v_search:=v_pos+1;
 end loop;
 return false;
end;
$function$;
revoke all on function public.ping_token_present(text,text) from public,anon,authenticated;

create or replace function public.guard_admin_mass_ping_setting()
returns trigger language plpgsql security definer set search_path=public,auth
as $function$
declare v_owner boolean;
begin
 select exists(select 1 from public.servers s where s.id=new.server_id and s.created_by=auth.uid()) into v_owner;
 if not v_owner then
  if tg_op='INSERT' and new.admin_mass_pings_enabled is distinct from true then
   raise exception 'Only the server owner can change administrator mass-ping access.';
  elsif tg_op='UPDATE' and new.admin_mass_pings_enabled is distinct from old.admin_mass_pings_enabled then
   raise exception 'Only the server owner can change administrator mass-ping access.';
  end if;
 end if;
 return new;
end;
$function$;
revoke all on function public.guard_admin_mass_ping_setting() from public,anon,authenticated;
drop trigger if exists guard_admin_mass_ping_setting on public.server_ping_settings;
create trigger guard_admin_mass_ping_setting before insert or update on public.server_ping_settings for each row execute function public.guard_admin_mass_ping_setting();

create or replace function public.send_message_with_pings(
 p_channel_id uuid,
 p_conversation_id uuid,
 p_body text,
 p_attachments jsonb default '[]'::jsonb,
 p_reply_to uuid default null,
 p_mentions jsonb default '[]'::jsonb,
 p_confirmed boolean default false
) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp
as $function$
declare
 v_uid uuid:=auth.uid();
 v_server_id uuid;
 v_server_role text;
 v_settings public.server_ping_settings%rowtype;
 v_body text:=btrim(coalesce(p_body,''));
 v_message public.messages%rowtype;
 v_token jsonb;
 v_target uuid;
 v_role_id uuid;
 v_type text;
 v_target_ids uuid[];
 v_target_id uuid;
 v_targets jsonb:='[]'::jsonb;
 v_existing jsonb;
 v_types text[];
 v_role_ids uuid[];
 v_target_count integer:=0;
 v_direct_count integer:=0;
 v_role_count integer:=0;
 v_is_mass boolean:=false;
 v_cooldown_applies boolean:=false;
 v_now timestamptz:=clock_timestamp();
 v_pref public.user_notification_preferences%rowtype;
 v_global_mode text:='all';
 v_override_mode text;
 v_interruptive boolean;
 v_title text;
 v_notification_body text;
 v_status text;
 v_attachment jsonb;
 v_expected_prefix text;
begin
 if v_uid is null then raise exception 'You must be signed in to send messages.'; end if;
 if length(v_body)>4000 then raise exception 'Messages cannot exceed 4000 characters.'; end if;
 if v_body='' and (p_attachments is null or jsonb_array_length(p_attachments)=0) then raise exception 'Write a message or attach a file before sending.'; end if;
 if (p_channel_id is null)=(p_conversation_id is null) then raise exception 'Choose exactly one channel or direct conversation.'; end if;
 if jsonb_typeof(coalesce(p_mentions,'[]'::jsonb))<>'array' then raise exception 'Invalid mention data.'; end if;
 if jsonb_typeof(coalesce(p_attachments,'[]'::jsonb))<>'array' then raise exception 'Invalid attachments.'; end if;
 if p_channel_id is not null then
  select c.server_id into v_server_id from public.channels c where c.id=p_channel_id;
  if v_server_id is null or not public.is_server_member(v_server_id) then raise exception 'You no longer have access to this channel.'; end if;
  select sm.role into v_server_role from public.server_members sm where sm.server_id=v_server_id and sm.user_id=v_uid;
  insert into public.server_ping_settings(server_id) values(v_server_id) on conflict(server_id) do nothing;
  select * into v_settings from public.server_ping_settings where server_id=v_server_id;
 else
  if not public.is_conversation_member(p_conversation_id) then raise exception 'You no longer have access to this conversation.'; end if;
 end if;
 if p_reply_to is not null and not exists(select 1 from public.messages m where m.id=p_reply_to and ((p_channel_id is not null and m.channel_id=p_channel_id) or (p_conversation_id is not null and m.conversation_id=p_conversation_id))) then raise exception 'The reply target is not in this conversation.'; end if;
 if p_channel_id is not null then v_expected_prefix:='channels/'||p_channel_id::text||'/'; else v_expected_prefix:='conversations/'||p_conversation_id::text||'/'; end if;
 for v_attachment in select value from jsonb_array_elements(coalesce(p_attachments,'[]'::jsonb)) loop
  if coalesce(v_attachment->>'path','') not like v_expected_prefix||'%' then raise exception 'An attachment belongs to a different conversation.'; end if;
  if coalesce(length(v_attachment->>'name'),0)>255 or coalesce(length(v_attachment->>'mimeType'),0)>150 then raise exception 'Invalid attachment metadata.'; end if;
 end loop;
 if p_channel_id is not null then
  for v_token in select value from jsonb_array_elements(coalesce(p_mentions,'[]'::jsonb)) loop
   v_type:=lower(coalesce(v_token->>'type','')); v_target_ids:='{}'::uuid[]; v_role_id:=null;
   if v_type='user' then
    begin v_target:=(v_token->>'id')::uuid; exception when others then raise exception 'Invalid member mention.'; end;
    if v_target=v_uid then continue; end if;
    if not exists(select 1 from public.server_members sm where sm.server_id=v_server_id and sm.user_id=v_target) then raise exception 'A mentioned member is not in this server.'; end if;
    if not exists(select 1 from public.profiles p where p.id=v_target and public.ping_token_present(v_body,p.username)) then raise exception 'Member mention does not match the message text.'; end if;
    v_target_ids:=array[v_target]; v_direct_count:=v_direct_count+1;
   elsif v_type='role' then
    begin v_role_id:=(v_token->>'id')::uuid; exception when others then raise exception 'Invalid role mention.'; end;
    if not exists(select 1 from public.server_roles r where r.id=v_role_id and r.server_id=v_server_id and public.ping_token_present(v_body,r.name)) then raise exception 'Role mention does not match a role in this server.'; end if;
    if not (coalesce((select r.allow_anyone_to_mention from public.server_roles r where r.id=v_role_id),false) or v_server_role in ('owner','admin') or exists(select 1 from public.server_member_roles smr join public.server_roles sr on sr.id=smr.role_id and sr.server_id=smr.server_id where smr.server_id=v_server_id and smr.user_id=v_uid and coalesce((sr.permissions->>'mention_roles')::boolean,false))) then raise exception 'You do not have permission to mention that role.'; end if;
    select coalesce(array_agg(smr.user_id),'{}'::uuid[]) into v_target_ids from public.server_member_roles smr where smr.server_id=v_server_id and smr.role_id=v_role_id;
    v_role_count:=v_role_count+1;
   elsif v_type in ('everyone','here') then
    if not public.ping_token_present(v_body,v_type) then raise exception 'Mass mention does not match the message text.'; end if;
    if v_type='everyone' then
     if not (v_server_role='owner' or (v_server_role='admin' and v_settings.admin_mass_pings_enabled) or (v_server_role not in ('admin','owner') and exists(select 1 from public.server_member_roles smr join public.server_roles sr on sr.id=smr.role_id and sr.server_id=smr.server_id where smr.server_id=v_server_id and smr.user_id=v_uid and coalesce((sr.permissions->>'mention_everyone')::boolean,false)))) then raise exception 'You do not have permission to use @everyone.'; end if;
     select coalesce(array_agg(sm.user_id),'{}'::uuid[]) into v_target_ids from public.server_members sm where sm.server_id=v_server_id;
    else
     if not (v_server_role='owner' or (v_server_role='admin' and v_settings.admin_mass_pings_enabled) or (v_server_role not in ('admin','owner') and exists(select 1 from public.server_member_roles smr join public.server_roles sr on sr.id=smr.role_id and sr.server_id=smr.server_id where smr.server_id=v_server_id and smr.user_id=v_uid and coalesce((sr.permissions->>'mention_here')::boolean,false)))) then raise exception 'You do not have permission to use @here.'; end if;
     select coalesce(array_agg(sm.user_id),'{}'::uuid[]) into v_target_ids from public.server_members sm join public.user_presence up on up.user_id=sm.user_id where sm.server_id=v_server_id and up.status in ('Online','Idle','Do not disturb') and up.last_seen_at>v_now-interval '90 seconds';
    end if;
    v_is_mass:=true;
   else raise exception 'Unsupported mention type.';
   end if;
   foreach v_target_id in array v_target_ids loop
    if v_target_id=v_uid then continue; end if;
    select value into v_existing from jsonb_array_elements(v_targets) where value->>'recipient_id'=v_target_id::text limit 1;
    if v_existing is null then
     v_targets:=v_targets||jsonb_build_array(jsonb_build_object('recipient_id',v_target_id,'types',jsonb_build_array(v_type),'role_ids',case when v_role_id is null then '[]'::jsonb else jsonb_build_array(v_role_id) end));
    else
     v_targets:=(select coalesce(jsonb_agg(case when value->>'recipient_id'=v_target_id::text then jsonb_set(jsonb_set(value,'{types}',(coalesce(value->'types','[]'::jsonb)||jsonb_build_array(v_type)),'true'),'{role_ids}',(coalesce(value->'role_ids','[]'::jsonb)||case when v_role_id is null then '[]'::jsonb else jsonb_build_array(v_role_id) end),'true') else value end),'[]'::jsonb) from jsonb_array_elements(v_targets));
    end if;
   end loop;
  end loop;
  select count(*) into v_target_count from jsonb_array_elements(v_targets);
  v_cooldown_applies:=v_is_mass or (v_role_count>0 and v_target_count>v_settings.confirmation_threshold);
  if v_target_count>v_settings.confirmation_threshold and (v_is_mass or v_role_count>0) and not p_confirmed then return jsonb_build_object('confirmation_required',true,'target_count',v_target_count,'threshold',v_settings.confirmation_threshold); end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text||':'||v_server_id::text,0));
  if v_cooldown_applies and v_settings.cooldown_seconds>0 and exists(select 1 from public.server_ping_cooldowns c where c.server_id=v_server_id and c.sender_id=v_uid and c.last_ping_at>v_now-make_interval(secs=>v_settings.cooldown_seconds)) then raise exception 'Mass-ping cooldown is active. Please wait before pinging this server again.'; end if;
  if (select count(*) from public.ping_rate_limit_events e where e.server_id=v_server_id and e.sender_id=v_uid and e.created_at>v_now-interval '5 seconds')>=v_settings.messages_per_5s then raise exception 'You are sending messages too quickly. Please wait a moment.'; end if;
  if v_direct_count>0 and (select coalesce(sum(e.direct_target_count),0) from public.ping_rate_limit_events e where e.server_id=v_server_id and e.sender_id=v_uid and e.created_at>v_now-interval '10 seconds')+v_direct_count>v_settings.direct_targets_per_10s then raise exception 'You are mentioning people too quickly. Please wait a moment.'; end if;
  if v_role_count>0 and (select coalesce(sum(e.role_action_count),0) from public.ping_rate_limit_events e where e.server_id=v_server_id and e.sender_id=v_uid and e.created_at>v_now-interval '60 seconds')+v_role_count>v_settings.role_actions_per_60s then raise exception 'You are mentioning roles too quickly. Please wait a moment.'; end if;
 end if;
 insert into public.messages(channel_id,conversation_id,author_id,body,attachments,reply_to) values(p_channel_id,p_conversation_id,v_uid,case when v_body='' then 'Shared an attachment' else v_body end,coalesce(p_attachments,'[]'::jsonb),p_reply_to) returning * into v_message;
 if p_channel_id is not null then
  for v_existing in select value from jsonb_array_elements(v_targets) loop
   v_target:=(v_existing->>'recipient_id')::uuid;
   select coalesce(array_agg(distinct x),'{}') into v_types from jsonb_array_elements_text(v_existing->'types') x;
   select coalesce(array_agg(distinct x::uuid),'{}'::uuid[]) into v_role_ids from jsonb_array_elements_text(v_existing->'role_ids') x;
   insert into public.message_mentions(message_id,recipient_id,mention_types,role_ids) values(v_message.id,v_target,v_types,v_role_ids) on conflict(message_id,recipient_id) do nothing;
   select * into v_pref from public.user_notification_preferences where user_id=v_target;
   v_global_mode:=coalesce(v_pref.global_mode,'all'); v_override_mode:=null;
   select no.mode into v_override_mode from public.notification_overrides no where no.user_id=v_target and ((no.scope_type='channel' and no.scope_id=p_channel_id) or (no.scope_type='server' and no.scope_id=v_server_id)) order by case when no.scope_type='channel' then 0 else 1 end limit 1;
   if v_override_mode is not null then v_interruptive:=v_override_mode in ('all','mentions'); else v_interruptive:=v_global_mode in ('all','mentions'); end if;
   v_interruptive:=v_interruptive and (('user'=any(v_types) and coalesce(v_pref.direct_mentions_enabled,true)) or ('role'=any(v_types) and coalesce(v_pref.role_mentions_enabled,true)) or ('everyone'=any(v_types) and coalesce(v_pref.everyone_mentions_enabled,true)) or ('here'=any(v_types) and coalesce(v_pref.here_mentions_enabled,true));
   select p.status into v_status from public.profiles p where p.id=v_target;
   if v_status='Do not disturb' then v_interruptive:=false; end if;
   if exists(select 1 from public.user_notification_blocks b where b.user_id=v_target and b.blocked_actor_id=v_uid) then v_interruptive:=false; end if;
   v_title:=case when 'everyone'=any(v_types) then '@everyone mentioned you' when 'here'=any(v_types) then '@here mentioned you' when 'role'=any(v_types) then 'Your role was mentioned' else 'You were mentioned' end;
   v_notification_body:=left(case when v_body='' then 'Shared an attachment' else v_body end,240);
   insert into public.notifications(recipient_id,actor_id,type,title,body,entity_id,interruptive) values(v_target,v_uid,'mention',v_title,v_notification_body,v_message.id,v_interruptive);
  end loop;
  insert into public.ping_rate_limit_events(server_id,sender_id,message_id,direct_target_count,role_action_count,is_mass_ping) values(v_server_id,v_uid,v_message.id,v_direct_count,v_role_count,v_is_mass);
  if v_cooldown_applies and v_settings.cooldown_seconds>0 then insert into public.server_ping_cooldowns(server_id,sender_id,last_ping_at) values(v_server_id,v_uid,v_now) on conflict(server_id,sender_id) do update set last_ping_at=excluded.last_ping_at; end if;
 end if;
 return jsonb_build_object('confirmation_required',false,'target_count',v_target_count,'message',to_jsonb(v_message));
end;
$function$;
revoke all on function public.send_message_with_pings(uuid,uuid,text,jsonb,uuid,jsonb,boolean) from public,anon;
grant execute on function public.send_message_with_pings(uuid,uuid,text,jsonb,uuid,jsonb,boolean) to authenticated;
