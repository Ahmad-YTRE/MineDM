-- Cover frequently traversed foreign keys and high-traffic lookups.
-- Existing leading-column indexes are intentionally reused rather than duplicated.
CREATE INDEX IF NOT EXISTS channel_messages_author_id_idx ON public.channel_messages (author_id);
CREATE INDEX IF NOT EXISTS channels_created_by_idx ON public.channels (created_by);
CREATE INDEX IF NOT EXISTS conversations_created_by_idx ON public.conversations (created_by);
CREATE INDEX IF NOT EXISTS message_reactions_user_id_idx ON public.message_reactions (user_id);
CREATE INDEX IF NOT EXISTS messages_author_id_idx ON public.messages (author_id);
CREATE INDEX IF NOT EXISTS messages_reply_to_idx ON public.messages (reply_to);
CREATE INDEX IF NOT EXISTS notifications_actor_id_idx ON public.notifications (actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS server_member_roles_assigned_by_idx ON public.server_member_roles (assigned_by) WHERE assigned_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS server_member_roles_server_role_idx ON public.server_member_roles (server_id, role_id);
CREATE INDEX IF NOT EXISTS servers_created_by_idx ON public.servers (created_by);
CREATE INDEX IF NOT EXISTS friendships_requester_status_idx ON public.friendships (requester_id, status);
