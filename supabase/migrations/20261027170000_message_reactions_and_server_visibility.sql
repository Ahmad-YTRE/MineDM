drop policy if exists "servers visible to members" on public.servers;
create policy "servers visible to members or their creator"
on public.servers for select to authenticated
using (created_by = (select auth.uid()) or is_server_member(id));

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);
alter table public.message_reactions enable row level security;
grant select, insert, delete on public.message_reactions to authenticated;
drop policy if exists "Users can read their own message reactions" on public.message_reactions;
create policy "Users can read their own message reactions" on public.message_reactions for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Users can react to readable messages" on public.message_reactions;
create policy "Users can react to readable messages" on public.message_reactions for insert to authenticated
with check (user_id = (select auth.uid()) and exists (select 1 from public.messages m where m.id = message_id));
drop policy if exists "Users can remove their own message reactions" on public.message_reactions;
create policy "Users can remove their own message reactions" on public.message_reactions for delete to authenticated using (user_id = (select auth.uid()));
