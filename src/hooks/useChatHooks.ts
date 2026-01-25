import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useEffect, useState, useRef } from 'react';
import {
  getChatsAction,
  getFullChatAction,
  markAsReadAction,
  searchUsersAction,
  sendMessageAction,
  updateLastSeenAction,
} from '@/actions/chat-actions';
import { supabase } from '@/lib/supabase';
import { usePresenceStore } from '@/store/usePresenceStore';
import type { Message } from '@/types';

interface ExtendedMessage extends Message {
  isOptimistic?: boolean;
}

export function useChats() {
  return useQuery({
    queryKey: ['chats'],
    queryFn: async () => {
      const result = await getChatsAction();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });
}

export function useMessages(chatId: string, currentUserId: string | undefined) {
  const queryClient = useQueryClient();
  const [isTyping, setIsTyping] = useState<Record<string, boolean>>({});
  const channelRef = useRef<any>(null);
  const timeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});

  useEffect(() => {
    if (!chatId || !currentUserId) return;

    const channel = supabase
      .channel(`chat_room:${chatId}`, {
        config: {
          broadcast: { self: true }
        }
      })
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages', 
        filter: `chat_id=eq.${chatId}` 
      }, (payload) => {
        const raw = payload.new as any;
        
        // НОРМАЛІЗАЦІЯ ДАНИХ: Перетворюємо snake_case (DB) у camelCase (UI)
        const newMessage: ExtendedMessage = {
          ...raw,
          senderId: raw.sender_id, // Критично важливо
          chatId: raw.chat_id,
          createdAt: raw.created_at,
          isOptimistic: false
        };
        
        queryClient.setQueryData<ExtendedMessage[]>(['messages', chatId], (old) => {
          if (!old) return [newMessage];
          if (old.some((m) => m.id === newMessage.id)) return old;
          
          // Шукаємо оптимістичне повідомлення для заміни
          const matchIndex = old.findIndex(m => 
            m.isOptimistic && 
            (m.senderId === newMessage.senderId || m.senderId === currentUserId) &&
            m.content.trim() === newMessage.content.trim()
          );

          if (matchIndex !== -1) {
            const updated = [...old];
            updated[matchIndex] = newMessage;
            return updated;
          }
          return [newMessage, ...old];
        });

        // Оновлюємо список чатів для нотифікацій
        queryClient.invalidateQueries({ queryKey: ['chats'] });
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId !== currentUserId) {
          setIsTyping(prev => ({ ...prev, [payload.userId]: payload.isTyping }));
          
          if (timeoutsRef.current[payload.userId]) {
            clearTimeout(timeoutsRef.current[payload.userId]);
          }

          if (payload.isTyping) {
            timeoutsRef.current[payload.userId] = setTimeout(() => {
              setIsTyping(prev => {
                const updated = { ...prev };
                delete updated[payload.userId];
                return updated;
              });
              delete timeoutsRef.current[payload.userId];
            }, 3000);
          }
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channelRef.current = channel;
        }
      });

    return () => {
      Object.values(timeoutsRef.current).forEach(clearTimeout);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [chatId, queryClient, currentUserId]);

  const setTyping = (typing: boolean) => {
    if (channelRef.current && (channelRef.current.state === 'joined' || channelRef.current.state === 'joining')) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: currentUserId, isTyping: typing },
      });
    }
  };

  const query = useQuery({
    queryKey: ['messages', chatId],
    queryFn: async () => {
      const result = await getFullChatAction(chatId);
      if (!result.success) throw new Error(result.error);
      // Також нормалізуємо дані при першому завантаженні
      return result.data.messages.map((m: any) => ({ 
        ...m, 
        senderId: m.sender_id || m.senderId,
        chatId: m.chat_id || m.chatId,
        createdAt: m.created_at || m.createdAt
      }));
    },
    enabled: !!chatId,
  });

  return { ...query, isTyping, setTyping };
}

// Решта функцій залишається без змін (я їх додав нижче для цілісності файлу)
export function useChatDetails(chatId: string) {
  return useQuery({
    queryKey: ['chat', chatId],
    queryFn: async () => {
      const result = await getFullChatAction(chatId);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    enabled: !!chatId,
  });
}

export function useSendMessage(chatId: string) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  return useMutation({
    mutationFn: ({ content }: { content: string }) => sendMessageAction(chatId, content),
    onMutate: async ({ content }) => {
      await queryClient.cancelQueries({ queryKey: ['messages', chatId] });
      const previousMessages = queryClient.getQueryData<ExtendedMessage[]>(['messages', chatId]);

      const optimisticMessage: ExtendedMessage = {
        id: crypto.randomUUID(),
        chatId,
        senderId: session?.user?.id || 'me',
        content,
        isRead: false,
        createdAt: new Date(),
        isOptimistic: true,
      };

      queryClient.setQueryData<ExtendedMessage[]>(['messages', chatId], (old) => [
        optimisticMessage,
        ...(old || []),
      ]);

      return { previousMessages };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(['messages', chatId], context.previousMessages);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', chatId] });
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },
  });
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chatId: string) => markAsReadAction(chatId),
    onSuccess: (_data, _chatId) => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },
  });
}

export function usePresence(_userId: string | undefined) {
  const onlineUsers = usePresenceStore((state) => state.onlineUsers);
  return { onlineUsers };
}

export function useSearchUsers(query: string) {
  return useQuery({
    queryKey: ['users', query],
    queryFn: async () => {
      if (query && query.length < 2) return [];
      const result = await searchUsersAction(query);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    staleTime: 30 * 1000,
  });
}

const LAST_SEEN_THROTTLE = 1000 * 60 * 5; 

export function useUpdateLastSeen(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    const update = async () => {
      const lastUpdate = localStorage.getItem(`lastSeenUpdate:${userId}`);
      const now = Date.now();
      if (!lastUpdate || now - Number(lastUpdate) > LAST_SEEN_THROTTLE) {
        await updateLastSeenAction();
        localStorage.setItem(`lastSeenUpdate:${userId}`, now.toString());
      }
    };
    update();
    const interval = setInterval(update, LAST_SEEN_THROTTLE);
    return () => clearInterval(interval);
  }, [userId]);
}