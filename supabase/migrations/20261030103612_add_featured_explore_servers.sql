alter table public.server_discovery add column is_featured boolean not null default false;
create index server_discovery_featured_idx on public.server_discovery(is_featured, listing_status, listing_enabled);
drop function public.get_explore_server_cards();
create function public.get_explore_server_cards()
returns table (
  listing_id uuid, server_id uuid, server_public_id text, server_name text, icon_url text, banner_url text,
  short_description text, full_description text, category text, tags text[], language text, owner_id uuid,
  created_at timestamptz, member_count bigint, online_count bigint, is_featured boolean
)
language sql stable security definer set search_path = ''
as $$
  select d.id, s.id, s.public_id, d.server_name, d.server_name, d.banner_url,
    d.short_description, d.full_description, d.category, d.tags, d.language, d.owner_id, d.created_at,
    (select count(*) from public.server_members sm where sm.server_id = s.id),
    (select count(*) from public.server_members sm join public.user_presence up on up.user_id = sm.user_id where sm.server_id = s.id and up.status <> 'Offline'),
    d.is_featured
  from public.server_discovery d join public.servers s on s.id = d.server_id
  where d.listing_status = 'approved' and d.listing_enabled = true
  order by d.is_featured desc, d.created_at desc;
$$;
revoke all on function public.get_explore_server_cards() from public;
grant execute on function public.get_explore_server_cards() to anon, authenticated;
