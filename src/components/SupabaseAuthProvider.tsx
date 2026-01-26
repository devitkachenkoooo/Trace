'use client';

import { createClient } from '@/lib/supabase/client';
import { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';

interface SupabaseAuthContextType {
  user: User | null;
  loading: boolean;
}

const SupabaseAuthContext = createContext<SupabaseAuthContextType>({ user: null, loading: true });

export const useSupabaseAuth = () => useContext(SupabaseAuthContext);

export function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  return (
    <SupabaseAuthContext.Provider value={{ user, loading }}>
      {children}
    </SupabaseAuthContext.Provider>
  );
}
