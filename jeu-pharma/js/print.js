/**
 * Impression same-document uniquement (iframe caché — pas de window.open).
 */
(function (global) {
  /**
   * @param {string} htmlBody contenu HTML (sans document wrapper)
   * @param {{ title?: string, stylesheets?: string[] }} [opts]
   */
  function printHtml(htmlBody, opts) {
    const title = (opts && opts.title) || document.title || 'Jeu Pharma';
    const sheets = (opts && opts.stylesheets) || [
      '../css/app.css',
      '../css/player.css',
      '../css/print.css',
    ];
    let iframe = document.getElementById('jpPrintFrame');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'jpPrintFrame';
      iframe.className = 'jp-print-frame no-print';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.setAttribute('tabindex', '-1');
      document.body.appendChild(iframe);
    }
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    const links = sheets.map((href) =>
      '<link rel="stylesheet" href="' + href + '">'
    ).join('');
    doc.open();
    doc.write(
      '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">'
      + '<title>' + String(title).replace(/</g, '') + '</title>'
      + links
      + '<style>body{margin:1.25rem;background:#fff;color:#14201C;font-family:"DM Sans",sans-serif;}'
      + '.jp-print-header{display:block!important;margin-bottom:1rem;padding-bottom:.75rem;border-bottom:1px solid #ccc;}'
      + '</style></head><body>'
      + '<header class="jp-print-header"><h1>' + String(title).replace(/</g, '&lt;') + '</h1>'
      + '<p class="jp-print-meta">' + new Date().toLocaleString('fr-FR') + '</p></header>'
      + (htmlBody || '')
      + '</body></html>'
    );
    doc.close();
    const win = iframe.contentWindow;
    const go = () => {
      try { win.focus(); win.print(); } catch (_) { /* silencieux */ }
    };
    // Laisser le temps aux CSS / images
    setTimeout(go, 350);
  }

  /** Imprime le HTML d’un élément du document courant. */
  function printElement(el, opts) {
    if (!el) return;
    printHtml(el.innerHTML, opts);
  }

  global.JpPrint = { printHtml, printElement };
})(window);
