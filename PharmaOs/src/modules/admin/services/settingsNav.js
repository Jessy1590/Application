/** Sous-onglets Administration → Paramètres (liés aux features dashboard module). */
export const SETTINGS_TABS = Object.freeze([
  /** Identité officielle partagée — visible si accès Paramètres. */
  { id: 'general', label: 'Général', feature: 'parametres' },
  { id: 'location', label: 'Location', feature: 'location' },
  { id: 'preparations', label: 'Préparations', feature: 'magistral' },
  { id: 'perimes', label: 'Périmés', feature: 'perimes' },
  { id: 'cash', label: 'Caisse', feature: 'cash' },
  { id: 'mails', label: 'Templates mail', feature: 'parametres' },
]);

/** Alias legacy / navigation → id de sous-onglet. */
export function resolveSettingsTab(raw) {
  const v = String(raw || '').toLowerCase();
  if (!v) return null;
  if (v === 'general' || v === 'generale' || v === 'pharmacy' || v === 'pharmacie') return 'general';
  if (v === 'location' || v === 'location_parametres') return 'location';
  if (v === 'preparations' || v === 'magistral' || v === 'magistral_parametres' || v === 'prepa') {
    return 'preparations';
  }
  if (v === 'perimes' || v === 'perimes_emplacements') return 'perimes';
  /** Ancien panneau livreurs stupéfiants → annuaire (géré côté SettingsManager). */
  if (v === 'stupefiants' || v === 'stupefiant' || v === 'stup' || v === 'livreurs') {
    return 'directory_redirect';
  }
  if (v === 'cash' || v === 'caisse') return 'cash';
  if (v === 'mails' || v === 'mail' || v === 'templates_mail' || v === 'mail_templates') return 'mails';
  if (SETTINGS_TABS.some((t) => t.id === v)) return v;
  return null;
}
