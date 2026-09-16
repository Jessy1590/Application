/**
 * Imprime un document HTML sans dépendre des pop-ups bloqués.
 * Évite `noopener` (sinon window.open renvoie null et on croit à un blocage).
 * Fallback : iframe invisible dans la fenêtre courante.
 */
export function printHtmlDocument(html) {
  // Ne pas passer noopener : le handle devient null et l'impression échoue silencieusement.
  let w = null;
  try {
    w = window.open('', '_blank', 'width=1100,height=800');
  } catch {
    w = null;
  }

  if (w && !w.closed) {
    try {
      w.document.open();
      w.document.write(html);
      w.document.close();
      return true;
    } catch {
      try { w.close(); } catch { /* ignore */ }
    }
  }

  return printHtmlViaIframe(html);
}

/** Ouvre une fenêtre vide synchrone (geste utilisateur) pour y écrire après un await. */
export function openPrintWindow() {
  try {
    const w = window.open('', '_blank', 'width=1100,height=800');
    if (w && !w.closed) {
      w.document.open();
      w.document.write('<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><title>Impression…</title></head><body style="font-family:system-ui;padding:24px;color:#64748b">Préparation du document…</body></html>');
      w.document.close();
      return w;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function writePrintWindow(w, html) {
  if (w && !w.closed) {
    try {
      w.document.open();
      w.document.write(html);
      w.document.close();
      return true;
    } catch {
      try { w.close(); } catch { /* ignore */ }
    }
  }
  return printHtmlViaIframe(html);
}

function printHtmlViaIframe(html) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return false;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const win = iframe.contentWindow;
  const cleanup = () => {
    try { iframe.remove(); } catch { /* ignore */ }
  };

  const doPrint = () => {
    try {
      win.focus();
      win.print();
    } finally {
      setTimeout(cleanup, 1500);
    }
  };

  // Si le HTML inclut déjà window.print au onload, laisser faire ; sinon imprimer après paint.
  if (!/<script[^>]*>[\s\S]*window\.print/i.test(html)) {
    if (doc.readyState === 'complete') doPrint();
    else iframe.onload = doPrint;
  } else {
    setTimeout(cleanup, 60_000);
  }

  return true;
}
