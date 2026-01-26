import { type InfiniteData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { createClient } from '@/lib/supabase/client';
import { usePresenceStore } from '@/store/usePresenceStore';
import { useSupabaseAuth } from '@/components/SupabaseAuthProvider';
import type { Attachment, FullChat, Message } from '@/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

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
  const queryClient = useQueryClient();
  const supabase = createClient();

  useEffect(() => {
    const channel = supabase
      .channel('global_chats')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const newMessage = payload.new as DbMessage;
          queryClient.setQueryData<FullChat[]>(['chats'], (old) => {
            if (!old) return old;
            const chatId = newMessage.chat_id || newMessage.chatId;
            const chatIndex = old.findIndex((c) => c.id === chatId);
            
            if (chatIndex === -1) {
              // If chat not in list, it might be a new chat
              queryClient.invalidateQueries({ queryKey: ['chats'] });
              return old;
            }

            const newChats = [...old];
            const updatedChat = { ...newChats[chatIndex] };
            
            // Update last message for preview
            updatedChat.messages = [{
              id: newMessage.id,
              content: newMessage.content,
              createdAt: new Date(newMessage.created_at || newMessage.createdAt || Date.now()),
              senderId: String(newMessage.sender_id || newMessage.senderId || ''),
              chatId: String(newMessage.chat_id || newMessage.chatId || ''),
              isRead: !!(newMessage.is_read || newMessage.isRead),
              attachments: newMessage.attachments || [],
            } as Message];

            newChats[chatIndex] = updatedChat;
            
            // Move to top
            const [movedChat] = newChats.splice(chatIndex, 1);
            newChats.unshift(movedChat);
            
            return newChats;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chats',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            queryClient.invalidateQueries({ queryKey: ['chats'] });
          } else if (payload.eventType === 'UPDATE') {
            const updatedChat = payload.new as FullChat;
            queryClient.setQueryData<FullChat[]>(['chats'], (old) => {
              if (!old) return old;
              const chatIndex = old.findIndex((c) => c.id === updatedChat.id);
              if (chatIndex === -1) return old;

              const newChats = [...old];
              // Update the chat data
              newChats[chatIndex] = { ...newChats[chatIndex], ...updatedChat };
              
              // Top-sort: Move the updated chat to the top
              const [movedChat] = newChats.splice(chatIndex, 1);
              newChats.unshift(movedChat);
              
              return newChats;
            });
          } else if (payload.eventType === 'DELETE') {
            const deletedId = payload.old.id;
            queryClient.setQueryData<FullChat[]>(['chats'], (old) => {
              if (!old) return old;
              return old.filter((c) => c.id !== deletedId);
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, queryClient]);

  return useQuery({
    queryKey: ['chats'],
    queryFn: async () => {
      const result = await getChatsAction();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
  });
}

export function useMessages(chatId: string, currentUserId: string | undefined) {
  const queryClient = useQueryClient();
  const [isTyping, setIsTyping] = useState<Record<string, boolean>>({});
  const channelRef = useRef<RealtimeChannel | null>(null);
  const timeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
  const supabase = createClient();

  useEffect(() => {
    if (!chatId || !currentUserId) return;

    const channel = supabase
      .channel(`chat_room:${chatId}`, {
        config: { broadcast: { self: true } },
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const raw = payload.new as DbMessage;

            queryClient.setQueryData<InfiniteData<Message[], Date | undefined>>(['messages', chatId], (old) => {
              if (!old) return old;
              
              const allMessages = old.pages.flat();
              // Message De-duplication: check if the message id already exists
              if (allMessages.some((m) => m.id === raw.id)) return old;

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

              const matchIndex = allMessages.findIndex(
                (m) =>
                  m.isOptimistic &&
                  (m.senderId === newMessage.senderId || m.senderId === currentUserId) &&
                  m.content.trim() === newMessage.content.trim(),
              );

              const newPages = [...old.pages];
              
              if (matchIndex !== -1) {
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
                // For a new message, add it to the first page (most recent)
                const firstPage = [...(newPages[0] || [])];
                firstPage.push(newMessage);
                newPages[0] = firstPage;
              }

              return { ...old, pages: newPages };
            });

            // Automatic Read Receipt: If the user is in the chat and it's from someone else
            if (raw.sender_id !== currentUserId || raw.senderId !== currentUserId) {
              markAsReadAction(chatId);
            }

            queryClient.invalidateQueries({ queryKey: ['chats'] });
          } else if (payload.eventType === 'UPDATE') {
            const raw = payload.new as DbMessage;
            queryClient.setQueryData<InfiniteData<Message[], Date | undefined>>(['messages', chatId], (old) => {
              if (!old) return old;
              return {
                ...old,
                pages: old.pages.map(page => page.map(m => {
                  if (m.id === raw.id) {
                    return {
                      ...m,
                      content: raw.content ?? m.content,
                      isRead: !!(raw.is_read ?? raw.isRead ?? m.isRead),
                      attachments: raw.attachments ?? m.attachments,
                    };
                  }
                  return m;
                }))
              };
            });
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
  }, [chatId, queryClient, currentUserId, supabase]);

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
  const router = useRouter();

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
    onSuccess: () => {
      router.push('/');
      router.refresh();
    },
    onError: (_err, _variables, context) => {
      if (context?.previousChats) {
        queryClient.setQueryData(['chats'], context.previousChats);
      }
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      queryClient.invalidateQueries({ queryKey: ['chat', variables] });
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

  const performScroll = useCallback((index: number, messageId: string) => {
    virtuosoRef.current?.scrollToIndex({
      index,
      align: 'center',
      behavior: 'auto'
    });

    setTimeout(() => {
      virtuosoRef.current?.scrollToIndex({
        index,
        align: 'center',
        behavior: 'smooth'
      });
      setHighlightedId(messageId);
      scrollTargetId.current = null;
      
      setTimeout(() => setHighlightedId(null), 3000);
    }, 50);
  }, [virtuosoRef]);

  useEffect(() => {
    if (scrollTargetId.current) {
      const index = messages.findIndex(m => m.id === scrollTargetId.current);
      if (index !== -1) {
        performScroll(index, scrollTargetId.current);
      } else if (hasNextPage) {
        fetchNextPage();
      } else {
        scrollTargetId.current = null;
      }
    }
  }, [messages, hasNextPage, fetchNextPage, performScroll]);

  const scrollToMessage = (messageId: string) => {
    const index = messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      performScroll(index, messageId);
    } else if (hasNextPage) {
      scrollTargetId.current = messageId;
      fetchNextPage();
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
    retry: false,
  });
}

export function useSendMessage(chatId: string) {
  const queryClient = useQueryClient();
  const { user } = useSupabaseAuth();

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
        senderId: user?.id || 'me',
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
        firstPage.push(optimisticMessage);
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

export function useUpdateLastSeen(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    const LAST_SEEN_THROTTLE = 1000 * 60 * 5;
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