create policy "conversation creators can see their conversations"
on public.conversations
for select
to authenticated
using (created_by = (select auth.uid()));
