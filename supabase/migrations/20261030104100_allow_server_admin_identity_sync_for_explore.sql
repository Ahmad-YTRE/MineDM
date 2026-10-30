drop policy server_discovery_owner_or_admin_update on public.server_discovery;
create policy server_discovery_owner_or_server_admin_update on public.server_discovery
for update to authenticated
using (
  owner_id = (select auth.uid())
  or (select private.is_voax_admin())
  or exists (
    select 1 from public.server_members sm
    where sm.server_id = server_discovery.server_id
      and sm.user_id = (select auth.uid())
      and sm.role in ('owner','admin')
  )
)
with check (
  owner_id = (select auth.uid())
  or (select private.is_voax_admin())
  or exists (
    select 1 from public.server_members sm
    where sm.server_id = server_discovery.server_id
      and sm.user_id = (select auth.uid())
      and sm.role in ('owner','admin')
  )
);

create or replace function private.guard_server_discovery_listing()
returns trigger language plpgsql set search_path = ''
as $$
declare can_manage boolean;
begin
  if private.is_voax_admin() then
    new.updated_at := now();
    return new;
  end if;
  if auth.uid() is null then raise exception 'Only a server owner or administrator can manage this listing'; end if;
  select exists (
    select 1 from public.server_members sm
    where sm.server_id = new.server_id and sm.user_id = auth.uid() and sm.role in ('owner','admin')
  ) into can_manage;
  if not can_manage then raise exception 'Only a server owner or administrator can manage this listing'; end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.server_members sm where sm.server_id = new.server_id and sm.user_id = auth.uid() and sm.role = 'owner') then
      raise exception 'Only the server owner can submit an Explore listing';
    end if;
    new.listing_status := 'pending'; new.reviewed_at := null; new.reviewed_by := null;
    new.rejection_reason := null; new.submitted_at := now();
  else
    if new.server_id <> old.server_id or new.owner_id <> old.owner_id then
      raise exception 'A listing cannot be transferred to another server or owner';
    end if;
    if new.server_name is distinct from old.server_name
      or new.icon_url is distinct from old.icon_url
      or new.banner_url is distinct from old.banner_url
      or new.short_description is distinct from old.short_description
      or new.full_description is distinct from old.full_description
      or new.category is distinct from old.category
      or new.tags is distinct from old.tags
      or new.language is distinct from old.language then
      new.listing_status := 'pending'; new.reviewed_at := null; new.reviewed_by := null;
      new.rejection_reason := null; new.submitted_at := now();
    else
      new.listing_status := old.listing_status; new.reviewed_at := old.reviewed_at;
      new.reviewed_by := old.reviewed_by; new.rejection_reason := old.rejection_reason;
      new.submitted_at := old.submitted_at;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
