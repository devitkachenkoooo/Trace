import type { RealtimeChannel } from '@supabase/supabase-js';
import { type InfiniteData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useEffect, useRef, useState } from 'react';
import type { VirtuosoHandle } from 'react-virtuoso';
import {
  deleteChatAction,
  deleteMessageAction,
  getChatsAction,
  getFullChatAction,
  getMessagesAction,
  markAsReadAction,
  searchUsersAction,
  sendMessageAction,
  updateLastSeenAction,
} from '@/actions/chat-actions';
import { supabase } from '@/lib/supabase';
import { usePresenceStore } from '@/store/usePresenceStore';
import type { Attachment, FullChat, Message } from '@/types';

interface DbMessage {
  id: string;
  sender_id?: string;
  senderId?: string;
  chat_id?: string;
  chatId?: string;
  content: string;
  attachments?: Attachment[];
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

            queryClient.setQueryData<InfiniteData<Message[], Date | undefined>>(['messages', chatId], (old) => {
              if (!old) return old;
              
              // 1. Уникаємо дублікатів
              const allMessages = old.pages.flat();
              if (allMessages.some((m) => m.id === raw.id)) return old;

              // 2. МАГІЯ РЕПЛАЮ
              const parentId = raw.reply_to_id || raw.replyToId;
              const foundParent = parentId 
                ? (allMessages.find(m => m.id === parentId) as Message | undefined)
                : undefined;

              const newMessage: Message = {
                id: raw.id,
                content: raw.content || '',
                attachments: raw.attachments || [],
                isRead: !!(raw.is_read || raw.isRead),
                senderId: String(raw.sender_id || raw.senderId || ''),
                chatId: String(raw.chat_id || raw.chatId || ''),
                replyToId: (parentId || undefined) as string | undefined,
                replyTo: foundParent,
                createdAt: new Date(raw.created_at || raw.createdAt || Date.now()),
                isOptimistic: false,
              };

              // 3. Перевіряємо заміну оптимістичного
              const matchIndex = allMessages.findIndex(
                (m) =>
                  m.isOptimistic &&
                  (m.senderId === newMessage.senderId || m.senderId === currentUserId) &&
                  m.content.trim() === newMessage.content.trim(),
              );

              // Клонуємо структуру
              const newPages = [...old.pages];
              
              if (matchIndex !== -1) {
                // Знаходимо в якій сторінці це повідомлення
                let currentIndex = 0;
                for (let i = 0; i < newPages.length; i++) {
                  if (matchIndex >= currentIndex && matchIndex < currentIndex + newPages[i].length) {
                    const pageCopy = [...newPages[i]];
                    pageCopy[matchIndex - currentIndex] = newMessage;
                    newPages[i] = pageCopy;
                    break;
                  }
                  currentIndex += newPages[i].length;
                }
              } else {
                // Додаємо в кінець ПЕРШОЇ сторінки
                const firstPage = [...(newPages[0] || [])];
                firstPage.push(newMessage);
                newPages[0] = firstPage;
              }

              return { ...old, pages: newPages };
            });

            queryClient.invalidateQueries({ queryKey: ['chats'] });
          } else if (payload.eventType === 'DELETE') {
            const deletedId = payload.old.id;
            queryClient.setQueryData<InfiniteData<Message[], Date | undefined>>(['messages', chatId], (old) => {
              if (!old) return old;
              return {
                ...old,
                pages: old.pages.map(page => page.filter(m => m.id !== deletedId))
              };
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

  const query = useInfiniteQuery<Message[], Error, InfiniteData<Message[], Date | undefined>, string[], Date | undefined>({
    queryKey: ['messages', chatId],
    queryFn: async ({ pageParam }) => {
      const result = await getMessagesAction(chatId, pageParam);
      if (!result.success) throw new Error(result.error);
      return result.data as Message[];
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < 50) return undefined;
      return lastPage[0]?.createdAt ? new Date(lastPage[0].createdAt) : undefined;
    },
    enabled: !!chatId,
  });

  // Flattened messages for the UI
  // Note: Pages are [NewestPage, OlderPage, ...]. Each page is [OldestInPage, ..., NewestInPage].
  // So we need to reverse the pages order and then flatten.
  const allMessages = query.data?.pages ? [...query.data.pages].reverse().flat() : [];

  return { ...query, messages: allMessages, isTyping, setTyping };
}

export function useDeleteMessage(chatId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => deleteMessageAction(messageId),
    onMutate: async (messageId) => {
      await queryClient.cancelQueries({ queryKey: ['messages', chatId] });
      const previousData = queryClient.getQueryData<InfiniteData<Message[], Date | undefined>>(['messages', chatId]);

      queryClient.setQueryData<InfiniteData<Message[], Date | undefined>>(['messages', chatId], (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map(page => page.filter(m => m.id !== messageId))
        };
      });

      return { previousData };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['messages', chatId], context.previousData);
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

export function useScrollToMessage(
  virtuosoRef: React.RefObject<VirtuosoHandle | null>,
  messages: Message[],
  fetchNextPage: () => void,
  hasNextPage: boolean
) {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const scrollTargetId = useRef<string | null>(null);

  useEffect(() => {
    if (scrollTargetId.current) {
      const index = messages.findIndex(m => m.id === scrollTargetId.current);
      if (index !== -1) {
        // Delay a bit to ensure the list is ready or to handle potential race conditions
        setTimeout(() => {
          virtuosoRef.current?.scrollToIndex({ 
            index, 
            align: 'center', 
            behavior: 'smooth' 
          });
          setHighlightedId(scrollTargetId.current);
          scrollTargetId.current = null;
          setTimeout(() => setHighlightedId(null), 3000); // 3s highlight
        }, 100);
      } else if (hasNextPage) {
        fetchNextPage();
      } else {
        console.warn('Message not found even after fetching all pages');
        scrollTargetId.current = null;
      }
    }
  }, [messages, hasNextPage, fetchNextPage, virtuosoRef]);

  const scrollToMessage = (messageId: string) => {
    const index = messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      virtuosoRef.current?.scrollToIndex({ 
        index, 
        align: 'center', 
        behavior: 'smooth' 
      });
      setHighlightedId(messageId);
      setTimeout(() => setHighlightedId(null), 3000);
    } else if (hasNextPage) {
      scrollTargetId.current = messageId;
      fetchNextPage();
    } else {
      console.warn('Message not found');
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
    mutationFn: ({ 
      content, 
      replyToId, 
      attachments = [] 
    }: { 
      content: string; 
      replyToId?: string; 
      attachments?: Attachment[] 
    }) => sendMessageAction(chatId, content, replyToId, attachments),
    onMutate: async ({ content, replyToId, attachments = [] }) => {
      await queryClient.cancelQueries({ queryKey: ['messages', chatId] });
      const previousData = queryClient.getQueryData<InfiniteData<Message[], Date | undefined>>(['messages', chatId]);

      const optimisticMessage: Message = {
        id: crypto.randomUUID(),
        chatId,
        senderId: session?.user?.id || 'me',
        content,
        attachments,
        replyToId: replyToId,
        isRead: false,
        createdAt: new Date(),
        isOptimistic: true,
      };

      queryClient.setQueryData<InfiniteData<Message[], Date | undefined>>(['messages', chatId], (old) => {
        if (!old) return { pages: [[optimisticMessage]], pageParams: [undefined] };
        const newPages = [...old.pages];
        const firstPage = [...(newPages[0] || [])];
        firstPage.push(optimisticMessage); // Newest message goes to the end of the first page (chronological)
        newPages[0] = firstPage;
        return { ...old, pages: newPages };
      });

      return { previousData };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['messages', chatId], context.previousData);
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