import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[PharmaOS Dashboard] Variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquantes (.env).'
  );
}

// RÈGLE STRICTE DB (CLAUDE.md) : schéma cible = 'PharmaOs', jamais 'public'.
// Rappel : 'PharmaOs' ET 'portail' (table profiles, lue par AuthContext.jsx)
// doivent être ajoutés à "Exposed schemas" dans Project Settings > Data API
// sur le dashboard Supabase, sinon 404.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: 'PharmaOs',
  },
});
