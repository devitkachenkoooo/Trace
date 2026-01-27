'use client';

import type { User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState } from 'react';
import { useGlobalRealtime } from '@/hooks/useGlobalRealtime';
import { createClient } from '@/lib/supabase/client';

// Виносимо за межі, щоб не створювати новий екземпляр при кожному рендері
const supabase = createClient();

interface SupabaseAuthContextType {
  user: User | null;
  loading: boolean;
}

const SupabaseAuthContext = createContext<SupabaseAuthContextType>({ user: null, loading: true });

export const useSupabaseAuth = () => useContext(SupabaseAuthContext);

export function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Ініціалізуємо глобальний Realtime (він тепер стабільний завдяки Singleton supabase)
  useGlobalRealtime();

  useEffect(() => {
    // Отримуємо поточну сесію відразу
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []); // Залежність supabase видалена, бо це Singleton

  return (
    <SupabaseAuthContext.Provider value={{ user, loading }}>
      {children}
    </SupabaseAuthContext.Provider>
  );
}
