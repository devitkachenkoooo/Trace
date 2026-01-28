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

    channel
      // 1. Presence (Online Status)
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const onlineIds = new Set<string>();
        for (const key of Object.keys(state)) {
          onlineIds.add(key);
        }
        setOnlineUsers(onlineIds);
      })
      // 2. Profiles (Contacts) updates
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user' },
        () => {
          console.log('👥 [Signal] Profile update. Invalidating contacts...');
          queryClient.invalidateQueries({ 
            queryKey: ['contacts'], 
            exact: false 
          });
        }
      )
      // 3. New chats signal
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chats' },
        () => {
          console.log('🚨 [Signal] New chat detected. Triggering list refresh...');
          queryClient.invalidateQueries({ 
            queryKey: ['chats'], 
            exact: false 
          });
        }
      )
      // 4. Messages signal (handles new messages & status updates)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => {
          console.log('📩 [Signal] Message change. Refreshing chats & messages...');
          // Invalidate both chats (re-order list) and messages (new content/read status)
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