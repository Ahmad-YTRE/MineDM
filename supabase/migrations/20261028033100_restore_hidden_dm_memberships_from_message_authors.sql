insert into public.conversation_members (conversation_id, user_id, hidden_at)
select distinct m.conversation_id, m.author_id, now()
from public.messages m
where m.conversation_id is not null
  and not exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = m.conversation_id
      and cm.user_id = m.author_id
  )
on conflict do nothing;
