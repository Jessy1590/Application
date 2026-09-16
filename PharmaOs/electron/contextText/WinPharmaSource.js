/**
 * Stub V2 — connecteur WinPharma (DLL / fichier / API).
 *
 * Contrat `ContextTextSource` :
 * - `id` : identifiant source
 * - `start()` / `stop()` : cycle de vie
 * - `poll()` : Promise<{ text, processName?, meta? } | null>
 *
 * Brancher ici sans refonte du bus `context:text`.
 */
export class WinPharmaSource {
  constructor() {
    this.id = 'winpharma';
  }

  start() {
    // no-op — en attente d’API WinPharma
  }

  stop() {
    // no-op
  }

  async poll() {
    return null;
  }
}
