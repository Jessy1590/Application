import { supabase } from './supabaseClient.js';

const SENSITIVE = /password|passwd|token|secret|authorization|apikey|api_key|anon/i;
const MAX_DETAIL_CHARS = 8000;
const FLUSH_MS = 350;

let actor = {
  userId: null,
  userName: null,
  userRole: null,
  surface: 'system',
};

let queue = [];
let timer = null;
let flushing = false;

export function setLogActor(partial) {
  actor = { ...actor, ...partial };
}

export function setLogSurface(surface) {
  actor = { ...actor, surface: surface || 'system' };
}

function sanitizeDetails(details) {
  if (details == null) return {};
  let value = details;
  if (typeof details !== 'object') {
    value = { value: String(details) };
  }
  const walk = (input) => {
    if (input == null) return input;
    if (Array.isArray(input)) return input.slice(0, 50).map(walk);
    if (typeof input === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(input)) {
        if (SENSITIVE.test(k)) {
          out[k] = '[redacted]';
        } else {
          out[k] = walk(v);
        }
      }
      return out;
    }
    if (typeof input === 'string' && input.length > 2000) return `${input.slice(0, 2000)}…`;
    return input;
  };
  const cleaned = walk(value);
  const text = JSON.stringify(cleaned);
  if (text && text.length > MAX_DETAIL_CHARS) {
    return { truncated: true, preview: text.slice(0, 500) };
  }
  return cleaned || {};
}

async function flushNow(rows) {
  const payload = (rows || []).filter((r) => r && r.action);
  if (!payload.length) return;
  try {
    const { error } = await supabase.from('app_logs').insert(payload);
    if (error) console.warn('[PharmaOS] log insert', error.message);
  } catch (err) {
    console.warn('[PharmaOS] log insert failed', err?.message || err);
  }
}

function scheduleFlush() {
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    if (flushing || queue.length === 0) return;
    flushing = true;
    const batch = queue.splice(0, 80);
    await flushNow(batch);
    flushing = false;
    if (queue.length) scheduleFlush();
  }, FLUSH_MS);
}

/**
 * Journal applicatif (UI, auth, fenêtres, erreurs).
 * Les mutations SQL sont journalisées côté Postgres (trigger app_logs).
 * Pas d’écriture hors session (RLS).
 */
export function logEvent({
  category = 'ui',
  action,
  entity = null,
  entityId = null,
  message = null,
  details = null,
  level = 'info',
  surface = null,
  flush = false,
} = {}) {
  if (!action) return;
  if (!actor.userId) return;

  const row = {
    user_id: actor.userId,
    user_name: actor.userName || null,
    user_role: actor.userRole || null,
    surface: surface || actor.surface || 'system',
    category,
    action: String(action).slice(0, 80),
    entity: entity ? String(entity).slice(0, 120) : null,
    entity_id: entityId != null ? String(entityId).slice(0, 80) : null,
    level: ['debug', 'info', 'warn', 'error'].includes(level) ? level : 'info',
    message: message ? String(message).slice(0, 2000) : null,
    details: sanitizeDetails(details),
    source: 'client',
  };

  if (flush || level === 'error') {
    return flushNow([row]);
  }
  queue.push(row);
  scheduleFlush();
  return undefined;
}

export function logError(action, error, extra = {}) {
  logEvent({
    category: 'error',
    action,
    level: 'error',
    message: error?.message || String(error || 'Erreur'),
    details: { ...extra, stack: error?.stack ? String(error.stack).slice(0, 1500) : null },
    flush: true,
  });
}

export function bindGlobalErrorLogging() {
  if (typeof window === 'undefined') return () => {};
  const onError = (event) => {
    logEvent({
      category: 'error',
      action: 'window_error',
      level: 'error',
      message: event?.message || 'window_error',
      details: {
        filename: event?.filename,
        lineno: event?.lineno,
        colno: event?.colno,
      },
      flush: true,
    });
  };
  const onReject = (event) => {
    const reason = event?.reason;
    logEvent({
      category: 'error',
      action: 'unhandled_rejection',
      level: 'error',
      message: reason?.message || String(reason || 'unhandledrejection'),
      details: { stack: reason?.stack ? String(reason.stack).slice(0, 1500) : null },
      flush: true,
    });
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onReject);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onReject);
  };
}
