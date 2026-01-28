'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { usePresenceStore } from '@/store/usePresenceStore';
import type { User, RealtimePostgresInsertPayload } from '@supabase/supabase-js';

export function useGlobalRealtime(user: User | null) {
  const queryClient = useQueryClient();
  const setOnlineUsers = usePresenceStore((state) => state.setOnlineUsers);

  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;

    const channel = supabase.channel('db-global-updates', {
      config: { presence: { key: userId } },
    });

    channel
      // 1. Списки користувачів (Presence)
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const onlineIds = new Set<string>();
        Object.keys(state).forEach((key) => onlineIds.add(key));
        setOnlineUsers(onlineIds);
      })
      // 2. Сигнал про нові чати
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chats' },
        (payload: RealtimePostgresInsertPayload<any>) => {
          console.log('🚨 [Signal] New chat detected. Triggering list refresh...');
          // Ця команда змушує всі компоненти з ключем 'chats' зробити новий fetch
          queryClient.invalidateQueries({ 
            queryKey: ['chats'], 
            exact: false 
          });
        }
      )
      // 3. Сигнал про нові повідомлення
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload: RealtimePostgresInsertPayload<any>) => {
          console.log('📩 [Signal] New message. Refreshing chats & messages...');
          // Оновлюємо і список чатів (щоб підняти активний чат вгору), і саме вікно переписки
          queryClient.invalidateQueries({ queryKey: ['chats'], exact: false });
          queryClient.invalidateQueries({ queryKey: ['messages'], exact: false });
        }
      )
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ 
            user_id: userId, 
            online_at: new Date().toISOString() 
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient, setOnlineUsers]);
}