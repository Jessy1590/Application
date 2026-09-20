import { supabase } from '../../../shared/supabaseClient.js';
import { logEvent } from '../../../shared/logService.js';

const SETTINGS_KEY = 'pharmacy';

export const EMPTY_PHARMACY = Object.freeze({
  name: '',
  address: '',
  email: '',
  phone: '',
  interlocuteur: '',
});

let _cache = null;
let _cacheAt = 0;
const CACHE_MS = 30_000;

function normalize(raw) {
  const v = raw && typeof raw === 'object' ? raw : {};
  return {
    name: String(v.name ?? v.pharmacy_name ?? '').trim(),
    address: String(v.address ?? v.pharmacy_address ?? '').trim(),
    email: String(v.email ?? v.pharmacy_email ?? '').trim(),
    phone: String(v.phone ?? v.pharmacy_phone ?? '').trim(),
    interlocuteur: String(v.interlocuteur ?? v.pharmacy_interlocuteur ?? '').trim(),
  };
}

export function invalidatePharmacyCache() {
  _cache = null;
  _cacheAt = 0;
}

/** Charge les infos pharmacie partagées (cache court). */
export async function fetchPharmacySettings({ force = false } = {}) {
  if (!force && _cache && Date.now() - _cacheAt < CACHE_MS) return _cache;
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  _cache = normalize(data?.value);
  _cacheAt = Date.now();
  return _cache;
}

/**
 * Pour l’édition UI : si vide, seed depuis magistral_settings (migration douce).
 */
export async function getPharmacySettingsForEdit() {
  const current = await fetchPharmacySettings({ force: true });
  const hasAny = Object.values(current).some((v) => v);
  if (hasAny) return current;

  const { data } = await supabase
    .from('magistral_settings')
    .select('pharmacy_name, pharmacy_address, pharmacy_email, pharmacy_interlocuteur')
    .limit(1)
    .maybeSingle();
  if (!data) return { ...EMPTY_PHARMACY };
  return normalize({
    name: data.pharmacy_name,
    address: data.pharmacy_address,
    email: data.pharmacy_email,
    interlocuteur: data.pharmacy_interlocuteur,
  });
}

export async function savePharmacySettings(input) {
  const value = normalize(input);
  const { error } = await supabase.from('app_settings').upsert({
    key: SETTINGS_KEY,
    value,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  invalidatePharmacyCache();
  _cache = value;
  _cacheAt = Date.now();
  logEvent({
    category: 'settings',
    action: 'save_pharmacy',
    entity: 'app_settings',
    entityId: SETTINGS_KEY,
    message: 'Paramètres pharmacie (général) enregistrés',
    details: {
      has_name: !!value.name,
      has_email: !!value.email,
      has_phone: !!value.phone,
    },
    flush: true,
  });
  return value;
}

/** Champs au format des templates mail / settings magistrales. */
export function pharmacyToMailFields(pharmacy) {
  const p = normalize(pharmacy);
  return {
    pharmacy_name: p.name,
    pharmacy_address: p.address,
    pharmacy_email: p.email,
    pharmacy_phone: p.phone,
    pharmacy_interlocuteur: p.interlocuteur,
  };
}

/**
 * Fusionne la pharmacie globale sur un objet settings module (priorité = global).
 * Les colonnes legacy module restent en fallback.
 */
export function mergePharmacyIntoSettings(settings, pharmacy) {
  const mail = pharmacyToMailFields(pharmacy);
  return {
    ...(settings || {}),
    pharmacy_name: mail.pharmacy_name || settings?.pharmacy_name || '',
    pharmacy_address: mail.pharmacy_address || settings?.pharmacy_address || '',
    pharmacy_email: mail.pharmacy_email || settings?.pharmacy_email || '',
    pharmacy_phone: mail.pharmacy_phone || settings?.pharmacy_phone || '',
    pharmacy_interlocuteur: mail.pharmacy_interlocuteur || settings?.pharmacy_interlocuteur || '',
  };
}

export async function loadSettingsWithPharmacy(settings) {
  const pharmacy = await fetchPharmacySettings();
  return mergePharmacyIntoSettings(settings, pharmacy);
}
