-- Remove redundant duplicate indexes/policies and consolidate OR-equivalent RLS rules.
DROP INDEX IF EXISTS public.message_reactions_unique_user_emoji;

-- Profiles had duplicate SELECT, INSERT, and UPDATE policies with identical intent.
DROP POLICY IF EXISTS "profiles readable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Users can create their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "users create own profile" ON public.profiles;
DROP POLICY IF EXISTS "users update own profile" ON public.profiles;
CREATE POLICY "users create own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY "users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- Replace two permissive SELECT policies with one equivalent policy.
DROP POLICY IF EXISTS "conversation creators can see their conversations" ON public.conversations;
DROP POLICY IF EXISTS "conversation members can see conversations" ON public.conversations;
CREATE POLICY "conversation participants can see conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING (created_by = (SELECT auth.uid()) OR public.is_conversation_member(id));

-- Author and moderator message permissions were separate permissive policies.
-- Consolidating their OR logic avoids duplicate policy evaluation while preserving access.
DROP POLICY IF EXISTS "authors delete own messages" ON public.messages;
DROP POLICY IF EXISTS "role managers delete channel messages" ON public.messages;
CREATE POLICY "authors or moderators delete messages" ON public.messages
  FOR DELETE TO authenticated
  USING (
    author_id = (SELECT auth.uid())
    OR (
      channel_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.channels c
        WHERE c.id = messages.channel_id
          AND public.has_server_permission(c.server_id, 'manage_messages')
      )
    )
  );

DROP POLICY IF EXISTS "authors edit own messages" ON public.messages;
DROP POLICY IF EXISTS "role managers edit channel messages" ON public.messages;
CREATE POLICY "authors or moderators edit messages" ON public.messages
  FOR UPDATE TO authenticated
  USING (
    author_id = (SELECT auth.uid())
    OR (
      channel_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.channels c
        WHERE c.id = messages.channel_id
          AND public.has_server_permission(c.server_id, 'manage_messages')
      )
    )
  )
  WITH CHECK (
    author_id = (SELECT auth.uid())
    OR (
      channel_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.channels c
        WHERE c.id = messages.channel_id
          AND public.has_server_permission(c.server_id, 'manage_messages')
      )
    )
  );
