import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import {
  startContextWatch,
  stopContextWatch,
  onContextText,
} from '../../../shared/windowService.js';
import { fetchActiveConseils, insertConseilEvent } from '../services/conseilService.js';
import { matchConseil } from '../services/conseilMatch.js';

const CACHE_TTL_MS = 60_000;
const COOLDOWN_MS = 45_000;

/**
 * Rectangle Conseil taskbar : idle neutre → match rouge/blanc → Validé / croix.
 */
export default function ConseilPanel({ layout = 'horizontal' }) {
  const { user } = useAuth();
  const [active, setActive] = useState(null);
  const [busy, setBusy] = useState(false);
  const cacheRef = useRef({ at: 0, items: [] });
  const pendingIdRef = useRef(null);
  const cooldownRef = useRef(new Map()); // conseil_id → until ts
  const sourceRef = useRef('focused_text');
  const matchedTextRef = useRef('');

  const refreshCache = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - cacheRef.current.at < CACHE_TTL_MS && cacheRef.current.items.length) {
      return cacheRef.current.items;
    }
    try {
      const items = await fetchActiveConseils();
      cacheRef.current = { at: now, items };
      return items;
    } catch (err) {
      console.warn('[ConseilPanel] cache', err?.message || err);
      return cacheRef.current.items;
    }
  }, []);

  const dismissedIds = useCallback(() => {
    const now = Date.now();
    const map = cooldownRef.current;
    for (const [id, until] of map) {
      if (until <= now) map.delete(id);
    }
    const ids = new Set(map.keys());
    if (pendingIdRef.current) ids.add(pendingIdRef.current);
    return ids;
  }, []);

  const tryMatch = useCallback(async (payload) => {
    if (pendingIdRef.current) return;
    const text = payload?.text || payload?.normalized || '';
    if (!text || String(text).trim().length < 3) return;

    sourceRef.current = payload.source || 'focused_text';
    matchedTextRef.current = String(payload.rawText || payload.text || '').slice(0, 500);

    const items = await refreshCache();
    const hit = matchConseil(text, items, {
      dismissedIds: dismissedIds(),
      cips: payload.cips || [],
    });
    if (!hit) return;

    pendingIdRef.current = hit.id;
    setActive(hit);
  }, [dismissedIds, refreshCache]);

  useEffect(() => {
    if (!user?.id) return undefined;

    refreshCache(true);
    startContextWatch();
    const unsub = onContextText((payload) => {
      tryMatch(payload);
    });

    const onFocus = () => { refreshCache(true); };
    window.addEventListener('focus', onFocus);

    return () => {
      unsub?.();
      stopContextWatch();
      window.removeEventListener('focus', onFocus);
    };
  }, [user?.id, refreshCache, tryMatch]);

  const resolve = async (status) => {
    if (!active || !user?.id || busy) return;
    setBusy(true);
    const conseilId = active.id;
    try {
      await insertConseilEvent({
        conseil_id: conseilId,
        user_id: user.id,
        status,
        matched_text: matchedTextRef.current,
        source: sourceRef.current,
      });
    } catch (err) {
      console.error('[ConseilPanel] event', err);
    } finally {
      cooldownRef.current.set(conseilId, Date.now() + COOLDOWN_MS);
      pendingIdRef.current = null;
      setActive(null);
      setBusy(false);
    }
  };

  if (!active) {
    const idleCls = layout === 'vertical'
      ? 'flex items-center justify-center w-full min-h-7 px-1 py-1 rounded border border-[var(--tb-border)] bg-[var(--tb-hover)] text-[10px] text-[var(--tb-muted)]'
      : layout === 'corner'
        ? 'flex items-center h-7 px-2 rounded border border-[var(--tb-border)] bg-[var(--tb-hover)] text-[11px] text-[var(--tb-muted)]'
        : 'hidden lg:flex items-center h-7 px-2.5 rounded border border-[var(--tb-border)] bg-[var(--tb-hover)] text-[11px] text-[var(--tb-muted)] max-w-[140px]';
    return (
      <div
        className={idleCls}
        title="Conseil — en écoute (Bloc-notes / presse-papiers)"
      >
        Conseil
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-1.5 h-7 pl-2 pr-1 rounded border border-[var(--danger)] bg-[var(--danger)] text-white shadow-sm ${layout === 'vertical' ? 'w-full max-w-full flex-col h-auto py-1' : 'max-w-[320px]'}`}
      title={active.label_snapshot || ''}
      role="status"
    >
      <span className="text-[11px] font-medium truncate min-w-0 flex-1">
        {active.message || active.label_snapshot}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          title="Validé — conseil accepté"
          aria-label="Validé"
          disabled={busy}
          onClick={() => resolve('accepte')}
          className="shrink-0 w-6 h-6 rounded flex items-center justify-center bg-white/20 hover:bg-white/30 disabled:opacity-50"
        >
          <Check size={14} strokeWidth={3} />
        </button>
        <button
          type="button"
          title="Refuser"
          aria-label="Refuser"
          disabled={busy}
          onClick={() => resolve('refuse')}
          className="shrink-0 w-6 h-6 rounded flex items-center justify-center bg-black/20 hover:bg-black/30 disabled:opacity-50"
        >
          <X size={14} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}
