-- The current app has no message-edit flow. Remove broad UPDATE access because
-- the old author policy allowed changing channel_id/conversation_id on an owned row.
DROP POLICY IF EXISTS "authors or moderators edit messages" ON public.messages;
REVOKE UPDATE ON TABLE public.messages FROM anon, authenticated;
