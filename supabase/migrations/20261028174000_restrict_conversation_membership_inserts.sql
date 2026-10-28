-- Prevent users from joining existing private conversations by inserting themselves.
-- A conversation creator may insert all intended participants, including themselves.
DROP POLICY IF EXISTS "creator adds conversation members" ON public.conversation_members;
CREATE POLICY "conversation creators add members"
ON public.conversation_members
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = conversation_members.conversation_id
      AND c.created_by = (SELECT auth.uid())
  )
);
