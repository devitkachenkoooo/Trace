-- Add DELETE policy for messages to enable real-time deletion updates
DROP POLICY IF EXISTS "Users can delete their own messages" ON public.messages;
CREATE POLICY "Users can delete their own messages" ON public.messages
FOR DELETE USING (
    sender_id = auth.uid()::text
    AND EXISTS (
        SELECT 1 FROM public.chats c
        WHERE c.id = messages.chat_id
        AND (c.user_id = auth.uid()::text OR c.recipient_id = auth.uid()::text)
    )
);
