'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { usePresenceStore } from '@/store/usePresenceStore';

export default function RealtimePresence() {
  const { data: session } = useSession();
  const setOnlineUsers = usePresenceStore((state) => state.setOnlineUsers);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!session?.user?.id) return;

    const userId = session.user.id;

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
  }, [session?.user?.id, setOnlineUsers, queryClient]);

  return null; // This is a logic-only component
}
