import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseEnv } from './env';

/** Client navigateur (cookies) — compatible middleware / protect.js cookie storage. */
export function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient(url, anonKey, {
    db: { schema: 'portail' },
  });
}
