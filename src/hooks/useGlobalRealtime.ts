'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useSupabaseAuth } from '@/components/SupabaseAuthProvider';
import { usePathname } from 'next/navigation';

export function useGlobalRealtime() {
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const supabase = createClient();
  const pathname = usePathname();
  const notificationPermissionRef = useRef<NotificationPermission | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().then((permission) => {
          notificationPermissionRef.current = permission;
        });
      } else {
        notificationPermissionRef.current = Notification.permission;
      }
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('global_messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const newMessage = payload.new;
          
          // Only process messages not sent by the current user
          if (newMessage.sender_id === user.id || newMessage.senderId === user.id) return;

          // Check if we are currently in this chat
          const activeChatId = pathname.startsWith('/chat/') ? pathname.split('/').pop() : null;
          const isCurrentChat = activeChatId === newMessage.chat_id || activeChatId === newMessage.chatId;

          // If not in the current chat, we should notify the user and refresh the chat list
          if (!isCurrentChat) {
            // Refresh chats list to update unread badge and preview
            queryClient.invalidateQueries({ queryKey: ['chats'] });

            // Trigger browser notification if possible
            if (notificationPermissionRef.current === 'granted' && document.visibilityState !== 'visible') {
              new Notification('Нове повідомлення', {
                body: newMessage.content || '📎 Медіафайл',
                icon: '/logo.png', // Fallback to logo or user image if available
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, supabase, queryClient, pathname]);
}
