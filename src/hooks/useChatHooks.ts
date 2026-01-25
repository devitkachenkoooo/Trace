import type { RealtimeChannel } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useEffect, useRef, useState } from 'react';
import {
  deleteChatAction,
  deleteMessageAction,
  getChatsAction,
  getFullChatAction,
  markAsReadAction,
  searchUsersAction,
  sendMessageAction,
  updateLastSeenAction,
} from '@/actions/chat-actions';
import { supabase } from '@/lib/supabase';
import { usePresenceStore } from '@/store/usePresenceStore';
import type { FullChat, Message } from '@/types';

interface DbMessage {
  id: string;
  sender_id?: string;
  senderId?: string;
  chat_id?: string;
  chatId?: string;
  content: string;
  is_read?: boolean;
  isRead?: boolean;
  reply_to_id?: string | null;
  replyToId?: string | null;
  created_at?: string | Date;
  createdAt?: string | Date;
}

export function useChats() {
  return useQuery({
    queryKey: ['chats'],
    queryFn: async () => {
      const result = await getChatsAction();
      if (!result.success) {
        throw new Error(result.error);
      }
      // Після перевірки success, TS гарантує наявність data
      return result.data;
    },
  });
}

export function useMessages(chatId: string, currentUserId: string | undefined) {
  const queryClient = useQueryClient();
  const [isTyping, setIsTyping] = useState<Record<string, boolean>>({});
  const channelRef = useRef<RealtimeChannel | null>(null);
  const timeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});

  useEffect(() => {
    if (!chatId || !currentUserId) return;

    const channel = supabase
      .channel(`chat_room:${chatId}`, {
        config: { broadcast: { self: true } },
      })
      .on(
        'postgres_changes',
        {
          event: '*', // Слухаємо всі зміни (INSERT, DELETE)
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const raw = payload.new as DbMessage;

            queryClient.setQueryData<(Message & { isOptimistic?: boolean })[]>(['messages', chatId], (old) => {
              const currentMessages = old || [];
              
              // 1. Уникаємо дублікатів (якщо це наше ж повідомлення вже додане оптимістично)
              if (currentMessages.some((m) => m.id === raw.id)) return currentMessages;

              // 2. МАГІЯ РЕПЛАЮ: Шукаємо повідомлення, на яке відповіли, у локальному кеші юзера
              const parentId = raw.reply_to_id || raw.replyToId;
              const foundParent = parentId 
                ? (currentMessages.find(m => m.id === parentId) as Message | undefined)
                : undefined;

              const newMessage: Message & { isOptimistic?: boolean } = {
                id: raw.id,
                content: raw.content || '',
                isRead: !!(raw.is_read || raw.isRead),
                senderId: String(raw.sender_id || raw.senderId || ''),
                chatId: String(raw.chat_id || raw.chatId || ''),
                replyToId: (parentId || undefined) as string | undefined,
                replyTo: foundParent,
                createdAt: new Date(raw.created_at || raw.createdAt || Date.now()),
                isOptimistic: false,
              };

              // 3. Перевіряємо, чи потрібно замінити оптимістичне повідомлення (наше власне)
              const matchIndex = currentMessages.findIndex(
                (m) =>
                  m.isOptimistic &&
                  (m.senderId === newMessage.senderId || m.senderId === currentUserId) &&
                  m.content.trim() === newMessage.content.trim(),
              );

              if (matchIndex !== -1) {
                const updated = [...currentMessages];
                updated[matchIndex] = newMessage;
                return updated;
              }

              // Додаємо нове повідомлення на початок (оскільки flex-col-reverse)
              return [newMessage, ...currentMessages];
            });

            queryClient.invalidateQueries({ queryKey: ['chats'] });
          } else if (payload.eventType === 'DELETE') {
            const deletedId = payload.old.id;
            queryClient.setQueryData<(Message & { isOptimistic?: boolean })[]>(['messages', chatId], (old) => {
              return old ? old.filter((m) => m.id !== deletedId) : [];
            });
          }
        },
      )
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId !== currentUserId) {
          setIsTyping((prev) => ({ ...prev, [payload.userId]: payload.isTyping }));

          if (timeoutsRef.current[payload.userId]) {
            clearTimeout(timeoutsRef.current[payload.userId]);
          }

          if (payload.isTyping) {
            timeoutsRef.current[payload.userId] = setTimeout(() => {
              setIsTyping((prev) => {
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
    if (
      channelRef.current &&
      (channelRef.current.state === 'joined' || channelRef.current.state === 'joining')
    ) {
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
      
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to fetch messages');
      }

      // Мапимо дані з бази в наш формат
      return result.data.messages.map((m: DbMessage & { 
        replyDetails?: { 
          id: string; 
          sender: { name?: string | null }; 
          content: string 
        } | null 
      }) => ({
        ...m,
        id: m.id,
        content: m.content,
        isRead: !!(m.is_read || m.isRead),
        senderId: String(m.sender_id || m.senderId || ''),
        chatId: String(m.chat_id || m.chatId || ''),
        replyToId: (m.reply_to_id || m.replyToId || undefined) as string | undefined,
        createdAt: new Date(m.created_at || m.createdAt || Date.now()),
        replyDetails: m.replyDetails,
      })) as (Message & { isOptimistic?: boolean })[];
    },
    enabled: !!chatId,
  });

  return { ...query, isTyping, setTyping };
}

export function useDeleteMessage(chatId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => deleteMessageAction(messageId),
    onMutate: async (messageId) => {
      await queryClient.cancelQueries({ queryKey: ['messages', chatId] });
      const previousMessages = queryClient.getQueryData<(Message & { isOptimistic?: boolean })[]>(['messages', chatId]);

      queryClient.setQueryData<(Message & { isOptimistic?: boolean })[]>(['messages', chatId], (old) => {
        return old ? old.filter((m) => m.id !== messageId) : [];
      });

      return { previousMessages };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(['messages', chatId], context.previousMessages);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', chatId] });
    },
  });
}

export function useDeleteChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chatId: string) => deleteChatAction(chatId),
    onMutate: async (chatId) => {
      await queryClient.cancelQueries({ queryKey: ['chats'] });
      const previousChats = queryClient.getQueryData<FullChat[]>(['chats']);

      queryClient.setQueryData<FullChat[]>(['chats'], (old) => {
        return old ? old.filter((c) => c.id !== chatId) : [];
      });

      return { previousChats };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousChats) {
        queryClient.setQueryData(['chats'], context.previousChats);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },
  });
}

export function useScrollToMessage() {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const scrollToMessage = (messageId: string) => {
    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedId(messageId);
      setTimeout(() => setHighlightedId(null), 2000);
    } else {
      console.warn('Message not found in DOM');
    }
  };

  return { scrollToMessage, highlightedId };
}

export function useChatDetails(chatId: string) {
  return useQuery({
    queryKey: ['chat', chatId],
    queryFn: async () => {
      const result = await getFullChatAction(chatId);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    enabled: !!chatId,
  });
}

export function useSendMessage(chatId: string) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  return useMutation({
    mutationFn: ({ content, replyToId }: { content: string; replyToId?: string }) =>
      sendMessageAction(chatId, content, replyToId),
    onMutate: async ({ content, replyToId }) => {
      await queryClient.cancelQueries({ queryKey: ['messages', chatId] });
      const previousMessages = queryClient.getQueryData<(Message & { isOptimistic?: boolean })[]>(['messages', chatId]);

      const optimisticMessage: Message & { isOptimistic?: boolean } = {
        id: crypto.randomUUID(),
        chatId,
        senderId: session?.user?.id || 'me',
        content,
        replyToId: replyToId,
        isRead: false,
        createdAt: new Date(),
        isOptimistic: true,
      };

      queryClient.setQueryData<(Message & { isOptimistic?: boolean })[]>(['messages', chatId], (old) => [
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
      if (!result.success) {
        throw new Error(result.error);
      }
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