/**
 * Modales admin (aide + confirmations).
 */
(function (global) {
  let root = null;

  function ensureRoot() {
    if (root) return root;
    root = document.createElement('div');
    root.id = 'jp-modal-root';
    document.body.appendChild(root);
    return root;
  }

  function close() {
    if (root) root.innerHTML = '';
  }

  function open({ title, body, confirmLabel, onConfirm, cancelLabel }) {
    const host = ensureRoot();
    host.innerHTML = '';
    const backdrop = document.createElement('div');
    backdrop.className = 'jp-modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    const panel = document.createElement('div');
    panel.className = 'jp-modal';
    panel.innerHTML = '<h2></h2><div class="jp-modal-body"></div><div class="jp-modal-actions"></div>';
    panel.querySelector('h2').textContent = title || '';
    const bodyEl = panel.querySelector('.jp-modal-body');
    if (typeof body === 'string') bodyEl.innerHTML = '<p>' + (global.JpUi?.escapeHtml?.(body) || body) + '</p>';
    else if (body instanceof Node) bodyEl.appendChild(body);
    else if (Array.isArray(body)) {
      body.forEach((t) => {
        const p = document.createElement('p');
        p.textContent = t;
        bodyEl.appendChild(p);
      });
    }
    const actions = panel.querySelector('.jp-modal-actions');
    const btnClose = document.createElement('button');
    btnClose.type = 'button';
    btnClose.className = 'jp-btn jp-btn-ghost';
    btnClose.textContent = cancelLabel || (onConfirm ? 'Annuler' : 'OK');
    btnClose.addEventListener('click', close);
    actions.appendChild(btnClose);
    if (onConfirm) {
      const btnOk = document.createElement('button');
      btnOk.type = 'button';
      btnOk.className = 'jp-btn jp-btn-primary';
      btnOk.textContent = confirmLabel || 'Confirmer';
      btnOk.addEventListener('click', async () => {
        await onConfirm();
        close();
      });
      actions.appendChild(btnOk);
    }
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    backdrop.appendChild(panel);
    host.appendChild(backdrop);
    const onKey = (e) => {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', onKey);
      }
    };
    document.addEventListener('keydown', onKey);
  }

  function help(title, lines) {
    open({ title, body: Array.isArray(lines) ? lines : [lines] });
  }

  function helpButton(title, lines) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'jp-help-btn';
    btn.setAttribute('aria-label', 'Aide');
    btn.textContent = '?';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      help(title, lines);
    });
    return btn;
  }

  global.JpModal = { open, close, help, helpButton };
})(window);
