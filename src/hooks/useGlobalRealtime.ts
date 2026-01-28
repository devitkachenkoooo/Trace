'use client';

import { type InfiniteData, useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useSupabaseAuth } from '@/components/SupabaseAuthProvider';
import { createClient } from '@/lib/supabase/client';
import { usePresenceStore } from '@/store/usePresenceStore';
import type { FullChat, Message, User } from '@/types';

// Singleton Supabase client
const supabase = createClient();

export function useGlobalRealtime() {
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const setOnlineUsers = usePresenceStore((state) => state.setOnlineUsers);

  // Refs for current values accessible inside closures/effects
  const pathnameRef = useRef(pathname);
  const userRef = useRef(user);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);


  useEffect(() => {
    if (!user?.id) return;

    const userId = user.id;

    console.log(`🔌 [GlobalRealtime] Initializing for user: ${userId}`);

    // --- 1. Global Presence Channel ---
    const presenceChannel = supabase.channel('global-presence', {
      config: {
        presence: { key: userId },
      },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const onlineIds = new Set<string>();
        for (const key of Object.keys(state)) {
          onlineIds.add(key);
        }
        setOnlineUsers(onlineIds);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          });
        }
      });

    // --- 2. Global Messages Channel (Optimistic Updates & Sidebar) ---
    const messagesChannel = supabase
      .channel(`global-messages-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const rawMessage = (payload.new || payload.old) as any;
          const chatId = rawMessage.chat_id || rawMessage.chatId;
          const messageId = rawMessage.id;

          if (payload.eventType === 'INSERT') {
            const newMessage = {
              id: rawMessage.id,
              content: rawMessage.content,
              createdAt: rawMessage.created_at,
              senderId: rawMessage.sender_id,
              chat_id: rawMessage.chat_id,
              isRead: rawMessage.is_read ?? false,
              attachments: rawMessage.attachments || []
            };

            // 1. Update Chat List (Move to top, update last message and unread count)
            queryClient.setQueryData<FullChat[]>(['chats'], (oldChats) => {
              if (!oldChats) {
                // If we don't have chats in cache, it's better to refetch
                queryClient.invalidateQueries({ queryKey: ['chats'] });
                return oldChats;
              }

              const chatIndex = oldChats.findIndex((c) => c.id === chatId);
              
              if (chatIndex === -1) {
                // Chat not in list, refetch entire list to get the new chat object
                queryClient.invalidateQueries({ queryKey: ['chats'] });
                return oldChats;
              }

              const chat = oldChats[chatIndex];
              const updatedChat: FullChat = {
                ...chat,
                messages: [newMessage as any], // Use new message as the "last" one
              };

              const newChats = [...oldChats];
              newChats.splice(chatIndex, 1);
              newChats.unshift(updatedChat);
              return newChats;
            });

            // 2. Update Message List (if active)
            const activePath = pathnameRef.current;
            const activeChatId = activePath?.startsWith('/chat/') ? activePath.split('/').pop() : null;

            if (activeChatId === chatId) {
              queryClient.setQueryData<InfiniteData<Message[]>>(['messages', chatId], (oldData) => {
                if (!oldData || !oldData.pages || oldData.pages.length === 0) return oldData;
                const exists = oldData.pages.some(page => page.some(m => m.id === messageId));
                if (exists) return oldData;

                const normalizedMsg: Message = {
                  id: rawMessage.id,
                  content: rawMessage.content,
                  createdAt: new Date(rawMessage.created_at),
                  senderId: rawMessage.sender_id,
                  chatId: rawMessage.chat_id,
                  isRead: rawMessage.is_read ?? false,
                  replyTo: undefined,
                  attachments: rawMessage.attachments || []
                };

                const newPages = [...oldData.pages];
                const lastIdx = newPages.length - 1;
                newPages[lastIdx] = [...newPages[lastIdx], normalizedMsg];
                
                return { ...oldData, pages: newPages };
              });
            }
          } else if (payload.eventType === 'DELETE') {
            // Update Message List
            queryClient.setQueryData<InfiniteData<Message[]>>(['messages', chatId], (oldData) => {
              if (!oldData) return oldData;
              return {
                ...oldData,
                pages: oldData.pages.map(page => page.filter(m => m.id !== messageId))
              };
            });

            // Update Chat List (Remove if it was the last message, or just refetch)
            queryClient.invalidateQueries({ queryKey: ['chats'] });
          } else if (payload.eventType === 'UPDATE') {
             // Handle isRead updates or content edits
             const updatedMessage = {
               id: rawMessage.id,
               content: rawMessage.content,
               createdAt: rawMessage.created_at,
               senderId: rawMessage.sender_id,
               chat_id: rawMessage.chat_id,
               is_read: rawMessage.is_read, // use snake_case for consistency with local state if needed
               isRead: rawMessage.is_read,
               attachments: rawMessage.attachments || []
             };

             queryClient.setQueryData<InfiniteData<Message[]>>(['messages', chatId], (oldData) => {
               if (!oldData) return oldData;
               return {
                 ...oldData,
                 pages: oldData.pages.map(page => page.map(m => {
                   if (m.id === messageId) {
                      return {
                        ...m,
                        content: rawMessage.content,
                        isRead: rawMessage.is_read ?? m.isRead,
                      };
                   }
                   return m;
                 }))
               };
             });

             // Update chat list if this was the last message
             queryClient.setQueryData<FullChat[]>(['chats'], (oldChats) => {
               if (!oldChats) return oldChats;
               return oldChats.map(chat => {
                 if (chat.id === chatId && chat.messages?.[0]?.id === messageId) {
                   return {
                     ...chat,
                     messages: [updatedMessage as any]
                   };
                 }
                 return chat;
               });
             });
          }
        }
      )
      .subscribe();

    // --- 3. Global Users Channel (Contacts Updates) ---
    const usersChannel = supabase
      .channel('global-users')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user', // Table name is 'user'
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newUser = payload.new as User;
            // Add to the top of the 'users-search' cache (for empty query)
            queryClient.setQueryData<User[]>(['users-search', ''], (oldUsers) => {
              if (!oldUsers) return [newUser];
              // Avoid duplicates
              if (oldUsers.some(u => u.id === newUser.id)) return oldUsers;
              return [newUser, ...oldUsers.slice(0, 19)]; // Keep max 20
            });
          } else if (payload.eventType === 'DELETE') {
            const deletedUser = payload.old as { id: string };
            queryClient.setQueryData<User[]>(['users-search', ''], (oldUsers) => {
              if (!oldUsers) return oldUsers;
              return oldUsers.filter(u => u.id !== deletedUser.id);
            });
          }
        }
      )
      .subscribe();

    return () => {
      console.log(`🛑 [GlobalRealtime] Cleaning up...`);
      supabase.removeChannel(presenceChannel);
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(usersChannel);

      try {
        supabase.rpc('set_user_offline').then(({ error }) => {
            if (error) console.error('Error setting offline:', error);
        });
      } catch (err) {
        console.error('Failed to call set_user_offline:', err);
      }
    };
  }, [user?.id, queryClient, setOnlineUsers]);
}

