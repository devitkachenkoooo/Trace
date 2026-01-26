'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useSupabaseAuth } from '@/components/SupabaseAuthProvider';
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { usePresenceStore } from '@/store/usePresenceStore';

export default function RealtimePresence() {
  const { user } = useSupabaseAuth();
  const setOnlineUsers = usePresenceStore((state) => state.setOnlineUsers);
  const queryClient = useQueryClient();
  const supabase = createClient();

  useEffect(() => {
    if (!user?.id) return;

    const userId = user.id;

    // 1. Канал для присутності (Online users)
    const presenceChannel = supabase.channel('online-users', {
      config: {
        presence: { key: userId },
      },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const ids = new Set<string>();
        for (const key of Object.keys(state)) {
          ids.add(key);
        }
        setOnlineUsers(ids);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          });
        }
      });

    // 2. Глобальний слухач для нових повідомлень (сайдбар)
    const messagesChannel = supabase
      .channel('global-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['chats'] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(presenceChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [user?.id, setOnlineUsers, queryClient, supabase]);

  return null; // This is a logic-only component
}
