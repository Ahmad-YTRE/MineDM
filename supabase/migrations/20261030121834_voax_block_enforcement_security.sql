-- Make block enforcement independent of the caller's row-level visibility.
create or replace function private.guard_voax_blocked_dm()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and new.author_id <> auth.uid() then
    raise exception 'Message author does not match the authenticated account';
  end if;
  if new.conversation_id is not null and exists (
    select 1 from public.conversation_members cm
    join public.voax_account_blocks b
      on (b.blocker_id=new.author_id and b.blocked_id=cm.user_id)
      or (b.blocked_id=new.author_id and b.blocker_id=cm.user_id)
    where cm.conversation_id=new.conversation_id and cm.user_id<>new.author_id
  ) then
    raise exception 'You cannot send a direct message because one of these accounts has blocked the other';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_voax_blocked_dm() from public, anon, authenticated;

create or replace function private.guard_voax_blocked_friendship()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and auth.uid() not in (new.requester_id,new.addressee_id) then
    raise exception 'Friendship participants do not match the authenticated account';
  end if;
  if exists (
    select 1 from public.voax_account_blocks b
    where (b.blocker_id=new.requester_id and b.blocked_id=new.addressee_id)
       or (b.blocker_id=new.addressee_id and b.blocked_id=new.requester_id)
  ) then
    raise exception 'Friend requests are unavailable because one of these accounts has blocked the other';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_voax_blocked_friendship() from public, anon, authenticated;
