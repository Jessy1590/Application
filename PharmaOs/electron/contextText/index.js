import { FocusedTextSource } from './FocusedTextSource.js';
import { ClipboardSource } from './ClipboardSource.js';
import { WinPharmaSource } from './WinPharmaSource.js';
import { normalizeText } from './normalize.js';

/**
 * Bus `context:text` — agrège des sources branchables et pousse vers le renderer taskbar.
 *
 * @param {{ getTargetWebContents: () => import('electron').WebContents | null }} deps
 */
export function createContextTextBus({ getTargetWebContents }) {
  const focused = new FocusedTextSource({ pollMs: 400 });
  const clipboard = new ClipboardSource({ pollMs: 500 });
  const winpharma = new WinPharmaSource();
  const sources = [focused, clipboard, winpharma];

  let watching = false;
  let timer = null;
  let lastFingerprint = '';
  let lastEmitAt = 0;

  function emit(payload) {
    const wc = getTargetWebContents?.();
    if (!wc || wc.isDestroyed()) return;
    const text = String(payload.text || '').trim();
    if (!text) return;

    const fingerprint = `${payload.source}|${payload.normalized || normalizeText(text)}`;
    const now = Date.now();
    // Anti-flood : même texte max 1× / 1.5 s (permet re-match après cooldown UI)
    if (fingerprint === lastFingerprint && now - lastEmitAt < 1500) return;
    lastFingerprint = fingerprint;
    lastEmitAt = now;

    wc.send('context:text', {
      text,
      rawText: payload.rawText || text,
      source: payload.source || 'focused_text',
      processName: payload.processName || null,
      normalized: payload.normalized || normalizeText(text),
      cips: payload.cips || [],
      at: now,
    });
  }

  async function tick() {
    if (!watching) return;
    for (const src of sources) {
      try {
        const hit = await src.poll();
        if (hit) emit(hit);
      } catch (err) {
        console.warn('[contextText]', src.id, err?.message || err);
      }
    }
  }

  return {
    startWatch() {
      if (watching) return { ok: true, status: 'already' };
      watching = true;
      lastFingerprint = '';
      lastEmitAt = 0;
      for (const src of sources) {
        try { src.start(); } catch { /* ignore */ }
      }
      timer = setInterval(() => { tick(); }, 350);
      tick();
      return { ok: true, status: 'started' };
    },

    stopWatch() {
      watching = false;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      for (const src of sources) {
        try { src.stop(); } catch { /* ignore */ }
      }
      lastFingerprint = '';
      return { ok: true, status: 'stopped' };
    },

    isWatching() {
      return watching;
    },
  };
}
