-- Users may only react to messages they are allowed to read.
DROP POLICY IF EXISTS "Users can react to readable messages" ON public.message_reactions;
CREATE POLICY "Users can react to readable messages"
ON public.message_reactions
FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.id = message_reactions.message_id
      AND (
        (m.channel_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.channels c
          WHERE c.id = m.channel_id
            AND public.is_server_member(c.server_id)
        ))
        OR
        (m.conversation_id IS NOT NULL
          AND public.is_conversation_member(m.conversation_id))
      )
  )
);
