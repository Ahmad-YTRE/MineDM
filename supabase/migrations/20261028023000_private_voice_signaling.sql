drop policy if exists "MineDM conversation members receive voice signaling" on realtime.messages;
create policy "MineDM conversation members receive voice signaling"
on realtime.messages
for select
to authenticated
using (
  realtime.topic() like 'minedm-voice-%'
  and private is true
  and exists (
    select 1
    from public.conversation_members cm
    where realtime.topic() = 'minedm-voice-' || cm.conversation_id::text
      and cm.user_id = auth.uid()
  )
);

drop policy if exists "MineDM conversation members send voice signaling" on realtime.messages;
create policy "MineDM conversation members send voice signaling"
on realtime.messages
for insert
to authenticated
with check (
  realtime.topic() like 'minedm-voice-%'
  and private is true
  and exists (
    select 1
    from public.conversation_members cm
    where realtime.topic() = 'minedm-voice-' || cm.conversation_id::text
      and cm.user_id = auth.uid()
  )
);