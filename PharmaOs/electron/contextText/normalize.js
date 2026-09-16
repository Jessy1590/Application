/**
 * Normalisation texte pour match conseil (minuscules, sans accents, espaces).
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** CIP 7 ou 13 dans un texte libre. */
export function extractCips(text) {
  const raw = String(text || '');
  const found = raw.match(/\b\d{13}\b|\b\d{7}\b/g);
  return found ? [...new Set(found)] : [];
}
