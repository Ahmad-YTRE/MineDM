create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
grant select on public.admin_users to authenticated;
create policy admin_users_read_own on public.admin_users
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function private.is_voax_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.admin_users au where au.user_id = (select auth.uid()));
$$;
revoke all on function private.is_voax_admin() from public, anon;
grant execute on function private.is_voax_admin() to authenticated;

create table public.server_discovery (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null unique references public.servers(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  server_name text not null check (char_length(server_name) between 1 and 60),
  icon_url text,
  banner_url text,
  short_description text not null check (char_length(short_description) between 1 and 120),
  full_description text not null check (char_length(full_description) <= 500),
  category text not null check (category in ('Gaming','Minecraft','Community','Technology','Art','Music','Education','Other','Programming','Sports','Entertainment')),
  tags text[] not null default '{}',
  language text not null default 'English' check (char_length(language) between 2 and 40),
  listing_enabled boolean not null default true,
  listing_status text not null default 'pending' check (listing_status in ('pending','approved','rejected')),
  rejection_reason text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index server_discovery_public_sort_idx on public.server_discovery(listing_status, listing_enabled, created_at desc);
create index server_discovery_category_idx on public.server_discovery(category, listing_status, listing_enabled);
create index server_discovery_owner_idx on public.server_discovery(owner_id, updated_at desc);
alter table public.server_discovery enable row level security;
grant select on public.server_discovery to anon, authenticated;
grant insert, update, delete on public.server_discovery to authenticated;

create or replace function private.guard_server_discovery_listing()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if private.is_voax_admin() then
    new.updated_at := now();
    return new;
  end if;
  if auth.uid() is null or new.owner_id <> auth.uid() then
    raise exception 'Only the server owner can manage this listing';
  end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.server_members sm where sm.server_id = new.server_id and sm.user_id = auth.uid() and sm.role = 'owner') then
      raise exception 'Only the server owner can submit an Explore listing';
    end if;
    new.listing_status := 'pending';
    new.reviewed_at := null;
    new.reviewed_by := null;
    new.rejection_reason := null;
    new.submitted_at := now();
  else
    if new.server_id <> old.server_id or new.owner_id <> old.owner_id then
      raise exception 'A listing cannot be transferred to another server or owner';
    end if;
    if new.server_name is distinct from old.server_name
      or new.icon_url is distinct from old.icon_url
      or new.banner_url is distinct from old.banner_url
      or new.short_description is distinct from old.short_description
      or new.full_description is distinct from old.full_description
      or new.category is distinct from old.category
      or new.tags is distinct from old.tags
      or new.language is distinct from old.language then
      new.listing_status := 'pending';
      new.reviewed_at := null;
      new.reviewed_by := null;
      new.rejection_reason := null;
      new.submitted_at := now();
    else
      new.listing_status := old.listing_status;
      new.reviewed_at := old.reviewed_at;
      new.reviewed_by := old.reviewed_by;
      new.rejection_reason := old.rejection_reason;
      new.submitted_at := old.submitted_at;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger server_discovery_guard_before_write before insert or update on public.server_discovery
for each row execute function private.guard_server_discovery_listing();

create policy server_discovery_read_visible_or_owned on public.server_discovery
  for select to anon, authenticated
  using ((listing_status = 'approved' and listing_enabled = true) or auth.uid() = owner_id or (select private.is_voax_admin()));
create policy server_discovery_owner_insert on public.server_discovery
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.server_members sm where sm.server_id = server_discovery.server_id and sm.user_id = (select auth.uid()) and sm.role = 'owner')
  );
create policy server_discovery_owner_or_admin_update on public.server_discovery
  for update to authenticated using (owner_id = (select auth.uid()) or (select private.is_voax_admin()))
  with check (owner_id = (select auth.uid()) or (select private.is_voax_admin()));
create policy server_discovery_owner_or_admin_delete on public.server_discovery
  for delete to authenticated using (owner_id = (select auth.uid()) or (select private.is_voax_admin()));

create table public.server_discovery_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.server_discovery(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 80),
  details text not null default '' check (char_length(details) <= 500),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index server_discovery_reports_status_idx on public.server_discovery_reports(status, created_at desc);
alter table public.server_discovery_reports enable row level security;
grant select, insert, update on public.server_discovery_reports to authenticated;
create policy server_discovery_reports_submit on public.server_discovery_reports
  for insert to authenticated with check (
    reporter_id = (select auth.uid())
    and exists (select 1 from public.server_discovery sd where sd.id = server_discovery_reports.listing_id and sd.listing_status = 'approved' and sd.listing_enabled = true)
  );
create policy server_discovery_reports_admin_read on public.server_discovery_reports
  for select to authenticated using ((select private.is_voax_admin()));
create policy server_discovery_reports_admin_update on public.server_discovery_reports
  for update to authenticated using ((select private.is_voax_admin())) with check ((select private.is_voax_admin()));

create table public.voax_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (char_length(action) between 1 and 100),
  target_type text not null check (char_length(target_type) between 1 and 50),
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index voax_admin_audit_log_created_idx on public.voax_admin_audit_log(created_at desc);
alter table public.voax_admin_audit_log enable row level security;
grant select, insert on public.voax_admin_audit_log to authenticated;
create policy voax_admin_audit_log_admin_read on public.voax_admin_audit_log
  for select to authenticated using ((select private.is_voax_admin()));
create policy voax_admin_audit_log_admin_insert on public.voax_admin_audit_log
  for insert to authenticated with check (admin_id = (select auth.uid()) and (select private.is_voax_admin()));

create policy voax_admin_read_profiles on public.profiles for select to authenticated using ((select private.is_voax_admin()));
create policy voax_admin_read_servers on public.servers for select to authenticated using ((select private.is_voax_admin()));
create policy voax_admin_read_server_members on public.server_members for select to authenticated using ((select private.is_voax_admin()));

create function public.get_explore_server_cards()
returns table (
  listing_id uuid, server_id uuid, server_public_id text, server_name text, icon_url text, banner_url text,
  short_description text, full_description text, category text, tags text[], language text, owner_id uuid,
  created_at timestamptz, member_count bigint, online_count bigint
)
language sql stable security definer set search_path = ''
as $$
  select d.id, s.id, s.public_id, d.server_name, d.icon_url, d.banner_url,
    d.short_description, d.full_description, d.category, d.tags, d.language, d.owner_id, d.created_at,
    (select count(*) from public.server_members sm where sm.server_id = s.id),
    (select count(*) from public.server_members sm join public.user_presence up on up.user_id = sm.user_id where sm.server_id = s.id and up.status <> 'Offline')
  from public.server_discovery d join public.servers s on s.id = d.server_id
  where d.listing_status = 'approved' and d.listing_enabled = true
  order by d.created_at desc;
$$;
revoke all on function public.get_explore_server_cards() from public;
grant execute on function public.get_explore_server_cards() to anon, authenticated;

create function public.join_discovered_server(p_server_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in to join a server'; end if;
  if not exists (select 1 from public.server_discovery d where d.server_id = p_server_id and d.listing_status = 'approved' and d.listing_enabled = true) then
    raise exception 'This server is not currently available in Explore';
  end if;
  insert into public.server_members(server_id,user_id,role) values (p_server_id,auth.uid(),'member') on conflict (server_id,user_id) do nothing;
  return p_server_id;
end;
$$;
revoke all on function public.join_discovered_server(uuid) from public, anon;
grant execute on function public.join_discovered_server(uuid) to authenticated;

create function public.get_server_invite_preview(p_invite_code text)
returns table (server_id uuid, server_public_id text, server_name text, description text, icon_url text, banner_url text, member_count bigint, online_count bigint, is_member boolean)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.public_id, s.name, s.description, s.icon_url,
    case when d.listing_status = 'approved' and d.listing_enabled then d.banner_url else null end,
    (select count(*) from public.server_members sm where sm.server_id = s.id),
    (select count(*) from public.server_members sm join public.user_presence up on up.user_id = sm.user_id where sm.server_id = s.id and up.status <> 'Offline'),
    exists (select 1 from public.server_members sm where sm.server_id = s.id and sm.user_id = (select auth.uid()))
  from public.servers s left join public.server_discovery d on d.server_id = s.id
  where s.invite_code = trim(p_invite_code) limit 1;
$$;
revoke all on function public.get_server_invite_preview(text) from public;
grant execute on function public.get_server_invite_preview(text) to anon, authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('server-discovery-banners','server-discovery-banners',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;

create policy server_discovery_banner_public_read on storage.objects for select to anon, authenticated
using (bucket_id = 'server-discovery-banners');
create policy server_discovery_banner_owner_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'server-discovery-banners'
  and exists (select 1 from public.server_members sm where sm.server_id::text = (storage.foldername(name))[1] and sm.user_id = (select auth.uid()) and sm.role = 'owner')
);
create policy server_discovery_banner_owner_update on storage.objects for update to authenticated using (
  bucket_id = 'server-discovery-banners'
  and exists (select 1 from public.server_members sm where sm.server_id::text = (storage.foldername(name))[1] and sm.user_id = (select auth.uid()) and sm.role = 'owner')
) with check (
  bucket_id = 'server-discovery-banners'
  and exists (select 1 from public.server_members sm where sm.server_id::text = (storage.foldername(name))[1] and sm.user_id = (select auth.uid()) and sm.role = 'owner')
);
create policy server_discovery_banner_owner_delete on storage.objects for delete to authenticated using (
  bucket_id = 'server-discovery-banners'
  and exists (select 1 from public.server_members sm where sm.server_id::text = (storage.foldername(name))[1] and sm.user_id = (select auth.uid()) and sm.role = 'owner')
);
