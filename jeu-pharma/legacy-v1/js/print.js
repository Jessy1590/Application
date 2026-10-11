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

  /**
   * HTML imprimable pour un tableau à trous (cellules masquées = blanc à remplir).
   * @param {{
   *   code: string,
   *   titre: string,
   *   nom?: string,
   *   date?: string,
   *   colonnes: string[],
   *   lignes: Array<{
   *     label?: string,
   *     cells?: Array<{ champ_code: string, trou?: boolean, valeur?: string|null, valeurs?: string[]|null }>
   *   }>,
   *   champLibelle?: (code: string) => string
   * }} payload
   */
  function trousPrintDocument(payload) {
    const esc = global.JpUi?.escapeHtml || ((s) => String(s ?? ''));
    const date = payload.date || new Date().toLocaleString('fr-FR');
    const nom = payload.nom || '';
    const libelleFn =
      payload.champLibelle ||
      global.JpTrous?.champLibelle ||
      ((c) => c);
    const displayFn =
      global.JpTrous?.cellDisplay ||
      ((cell) => (cell && (Array.isArray(cell.valeurs) && cell.valeurs.length
        ? cell.valeurs.join('; ')
        : (cell.valeur || ''))) || '');

    const cols = payload.colonnes || [];
    const showMedCol = payload.afficheColonneMedicament != null
      ? !!payload.afficheColonneMedicament
      : (global.JpTrous?.afficheColonneMedicament
        ? global.JpTrous.afficheColonneMedicament({
          identite_visible: payload.identite_visible,
        })
        : true);
    const headMed = showMedCol ? '<th>Médicament</th>' : '';
    const head = cols
      .map((c) => `<th>${esc(libelleFn(c))}</th>`)
      .join('');

    const body = (payload.lignes || [])
      .map((ligne) => {
        const cells = (ligne.cells || [])
          .map((cell) => {
            if (cell.trou) {
              return '<td class="blank">&nbsp;</td>';
            }
            const val = displayFn(cell);
            return `<td>${esc(val || '—')}</td>`;
          })
          .join('');
        const med = showMedCol ? `<td class="med">${esc(ligne.label || '')}</td>` : '';
        return `<tr>${med}${cells}</tr>`;
      })
      .join('');

    return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>${esc(payload.code)} — ${esc(payload.titre)}</title>
<style>
  body{font-family:Georgia,serif;color:#000;margin:1.2cm;font-size:10pt;line-height:1.35}
  h1{font-size:15pt;margin:0 0 .25rem}
  .meta{font-size:9.5pt;color:#333;margin-bottom:1rem;padding-bottom:.6rem;border-bottom:1px solid #ccc}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  th,td{border:1px solid #333;padding:.35rem .4rem;vertical-align:top;word-wrap:break-word}
  th{background:#eee;font-size:9pt;text-align:left}
  td.med{font-weight:600;width:12%}
  td.blank{min-height:1.4em;background:#fafafa}
  @media print{body{margin:1cm}}
</style></head><body>
  <h1>${esc(payload.titre || 'Tableau à trous')}</h1>
  <div class="meta">
    <div>Code : <strong>${esc(payload.code || '')}</strong></div>
    ${nom ? `<div>Nom : ${esc(nom)}</div>` : ''}
    <div>Date : ${esc(date)}</div>
  </div>
  <table>
    <thead><tr>${headMed}${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</body></html>`;
  }

  /**
   * HTML imprimable pour le catalogue (colonnes visibles + lignes filtrées).
   * @param {{
   *   titre?: string,
   *   date?: string,
   *   colonnes: Array<{ code?: string, libelle: string }|string>,
   *   lignes: Array<string[]>
   * }} payload
   */
  function cataloguePrintDocument(payload) {
    const esc = global.JpUi?.escapeHtml || ((s) => String(s ?? ''));
    const date = payload.date || new Date().toLocaleString('fr-FR');
    const titre = payload.titre || 'Catalogue';
    const cols = (payload.colonnes || []).map((c) =>
      typeof c === 'string' ? { libelle: c } : c
    );
    const head = cols.map((c) => `<th>${esc(c.libelle || '')}</th>`).join('');
    const body = (payload.lignes || [])
      .map((cells) => {
        const tds = (cells || [])
          .map((v) => `<td>${esc(v == null || v === '' ? '—' : v)}</td>`)
          .join('');
        return `<tr>${tds}</tr>`;
      })
      .join('');

    return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>${esc(titre)}</title>
<style>
  body{font-family:Georgia,serif;color:#000;margin:1.2cm;font-size:9.5pt;line-height:1.35}
  h1{font-size:15pt;margin:0 0 .25rem}
  .meta{font-size:9pt;color:#333;margin-bottom:.85rem;padding-bottom:.5rem;border-bottom:1px solid #ccc}
  table{width:100%;border-collapse:collapse;table-layout:auto}
  th,td{border:1px solid #333;padding:.3rem .35rem;vertical-align:top;word-wrap:break-word}
  th{background:#eee;font-size:8.5pt;text-align:left}
  @media print{body{margin:.8cm} thead{display:table-header-group}}
</style></head><body>
  <h1>${esc(titre)}</h1>
  <div class="meta">
    <div>Date : ${esc(date)}</div>
    <div>${esc(String((payload.lignes || []).length))} fiche(s) — colonnes visibles uniquement</div>
  </div>
  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</body></html>`;
  }

  global.JpPrint = {
    printHtml,
    quizPrintDocument,
    trousPrintDocument,
    cataloguePrintDocument,
  };
})(window);
