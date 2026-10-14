/**
 * Modales admin (aide, confirmations, saisie).
 */
(function (global) {
  let root = null;
  let keyHandler = null;

  function ensureRoot() {
    if (root) return root;
    root = document.createElement('div');
    root.id = 'jp-modal-root';
    document.body.appendChild(root);
    return root;
  }

  function close() {
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
    if (root) root.innerHTML = '';
  }

  /**
   * @param {object} opts
   * @param {string} [opts.title]
   * @param {string|Node|string[]} [opts.body]
   * @param {string} [opts.confirmLabel]
   * @param {string} [opts.cancelLabel]
   * @param {() => (void|boolean|Promise<void|boolean>)} [opts.onConfirm] — return false pour garder la modale ouverte
   * @param {() => void} [opts.onCancel]
   * @param {HTMLElement} [opts.focus] — élément à focus à l’ouverture
   */
  function open(opts) {
    const {
      title, body, confirmLabel, onConfirm, cancelLabel, onCancel, focus,
    } = opts || {};
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
    if (typeof body === 'string') {
      bodyEl.innerHTML = '<p>' + (global.JpUi?.escapeHtml?.(body) || body) + '</p>';
    } else if (body instanceof Node) {
      bodyEl.appendChild(body);
    } else if (Array.isArray(body)) {
      body.forEach((t) => {
        const p = document.createElement('p');
        p.textContent = t;
        bodyEl.appendChild(p);
      });
    }
    const actions = panel.querySelector('.jp-modal-actions');

    function doCancel() {
      close();
      if (typeof onCancel === 'function') onCancel();
    }

    const btnClose = document.createElement('button');
    btnClose.type = 'button';
    btnClose.className = 'jp-btn jp-btn-ghost';
    btnClose.textContent = cancelLabel || (onConfirm ? 'Annuler' : 'OK');
    btnClose.addEventListener('click', doCancel);
    actions.appendChild(btnClose);

    let btnOk = null;
    if (onConfirm) {
      btnOk = document.createElement('button');
      btnOk.type = 'button';
      btnOk.className = 'jp-btn jp-btn-primary';
      btnOk.textContent = confirmLabel || 'Confirmer';
      btnOk.addEventListener('click', async () => {
        btnOk.disabled = true;
        try {
          const keep = await onConfirm();
          if (keep === false) {
            btnOk.disabled = false;
            return;
          }
          close();
        } catch (e) {
          btnOk.disabled = false;
          global.JpToast?.fromError?.(e);
        }
      });
      actions.appendChild(btnOk);
    }

    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) doCancel(); });
    backdrop.appendChild(panel);
    host.appendChild(backdrop);

    keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        doCancel();
      } else if (e.key === 'Enter' && btnOk && e.target && e.target.tagName === 'INPUT') {
        e.preventDefault();
        btnOk.click();
      }
    };
    document.addEventListener('keydown', keyHandler);

    const focusEl = focus || panel.querySelector('input, textarea, select, button.jp-btn-primary') || btnClose;
    setTimeout(() => focusEl?.focus?.(), 30);
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

  /**
   * Saisie texte (remplace window.prompt).
   * @returns {Promise<string|null>} valeur trimée, ou null si annulé / vide refusé
   */
  function ask(opts) {
    const o = opts || {};
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'jp-modal-ask';
      if (o.message) {
        const p = document.createElement('p');
        p.textContent = o.message;
        wrap.appendChild(p);
      }
      const label = document.createElement('label');
      label.className = 'jp-field';
      const lab = document.createElement('span');
      lab.textContent = o.label || 'Nom';
      label.appendChild(lab);
      let input;
      if (o.multiline) {
        input = document.createElement('textarea');
        input.rows = o.rows || 3;
      } else {
        input = document.createElement('input');
        input.type = 'text';
      }
      input.id = 'jp-modal-ask-input';
      input.value = o.value != null ? String(o.value) : '';
      if (o.placeholder) input.placeholder = o.placeholder;
      if (o.maxLength) input.maxLength = o.maxLength;
      label.appendChild(input);
      wrap.appendChild(label);

      let settled = false;
      function finish(v) {
        if (settled) return;
        settled = true;
        resolve(v);
      }

      open({
        title: o.title || 'Saisie',
        body: wrap,
        confirmLabel: o.confirmLabel || 'Valider',
        cancelLabel: o.cancelLabel || 'Annuler',
        focus: input,
        onConfirm: async () => {
          const v = String(input.value || '').trim();
          if (!v && o.allowEmpty !== true) {
            global.JpToast?.warn?.(o.emptyMessage || 'Indiquez une valeur');
            input.focus();
            return false;
          }
          finish(v || null);
          return undefined;
        },
        onCancel: () => finish(null),
      });
    });
  }

  global.JpModal = { open, close, help, helpButton, ask };
})(window);
