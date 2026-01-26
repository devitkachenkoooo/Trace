import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase env variables are missing! Check your .env.local file.');
}

// Client for browser-side public operations (e.g., getting public URLs)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false, // Це вимкне спроби клієнта знайти сесію самостійно
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

// Client for server-side secure operations (e.g., uploading files via Server Actions)
// This client bypasses RLS and should ONLY be used in server-side code.
export const supabaseService = supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;