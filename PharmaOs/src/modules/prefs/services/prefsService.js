import { supabase } from '../../../shared/supabaseClient.js';

export const THEME_OPTIONS = Object.freeze([
  { id: 'clair', label: 'Clair' },
  { id: 'sombre', label: 'Sombre' },
  { id: 'colore', label: 'Coloré' },
  { id: 'bleu_dore', label: 'Bleu Doré' },
]);

export const PLACEMENT_OPTIONS = Object.freeze([
  { id: 'haut', label: 'Haut' },
  { id: 'bas', label: 'Bas' },
  { id: 'gauche', label: 'Gauche' },
  { id: 'droite', label: 'Droite' },
  { id: 'bas_gauche', label: 'Bas gauche' },
  { id: 'bas_droite', label: 'Bas droite' },
]);

export const DENSITY_OPTIONS = Object.freeze([
  { id: 'compact', label: 'Compacte' },
  { id: 'normal', label: 'Normale' },
  { id: 'detaillee', label: 'Détaillée' },
  { id: 'empilee', label: 'Empilée' },
]);

export const FONT_SIZE_OPTIONS = Object.freeze([
  { id: 'sm', label: 'Petite' },
  { id: 'md', label: 'Moyenne' },
  { id: 'lg', label: 'Grande' },
]);

export const DEFAULT_PREFERENCES = Object.freeze({
  theme: 'clair',
  taskbar_placement: 'haut',
  taskbar_density: 'normal',
  font_size_taskbar: 'md',
  font_size_dashboard: 'md',
});

const ALLOWED_THEME = new Set(THEME_OPTIONS.map((o) => o.id));
const ALLOWED_PLACEMENT = new Set(PLACEMENT_OPTIONS.map((o) => o.id));
const ALLOWED_DENSITY = new Set(DENSITY_OPTIONS.map((o) => o.id));
const ALLOWED_FONT = new Set(FONT_SIZE_OPTIONS.map((o) => o.id));

/** Legacy densités → nouvelles (migration SQL miroir). */
const LEGACY_DENSITY = Object.freeze({
  auto: 'normal',
  stack: 'empilee',
});

/** Legacy thèmes → canoniques (migration 047). */
const LEGACY_THEME = Object.freeze({
  contraste: 'clair',
  daltonien: 'bleu_dore',
});

function migrateDensity(density) {
  if (LEGACY_DENSITY[density]) return LEGACY_DENSITY[density];
  return density;
}

function migrateTheme(theme) {
  if (LEGACY_THEME[theme]) return LEGACY_THEME[theme];
  return theme;
}

function sanitize(row) {
  const theme = migrateTheme(row?.theme);
  const density = migrateDensity(row?.taskbar_density);
  return {
    theme: ALLOWED_THEME.has(theme) ? theme : DEFAULT_PREFERENCES.theme,
    taskbar_placement: ALLOWED_PLACEMENT.has(row?.taskbar_placement)
      ? row.taskbar_placement
      : DEFAULT_PREFERENCES.taskbar_placement,
    taskbar_density: ALLOWED_DENSITY.has(density)
      ? density
      : DEFAULT_PREFERENCES.taskbar_density,
    font_size_taskbar: ALLOWED_FONT.has(row?.font_size_taskbar)
      ? row.font_size_taskbar
      : DEFAULT_PREFERENCES.font_size_taskbar,
    font_size_dashboard: ALLOWED_FONT.has(row?.font_size_dashboard)
      ? row.font_size_dashboard
      : DEFAULT_PREFERENCES.font_size_dashboard,
  };
}

const PREFS_SELECT =
  'theme, taskbar_placement, taskbar_density, font_size_taskbar, font_size_dashboard';

/** Applique le thème sur le document (toutes les entrées HTML). */
export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const value = ALLOWED_THEME.has(migrateTheme(theme))
    ? migrateTheme(theme)
    : DEFAULT_PREFERENCES.theme;
  document.documentElement.setAttribute('data-theme', value);
}

/** Applique les tailles de police taskbar / dashboard. */
export function applyFontSizes({
  font_size_taskbar: tb = DEFAULT_PREFERENCES.font_size_taskbar,
  font_size_dashboard: dash = DEFAULT_PREFERENCES.font_size_dashboard,
} = {}) {
  if (typeof document === 'undefined') return;
  const tbVal = ALLOWED_FONT.has(tb) ? tb : DEFAULT_PREFERENCES.font_size_taskbar;
  const dashVal = ALLOWED_FONT.has(dash) ? dash : DEFAULT_PREFERENCES.font_size_dashboard;
  document.documentElement.setAttribute('data-font-tb', tbVal);
  document.documentElement.setAttribute('data-font-dash', dashVal);
}

/**
 * Charge les préférences ; retourne les défauts si aucune ligne.
 * @param {string} userId
 */
export async function fetchPreferences(userId) {
  if (!userId) return { ...DEFAULT_PREFERENCES };
  const { data, error } = await supabase
    .from('user_preferences')
    .select(PREFS_SELECT)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[PharmaOS] prefs fetch', error.message);
    return { ...DEFAULT_PREFERENCES };
  }
  if (!data) return { ...DEFAULT_PREFERENCES };
  return sanitize(data);
}

/**
 * Upsert partiel des préférences.
 * @param {string} userId
 * @param {Partial<typeof DEFAULT_PREFERENCES>} patch
 */
export async function upsertPreferences(userId, patch = {}) {
  if (!userId) throw new Error('Utilisateur requis');
  const current = await fetchPreferences(userId);
  const next = sanitize({ ...current, ...patch });
  const { data, error } = await supabase
    .from('user_preferences')
    .upsert(
      {
        user_id: userId,
        ...next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select(PREFS_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return sanitize(data);
}
