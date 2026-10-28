/**
 * Client IA partagé (Jeu Pharma) — appelle une Edge Function Supabase qui détient GEMINI_API_KEY.
 * Clé anon + session utilisateur uniquement (jamais de clé Gemini ni service_role côté navigateur).
 */
(function (global) {
  const FN_BLOCS = 'jeupharma-ia-blocs';
  const FN_MATRICE = 'jeupharma-ia-matrice';
  const FN_ENTITES = 'jeupharma-ia-entites';
  const PDF_MAX_BYTES = 10 * 1024 * 1024;
  const TEXT_MAX_CHARS = 80000;
  const RCP_MAX_CHARS = 100000;
  /** Garde-fou aligné sur l’Edge. Le délai HTTP hébergé reste 150 s : lot côté UI. */
  const ENTITES_MAX_ITEMS = 10000;
  const ENTITES_INSTRUCTION_MAX = 4000;

  /** Fichier -> base64 (sans préfixe data:). */
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('Lecture du fichier impossible'));
      fr.onload = () => {
        const s = String(fr.result || '');
        resolve(s.slice(s.indexOf(',') + 1));
      };
      fr.readAsDataURL(file);
    });
  }

  /** Message lisible depuis une erreur FunctionsHttpError / réseau. */
  async function errorMessage(err, fn) {
    const res = err && err.context;
    const status = res && typeof res.status === 'number' ? res.status : 0;
    let code = '';
    let serverError = '';
    let serverMessage = '';
    try {
      if (res && res.headers && typeof res.headers.get === 'function') {
        code = String(res.headers.get('sb-error-code') || '');
      }
      const readable = res && typeof res.clone === 'function' ? res.clone() : res;
      if (readable && typeof readable.json === 'function') {
        const body = await readable.json();
        if (body && body.error) serverError = String(body.error);
        else if (body && body.message) serverMessage = String(body.message);
      }
    } catch (_) { /* repli */ }
    const lotHint = fn === FN_ENTITES
      ? ' Sélectionnez un lot plus petit (par exemple les 300 premiers), puis relancez.'
      : '';
    const blob = serverError + ' ' + serverMessage;
    if (status === 504 || code === 'IDLE_TIMEOUT' || /idle timeout|timed out|gateway timeout/i.test(blob)) {
      return 'La fonction IA a dépassé le délai maximal (150 s).' + lotHint;
    }
    if (serverError) return serverError;
    const msg = (err && err.message) || '';
    if (/Failed to send a request|NetworkError|fetch/i.test(msg)) {
      return 'Fonction IA injoignable (déployée ? réseau ?).';
    }
    if (status >= 400 || /non-2xx status code/i.test(msg)) {
      return 'La fonction IA a renvoyé une erreur'
        + (status ? ' (statut ' + status + ')' : '')
        + '.' + lotHint;
    }
    return serverMessage || msg || 'Erreur IA';
  }

  /**
   * @param {string} fn nom de l’Edge Function
   * @param {object} body charge JSON
   * @returns {Promise<object>}
   */
  async function invoke(fn, body) {
    const client = global.JpApp.sbPortail();
    const { data, error } = await client.functions.invoke(fn, { body });
    if (error) throw new Error(await errorMessage(error, fn));
    if (data && data.error) throw new Error(String(data.error));
    return data;
  }

  global.JpIaGemini = {
    FN_BLOCS,
    FN_MATRICE,
    FN_ENTITES,
    PDF_MAX_BYTES,
    TEXT_MAX_CHARS,
    RCP_MAX_CHARS,
    ENTITES_MAX_ITEMS,
    ENTITES_INSTRUCTION_MAX,
    fileToBase64,
    invoke,
  };
})(window);
