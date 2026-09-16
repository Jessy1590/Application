import { clipboard } from 'electron';
import { extractCips, normalizeText } from './normalize.js';

/**
 * Source secondaire : détecte les CIP 7/13 collés (utile LGO / WinPharma sans API).
 */
export class ClipboardSource {
  constructor({ pollMs = 500 } = {}) {
    this.id = 'clipboard';
    this.pollMs = pollMs;
    this._lastText = null;
    this._lastEmitAt = 0;
  }

  start() {
    this._lastText = null;
  }

  stop() {
    this._lastText = null;
  }

  async poll() {
    let text = '';
    try {
      text = clipboard.readText() || '';
    } catch {
      return null;
    }

    const trimmed = text.trim();
    if (!trimmed || trimmed === this._lastText) return null;

    const cips = extractCips(trimmed);
    // Émettre seulement si CIP détecté ou texte court (évite spam presse-papiers long)
    if (cips.length === 0 && trimmed.length > 80) {
      this._lastText = trimmed;
      return null;
    }
    if (cips.length === 0 && trimmed.length < 3) {
      this._lastText = trimmed;
      return null;
    }

    this._lastText = trimmed;
    this._lastEmitAt = Date.now();

    return {
      text: cips[0] || trimmed.slice(0, 200),
      rawText: trimmed.slice(0, 500),
      processName: null,
      source: 'clipboard',
      normalized: normalizeText(cips[0] || trimmed),
      cips,
    };
  }
}
