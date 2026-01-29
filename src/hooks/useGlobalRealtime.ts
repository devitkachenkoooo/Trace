'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { normalizePayload } from '@/lib/supabase/utils';
import { usePresenceStore } from '@/store/usePresenceStore';
import type { User } from '@supabase/supabase-js';
import type { FullChat, Message } from '@/types';

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

    // --- ДОДАЄМО HEARTBEAT ТУТ ---
    const heartbeatInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        updateLastSeen();
        console.log('💓 Heartbeat: status updated');
      }
    }, 1000 * 60 * 5); // 5 хвилин
    // ----------------------------

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
          queryClient.invalidateQueries({
            queryKey: ['contacts'],
            exact: false,
          });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chats' },
        (payload: any) => {
          // 1. If chat was deleted, REMOVE it from cache to prevent ghost refetches
          if (payload.eventType === 'DELETE') {
            const deletedId = payload.old.id;
            
            // Check if this chat was in our list
            const cachedChats = queryClient.getQueryData<FullChat[]>(['chats']) || [];
            const wasKnownChat = cachedChats.some((c) => c.id === deletedId);
            
            if (wasKnownChat) {
              queryClient.removeQueries({ queryKey: ['chat', deletedId] });
              queryClient.removeQueries({ queryKey: ['messages', deletedId] });
              // Optimistically update the list
              queryClient.setQueryData(['chats'], (old: FullChat[] | undefined) => 
                old ? old.filter(c => c.id !== deletedId) : []
              );
            }
            return;
          }

          // 2. For UPDATE/INSERT
          const newChat = payload.new;
          if (!newChat) return;

          // Check if this chat belongs to the current user
          const isParticipant = newChat.user_id === userId || newChat.recipient_id === userId;
          
          if (isParticipant) {
             // For new or updated chats, we should invalidate to fetch full details (participants etc)
            queryClient.invalidateQueries({ queryKey: ['chats'] });
            if (newChat.id) {
               queryClient.invalidateQueries({ queryKey: ['chat', newChat.id] });
            }
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        (payload: any) => {
          const chatId = payload.new?.chat_id || payload.old?.chat_id;
          if (!chatId) return;

          const cachedChats = queryClient.getQueryData<FullChat[]>(['chats']) || [];
          const isKnownChat = cachedChats.some((c) => c.id === chatId);
          const isSender = payload.new?.sender_id === userId;

          // If this message is not from a chat we know about, and we aren't the sender, ignore it.
          if (!isKnownChat && !isSender) return;

          // 1. Handle DELETE events
          if (payload.eventType === 'DELETE') {
            const deletedMessageId = payload.old.id;
            
            // Direct cache update for messages
            queryClient.setQueryData(['messages', chatId], (oldData: any) => {
              if (!oldData) return oldData;
              return {
                ...oldData,
                pages: oldData.pages.map((page: Message[]) => 
                  page.filter((msg) => msg.id !== deletedMessageId)
                )
              };
            });

            // Update sidebar snippet if needed (fallback to invalidation for accurate last message)
            if (isKnownChat) {
               queryClient.invalidateQueries({ queryKey: ['chats'] });
            }
            return;
          }

          // 2. Handle INSERT
          if (payload.eventType === 'INSERT') {
            const newMessage = normalizePayload<Message>(payload.new);
            
            // Direct cache update - Append to the LAST page of the infinite query
            queryClient.setQueryData(['messages', chatId], (oldData: any) => {
               if (!oldData) return oldData; // If chat not loaded, do nothing (will fetch on open)
               
               const newPages = [...oldData.pages];
               const lastPageIdx = newPages.length - 1;
               
               // Check if message already exists (optimistic update deduping)
               const exists = newPages.some(page => page.some((m: Message) => m.id === newMessage.id));
               if (exists) return oldData;

               newPages[lastPageIdx] = [...newPages[lastPageIdx], newMessage];
               return { ...oldData, pages: newPages };
            });

             // Update Sidebar: Move chat to top and update snippet
             queryClient.setQueryData(['chats'], (oldChats: FullChat[] | undefined) => {
               if (!oldChats) return oldChats;
               
               const chatIndex = oldChats.findIndex(c => c.id === chatId);
               if (chatIndex === -1) return oldChats; // Should be handled by invalidation if new chat
               
               const updatedChat = {
                 ...oldChats[chatIndex],
                 messages: [newMessage] // Update preview
               };
               
               // Move to top
               const otherChats = oldChats.filter(c => c.id !== chatId);
               return [updatedChat, ...otherChats];
             });
             
             return;
          }

          // 3. Handle UPDATE (Edits)
          if (payload.eventType === 'UPDATE') {
             const updatedMessage = normalizePayload<Message>(payload.new);
             
             queryClient.setQueryData(['messages', chatId], (oldData: any) => {
               if (!oldData) return oldData;
               return {
                 ...oldData,
                 pages: oldData.pages.map((page: Message[]) => 
                   page.map((msg) => msg.id === updatedMessage.id ? updatedMessage : msg)
                 )
               };
             });
             
             // Update sidebar snippet if it was the last message
             if (isKnownChat) {
                queryClient.invalidateQueries({ queryKey: ['chats'] }); 
             }
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
      // ОБОВ'ЯЗКОВО ОЧИЩУЄМО ІНТЕРВАЛ
      clearInterval(heartbeatInterval); 
      updateLastSeen();
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', updateLastSeen);
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient, setOnlineUsers]);
}