-- Keep the notification schema aligned with the ping inbox and realtime client.
alter table public.notifications
  add column if not exists interruptive boolean not null default true;

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in ('message', 'friend_request', 'friend_accepted', 'mention'));

create index if not exists notifications_unread_recipient_created_idx
  on public.notifications (recipient_id, created_at desc)
  where read_at is null;

comment on column public.notifications.interruptive is
  'Whether a new notification should trigger an immediate in-app alert; inbox delivery is independent.';
