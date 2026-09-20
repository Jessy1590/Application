/** Sous-onglets Administration → Paramètres (liés aux features dashboard module). */
export const SETTINGS_TABS = Object.freeze([
  { id: 'location', label: 'Location', feature: 'location' },
  { id: 'preparations', label: 'Préparations', feature: 'magistral' },
  { id: 'perimes', label: 'Périmés', feature: 'perimes' },
  { id: 'cash', label: 'Caisse', feature: 'cash' },
]);

/** Alias legacy / navigation → id de sous-onglet. */
export function resolveSettingsTab(raw) {
  const v = String(raw || '').toLowerCase();
  if (!v) return null;
  if (v === 'location' || v === 'location_parametres') return 'location';
  if (v === 'preparations' || v === 'magistral' || v === 'magistral_parametres' || v === 'prepa') {
    return 'preparations';
  }
  if (v === 'perimes' || v === 'perimes_emplacements') return 'perimes';
  if (v === 'cash' || v === 'caisse') return 'cash';
  if (SETTINGS_TABS.some((t) => t.id === v)) return v;
  return null;
}
