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
          messages!messages_chat_id_chats_id_fk(
            id, 
            content, 
            createdAt:created_at, 
            senderId:sender_id, 
            chat_id:chat_id, 
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

      // Використовуємо 'as unknown as FullChat[]', щоб прибрати помилку Conversion
      return data as unknown as FullChat[];
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
  const queryClient = useQueryClient();
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
    getPreviousPageParam: (firstPage) => {
      if (!firstPage || firstPage.length < 50) return undefined;
      return firstPage[0].created_at;
    },
    getNextPageParam: () => undefined,
    enabled: !!chatId,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!chatId) return;

    const channel = supabase
      .channel(`chat_realtime:${chatId}`)
      .on(
        'postgres_changes',
        {
          event: '*', 
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          // --- ОБРОБКА ВИДАЛЕННЯ (від іншого юзера) ---
          if (payload.eventType === 'DELETE') {
            const deletedId = payload.old?.id;
            
            if (deletedId) {
              queryClient.setQueryData(['messages', chatId], (old: any) => {
                if (!old) return old;
                return {
                  ...old,
                  pages: old.pages.map((page: any) =>
                    page.filter((msg: any) => msg.id !== deletedId)
                  ),
                };
              });
            }
          }

          // --- ОБРОБКА НОВОГО ПОВІДОМЛЕННЯ (від іншого юзера) ---
          if (payload.eventType === 'INSERT') {
            const newMessage = payload.new;

            queryClient.setQueryData(['messages', chatId], (old: any) => {
              if (!old) return old;
              
              // Якщо ми вже додали це повідомлення оптимістично — ігноруємо дубль
              const exists = old.pages.some((page: any) => 
                page.some((m: any) => m.id === newMessage.id)
              );

              if (exists) return old;

              const newPages = [...old.pages];
              const lastIdx = newPages.length - 1;
              newPages[lastIdx] = [...newPages[lastIdx], newMessage];
              
              return { ...old, pages: newPages };
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, queryClient]);

  // Логіка автоматичного прочитання
  const pages = query.data?.pages || [];
  const allMessages = pages.flat();
  const latestMessage = allMessages.length > 0 ? allMessages[allMessages.length - 1] : null;

  useEffect(() => {
    const msgId = latestMessage?.id;
    const isRead = latestMessage?.is_read || (latestMessage as any)?.isRead;
    const senderId = latestMessage?.sender_id || (latestMessage as any)?.senderId;
    
    // Позначаємо як прочитане тільки якщо повідомлення НЕ від нас
    if (msgId && user?.id && senderId !== user.id && !isRead && lastProcessedId.current !== msgId) {
      lastProcessedId.current = msgId;
      markAsReadMutation.mutate(chatId);
    }
  }, [latestMessage, user?.id, chatId, markAsReadMutation]);

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
        .select(`
          *,
          replyTo:messages!reply_to_id(*)
        `)
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

