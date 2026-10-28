-- Allow a user to retry a friend request they previously had rejected.
-- The requester can only transition their own rejected row back to pending.
DROP POLICY IF EXISTS "requesters can retry rejected friend requests" ON public.friendships;
CREATE POLICY "requesters can retry rejected friend requests"
ON public.friendships
FOR UPDATE TO authenticated
USING (requester_id = (SELECT auth.uid()) AND status = 'rejected')
WITH CHECK (requester_id = (SELECT auth.uid()) AND status = 'pending');

-- This duplicate CHECK enforces the same rule as friendships_no_self_request.
ALTER TABLE public.friendships DROP CONSTRAINT IF EXISTS friendships_check;
