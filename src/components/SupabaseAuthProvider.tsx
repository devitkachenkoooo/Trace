'use client';

import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState } from 'react';
import { useGlobalRealtime } from '@/hooks/useGlobalRealtime';
import { supabase } from '@/lib/supabase/client';

interface SupabaseAuthContextType {
  user: User | null;
  loading: boolean;
}

const SupabaseAuthContext = createContext<SupabaseAuthContextType>({ 
  user: null, 
  loading: true 
});

export const useSupabaseAuth = () => useContext(SupabaseAuthContext);

export function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Ініціалізуємо реалтайм
  useGlobalRealtime(user);

  useEffect(() => {
    // Типізуємо отримання сесії
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <SupabaseAuthContext.Provider value={{ user, loading }}>
      {children}
    </SupabaseAuthContext.Provider>
  );
}