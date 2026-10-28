CREATE OR REPLACE FUNCTION public.get_unread_channel_counts()
RETURNS TABLE(channel_id uuid, unread_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, auth
AS $$
  SELECT c.id AS channel_id, count(m.id)::bigint AS unread_count
  FROM public.channels c
  JOIN public.server_members sm
    ON sm.server_id = c.server_id
   AND sm.user_id = (SELECT auth.uid())
  LEFT JOIN public.channel_read_states rs
    ON rs.channel_id = c.id
   AND rs.user_id = (SELECT auth.uid())
  LEFT JOIN public.messages m
    ON m.channel_id = c.id
   AND m.author_id <> (SELECT auth.uid())
   AND m.created_at > COALESCE(rs.last_read_at, now())
  GROUP BY c.id;
$$;

REVOKE ALL ON FUNCTION public.get_unread_channel_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_unread_channel_counts() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_unread_channel_counts() TO authenticated;
