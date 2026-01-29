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
        (payload: any) => {
          // 1. If chat was deleted, REMOVE it from cache to prevent ghost refetches
          if (payload.eventType === 'DELETE') {
            const deletedId = payload.old.id;
            queryClient.removeQueries({ queryKey: ['chat', deletedId] });
            queryClient.removeQueries({ queryKey: ['messages', deletedId] });
            
            // Also invalidate the list to remove it from sidebar
            queryClient.invalidateQueries({ queryKey: ['chats'] });
            return;
          }

          // 2. For UPDATE/INSERT, we can be more specific
          const chatId = payload.new?.id;
          
          queryClient.invalidateQueries({ queryKey: ['chats'] });
          if (chatId) {
            queryClient.invalidateQueries({ queryKey: ['chat', chatId] });
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        (payload: any) => {
          const chatId = payload.new?.chat_id || payload.old?.chat_id;
          
          // Always invalidate chats list to update the last message preview
          queryClient.invalidateQueries({ queryKey: ['chats'] });
          
          // Only invalidate the specific chat messages if we have the ID
          if (chatId) {
            queryClient.invalidateQueries({ queryKey: ['messages', chatId] });
          }
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