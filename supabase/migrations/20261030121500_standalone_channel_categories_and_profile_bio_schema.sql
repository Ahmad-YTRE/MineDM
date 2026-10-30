alter table public.profiles add column if not exists bio text not null default '';

create table if not exists public.channel_categories (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 32),
  position integer not null default 0,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (server_id, name)
);

alter table public.channel_categories enable row level security;
drop policy if exists "categories visible to server members" on public.channel_categories;
create policy "categories visible to server members" on public.channel_categories for select to authenticated using (public.is_server_member(server_id));
drop policy if exists "admins create channel categories" on public.channel_categories;
create policy "admins create channel categories" on public.channel_categories for insert to authenticated with check (created_by = auth.uid() and public.has_server_permission(server_id, 'manage_channels'));
drop policy if exists "admins update channel categories" on public.channel_categories;
create policy "admins update channel categories" on public.channel_categories for update to authenticated using (public.has_server_permission(server_id, 'manage_channels')) with check (public.has_server_permission(server_id, 'manage_channels'));
drop policy if exists "admins delete channel categories" on public.channel_categories;
create policy "admins delete channel categories" on public.channel_categories for delete to authenticated using (public.has_server_permission(server_id, 'manage_channels'));

notify pgrst, 'reload schema';
