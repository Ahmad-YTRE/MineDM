-- Voax staff roles, reporting, account blocking, bans, and appeals.
create table if not exists public.voax_staff_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','moderator')),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.voax_staff_roles enable row level security;
grant select on public.voax_staff_roles to authenticated;
drop policy if exists voax_staff_roles_read on public.voax_staff_roles;
create policy voax_staff_roles_read on public.voax_staff_roles for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_voax_admin()));
insert into public.voax_staff_roles(user_id, role, granted_by)
select au.user_id, 'owner', au.granted_by from public.admin_users au
on conflict (user_id) do update set role='owner', granted_by=excluded.granted_by, updated_at=now();

create or replace function private.current_voax_staff_role()
returns text language sql stable security definer set search_path = ''
as $$ select sr.role from public.voax_staff_roles sr where sr.user_id = (select auth.uid()) limit 1; $$;
revoke all on function private.current_voax_staff_role() from public, anon;
grant execute on function private.current_voax_staff_role() to authenticated;

create or replace function private.is_voax_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.voax_staff_roles sr where sr.user_id=(select auth.uid()) and sr.role in ('owner','admin'))
    or exists (select 1 from public.admin_users au where au.user_id=(select auth.uid()));
$$;
revoke all on function private.is_voax_admin() from public, anon;
grant execute on function private.is_voax_admin() to authenticated;
create or replace function private.is_voax_staff()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.voax_staff_roles sr where sr.user_id=(select auth.uid())); $$;
revoke all on function private.is_voax_staff() from public, anon;
grant execute on function private.is_voax_staff() to authenticated;

create table if not exists public.voax_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('account','message','server')),
  target_user_id uuid, target_message_id uuid, target_server_id uuid,
  reason text not null check (char_length(reason) between 3 and 100),
  details text not null default '' check (char_length(details) <= 1000),
  snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), resolved_at timestamptz,
  constraint voax_reports_target_matches_type check (
    (target_type='account' and target_user_id is not null and target_message_id is null and target_server_id is null) or
    (target_type='message' and target_message_id is not null and target_user_id is null and target_server_id is null) or
    (target_type='server' and target_server_id is not null and target_user_id is null and target_message_id is null)
  ),
  constraint voax_reports_not_self check (target_user_id is null or target_user_id <> reporter_id)
);
create index if not exists voax_reports_queue_idx on public.voax_reports(status, created_at desc);
create index if not exists voax_reports_target_user_idx on public.voax_reports(target_user_id) where target_user_id is not null;
create index if not exists voax_reports_target_server_idx on public.voax_reports(target_server_id) where target_server_id is not null;
create unique index if not exists voax_reports_account_duplicate_idx on public.voax_reports(reporter_id,target_user_id) where target_type='account';
create unique index if not exists voax_reports_message_duplicate_idx on public.voax_reports(reporter_id,target_message_id) where target_type='message';
create unique index if not exists voax_reports_server_duplicate_idx on public.voax_reports(reporter_id,target_server_id) where target_type='server';
alter table public.voax_reports enable row level security;
grant select, insert, update on public.voax_reports to authenticated;
drop policy if exists voax_reports_submit on public.voax_reports;
create policy voax_reports_submit on public.voax_reports for insert to authenticated
with check (reporter_id=(select auth.uid()) and (select auth.uid()) is not null);
drop policy if exists voax_reports_staff_read on public.voax_reports;
create policy voax_reports_staff_read on public.voax_reports for select to authenticated using ((select private.is_voax_staff()));
drop policy if exists voax_reports_staff_update on public.voax_reports;
create policy voax_reports_staff_update on public.voax_reports for update to authenticated
using ((select private.is_voax_staff())) with check ((select private.is_voax_staff()));

create table if not exists public.voax_account_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id), constraint voax_account_blocks_not_self check (blocker_id <> blocked_id)
);
create index if not exists voax_account_blocks_blocked_idx on public.voax_account_blocks(blocked_id, blocker_id);
alter table public.voax_account_blocks enable row level security;
grant select, insert, delete on public.voax_account_blocks to authenticated;
drop policy if exists voax_account_blocks_read_own on public.voax_account_blocks;
create policy voax_account_blocks_read_own on public.voax_account_blocks for select to authenticated using (blocker_id=(select auth.uid()));
drop policy if exists voax_account_blocks_insert_own on public.voax_account_blocks;
create policy voax_account_blocks_insert_own on public.voax_account_blocks for insert to authenticated with check (blocker_id=(select auth.uid()) and blocked_id<>(select auth.uid()));
drop policy if exists voax_account_blocks_delete_own on public.voax_account_blocks;
create policy voax_account_blocks_delete_own on public.voax_account_blocks for delete to authenticated using (blocker_id=(select auth.uid()));

create table if not exists public.voax_account_bans (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  reason text not null check (char_length(reason) between 3 and 500),
  duration text not null check (duration in ('1h','24h','7d','30d','permanent')),
  expires_at timestamptz, status text not null default 'active' check (status in ('active','revoked','expired')),
  banned_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id) on delete set null, revoked_at timestamptz
);
create index if not exists voax_account_bans_active_idx on public.voax_account_bans(user_id, expires_at desc) where status='active';
alter table public.voax_account_bans enable row level security;
grant select on public.voax_account_bans to authenticated;
drop policy if exists voax_account_bans_read_own_or_staff on public.voax_account_bans;
create policy voax_account_bans_read_own_or_staff on public.voax_account_bans for select to authenticated
using (user_id=(select auth.uid()) or (select private.is_voax_staff()));

create table if not exists public.voax_ban_appeals (
  id uuid primary key default gen_random_uuid(), ban_id uuid not null references public.voax_account_bans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(message) between 10 and 2000),
  status text not null default 'open' check (status in ('open','reviewing','accepted','rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  response text not null default '' check (char_length(response) <= 1000),
  created_at timestamptz not null default now(), resolved_at timestamptz, unique (ban_id,user_id)
);
create index if not exists voax_ban_appeals_queue_idx on public.voax_ban_appeals(status,created_at desc);
alter table public.voax_ban_appeals enable row level security;
grant select, insert, update on public.voax_ban_appeals to authenticated;
drop policy if exists voax_ban_appeals_read_own_or_staff on public.voax_ban_appeals;
create policy voax_ban_appeals_read_own_or_staff on public.voax_ban_appeals for select to authenticated
using (user_id=(select auth.uid()) or (select private.is_voax_staff()));
drop policy if exists voax_ban_appeals_submit_own on public.voax_ban_appeals;
create policy voax_ban_appeals_submit_own on public.voax_ban_appeals for insert to authenticated
with check (user_id=(select auth.uid()) and exists (select 1 from public.voax_account_bans b where b.id=ban_id and b.user_id=(select auth.uid()) and b.status='active'));
drop policy if exists voax_ban_appeals_staff_update on public.voax_ban_appeals;
create policy voax_ban_appeals_staff_update on public.voax_ban_appeals for update to authenticated
using ((select private.is_voax_staff())) with check ((select private.is_voax_staff()));

drop policy if exists voax_admin_audit_log_admin_read on public.voax_admin_audit_log;
drop policy if exists voax_admin_audit_log_admin_insert on public.voax_admin_audit_log;
create policy voax_admin_audit_log_staff_read on public.voax_admin_audit_log for select to authenticated using ((select private.is_voax_staff()));
create policy voax_admin_audit_log_staff_insert on public.voax_admin_audit_log for insert to authenticated
with check (admin_id=(select auth.uid()) and (select private.is_voax_staff()));

create or replace function private.guard_voax_active_account()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if auth.uid() is not null and exists (select 1 from public.voax_account_bans b
    where b.user_id=auth.uid() and b.status='active' and (b.expires_at is null or b.expires_at>now())) then
    raise exception 'This Voax account is suspended';
  end if;
  return new;
end;
$$;
drop trigger if exists voax_guard_active_messages on public.messages;
create trigger voax_guard_active_messages before insert on public.messages for each row execute function private.guard_voax_active_account();
drop trigger if exists voax_guard_active_friendships on public.friendships;
create trigger voax_guard_active_friendships before insert or update on public.friendships for each row execute function private.guard_voax_active_account();
drop trigger if exists voax_guard_active_server_members on public.server_members;
create trigger voax_guard_active_server_members before insert on public.server_members for each row execute function private.guard_voax_active_account();
drop trigger if exists voax_guard_active_servers on public.servers;
create trigger voax_guard_active_servers before insert on public.servers for each row execute function private.guard_voax_active_account();

create or replace function private.guard_voax_blocked_dm()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.conversation_id is not null and exists (
    select 1 from public.conversation_members cm
    join public.voax_account_blocks b on (b.blocker_id=new.author_id and b.blocked_id=cm.user_id) or (b.blocked_id=new.author_id and b.blocker_id=cm.user_id)
    where cm.conversation_id=new.conversation_id and cm.user_id<>new.author_id
  ) then raise exception 'You cannot send a direct message because one of these accounts has blocked the other'; end if;
  return new;
end;
$$;
drop trigger if exists voax_guard_blocked_dm on public.messages;
create trigger voax_guard_blocked_dm before insert on public.messages for each row execute function private.guard_voax_blocked_dm();

create or replace function private.guard_voax_blocked_friendship()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if exists (select 1 from public.voax_account_blocks b
    where (b.blocker_id=new.requester_id and b.blocked_id=new.addressee_id) or (b.blocker_id=new.addressee_id and b.blocked_id=new.requester_id))
  then raise exception 'Friend requests are unavailable because one of these accounts has blocked the other'; end if;
  return new;
end;
$$;
drop trigger if exists voax_guard_blocked_friendship on public.friendships;
create trigger voax_guard_blocked_friendship before insert or update on public.friendships for each row execute function private.guard_voax_blocked_friendship();

insert into public.voax_reports(reporter_id,target_type,target_server_id,reason,details,status,reviewed_by,created_at,resolved_at,snapshot)
select r.reporter_id,'server',d.server_id,r.reason,r.details,r.status,r.reviewed_by,r.created_at,r.resolved_at,
       jsonb_build_object('server_name',d.server_name,'source','server_discovery_reports')
from public.server_discovery_reports r join public.server_discovery d on d.id=r.listing_id
on conflict do nothing;
