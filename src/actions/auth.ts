'use client';

import { createClient } from '@/lib/supabase/client';

export async function handleSignIn() {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });

  if (error) {
    console.error('Error signing in:', error.message);
  }
}

export async function handleSignOut() {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  
  if (error) {
    console.error('Error signing out:', error.message);
  } else {
    window.location.href = '/';
  }
}
