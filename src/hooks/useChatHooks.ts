import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getChatsAction, getFullChatAction, sendMessageAction, markAsReadAction, searchUsersAction, updateLastSeenAction } from '@/actions/chat-actions';
import type { Message } from '@/types';
import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';

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

export function useMessages(chatId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!chatId) return;

    const channel = supabase
      .channel(`chat:${chatId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`,
        },
        (payload: { new: Message }) => {
          const newMessage = payload.new;
          queryClient.setQueryData<ExtendedMessage[]>(['messages', chatId], (old) => {
            if (!old) return [newMessage];
            
            // Check if message ID already exists (deduplication)
            if (old.some((m) => m.id === newMessage.id)) return old;

            // Check for matching optimistic record
            const matchIndex = old.findIndex(
              (m) => 
                m.isOptimistic && 
                m.senderId === newMessage.senderId && 
                m.content === newMessage.content
            );

            if (matchIndex !== -1) {
              const updated = [...old];
              updated[matchIndex] = newMessage;
              return updated;
            }

            return [newMessage, ...old];
          });
          queryClient.invalidateQueries({ queryKey: ['chats'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, queryClient]);

  return useQuery({
    queryKey: ['messages', chatId],
    queryFn: async () => {
      const result = await getFullChatAction(chatId);
      if (!result.success) throw new Error(result.error);
      return result.data.messages;
    },
    enabled: !!chatId,
  });
}

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

  return useMutation({
    mutationFn: ({ content }: { content: string }) => sendMessageAction(chatId, content),
    onMutate: async ({ content }) => {
      await queryClient.cancelQueries({ queryKey: ['messages', chatId] });

      const previousMessages = queryClient.getQueryData<ExtendedMessage[]>(['messages', chatId]);

      const optimisticMessage: ExtendedMessage = {
        id: crypto.randomUUID(),
        chatId,
        senderId: 'me', // UI will handle this
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

export function usePresence(userId: string | undefined) {
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel('online-users');

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const ids = new Set<string>();
        for (const id in state) {
          const presences = state[id] as unknown as { user_id: string }[];
          for (const p of presences) {
            ids.add(p.user_id);
          }
        }
        setOnlineUsers(ids);
      })
      .on('presence', { event: 'join' }, () => {})
      .on('presence', { event: 'leave' }, () => {})
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return { onlineUsers };
}

export function useTyping(chatId: string, userId: string | undefined) {
  const [isTyping, setIsTyping] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!chatId || !userId) return;

    const channel = supabase
      .channel(`typing:${chatId}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId !== userId) {
          setIsTyping((prev) => ({ ...prev, [payload.userId]: payload.isTyping }));
          // Clear typing after 3 seconds of no updates
          if (payload.isTyping) {
            setTimeout(() => {
              setIsTyping((prev) => ({ ...prev, [payload.userId]: false }));
            }, 3000);
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, userId]);

  const setTyping = (typing: boolean) => {
    supabase.channel(`typing:${chatId}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId, isTyping: typing },
    });
  };

  return { isTyping, setTyping };
}

export function useSearchUsers(query: string) {
  return useQuery({
    queryKey: ['users', query],
    queryFn: async () => {
      // Only search if empty (initial list) or >= 2 characters
      if (query && query.length < 2) return [];

      const result = await searchUsersAction(query);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    staleTime: 30 * 1000,
  });
}

const LAST_SEEN_THROTTLE = 1000 * 60 * 5; // 5 minutes

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
