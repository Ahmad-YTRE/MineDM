insert into public.conversation_members (conversation_id, user_id, hidden_at)
select distinct n.entity_id, n.recipient_id, now()
from public.notifications n
join public.conversations c on c.id = n.entity_id
where n.type = 'message'
  and n.recipient_id is not null
  and not exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = n.entity_id
      and cm.user_id = n.recipient_id
  )
on conflict do nothing;
