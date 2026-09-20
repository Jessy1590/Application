import { supabase } from '../../../shared/supabaseClient.js';
import { logEvent } from '../../../shared/logService.js';
import {
  DEFAULT_MAIL_TEMPLATES,
  asTemplateObj,
  getDefaultTemplate,
  renderPlaceholders,
} from './mailTemplatesCatalog.js';

const SETTINGS_KEY = 'mail_templates';

let _cache = null;
let _cacheAt = 0;
const CACHE_MS = 30_000;

/** Charge tous les templates app (cache court). */
export async function fetchMailTemplates({ force = false } = {}) {
  if (!force && _cache && Date.now() - _cacheAt < CACHE_MS) return _cache;
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const value = data?.value && typeof data.value === 'object' ? data.value : {};
  _cache = value;
  _cacheAt = Date.now();
  return value;
}

export function invalidateMailTemplatesCache() {
  _cache = null;
  _cacheAt = 0;
}

/** Fusionne défauts + sauvegarde pour l’UI. */
export async function getMailTemplatesForEdit() {
  const stored = await fetchMailTemplates({ force: true });
  const out = {};
  for (const [mod, defs] of Object.entries(DEFAULT_MAIL_TEMPLATES)) {
    out[mod] = {};
    for (const key of Object.keys(defs)) {
      out[mod][key] = asTemplateObj(stored?.[mod]?.[key], defs[key]);
    }
    // conserver d’éventuelles clés custom stockées
    if (stored?.[mod] && typeof stored[mod] === 'object') {
      for (const [k, v] of Object.entries(stored[mod])) {
        if (!out[mod][k]) out[mod][k] = asTemplateObj(v, { subject: '', body: '' });
      }
    }
  }
  return out;
}

export async function saveMailTemplates(tree) {
  const { error } = await supabase.from('app_settings').upsert({
    key: SETTINGS_KEY,
    value: tree || {},
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  invalidateMailTemplatesCache();
  const modules = Object.keys(tree || {});
  logEvent({
    category: 'settings',
    action: 'save_mail_templates',
    entity: 'app_settings',
    entityId: SETTINGS_KEY,
    message: 'Templates mail enregistrés',
    details: {
      modules,
      keys_count: modules.reduce((n, m) => n + Object.keys(tree?.[m] || {}).length, 0),
    },
    flush: true,
  });
  return tree;
}

/**
 * Résout un template (app_settings → legacy magistral_settings.mail_templates → défaut).
 * @param {string} moduleId
 * @param {string} key
 * @param {object} [legacyModuleSettings] — ex. magistral_settings row (compat)
 */
export async function resolveMailTemplate(moduleId, key, legacyModuleSettings = null) {
  const stored = await fetchMailTemplates();
  const def = DEFAULT_MAIL_TEMPLATES[moduleId]?.[key] || { subject: '', body: '' };
  let raw = stored?.[moduleId]?.[key];
  if (raw == null && moduleId === 'magistral' && legacyModuleSettings?.mail_templates) {
    raw = legacyModuleSettings.mail_templates[key];
  }
  return asTemplateObj(raw, def);
}

export async function renderAppMail(moduleId, key, ctx = {}, legacyModuleSettings = null) {
  const tpl = await resolveMailTemplate(moduleId, key, legacyModuleSettings);
  return {
    subject: renderPlaceholders(tpl.subject, ctx),
    body: renderPlaceholders(tpl.body, ctx),
    tpl,
  };
}

export { getDefaultTemplate, renderPlaceholders };
