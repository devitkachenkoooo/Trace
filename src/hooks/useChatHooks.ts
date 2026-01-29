'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  useInfiniteQuery, 
  useMutation, 
  useQuery, 
  useQueryClient 
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

// Залишаємо тільки ОДИН варіант авторизації та клієнта
import { useSupabaseAuth } from '@/components/SupabaseAuthProvider';
import { supabase } from '@/lib/supabase/client';
import { normalizePayload } from '@/lib/supabase/utils';
import { usePresenceStore } from '@/store/usePresenceStore';
import type { FullChat, Message, User } from '@/types';

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
          userLastRead:user_last_read_id(id, createdAt:created_at),
          recipientLastRead:recipient_last_read_id(id, createdAt:created_at),
          messages!messages_chat_id_chats_id_fk(
            id, 
            content, 
            createdAt:created_at, 
            senderId:sender_id, 
            chat_id:chat_id, 
            attachments
          )
        `)
        .or(`user_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order('created_at', { foreignTable: 'messages', ascending: false })
        .limit(1, { foreignTable: 'messages' });

      if (error) {
        console.error('Помилка запиту чатів:', error.message);
        throw error;
      }

      const normalizedChats = normalizePayload(data) as FullChat[];
      
      // Сортуємо за датою останнього повідомлення (Bubble to top)
      return normalizedChats.sort((a, b) => {
        const dateA = a.messages?.[0]?.createdAt || a.createdAt;
        const dateB = b.messages?.[0]?.createdAt || b.createdAt;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
    },
    enabled: !!user,
  });
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();
  const { user } = useSupabaseAuth();

  return useMutation({
    mutationFn: async ({ chatId, messageId }: { chatId: string; messageId: string }) => {
      if (!user?.id) return;

      const { error } = await supabase.rpc('mark_chat_as_read', {
        p_chat_id: chatId,        // використовуємо p_ для чіткості з SQL параметрами
        p_message_id: messageId,
        p_user_id: user.id        // ПЕРЕДАЄМО ID ЯВНО, щоб уникнути NULL сесії
      });

      if (error) {
        console.error('Error marking as read:', error);
        throw error;
      }
    },
    onSuccess: (_, { chatId }) => {
      // Оновлюємо кеш, щоб MessageBubble побачив нову дату в recipientLastReadAt
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      queryClient.invalidateQueries({ queryKey: ['chat', chatId] });
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
          recipient:user!recipient_id(*),
          userLastRead:user_last_read_id(id, created_at),
          recipientLastRead:recipient_last_read_id(id, created_at)
        `)
        .eq('id', chatId)
        .single();

      if (error) throw error;

      // Normalize participants for the UI
      const participants = [data.participants, data.recipient].filter(Boolean) as User[];

      return normalizePayload({ ...data, participants }) as FullChat;
    },
    enabled: !!chatId && !!user,
  });
}

export function useMessages(chatId: string) {
  const { user } = useSupabaseAuth();
  const markAsReadMutation = useMarkAsRead();
  const lastProcessedId = useRef<string | null>(null);

  const query = useInfiniteQuery({
    queryKey: ['messages', chatId],
    queryFn: async ({ pageParam }) => {
      if (!chatId) return [];

      const { data, error } = await supabase
        .from('messages')
        /**
         * ВИПРАВЛЕННЯ PGRST200:
         * Використовуємо 'replyTo:reply_to_id(*)' замість імені ключа fkey.
         */
        .select('*, replyTo:reply_to_id(*)')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(50)
        .lt('created_at', pageParam || '9999-12-31');

      if (error) {
        console.error("Помилка завантаження повідомлень:", error.message);
        throw error;
      }
      
      // Повертаємо масив (нові повідомлення будуть в кінці масиву сторінки)
      const normalizedData = (data || []).map((msg: any) => normalizePayload(msg));
      return (normalizedData as Message[]).reverse();
    },
    initialPageParam: undefined as string | undefined,
    getPreviousPageParam: (firstPage) => {
      if (!firstPage || firstPage.length < 50) return undefined;
      return (firstPage[0] as Message).createdAt;
    },
    getNextPageParam: () => undefined,
    enabled: !!chatId,
    refetchOnWindowFocus: false,
  });

  // --- АВТОМАТИЧНЕ ПРОЧИТАННЯ (ОНОВЛЕНО) ---
  useEffect(() => {
    const allMessages = query.data?.pages.flat() || [];
    if (allMessages.length === 0 || !user?.id) return;

    const latestMessage = allMessages.reduce((prev, current) => {
      return (new Date(current.createdAt) > new Date(prev.createdAt)) ? current : prev;
    });
    
    const msgId = latestMessage.id;
    const msgSenderId = latestMessage.sender_id || latestMessage.senderId;

    if (msgId && msgSenderId !== user.id && lastProcessedId.current !== msgId) {
      lastProcessedId.current = msgId;
      markAsReadMutation.mutate({ chatId, messageId: msgId });
    }
  }, [query.data?.pages, user?.id, chatId, markAsReadMutation.mutate]);

  return query;
}

// 3. Пошук (для ContactsList)
export function useSearchUsers(queryText: string) {
  const { user: currentUser } = useSupabaseAuth();

  return useQuery({
    queryKey: ['contacts', queryText, currentUser?.id],
    queryFn: async () => {
      // 1. Захист від undefined UUID
      if (!currentUser?.id) return [];

      let query = supabase
        .from('user')
        .select('id, name, email, image, last_seen') // Вибираємо тільки ті поля, що існують
        .neq('id', currentUser.id);

      if (queryText.trim().length > 1) {
        // Пошук за ім'ям або поштою
        query = query.or(`name.ilike.%${queryText}%,email.ilike.%${queryText}%`).limit(10);
      } else if (!queryText.trim()) {
        // Task 2: 20 юзерів, які заходили нещодавно (сортуємо за last_seen)
        // Якщо в базі поле зветься last_seen — використовуємо його
        query = query.order('last_seen', { ascending: false, nullsFirst: false }).limit(20);
      } else {
        return [];
      }

      const { data, error } = await query;

      if (error) {
        console.error('Помилка useSearchUsers:', error.message);
        throw error;
      }

      return normalizePayload(data) as User[];
    },
    // Запит спрацює тільки коли є юзер і або порожній рядок, або > 1 символа
    enabled: !!currentUser?.id && (queryText.trim().length === 0 || queryText.trim().length > 1),
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
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!chatId || !user?.id) return;

    const channel = supabase.channel(`typing:${chatId}`, {
      config: { presence: { key: user.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const typingMap: Record<string, boolean> = {};
        
        for (const id in state) {
          typingMap[id] = (state[id] as any[]).some((p) => p.isTyping);
        }
        setIsTyping(typingMap);
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ isTyping: false });
        }
      });

    channelRef.current = channel;

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [chatId, user]);

  const setTyping = useCallback((typing: boolean) => {
    if (channelRef.current) {
      channelRef.current.track({ isTyping: typing });

      // Auto-cleanup timer: 3 seconds
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      
      if (typing) {
        timeoutRef.current = setTimeout(() => {
          channelRef.current?.track({ isTyping: false });
        }, 3000);
      }
    }
  }, []);

  return { isTyping, setTyping };
}

export function useEditMessage(chatId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId, content }: { messageId: string; content: string }) => {
      const { data, error } = await supabase
        .from('messages')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', messageId)
        .select('*, replyTo:reply_to_id(*)')
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async (newEdit) => {
      await queryClient.cancelQueries({ queryKey: ['messages', chatId] });
      const previousData = queryClient.getQueryData(['messages', chatId]);

      queryClient.setQueryData(['messages', chatId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) =>
            page.map((msg: any) =>
              msg.id === newEdit.messageId ? { ...msg, content: newEdit.content, updated_at: new Date().toISOString() } : msg
            )
          ),
        };
      });

      return { previousData };
    },
    onError: (error: any, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['messages', chatId], context.previousData);
      }
      toast.error(`Помилка редагування: ${error.message}`);
    },
    onSuccess: () => {
      toast.success('Повідомлення відредаговано');
    },
  });
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
      attachments?: any[];
    }) => {
      if (!user) throw new Error('Ви не авторизовані');

      // 1. Вставляємо дані. 
      // Використовуємо .select() з явним вказанням зв'язку, щоб уникнути дублів ключів
      const { error, data } = await supabase
        .from('messages')
        .insert({
          chat_id: chatId,
          sender_id: user.id,
          content,
          reply_to_id: replyToId || null,
          attachments: attachments || [],
        })
        .select('*, replyTo:reply_to_id(*)')
        .single();

      if (error) {
        console.error("Помилка відправки:", error.message);
        throw error;
      }
      return data;
    },

    onMutate: async (newMessage) => {
      // Скасовуємо активні запити, щоб вони не перезаписали наш оптимістичний стейт
      await queryClient.cancelQueries({ queryKey: ['messages', chatId] });

      // Зберігаємо попередні дані для відкату у разі помилки
      const previousData = queryClient.getQueryData(['messages', chatId]);

      // Знаходимо повідомлення, на яке відповідаємо (для UI)
      const allMessages = (previousData as any)?.pages?.flat() || [];
      const parentMessage = newMessage.replyToId 
        ? allMessages.find((m: any) => m.id === newMessage.replyToId)
        : null;

      // Створюємо "фейкове" повідомлення для миттєвого відображення
      const optimisticMessage = {
        id: `temp-${Date.now()}`,
        content: newMessage.content,
        sender_id: user?.id,
        chat_id: chatId,
        created_at: new Date().toISOString(), // для бази/сокета
        createdAt: new Date().toISOString(),  // для твого UI-компонента
        reply_to_id: newMessage.replyToId || null,
        replyTo: parentMessage,
        attachments: newMessage.attachments || [],
        is_read: false,
        is_optimistic: true 
      };

      // Оновлюємо кеш React Query
      queryClient.setQueryData(['messages', chatId], (old: any) => {
        if (!old) return { pages: [[optimisticMessage]], pageParams: [undefined] };
        
        const newPages = [...old.pages];
        const lastPageIdx = newPages.length - 1;
        
        // Додаємо в кінець останньої сторінки
        newPages[lastPageIdx] = [...newPages[lastPageIdx], optimisticMessage];
  
        return { ...old, pages: newPages };
      });

      // --- ОПТИМІСТИЧНЕ ОНОВЛЕННЯ СПИСКУ ЧАТІВ (Bubble to top) ---
      queryClient.setQueryData(['chats'], (old: any) => {
        if (!old) return old;
        const chatIndex = old.findIndex((c: any) => c.id === chatId);
        if (chatIndex === -1) return old;

        const updatedChat = {
          ...old[chatIndex],
          messages: [optimisticMessage], // Оновлюємо прев'ю
        };

        const otherChats = old.filter((c: any) => c.id !== chatId);
        return [updatedChat, ...otherChats]; // Ставимо на початок
      });

      return { previousData };
    },

    onError: (error: Error, _, context) => {
      // Якщо помилка — повертаємо старі дані
      if (context?.previousData) {
        queryClient.setQueryData(['messages', chatId], context.previousData);
      }
      toast.error(`Не вдалося відправити: ${error.message}`);
    },

    onSuccess: (savedMessage) => {
      // Коли прийшла відповідь від бази, замінюємо "temp" повідомлення на реальне
      queryClient.setQueryData(['messages', chatId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: any[]) =>
            page.map((msg) => 
              msg.id.toString().startsWith('temp-') && msg.content === savedMessage.content 
                ? savedMessage 
                : msg
            )
          ),
        };
      });
    },

    onSettled: () => {
      // Фінальна синхронізація (опціонально)
      // queryClient.invalidateQueries({ queryKey: ['messages', chatId] });
    }
  });
}

export function useDeleteMessage(chatId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string) => {
      const { data, error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId)
        .select(); 

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Немає прав на видалення або повідомлення вже видалено');
      }
      return data;
    },
    // Чітко вказуємо, що чекаємо string
    onMutate: async (messageId: string) => {
      await queryClient.cancelQueries({ queryKey: ['messages', chatId] });

      const previousData = queryClient.getQueryData(['messages', chatId]);

      queryClient.setQueryData(['messages', chatId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) =>
            // Використовуємо messageId з аргументів мутації
            page.filter((msg: any) => msg.id !== messageId)
          ),
        };
      });

      return { previousData };
    },
    onError: (error: any, messageId, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['messages', chatId], context.previousData);
      }
      toast.error('Помилка видалення', {
        description: error.message,
      });
    },
    onSuccess: () => {
      toast.success('Повідомлення видалено');
    },
  });
}

export function useDeleteChat() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (chatId: string) => {
      const { error } = await supabase
        .from('chats')
        .delete()
        .eq('id', chatId);

      if (error) throw error;
      return chatId;
    },
    onSuccess: (chatId) => {
      // 1. Оновлюємо кеш списку чатів, щоб видалений чат зник з інтерфейсу
      queryClient.setQueryData(['chats'], (old: any) => {
        if (!old) return old;
        return old.filter((chat: any) => chat.id !== chatId);
      });

      // 2. Виводимо сповіщення
      toast.success('Чат видалено');

      // 3. Редірект на головну сторінку месенджера
      router.push('/chat'); 
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

      const { error } = await supabase.rpc('update_last_seen');

      if (error) throw error;
    },
    onError: (error: Error) => {
      console.error('Помилка оновлення статусу присутності:', error);
    },
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
    async (messageId: string, options?: { align?: 'start' | 'center' | 'end'; behavior?: 'smooth' | 'auto' }) => {
      const index = messages.findIndex((m: Message) => m.id === messageId);

      if (index !== -1) {
        virtuosoRef.current?.scrollToIndex({
          index,
          behavior: options?.behavior || 'smooth',
          align: options?.align || 'center',
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

