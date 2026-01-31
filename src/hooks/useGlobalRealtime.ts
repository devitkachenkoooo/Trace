'use client';

import { type InfiniteData, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { supabase } from '@/lib/supabase/client';
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
    if (!user?.id) {
      console.log('🚫 No user ID, skipping realtime subscription');
      return;
    }
    
    const userId = user.id;
    console.log('👤 Setting up realtime for user:', userId);

    const channel = supabase.channel('db-global-updates', {
      config: { presence: { key: userId } },
    });

    console.log('📡 Creating channel with config:', { presence: { key: userId } });

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

          const newPayload = payload.new;
          const oldPayload = payload.old;

          if (payload.eventType === 'DELETE') {
            const deletedId = oldPayload?.id;
            queryClient.removeQueries({ queryKey: ['chat', deletedId] });
            queryClient.setQueryData(['chats'], (old: FullChat[] | undefined) => 
              old ? old.filter(c => c.id !== deletedId) : []
            );
            return;
          }

          if (payload.eventType === 'UPDATE') {
            const updatedChat = newPayload;
            if (!updatedChat) return;

            const messagesCache = queryClient.getQueryData<InfiniteData<Message[]>>(['messages', updatedChat.id]);
            const allMessages = messagesCache?.pages.flat() || [];
            let shouldInvalidate = false;

            const resolveReadStatus = (newReadId: string | undefined | null, oldReadId: string | undefined | null) => {
              if (!newReadId || newReadId === oldReadId) return oldReadId;

              const message = allMessages.find((m) => m.id === newReadId) as Message | undefined;
              
              if (message) {
                const timestamp = message.created_at;
                if (timestamp) {
                  console.log(' Found message for status:', newReadId, timestamp);
                  return newReadId;
                }
              }

              console.warn(' Message not found in cache for ID:', newReadId);
              shouldInvalidate = true; 
              return oldReadId; 
            };

            const currentChatData = queryClient.getQueryData(['chats']) as FullChat[] | undefined;
            const currentChat = currentChatData?.find(c => c.id === updatedChat.id);
            
            const userLastReadId = resolveReadStatus(updatedChat.user_last_read_id, currentChat?.user_last_read_id);
            const recipientLastReadId = resolveReadStatus(updatedChat.recipient_last_read_id, currentChat?.recipient_last_read_id);

            queryClient.setQueryData(['chat', updatedChat.id], (oldData: FullChat | undefined) => {
              if (!oldData) return oldData;
              return {
                ...oldData,
                user_last_read_id: userLastReadId,
                recipient_last_read_id: recipientLastReadId,
              } as FullChat;
            });

            queryClient.setQueryData(['chats'], (oldChats: FullChat[] | undefined) => {
              if (!oldChats) return oldChats;
              return oldChats.map((c) => {
                if (c.id !== updatedChat.id) return c;
                return {
                  ...c,
                  user_last_read_id: userLastReadId,
                  recipient_last_read_id: recipientLastReadId,
                };
              });
            });

            if (shouldInvalidate) {
              queryClient.invalidateQueries({ queryKey: ['chat', updatedChat.id] });
              queryClient.invalidateQueries({ queryKey: ['chats'] });
            }
            return;
          }

          if (payload.eventType === 'INSERT') {
            const newChat = newPayload;
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
        { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload: RealtimePayload<MessagePayload>) => {
          console.log('🗑️ Realtime: Message deletion received:', { 
            fullPayload: payload,
            payloadNew: payload.new,
            payloadOld: payload.old,
            deletedId: payload.old?.id,
            chatId: payload.old?.chat_id,
            eventType: payload.eventType,
            allOldKeys: Object.keys(payload.old || {}),
            allNewKeys: Object.keys(payload.new || {})
          });
          
          const deletedId = payload.old?.id;
          let chatId = payload.old?.chat_id;
          
          // If chatId is missing, try to get it from the current cache
          if (!chatId && deletedId) {
            console.log('🔍 chat_id missing from payload, searching cache...');
            // Search through all message caches to find which chat this message belongs to
            const allChats = queryClient.getQueryData(['chats']) as FullChat[] | undefined;
            if (allChats) {
              for (const chat of allChats) {
                const messagesCache = queryClient.getQueryData(['messages', chat.id]) as InfiniteData<Message[]> | undefined;
                const allMessages = messagesCache?.pages.flat() || [];
                if (allMessages.some(m => m.id === deletedId)) {
                  chatId = chat.id;
                  console.log('🎯 Found chatId from cache:', chatId);
                  break;
                }
              }
            }
          }
          
          if (!deletedId || !chatId) {
            console.warn('⚠️ Missing required data in DELETE payload:', { deletedId, chatId, payload });
            return;
          }
          
          console.log('🎯 Processing deletion for chat:', chatId, 'message:', deletedId);
          
          // Check current cache state before update
          const currentCache = queryClient.getQueryData(['messages', chatId]) as InfiniteData<Message[]> | undefined;
          console.log('📋 Current cache state:', {
            hasData: !!currentCache,
            pageCount: currentCache?.pages?.length || 0,
            totalMessages: currentCache?.pages?.reduce((sum: number, page: Message[]) => sum + page.length, 0) || 0
          });
          
          queryClient.setQueryData(['messages', chatId], (oldData: InfiniteData<Message[]> | undefined) => {
            if (!oldData) {
              console.log('📭 No existing data for messages cache, skipping update');
              return oldData;
            }
            
            const newData = {
              ...oldData,
              pages: oldData.pages.map((page) => {
                const filteredPage = page.filter((m) => m.id !== deletedId);
                console.log(`🔄 Filtered page: ${page.length} → ${filteredPage.length} messages`);
                return filteredPage;
              }),
            };
            
            const totalMessages = newData.pages.reduce((sum, page) => sum + page.length, 0);
            console.log(`📊 Total messages after deletion: ${totalMessages}`);
            
            return newData;
          });
          
          // Also update the chats cache to reflect the latest message change
          queryClient.setQueryData(['chats'], (oldChats: FullChat[] | undefined) => {
            if (!oldChats) return oldChats;
            
            return oldChats.map((chat) => {
              if (chat.id !== chatId) return chat;
              
              const updatedMessages = chat.messages?.filter((m: Message) => m.id !== deletedId) || [];
              
              return {
                ...chat,
                messages: updatedMessages,
              };
            });
          });
          
          console.log('✅ Message deletion processed successfully');
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload: RealtimePayload<MessagePayload>) => {
          const chatId = payload.new?.chat_id;
          if (!chatId) return;

          const newMessage = payload.new;
          if (!newMessage) return;
          
          queryClient.setQueryData(['messages', chatId], (oldData: InfiniteData<Message[]> | undefined) => {
             if (!oldData) return oldData;
             const newPages = [...oldData.pages];
             const lastPageIdx = newPages.length - 1;
             const exists = newPages.some(page => page.some((m: Message) => m.id === newMessage.id));
             if (exists) return oldData;
             
             if (lastPageIdx >= 0) {
               newPages[lastPageIdx] = [...newPages[lastPageIdx], newMessage as unknown as Message];
             } else {
               newPages[0] = [newMessage as unknown as Message];
             }
             
             return { ...oldData, pages: newPages };
          });
          queryClient.invalidateQueries({ queryKey: ['chats'] });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload: RealtimePayload<MessagePayload>) => {
          const chatId = payload.new?.chat_id || payload.old?.chat_id;
          if (!chatId) return;

          const updatedMessage = payload.new;
          if (!updatedMessage) return;
          
          queryClient.setQueryData(['messages', chatId], (oldData: InfiniteData<Message[]> | undefined) => {
             if (!oldData) return oldData;
             return {
               ...oldData,
               pages: oldData.pages.map((page) => 
                 page.map((msg: Message) => msg.id === updatedMessage.id ? updatedMessage as unknown as Message : msg)
               )
             };
          });
        }
      )
      .subscribe(async (status: string) => {
        console.log('📡 Channel subscription status:', status);
        
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to realtime channel');
          await channel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          });
          console.log('👤 Tracked user presence:', { user_id: userId, online_at: new Date().toISOString() });
        }
        
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.log('❌ Channel disconnected:', status);
          updateLastSeen();
        }
        
        if (status === 'CHANNEL_ERROR') {
          console.error('💥 Channel error occurred');
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