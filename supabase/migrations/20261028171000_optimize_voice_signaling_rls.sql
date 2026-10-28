DROP POLICY IF EXISTS "MineDM conversation members receive voice signaling" ON realtime.messages;
CREATE POLICY "MineDM conversation members receive voice signaling"
ON realtime.messages FOR SELECT TO authenticated
USING (
  realtime.topic() LIKE 'minedm-voice-%'
  AND private IS TRUE
  AND EXISTS (
    SELECT 1 FROM public.conversation_members cm
    WHERE realtime.topic() = 'minedm-voice-' || cm.conversation_id::text
      AND cm.user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "MineDM conversation members send voice signaling" ON realtime.messages;
CREATE POLICY "MineDM conversation members send voice signaling"
ON realtime.messages FOR INSERT TO authenticated
WITH CHECK (
  realtime.topic() LIKE 'minedm-voice-%'
  AND private IS TRUE
  AND EXISTS (
    SELECT 1 FROM public.conversation_members cm
    WHERE realtime.topic() = 'minedm-voice-' || cm.conversation_id::text
      AND cm.user_id = (SELECT auth.uid())
  )
);
