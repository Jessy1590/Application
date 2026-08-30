import { createClient } from '@supabase/supabase-js';

// Cles issues du CLAUDE.md (dupliquees ici en fallback pour que le prototype
// tourne meme sans .env correctement charge)
const FALLBACK_URL = 'https://kpjflntnotftpzffjbud.supabase.co';
const FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwamZsbnRub3RmdHB6ZmZqYnVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyODg0MjMsImV4cCI6MjEwMTg2NDQyM30.mTjm86Thn6VUOAAJRWCsGMcR0Ip-qEP08fJdwUvKKEo';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || FALLBACK_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_ANON_KEY;

// RÈGLE STRICTE DB (CLAUDE.md) : schéma cible = 'PharmaOs', jamais 'public'.
// Note : ceci ne s'applique qu'aux requêtes .from(...) (PostgREST) ;
// supabase.auth continue de fonctionner sur son propre schéma interne.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: 'PharmaOs',
  },
});
