create table if not exists public.channel_read_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);
create index if not exists channel_read_states_channel_idx on public.channel_read_states (channel_id);
alter table public.channel_read_states enable row level security;
revoke all on public.channel_read_states from anon, public;
grant select, insert, update on public.channel_read_states to authenticated;
drop policy if exists "Users read their own channel read states" on public.channel_read_states;
create policy "Users read their own channel read states" on public.channel_read_states for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Users create their own channel read states" on public.channel_read_states;
create policy "Users create their own channel read states" on public.channel_read_states for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_server_member((select server_id from public.channels where id = channel_id)));
drop policy if exists "Users update their own channel read states" on public.channel_read_states;
create policy "Users update their own channel read states" on public.channel_read_states for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_server_member((select server_id from public.channels where id = channel_id)));
