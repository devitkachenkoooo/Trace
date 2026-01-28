'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { usePresenceStore } from '@/store/usePresenceStore';
import type { User } from '@supabase/supabase-js';

export function useGlobalRealtime(user: User | null) {
  const queryClient = useQueryClient();
  const setOnlineUsers = usePresenceStore((state) => state.setOnlineUsers);

  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;

    const channel = supabase.channel('db-global-updates', {
      config: { presence: { key: userId } },
    });

    const updateLastSeen = async () => {
      await supabase.rpc('update_last_seen');
    };

    // --- ДОДАЄМО HEARTBEAT ТУТ ---
    const heartbeatInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        updateLastSeen();
        console.log('💓 Heartbeat: status updated');
      }
    }, 1000 * 60 * 5); // 5 хвилин
    // ----------------------------

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
          queryClient.invalidateQueries({
            queryKey: ['contacts'],
            exact: false,
          });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chats' },
        () => {
          queryClient.invalidateQueries({
            queryKey: ['chats'],
            exact: false,
          });
          queryClient.invalidateQueries({
             queryKey: ['chat'],
             exact: false,
          });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['chats'], exact: false });
          queryClient.invalidateQueries({ queryKey: ['messages'], exact: false });
        },
      )
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          });
        }
        
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
           updateLastSeen();
        }
      });

    return () => {
      // ОБОВ'ЯЗКОВО ОЧИЩУЄМО ІНТЕРВАЛ
      clearInterval(heartbeatInterval); 
      updateLastSeen();
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', updateLastSeen);
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient, setOnlineUsers]);
}