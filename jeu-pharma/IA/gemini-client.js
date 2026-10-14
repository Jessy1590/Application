/**
 * Client IA partagé (Jeu Pharma) — appelle une Edge Function Supabase qui détient GEMINI_API_KEY.
 * Clé anon + session utilisateur uniquement (jamais de clé Gemini ni service_role côté navigateur).
 */
(function (global) {
  const FN_BLOCS = 'jeupharma-ia-blocs';
  const FN_MATRICE = 'jeupharma-ia-matrice';
  const PDF_MAX_BYTES = 10 * 1024 * 1024;
  const TEXT_MAX_CHARS = 80000;
  const RCP_MAX_CHARS = 100000;

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
  async function errorMessage(err) {
    try {
      const res = err && err.context;
      if (res && typeof res.json === 'function') {
        const body = await res.json();
        if (body && body.error) return String(body.error);
      }
    } catch (_) { /* repli */ }
    const msg = (err && err.message) || '';
    if (/Failed to send a request|NetworkError|fetch/i.test(msg)) {
      return 'Fonction IA injoignable (déployée ? réseau ?).';
    }
    return msg || 'Erreur IA';
  }

  /**
   * @param {string} fn nom de l’Edge Function
   * @param {object} body charge JSON
   * @returns {Promise<object>}
   */
  async function invoke(fn, body) {
    const client = global.JpApp.sbPortail();
    const { data, error } = await client.functions.invoke(fn, { body });
    if (error) throw new Error(await errorMessage(error));
    if (data && data.error) throw new Error(String(data.error));
    return data;
  }

  global.JpIaGemini = {
    FN_BLOCS,
    FN_MATRICE,
    PDF_MAX_BYTES,
    TEXT_MAX_CHARS,
    RCP_MAX_CHARS,
    fileToBase64,
    invoke,
  };
})(window);
