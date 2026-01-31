'use client';

import { type InfiniteData, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { supabase } from '@/lib/supabase/client';
import { normalizePayload } from '@/lib/supabase/utils';
import { usePresenceStore } from '@/store/usePresenceStore';
import type { FullChat, Message } from '@/types';
import type { User } from '@supabase/supabase-js';

interface RealtimePayload<T = Record<string, unknown>> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T;
  old: Partial<T>;
  errors?: string[];
}

interface ChatPayload {
  id: string;
  user_id: string;
  recipient_id: string;
  user_last_read_id?: string | null;
  recipient_last_read_id?: string | null;
  user_last_read_at?: string | null;
  recipient_last_read_at?: string | null;
  created_at: string;
  [key: string]: unknown;
}

interface MessagePayload {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  [key: string]: unknown;
}

export function useGlobalRealtime(user: User | null) {
  const queryClient = useQueryClient();
  const setOnlineUsers = usePresenceStore((state) => state.setOnlineUsers);

  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;

    const channel = supabase.channel('db-global-updates', {
      config: { presence: { key: userId } },
    });

    const updateLastSeen = async () => {
      await supabase.rpc('update_last_seen');
    };

    const heartbeatInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        updateLastSeen();
      }
    }, 1000 * 60 * 5);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        updateLastSeen();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', updateLastSeen);

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const onlineIds = new Set<string>();
        for (const key of Object.keys(state)) {
          onlineIds.add(key);
        }
        setOnlineUsers(onlineIds);
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['contacts'], exact: false });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chats' },
        (payload: RealtimePayload<ChatPayload>) => {
          console.log('🚀 Realtime: Chats update received:', payload);

          const normalizedNew = payload.new ? normalizePayload<ChatPayload>(payload.new) : null;
          const normalizedOld = payload.old ? normalizePayload<Partial<ChatPayload>>(payload.old) : null;

          if (payload.eventType === 'DELETE') {
            const deletedId = normalizedOld?.id;
            queryClient.removeQueries({ queryKey: ['chat', deletedId] });
            queryClient.setQueryData(['chats'], (old: FullChat[] | undefined) => 
              old ? old.filter(c => c.id !== deletedId) : []
            );
            return;
          }

          if (payload.eventType === 'UPDATE') {
            const updatedChat = normalizedNew;
            if (!updatedChat) return;

            const messagesCache = queryClient.getQueryData<InfiniteData<Message[]>>(['messages', updatedChat.id]);
            const allMessages = messagesCache?.pages.flat() || [];
            let shouldInvalidate = false;

            const resolveReadStatus = (newId: string | undefined | null, oldStatus: { id: string; createdAt: string } | null | undefined) => {
              if (!newId || newId === oldStatus?.id) return oldStatus;

              // Check for message in strict typed array first, but handle potentially raw data structure if needed
              // casting to 'any' for the find search to support _id fallback if accidentally present
              const message = allMessages.find((m) => m.id === newId) as (Message & { _id?: string }) | undefined;
              
              if (message) {
                 // Try standard 'createdAt' first (Project convention), fallback to 'created_at' if raw
                const timestamp = message.createdAt || (message as any).created_at || (message as any).timestamp;
                if (timestamp) {
                  console.log('✅ Found message for status:', newId, timestamp);
                  return { id: newId, createdAt: timestamp };
                }
              }

              console.warn('⚠️ Message not found in cache for ID:', newId);
              shouldInvalidate = true; 
              return oldStatus; 
            };

            // 1. Update Detailed Chat Cache
            queryClient.setQueryData(['chat', updatedChat.id], (oldData: FullChat | undefined) => {
              if (!oldData) return oldData;
              return {
                ...oldData,
                recipientLastRead: resolveReadStatus(updatedChat.recipientLastReadId as string | null | undefined, oldData.recipientLastRead),
                userLastRead: resolveReadStatus(updatedChat.userLastReadId as string | null | undefined, oldData.userLastRead),
                recipientLastReadId: updatedChat.recipientLastReadId ?? oldData.recipientLastReadId,
                userLastReadId: updatedChat.userLastReadId ?? oldData.userLastReadId,
              } as FullChat;
            });

            // 2. Update Sidebar Chat List
            queryClient.setQueryData(['chats'], (oldChats: FullChat[] | undefined) => {
              if (!oldChats) return oldChats;
              return oldChats.map((c) => {
                if (c.id !== updatedChat.id) return c;
                return {
                  ...c,
                  recipientLastRead: resolveReadStatus(updatedChat.recipientLastReadId as string | null | undefined, c.recipientLastRead),
                  userLastRead: resolveReadStatus(updatedChat.userLastReadId as string | null | undefined, c.userLastRead),
                  recipientLastReadId: updatedChat.recipientLastReadId ?? c.recipientLastReadId,
                  userLastReadId: updatedChat.userLastReadId ?? c.userLastReadId,
                };
              });
            });

            // 3. FORCE RE-RENDER of messages to update "isRead" status in UI
            // We're expecting InfiniteData structure here
            queryClient.setQueryData(['messages', updatedChat.id], (oldData: InfiniteData<Message[]> | undefined) => {
              if (!oldData) return oldData;
              // We need to trigger a reference change for the data consumption hooks
              return {
                ...oldData,
                // Adding a property to the root object might not be valid for InfiniteData type strictly, 
                // but if we just want to re-trigger, copying the array is safer in React Query
                pages: [...oldData.pages]
              };
            });

            if (shouldInvalidate) {
              queryClient.invalidateQueries({ queryKey: ['chat', updatedChat.id] });
              queryClient.invalidateQueries({ queryKey: ['chats'] });
            }
            return;
          }

          if (payload.eventType === 'INSERT') {
            const newChat = normalizedNew;
            if (!newChat) return;
            const isParticipant = !newChat.user_id || newChat.user_id === userId || newChat.recipient_id === userId;
            if (isParticipant) {
              queryClient.invalidateQueries({ queryKey: ['chats'] });
            }
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        (payload: RealtimePayload<MessagePayload>) => {
          const chatId = payload.new?.chat_id || payload.old?.chat_id;
          if (!chatId) return;

          const normalizedNew = payload.new ? normalizePayload<MessagePayload>(payload.new) : null;
          const normalizedOld = payload.old ? normalizePayload<Partial<MessagePayload>>(payload.old) : null;

          if (payload.eventType === 'DELETE') {
            const deletedId = normalizedOld?.id;
            queryClient.setQueryData(['messages', chatId], (oldData: InfiniteData<Message[]> | undefined) => {
              if (!oldData) return oldData;
              return {
                ...oldData,
                pages: oldData.pages.map((page) => page.filter((m) => m.id !== deletedId)),
              };
            });
            queryClient.invalidateQueries({ queryKey: ['chats'] });
            return;
          }

          if (payload.eventType === 'INSERT') {
            const newMessage = normalizedNew;
            if (!newMessage) return;
            queryClient.setQueryData(['messages', chatId], (oldData: InfiniteData<Message[]> | undefined) => {
               if (!oldData) return oldData;
               const newPages = [...oldData.pages];
               const lastPageIdx = newPages.length - 1;
               const exists = newPages.some(page => page.some((m) => m.id === newMessage.id));
               if (exists) return oldData;
               
               // Ensure the last page exists before appending
               if (lastPageIdx >= 0) {
                 newPages[lastPageIdx] = [...newPages[lastPageIdx], newMessage as unknown as Message];
               } else {
                 newPages[0] = [newMessage as unknown as Message];
               }
               
               return { ...oldData, pages: newPages };
            });
            queryClient.invalidateQueries({ queryKey: ['chats'] });
            return;
          }

          if (payload.eventType === 'UPDATE') {
            const updatedMessage = normalizedNew;
            if (!updatedMessage) return;
            queryClient.setQueryData(['messages', chatId], (oldData: InfiniteData<Message[]> | undefined) => {
               if (!oldData) return oldData;
               return {
                 ...oldData,
                 pages: oldData.pages.map((page) => 
                   page.map((msg) => msg.id === updatedMessage.id ? updatedMessage as unknown as Message : msg)
                 )
               };
            });
          }
        },
      )
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          });
        }
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
           updateLastSeen();
        }
      });

    return () => {
      clearInterval(heartbeatInterval);
      updateLastSeen();
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', updateLastSeen);
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient, setOnlineUsers]);
}