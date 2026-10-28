create table if not exists public.server_roles (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 32),
  color text not null default '#99aab5' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  position integer not null default 0,
  permissions jsonb not null default '{"manage_server":false,"manage_roles":false,"manage_channels":false,"kick_members":false,"manage_messages":false}'::jsonb,
  created_at timestamptz not null default now(),
  unique (server_id, name),
  unique (server_id, id)
);
create table if not exists public.server_member_roles (
  server_id uuid not null,
  user_id uuid not null,
  role_id uuid not null,
  assigned_by uuid default auth.uid(),
  assigned_at timestamptz not null default now(),
  primary key (server_id, user_id, role_id),
  foreign key (server_id, role_id) references public.server_roles(server_id, id) on delete cascade,
  foreign key (server_id, user_id) references public.server_members(server_id, user_id) on delete cascade,
  foreign key (assigned_by) references auth.users(id) on delete set null
);
alter table public.server_roles enable row level security;
alter table public.server_member_roles enable row level security;
grant select, insert, update, delete on public.server_roles to authenticated;
grant select, insert, delete on public.server_member_roles to authenticated;
create index if not exists server_roles_server_position_idx on public.server_roles(server_id, position desc);
create index if not exists server_member_roles_user_idx on public.server_member_roles(server_id, user_id);

create or replace function public.has_server_permission(target_server uuid, permission_name text)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select coalesce(auth.uid() is not null and exists (
    select 1 from public.server_members sm
    where sm.server_id = target_server and sm.user_id = auth.uid()
      and (sm.role in ('owner','admin') or exists (
        select 1 from public.server_member_roles smr
        join public.server_roles sr on sr.id = smr.role_id and sr.server_id = smr.server_id
        where smr.server_id = target_server and smr.user_id = auth.uid()
          and coalesce((sr.permissions ->> permission_name)::boolean, false)
      ))
  ), false);
$$;
revoke all on function public.has_server_permission(uuid,text) from public;
grant execute on function public.has_server_permission(uuid,text) to authenticated;

create policy "members read server roles" on public.server_roles for select to authenticated using (public.is_server_member(server_id));
create policy "admins create server roles" on public.server_roles for insert to authenticated with check (
  public.has_server_permission(server_id,'manage_roles')
  and (not (coalesce((permissions->>'manage_roles')::boolean,false) or coalesce((permissions->>'manage_server')::boolean,false))
    or exists(select 1 from public.servers s where s.id=server_id and s.created_by=auth.uid()))
);
create policy "admins update server roles" on public.server_roles for update to authenticated using (public.has_server_permission(server_id,'manage_roles')) with check (
  public.has_server_permission(server_id,'manage_roles')
  and (not (coalesce((permissions->>'manage_roles')::boolean,false) or coalesce((permissions->>'manage_server')::boolean,false))
    or exists(select 1 from public.servers s where s.id=server_id and s.created_by=auth.uid()))
);
create policy "admins delete server roles" on public.server_roles for delete to authenticated using (public.has_server_permission(server_id,'manage_roles'));
create policy "members read assigned roles" on public.server_member_roles for select to authenticated using (public.is_server_member(server_id));
create policy "admins assign server roles" on public.server_member_roles for insert to authenticated with check (
  public.has_server_permission(server_id,'manage_roles') and user_id <> auth.uid()
  and exists(select 1 from public.server_roles r where r.id=role_id and r.server_id=server_id
    and (not (coalesce((r.permissions->>'manage_roles')::boolean,false) or coalesce((r.permissions->>'manage_server')::boolean,false))
      or exists(select 1 from public.servers s where s.id=server_id and s.created_by=auth.uid()))
);
create policy "admins remove assigned roles" on public.server_member_roles for delete to authenticated using (public.has_server_permission(server_id,'manage_roles') and user_id <> auth.uid());

drop policy if exists "admins create channels" on public.channels;
create policy "admins create channels" on public.channels for insert to authenticated with check (created_by = (select auth.uid()) and public.has_server_permission(server_id,'manage_channels'));
drop policy if exists "admins update channels" on public.channels;
create policy "admins update channels" on public.channels for update to authenticated using (public.has_server_permission(server_id,'manage_channels')) with check (public.has_server_permission(server_id,'manage_channels'));
drop policy if exists "admins delete channels" on public.channels;
create policy "admins delete channels" on public.channels for delete to authenticated using (public.has_server_permission(server_id,'manage_channels'));
drop policy if exists "admins update servers" on public.servers;
create policy "admins update servers" on public.servers for update to authenticated using (public.has_server_permission(id,'manage_server')) with check (public.has_server_permission(id,'manage_server'));
drop policy if exists "users leave server or admins manage members" on public.server_members;
create policy "users leave server or admins manage members" on public.server_members for delete to authenticated using (user_id = (select auth.uid()) or public.has_server_permission(server_id,'kick_members'));
