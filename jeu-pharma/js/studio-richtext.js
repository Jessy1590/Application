/**
 * Éditeur texte riche léger (contenteditable + barre d’outils).
 * mount(host, html, { onChange }) — onChange est appelé à chaque modification (auto-enregistrement brouillon).
 */
(function (global) {
  const CMDS = [
    { cmd: 'bold', label: 'B', title: 'Gras' },
    { cmd: 'italic', label: 'I', title: 'Italique' },
    { cmd: 'underline', label: 'U', title: 'Souligné' },
    { cmd: 'insertUnorderedList', label: '•', title: 'Liste' },
    { cmd: 'insertOrderedList', label: '1.', title: 'Liste numérotée' },
    { cmd: 'formatBlock', arg: 'h2', label: 'H2', title: 'Titre' },
    { cmd: 'formatBlock', arg: 'h3', label: 'H3', title: 'Sous-titre' },
    { cmd: 'formatBlock', arg: 'p', label: '¶', title: 'Paragraphe' },
  ];

  /** Palette sobre (tokens teal + couleurs de lisibilité). */
  const COLORS = [
    { v: '#14201c', n: 'Texte (défaut)' },
    { v: '#0f6b5c', n: 'Teal' },
    { v: '#b42318', n: 'Rouge' },
    { v: '#c2570c', n: 'Orange' },
    { v: '#9a6700', n: 'Ocre' },
    { v: '#1d5fa8', n: 'Bleu' },
    { v: '#5b6b66', n: 'Gris' },
  ];

  function mount(host, initialHtml, opts) {
    const options = opts || {};
    host.innerHTML = '';
    host.classList.add('jp-rte');
    const bar = document.createElement('div');
    bar.className = 'jp-rte-bar';
    const surface = document.createElement('div');
    surface.className = 'jp-rte-surface';
    surface.contentEditable = 'true';
    surface.setAttribute('role', 'textbox');
    surface.setAttribute('aria-multiline', 'true');
    surface.innerHTML = initialHtml || '<p><br></p>';

    let savedRange = null;
    function saveRange() {
      const sel = window.getSelection();
      if (sel && sel.rangeCount && surface.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        savedRange = sel.getRangeAt(0).cloneRange();
      }
    }
    function restoreRange() {
      surface.focus();
      if (!savedRange) return;
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }
    function changed() {
      if (typeof options.onChange === 'function') options.onChange();
    }
    surface.addEventListener('input', changed);
    surface.addEventListener('keyup', saveRange);
    surface.addEventListener('mouseup', saveRange);
    surface.addEventListener('blur', saveRange);

    function addGroupSep() {
      const sep = document.createElement('span');
      sep.className = 'jp-rte-sep';
      sep.setAttribute('aria-hidden', 'true');
      bar.appendChild(sep);
    }

    CMDS.forEach((c, i) => {
      if (i === 3 || i === 5) addGroupSep();
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'jp-rte-btn';
      btn.textContent = c.label;
      btn.title = c.title;
      btn.setAttribute('aria-label', c.title);
      if (c.cmd === 'italic') btn.style.fontStyle = 'italic';
      if (c.cmd === 'bold') btn.style.fontWeight = '700';
      if (c.cmd === 'underline') btn.style.textDecoration = 'underline';
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => {
        surface.focus();
        if (c.arg) document.execCommand(c.cmd, false, c.arg);
        else document.execCommand(c.cmd, false, null);
        changed();
      });
      bar.appendChild(btn);
    });

    addGroupSep();

    /* ——— Couleur du texte ——— */
    const colorWrap = document.createElement('span');
    colorWrap.className = 'jp-rte-color';
    const colorBtn = document.createElement('button');
    colorBtn.type = 'button';
    colorBtn.className = 'jp-rte-btn jp-rte-color-btn';
    colorBtn.title = 'Couleur du texte';
    colorBtn.setAttribute('aria-label', 'Couleur du texte');
    colorBtn.setAttribute('aria-haspopup', 'true');
    colorBtn.setAttribute('aria-expanded', 'false');
    colorBtn.innerHTML = '<span class="jp-rte-color-a">A</span><span class="jp-rte-color-bar"></span>';
    const pop = document.createElement('div');
    pop.className = 'jp-rte-pop';
    pop.hidden = true;
    pop.setAttribute('role', 'menu');

    function applyColor(value) {
      restoreRange();
      try { document.execCommand('styleWithCSS', false, true); } catch (_) { /* ignore */ }
      document.execCommand('foreColor', false, value);
      try { document.execCommand('styleWithCSS', false, false); } catch (_) { /* ignore */ }
      colorWrap.style.setProperty('--rte-current', value);
      saveRange();
      changed();
    }
    function closePop() {
      pop.hidden = true;
      colorBtn.setAttribute('aria-expanded', 'false');
    }

    COLORS.forEach((c) => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'jp-rte-swatch';
      sw.style.background = c.v;
      sw.title = c.n;
      sw.setAttribute('aria-label', c.n);
      sw.setAttribute('role', 'menuitem');
      sw.addEventListener('mousedown', (e) => e.preventDefault());
      sw.addEventListener('click', () => { applyColor(c.v); closePop(); });
      pop.appendChild(sw);
    });
    const custom = document.createElement('label');
    custom.className = 'jp-rte-custom';
    custom.title = 'Autre couleur';
    custom.innerHTML = '<span>Autre</span><input type="color" value="#0f6b5c" aria-label="Autre couleur">';
    const colorInput = custom.querySelector('input');
    colorInput.addEventListener('mousedown', saveRange);
    colorInput.addEventListener('change', () => { applyColor(colorInput.value); closePop(); });
    pop.appendChild(custom);

    colorBtn.addEventListener('mousedown', (e) => { saveRange(); e.preventDefault(); });
    colorBtn.addEventListener('click', () => {
      pop.hidden = !pop.hidden;
      colorBtn.setAttribute('aria-expanded', pop.hidden ? 'false' : 'true');
    });
    function onDocDown(e) {
      if (!host.isConnected) { document.removeEventListener('mousedown', onDocDown); return; }
      if (!colorWrap.contains(e.target)) closePop();
    }
    document.addEventListener('mousedown', onDocDown);

    colorWrap.appendChild(colorBtn);
    colorWrap.appendChild(pop);
    bar.appendChild(colorWrap);

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'jp-rte-btn';
    clearBtn.textContent = 'Tx';
    clearBtn.title = 'Effacer le format';
    clearBtn.setAttribute('aria-label', 'Effacer le format');
    clearBtn.addEventListener('mousedown', (e) => e.preventDefault());
    clearBtn.addEventListener('click', () => {
      surface.focus();
      document.execCommand('removeFormat', false, null);
      changed();
    });
    bar.appendChild(clearBtn);

    const linkBtn = document.createElement('button');
    linkBtn.type = 'button';
    linkBtn.className = 'jp-rte-btn';
    linkBtn.textContent = '🔗';
    linkBtn.title = 'Lien';
    linkBtn.setAttribute('aria-label', 'Lien');
    linkBtn.addEventListener('mousedown', (e) => { saveRange(); e.preventDefault(); });
    linkBtn.addEventListener('click', () => {
      const url = prompt('URL du lien');
      if (!url) return;
      restoreRange();
      document.execCommand('createLink', false, url);
      changed();
    });
    bar.appendChild(linkBtn);

    host.appendChild(bar);
    host.appendChild(surface);

    return {
      getHtml() {
        return surface.innerHTML;
      },
      setHtml(html) {
        surface.innerHTML = html || '<p><br></p>';
      },
      el: surface,
      destroy() {
        document.removeEventListener('mousedown', onDocDown);
        host.innerHTML = '';
        host.classList.remove('jp-rte');
      },
    };
  }

  global.JpStudioRichtext = { mount };
})(window);
