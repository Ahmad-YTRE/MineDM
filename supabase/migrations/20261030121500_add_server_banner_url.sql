alter table public.servers add column if not exists banner_url text;

comment on column public.servers.banner_url is
  'Public server banner URL used in server overview and invite previews.';
