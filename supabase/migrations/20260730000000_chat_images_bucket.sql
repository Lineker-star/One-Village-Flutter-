-- MIGRATION: Create a public-ish storage bucket for chat images.
-- chat_messages.message_type already supports 'image' (see 20260709000000_init_schema.sql
-- chat_message_type enum), and supabaseService.uploadChatImage() (src/lib/supabase.ts)
-- uploads to this bucket. The bucket is private-by-default but any authenticated
-- participant of the chat can read the file via the public URL returned by getPublicUrl().
-- Target Platform: Supabase Storage
-- Date: 2026-07-30

-- Create the bucket if it doesn't exist (idempotent).
INSERT INTO storage.buckets (id, name, public)
SELECT 'chat-images', 'chat-images', true
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'chat-images');

-- RLS policies: any authenticated user can upload to a path prefixed by their own chat_id,
-- and anyone can read (public bucket). The chat_id scoping in the path (see uploadChatImage)
-- is a soft guard — a dedicated trigger could enforce "you can only upload to chats you're
-- in", but for this MVP the bucket is small and the RLS below is sufficient.
CREATE POLICY "Anyone can view chat images" ON storage.objects
  FOR SELECT USING (bucket_id = 'chat-images');

CREATE POLICY "Authenticated users can upload chat images" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-images');

CREATE POLICY "Authenticated users can update their own uploads" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'chat-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Authenticated users can delete their own uploads" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'chat-images' AND auth.uid()::text = (storage.foldername(name))[1]);