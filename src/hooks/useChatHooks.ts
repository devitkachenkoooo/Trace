'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  type InfiniteData, 
  useInfiniteQuery, 
  useMutation, 
  useQuery, 
  useQueryClient 
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { RealtimeChannel } from '@supabase/supabase-js';

// Залишаємо тільки ОДИН варіант авторизації та клієнта
import { useSupabaseAuth } from '@/components/SupabaseAuthProvider';
import { createClient } from '@/lib/supabase/client';
import { usePresenceStore } from '@/store/usePresenceStore';
import type { FullChat, Message, User } from '@/types';

// Створюємо клієнт supabase ОДИН раз
const supabase = createClient();

// 1. Отримання чатів
export function useChats() {
  const { user } = useSupabaseAuth();

  return useQuery({
    queryKey: ['chats'],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('chats')
        .select(`
          *,
          user:user_id(*),      
          recipient:recipient_id(*),
          messages(
            id, 
            content, 
            createdAt:created_at, 
            senderId:sender_id, 
            chatId:chat_id, 
            isRead:is_read, 
            attachments
          )
        `)
        .or(`user_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Помилка запиту чатів:", error.message);
        throw error;
      }

      return data as FullChat[];
    },
    enabled: !!user,
  });
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();
  const { user } = useSupabaseAuth();

  return useMutation({
    mutationFn: async (chatId: string) => {
      if (!user) return;

      const { error } = await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('chat_id', chatId)
        .eq('is_read', false)
        .neq('sender_id', user.id); // Не позначаємо прочитаними свої повідомлення

      if (error) throw error;
    },
    onSuccess: (_, chatId) => {
      // Оновлюємо кеш повідомлень, щоб змінити статус is_read локально
      queryClient.invalidateQueries({ queryKey: ['messages', chatId] });
      // Оновлюємо список чатів, щоб прибрати лічильник непрочитаних
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },
  });
}

export function useChatDetails(chatId: string) {
  const { user } = useSupabaseAuth();

  return useQuery({
    queryKey: ['chat', chatId],
    queryFn: async () => {
      if (!user) throw new Error('Unauthorized');

      const { data, error } = await supabase
        .from('chats')
        .select(`
          *,
          participants:user!user_id(*),
          recipient:user!recipient_id(*)
        `)
        .eq('id', chatId)
        .single();

      if (error) throw error;

      // Normalize participants for the UI
      const participants = [data.participants, data.recipient].filter(Boolean) as User[];
      
      return { ...data, participants } as FullChat;
    },
    enabled: !!chatId && !!user,
  });
}

export function useMessages(chatId: string) {
  const { user } = useSupabaseAuth();
  // Викликаємо мутацію (переконайся, що назва збігається з експортованою функцією в цьому файлі)
  const markAsReadMutation = useMarkAsRead(); 
  const lastProcessedId = useRef<string | null>(null);

  const query = useInfiniteQuery({
    queryKey: ['messages', chatId],
    queryFn: async ({ pageParam }) => {
      if (!chatId) return [];
      const { data, error } = await supabase
        .from('messages')
        .select('*, replyTo:messages!reply_to_id(*)')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(50)
        .lt('created_at', pageParam || '9999-12-31');

      if (error) throw error;
      return (data || []).reverse();
    },
    initialPageParam: undefined as string | undefined,
    // Ми використовуємо getPreviousPageParam, щоб старіші повідомлення додавалися в ПОЧАТОК масиву pages.
    // Таким чином flat() завжди буде [Older...Newest].
    getPreviousPageParam: (firstPage) => {
      if (!firstPage || firstPage.length < 50) return undefined;
      return firstPage[0].created_at;
    },
    getNextPageParam: () => undefined,
    enabled: !!chatId,
    refetchOnWindowFocus: false,
  });

  const pages = query.data?.pages || [];
  const latestMessage = pages.length > 0 ? pages[pages.length - 1][pages[pages.length - 1].length - 1] : null;

  useEffect(() => {
    // Розпаковуємо значення для чіткості, щоб Biome не плутався
    const msgId = latestMessage?.id;
    const isRead = latestMessage?.is_read;
    const senderId = latestMessage?.sender_id;
    const currentUserId = user?.id;

    if (
      msgId && 
      currentUserId && 
      senderId !== currentUserId && 
      !isRead && 
      lastProcessedId.current !== msgId
    ) {
      lastProcessedId.current = msgId;
      markAsReadMutation.mutate(chatId);
    }
    // Вказуємо конкретні примітиви в залежності — Biome це обожнює
  }, [latestMessage, user, chatId, markAsReadMutation.mutate]);

  return query;
}
// 3. Пошук (для ContactsList)
export function useSearchUsers(queryText: string) {
  return useQuery({
    queryKey: ['users-search', queryText],
    queryFn: async () => {
      if (!queryText.trim()) return [];

      // Отримуємо поточного юзера, щоб виключити його з пошуку
      const { data: { user: currentUser } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('user')
        .select('id, name, email, image')
        // Шукаємо або по імені, або по email
        .or(`name.ilike.%${queryText}%,email.ilike.%${queryText}%`)
        // Виключаємо себе з результатів
        .neq('id', currentUser?.id)
        .limit(10);

      if (error) {
        console.error("Помилка пошуку користувачів:", error.message);
        throw error;
      }

      return data;
    },
    enabled: queryText.trim().length > 1,
  });
}

// 4. Присутність (для ContactsList)
export function usePresence() {
  const onlineUsers = usePresenceStore((state) => state.onlineUsers);
  return { onlineUsers };
}

export function useChatTyping(chatId: string) {
  const { user } = useSupabaseAuth();
  const [isTyping, setIsTyping] = useState<Record<string, boolean>>({});
  const channelRef = useRef<any>(null);

  useEffect(() => {
    // Перевіряємо наявність chatId та user.id
    if (!chatId || !user?.id) return;

    // Створюємо окремий канал тільки для присутності
    const channel = supabase.channel(`typing:${chatId}`, {
      config: { presence: { key: user.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const typingMap: Record<string, boolean> = {};
        
        for (const id in state) {
          // Перевіряємо, чи хтось із пристроїв цього юзера друкує
          // p as any дозволяє уникнути помилок типізації властивості isTyping
          typingMap[id] = (state[id] as any[]).some((p) => p.isTyping);
        }
        setIsTyping(typingMap);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ isTyping: false });
        }
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
    // Додаємо user в залежності замість user.id, щоб Biome був щасливий
  }, [chatId, user]);

  const setTyping = useCallback((typing: boolean) => {
    if (channelRef.current) {
      channelRef.current.track({ isTyping: typing });
    }
  }, []);

  return { isTyping, setTyping };
}

// 5. Відправка повідомлення
export function useSendMessage(chatId: string) {
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      content, 
      replyToId,
      attachments 
    }: { 
      content: string; 
      replyToId?: string;
      attachments?: { id: string; type: string; url: string; metadata: any }[];
    }) => {
      if (!user) throw new Error('Ви не авторизовані');

      const messageId = crypto.randomUUID();

      const { error } = await supabase.from('messages').insert({
        id: messageId,
        chat_id: chatId,
        sender_id: user.id,
        content,
        reply_to_id: replyToId || null,
        attachments: attachments || [],
      });

      if (error) throw error;
      return { id: messageId, content, replyToId, attachments };
    },

    onMutate: async (newMessage) => {
      await queryClient.cancelQueries({ queryKey: ['messages', chatId] });
      const previousData = queryClient.getQueryData(['messages', chatId]);

      const allMessages = (previousData as any)?.pages?.flat() || [];
      const parentMessage = newMessage.replyToId 
        ? allMessages.find((m: any) => m.id === newMessage.replyToId)
        : null;

      const optimisticMessage = {
        id: crypto.randomUUID(),
        content: newMessage.content,
        senderId: user?.id, 
        sender_id: user?.id,
        chatId: chatId,
        chat_id: chatId,
        createdAt: new Date().toISOString(),
        replyToId: newMessage.replyToId || null,
        reply_to_id: newMessage.replyToId || null,
        replyTo: parentMessage ? {
          id: parentMessage.id,
          content: parentMessage.content,
          sender: parentMessage.sender
        } : null,
        attachments: newMessage.attachments || [],
        is_read: false,
      };

      queryClient.setQueryData(['messages', chatId], (old: any) => {
        if (!old || !old.pages || old.pages.length === 0) {
          return { pages: [[optimisticMessage]], pageParams: [undefined] };
        }
        
        const newPages = [...old.pages];
        const lastIdx = newPages.length - 1;
        
        // Додаємо в КІНЕЦЬ останньої сторінки (хронологічний порядок)
        newPages[lastIdx] = [...newPages[lastIdx], optimisticMessage];
  
        return { ...old, pages: newPages };
      });

      return { previousData };
    },

    onError: (error: Error, newMessage, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['messages', chatId], context.previousData);
      }
      toast.error(`Помилка відправки: ${error.message}`);
    },

    onSettled: () => {
      // Важливо: не інвалідуємо відразу, якщо realtime вже вставив повідомлення,
      // але для впевненості можна залишити.
      queryClient.invalidateQueries({ queryKey: ['messages', chatId] });
    }
  });
}

export function useDeleteMessage(_chatId: string) {

  return useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase.from('messages').delete().eq('id', messageId);
      if (error) throw error;
    },
    onSuccess: () => {
      // Real-time listener handles cache updates
      toast.success('Повідомлення видалено');
    },
    onError: (error: Error) => {
      toast.error(`Не вдалося видалити повідомлення: ${error.message}`);
    }
  });
}

export function useDeleteChat() {

  return useMutation({
    mutationFn: async (chatId: string) => {
      const { error } = await supabase.from('chats').delete().eq('id', chatId);
      if (error) throw error;
    },
    onSuccess: () => {
      // Real-time listener handles cache updates
      toast.success('Чат видалено');
    },
    onError: (error: Error) => {
      toast.error(`Не вдалося видалити чат: ${error.message}`);
    }
  });
}



export function useUpdateLastSeen() {
  const { user } = useSupabaseAuth();

  return useMutation({
    mutationFn: async () => {
      if (!user) return;

      const { error } = await supabase
        .from('user') // ТЕПЕР В ОДНИНІ, як у схемі
        .update({ lastSeen: new Date().toISOString() })
        .eq('id', user.id);

      if (error) throw error;
    },
    onError: (error: Error) => {
      console.error('Помилка оновлення статусу присутності:', error);
    }
  });
}

export function useScrollToMessage(
  virtuosoRef: React.RefObject<any>,
  messages: Message[],
  fetchPreviousPage: () => void,
  hasPreviousPage: boolean,
) {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const scrollToMessage = useCallback(
    async (messageId: string) => {
      const index = messages.findIndex((m: Message) => m.id === messageId);

      if (index !== -1) {
        virtuosoRef.current?.scrollToIndex({
          index,
          behavior: 'smooth',
          align: 'center',
        });
        setHighlightedId(messageId);
        setTimeout(() => setHighlightedId(null), 2000);
      } else {
        if (hasPreviousPage) {
          fetchPreviousPage();
          toast.info('Підвантажуємо історію...');
        }
      }
    },
    [messages, hasPreviousPage, fetchPreviousPage, virtuosoRef],
  );

  return { scrollToMessage, highlightedId };
}

