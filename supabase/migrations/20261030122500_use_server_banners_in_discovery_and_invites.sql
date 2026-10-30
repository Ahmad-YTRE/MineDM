create or replace function public.get_explore_server_cards()
returns table(
  listing_id uuid, server_id uuid, server_public_id text, server_name text,
  icon_url text, banner_url text, short_description text, full_description text,
  category text, tags text[], language text, owner_id uuid, created_at timestamptz,
  member_count bigint, online_count bigint, is_featured boolean
)
language sql
stable
security definer
set search_path to ''
as $function$
  select d.id, s.id, s.public_id, d.server_name, d.icon_url,
         coalesce(s.banner_url, d.banner_url),
         d.short_description, d.full_description, d.category, d.tags, d.language,
         d.owner_id, d.created_at,
         (select count(*) from public.server_members sm where sm.server_id = s.id),
         (select count(*) from public.server_members sm
          join public.user_presence up on up.user_id = sm.user_id
          where sm.server_id = s.id and up.status <> 'Offline'),
         d.is_featured
  from public.server_discovery d
  join public.servers s on s.id = d.server_id
  where d.listing_status = 'approved' and d.listing_enabled = true
  order by d.is_featured desc, d.created_at desc;
$function$;

create or replace function public.get_server_invite_preview(p_invite_code text)
returns table(
  server_id uuid, server_public_id text, server_name text, description text,
  icon_url text, banner_url text, member_count bigint, online_count bigint, is_member boolean
)
language sql
stable
security definer
set search_path to ''
as $function$
  select s.id, s.public_id, s.name, s.description, s.icon_url,
         coalesce(s.banner_url, case when d.listing_status = 'approved' and d.listing_enabled then d.banner_url else null end),
         (select count(*) from public.server_members sm where sm.server_id = s.id),
         (select count(*) from public.server_members sm
          join public.user_presence up on up.user_id = sm.user_id
          where sm.server_id = s.id and up.status <> 'Offline'),
         exists (select 1 from public.server_members sm where sm.server_id = s.id and sm.user_id = (select auth.uid()))
  from public.servers s
  left join public.server_discovery d on d.server_id = s.id
  where s.invite_code = trim(p_invite_code)
  limit 1;
$function$;
