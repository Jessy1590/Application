import { useEffect, useRef } from 'react';
import { supabase } from './supabaseClient.js';

/**
 * Recharge les données dès qu'une table PharmaOs change (Realtime)
 * ou quand la fenêtre reprend le focus / devient visible.
 *
 * @param {() => void|Promise<void>} onRefresh
 * @param {{ tables?: string[], schema?: string, enabled?: boolean }} options
 */
export function useRealtimeRefresh(onRefresh, { tables = [], schema = 'PharmaOs', enabled = true } = {}) {
  const cbRef = useRef(onRefresh);
  useEffect(() => { cbRef.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    if (!enabled) return undefined;

    const run = () => {
      try {
        const r = cbRef.current?.();
        if (r && typeof r.then === 'function') r.catch(() => {});
      } catch { /* ignore */ }
    };

    const channelName = `rt-${schema}-${tables.join('|') || 'focus'}-${Math.random().toString(36).slice(2, 8)}`;
    let channel = null;

    if (tables.length > 0) {
      channel = supabase.channel(channelName);
      tables.forEach((table) => {
        channel.on(
          'postgres_changes',
          { event: '*', schema, table },
          () => run(),
        );
      });
      channel.subscribe();
    }

    const onFocus = () => run();
    const onVis = () => {
      if (document.visibilityState === 'visible') run();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);

    return () => {
      if (channel) supabase.removeChannel(channel);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled, schema, tables.join('|')]);
}
