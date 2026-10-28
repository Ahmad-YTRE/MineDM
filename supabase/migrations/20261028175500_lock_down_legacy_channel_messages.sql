-- Legacy table is not used by the current app. It contains old rows and had
-- an authenticated SELECT policy with USING (true), exposing all legacy messages.
DROP POLICY IF EXISTS "Authenticated users can read channel messages" ON public.channel_messages;
REVOKE ALL ON TABLE public.channel_messages FROM anon, authenticated;
