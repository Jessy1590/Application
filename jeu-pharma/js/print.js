/**
 * Impression same-document via iframe caché — pas de window.open.
 */
(function (global) {
  /**
   * @param {string} htmlDocument — document HTML complet
   */
  function printHtml(htmlDocument) {
    const prev = document.getElementById('jp-print-frame');
    if (prev) prev.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'jp-print-frame';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('title', 'Impression');
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
    document.body.appendChild(iframe);

    const win = iframe.contentWindow;
    const doc = iframe.contentDocument || win?.document;
    if (!doc || !win) {
      iframe.remove();
      throw new Error('Impression impossible');
    }

    doc.open();
    doc.write(htmlDocument);
    doc.close();

    const cleanup = () => {
      try { iframe.remove(); } catch (_) { /* ignore */ }
    };

    const trigger = () => {
      try {
        win.focus();
        win.print();
      } finally {
        setTimeout(cleanup, 2000);
      }
    };

    if (doc.fonts?.ready) {
      doc.fonts.ready.then(trigger).catch(trigger);
    } else {
      setTimeout(trigger, 150);
    }
  }

  /**
   * Construit un HTML imprimable pour un quiz ouvert / snapshot.
   * @param {{
   *   code: string,
   *   titre: string,
   *   nom?: string,
   *   date?: string,
   *   questions: Array<{ ordre?: number, enonce: string, propositions?: Array<{valeur:string}> }>
   * }} payload
   */
  function quizPrintDocument(payload) {
    const esc = global.JpUi?.escapeHtml || ((s) => String(s ?? ''));
    const date = payload.date || new Date().toLocaleString('fr-FR');
    const nom = payload.nom || '';
    const qs = (payload.questions || []).map((q, i) => {
      const n = q.ordre != null ? q.ordre : i + 1;
      const props = (q.propositions || [])
        .map((p) => `<li>${esc(p.valeur || p)}</li>`)
        .join('');
      return `
        <section class="q">
          <h2>${esc(n)}. ${esc(q.enonce || '')}</h2>
          <ol type="A">${props}</ol>
          <p class="blank">Réponse : _______________</p>
        </section>`;
    }).join('');

    return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>${esc(payload.code)} — ${esc(payload.titre)}</title>
<style>
  body{font-family:Georgia,serif;color:#000;margin:1.5cm;font-size:11pt;line-height:1.4}
  h1{font-size:16pt;margin:0 0 .25rem}
  .meta{font-size:10pt;color:#333;margin-bottom:1rem;padding-bottom:.75rem;border-bottom:1px solid #ccc}
  .q{margin:1rem 0;page-break-inside:avoid}
  .q h2{font-size:12pt;font-weight:600;margin:0 0 .4rem}
  ol{margin:.25rem 0 .5rem 1.25rem}
  .blank{margin:.5rem 0 0;font-size:10pt}
</style></head><body>
  <h1>${esc(payload.titre || 'Quiz')}</h1>
  <div class="meta">
    <div>Code : <strong>${esc(payload.code || '')}</strong></div>
    ${nom ? `<div>Nom : ${esc(nom)}</div>` : ''}
    <div>Date : ${esc(date)}</div>
  </div>
  ${qs}
</body></html>`;
  }

  global.JpPrint = {
    printHtml,
    quizPrintDocument,
  };
})(window);
