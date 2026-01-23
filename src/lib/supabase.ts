import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Якщо критично важливо знати про відсутність ключів:
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase env variables are missing! Check your .env.local file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
