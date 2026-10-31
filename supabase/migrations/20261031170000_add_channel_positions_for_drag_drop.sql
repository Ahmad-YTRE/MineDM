-- Persist the order of channels within each server/category for drag-and-drop navigation.
alter table public.channels
  add column if not exists position integer not null default 0;

with ranked as (
  select
    id,
    row_number() over (
      partition by server_id, coalesce(category_id::text, category)
      order by created_at, id
    ) - 1 as new_position
  from public.channels
)
update public.channels as channel
set position = ranked.new_position
from ranked
where ranked.id = channel.id;
