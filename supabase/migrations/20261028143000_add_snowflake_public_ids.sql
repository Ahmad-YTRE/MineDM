-- Add public Snowflake-style identifiers without changing internal UUID primary keys.
-- Timestamp bits use a 2020-01-01 epoch; the low 22 bits come from a shared sequence.
-- IDs are stored as text so JavaScript never rounds 64-bit integers.

CREATE SEQUENCE IF NOT EXISTS public.snowflake_counter AS bigint;

CREATE OR REPLACE FUNCTION public.generate_snowflake_id()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = ''
AS $$
  SELECT (
    (
      floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint
      - 1577836800000
    ) * 4194304
    + (pg_catalog.nextval('public.snowflake_counter'::regclass) % 4194304)
  )::text;
$$;

REVOKE ALL ON FUNCTION public.generate_snowflake_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_snowflake_id() TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.snowflake_counter TO authenticated, service_role;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS public_id text DEFAULT public.generate_snowflake_id();
ALTER TABLE public.servers ADD COLUMN IF NOT EXISTS public_id text DEFAULT public.generate_snowflake_id();
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS public_id text DEFAULT public.generate_snowflake_id();
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS public_id text DEFAULT public.generate_snowflake_id();
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS public_id text DEFAULT public.generate_snowflake_id();
ALTER TABLE public.channel_messages ADD COLUMN IF NOT EXISTS public_id text DEFAULT public.generate_snowflake_id();
ALTER TABLE public.friendships ADD COLUMN IF NOT EXISTS public_id text DEFAULT public.generate_snowflake_id();
ALTER TABLE public.message_reactions ADD COLUMN IF NOT EXISTS public_id text DEFAULT public.generate_snowflake_id();
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS public_id text DEFAULT public.generate_snowflake_id();

UPDATE public.profiles SET public_id = public.generate_snowflake_id() WHERE public_id IS NULL;
UPDATE public.servers SET public_id = public.generate_snowflake_id() WHERE public_id IS NULL;
UPDATE public.channels SET public_id = public.generate_snowflake_id() WHERE public_id IS NULL;
UPDATE public.conversations SET public_id = public.generate_snowflake_id() WHERE public_id IS NULL;
UPDATE public.messages SET public_id = public.generate_snowflake_id() WHERE public_id IS NULL;
UPDATE public.channel_messages SET public_id = public.generate_snowflake_id() WHERE public_id IS NULL;
UPDATE public.friendships SET public_id = public.generate_snowflake_id() WHERE public_id IS NULL;
UPDATE public.message_reactions SET public_id = public.generate_snowflake_id() WHERE public_id IS NULL;
UPDATE public.notifications SET public_id = public.generate_snowflake_id() WHERE public_id IS NULL;

ALTER TABLE public.profiles ALTER COLUMN public_id SET NOT NULL;
ALTER TABLE public.servers ALTER COLUMN public_id SET NOT NULL;
ALTER TABLE public.channels ALTER COLUMN public_id SET NOT NULL;
ALTER TABLE public.conversations ALTER COLUMN public_id SET NOT NULL;
ALTER TABLE public.messages ALTER COLUMN public_id SET NOT NULL;
ALTER TABLE public.channel_messages ALTER COLUMN public_id SET NOT NULL;
ALTER TABLE public.friendships ALTER COLUMN public_id SET NOT NULL;
ALTER TABLE public.message_reactions ALTER COLUMN public_id SET NOT NULL;
ALTER TABLE public.notifications ALTER COLUMN public_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_public_id_key ON public.profiles(public_id);
CREATE UNIQUE INDEX IF NOT EXISTS servers_public_id_key ON public.servers(public_id);
CREATE UNIQUE INDEX IF NOT EXISTS channels_public_id_key ON public.channels(public_id);
CREATE UNIQUE INDEX IF NOT EXISTS conversations_public_id_key ON public.conversations(public_id);
CREATE UNIQUE INDEX IF NOT EXISTS messages_public_id_key ON public.messages(public_id);
CREATE UNIQUE INDEX IF NOT EXISTS channel_messages_public_id_key ON public.channel_messages(public_id);
CREATE UNIQUE INDEX IF NOT EXISTS friendships_public_id_key ON public.friendships(public_id);
CREATE UNIQUE INDEX IF NOT EXISTS message_reactions_public_id_key ON public.message_reactions(public_id);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_public_id_key ON public.notifications(public_id);
