create or replace function public.guard_friendship_transition()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.requester_id is distinct from old.requester_id or new.addressee_id is distinct from old.addressee_id then
    raise exception 'Friendship participants cannot be changed';
  end if;
  if old.status <> 'pending' or new.status not in ('accepted', 'rejected') then
    raise exception 'Only pending friend requests can be accepted or rejected';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_friendship_transition() from public, anon, authenticated;
drop trigger if exists minedm_guard_friendship_transition on public.friendships;
create trigger minedm_guard_friendship_transition before update on public.friendships
  for each row execute function public.guard_friendship_transition();

create unique index if not exists friendships_unique_active_pair
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id))
  where status in ('pending', 'accepted');
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'friendships_no_self_request') then
    alter table public.friendships add constraint friendships_no_self_request
      check (requester_id <> addressee_id) not valid;
  end if;
end $$;
alter table public.friendships validate constraint friendships_no_self_request;
