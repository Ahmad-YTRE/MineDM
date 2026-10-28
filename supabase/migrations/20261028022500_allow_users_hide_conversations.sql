drop policy if exists "Users can leave their own conversations" on public.conversation_members;
create policy "Users can leave their own conversations"
on public.conversation_members
for delete
to authenticated
using (user_id = auth.uid());