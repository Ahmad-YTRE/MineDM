create or replace function private.sync_server_discovery_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.name is distinct from old.name or new.icon_url is distinct from old.icon_url then
    update public.server_discovery
      set server_name = new.name,
          icon_url = new.icon_url
      where server_id = new.id;
  end if;
  return new;
end;
$$;
create trigger servers_sync_discovery_identity
after update of name, icon_url on public.servers
for each row execute function private.sync_server_discovery_identity();
