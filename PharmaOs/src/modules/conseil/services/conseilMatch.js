/**
 * Moteur de match conseils (cache local côté taskbar).
 * Priorité : CIP exact > sous-chaîne libellé ; spécificité présentation > spécialité > substance.
 */

const SPECIFICITY = { presentation: 3, specialite: 2, substance: 1 };
const MIN_LABEL_LEN = 4;

export function normalizeForMatch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCips(text) {
  const found = String(text || '').match(/\b\d{13}\b|\b\d{7}\b/g);
  return found ? [...new Set(found)] : [];
}

/**
 * @param {string} text
 * @param {object[]} conseils — conseils actifs (cache)
 * @param {{ dismissedIds?: Set<string>|string[], cips?: string[] }} [opts]
 * @returns {object|null}
 */
export function matchConseil(text, conseils, opts = {}) {
  const list = Array.isArray(conseils) ? conseils : [];
  if (!list.length) return null;

  const dismissed = opts.dismissedIds instanceof Set
    ? opts.dismissedIds
    : new Set(opts.dismissedIds || []);

  const raw = String(text || '');
  const normalized = normalizeForMatch(raw);
  const cips = [...new Set([...(opts.cips || []), ...extractCips(raw)])];

  let best = null;
  let bestScore = -1;

  for (const c of list) {
    if (!c?.is_active) continue;
    if (dismissed.has(c.id)) continue;

    const specificity = SPECIFICITY[c.target_type] || 0;
    let score = -1;

    if (c.cip13 && cips.some((cip) => cip === c.cip13 || cip === c.cip13.slice(-7))) {
      score = 1000 + specificity;
    } else if (c.cip13 && (normalized.includes(c.cip13) || normalized.includes(String(c.cip13).slice(-7)))) {
      score = 900 + specificity;
    } else {
      const label = normalizeForMatch(c.label_snapshot);
      if (label.length >= MIN_LABEL_LEN && normalized.includes(label)) {
        score = 100 + specificity * 10 + Math.min(label.length, 40);
      } else if (c.code_substance && normalized.includes(normalizeForMatch(c.code_substance))) {
        score = 50 + specificity;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  return best;
}
