alter table public.conversation_members
  add column if not exists hidden_at timestamptz;

drop policy if exists "Users can hide and restore their own conversations" on public.conversation_members;
create policy "Users can hide and restore their own conversations"
on public.conversation_members
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

revoke update on public.conversation_members from authenticated;
grant update (hidden_at) on public.conversation_members to authenticated;

drop policy if exists "Users can leave their own conversations" on public.conversation_members;
