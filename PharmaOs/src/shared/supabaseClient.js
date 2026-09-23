import { createClient } from '@supabase/supabase-js';

/** Trim + sans slash final — les espaces après `=` dans `.env` cassent l’auth. */
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[PharmaOS] Variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquantes (.env).'
  );
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  db: {
    schema: 'PharmaOs',
  },
});
