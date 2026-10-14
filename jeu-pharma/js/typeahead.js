/**
 * Typeahead / autocomplete unifié (admin studio, jeux, sélecteurs).
 * - combo  : choix unique (remplace un <select> long) ou barre de recherche (clearOnPick)
 * - chips  : choix multiple avec pastilles
 * Les listes complètes ne sont jamais affichées d'office : résultats sous la barre, après saisie.
 */
(function (global) {
  function esc(s) {
    const f = global.JpUi && global.JpUi.escapeHtml;
    if (f) return f(String(s == null ? '' : s));
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Minuscules sans accents. */
  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().trim();
  }

  /** Retire les caractères qui cassent un filtre PostgREST `or()` / `ilike`. */
  function safeTerm(q) {
    return String(q == null ? '' : q).replace(/[%_,()*\\]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function sb() { return global.JpApp.sbJeu(); }

  let uid = 0;

  /**
   * Moteur : champ + liste déroulante + clavier.
   * @returns {{ run: Function, close: Function }}
   */
  function engine(wrap, input, listEl, opts, onPick) {
    const minChars = opts.minChars != null ? opts.minChars : 0;
    const delay = opts.debounce != null ? opts.debounce : 180;
    const listId = 'jp-ta-' + (++uid);
    let items = [];
    let active = -1;
    let seq = 0;
    let timer = null;

    listEl.id = listId;
    input.setAttribute('aria-controls', listId);

    function isOpen() { return !listEl.hidden; }
    function open() { listEl.hidden = false; input.setAttribute('aria-expanded', 'true'); }
    function close() {
      listEl.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      active = -1;
    }

    function paintActive() {
      listEl.querySelectorAll('.jp-ta-item').forEach(function (el) {
        const on = Number(el.getAttribute('data-i')) === active;
        el.classList.toggle('is-active', on);
        el.setAttribute('aria-selected', on ? 'true' : 'false');
        if (on) {
          input.setAttribute('aria-activedescendant', el.id);
          if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
        }
      });
    }

    function paint(msg) {
      if (msg) {
        listEl.innerHTML = '<div class="jp-ta-msg">' + esc(msg) + '</div>';
        open();
        return;
      }
      let html = '';
      let lastGroup = null;
      items.forEach(function (it, i) {
        if (it.group && it.group !== lastGroup) {
          html += '<div class="jp-ta-group">' + esc(it.group) + '</div>';
          lastGroup = it.group;
        }
        html += '<div class="jp-ta-item' + (i === active ? ' is-active' : '') + '" role="option" id="' + listId + '-' + i
          + '" data-i="' + i + '" aria-selected="' + (i === active ? 'true' : 'false') + '">'
          + '<span class="jp-ta-main">' + esc(it.label) + '</span>'
          + (it.sub ? '<span class="jp-ta-sub">' + esc(it.sub) + '</span>' : '')
          + (it.badge ? '<em class="jp-ta-badge">' + esc(it.badge) + '</em>' : '')
          + '</div>';
      });
      listEl.innerHTML = html;
      open();
      if (active >= 0) paintActive();
    }

    async function run() {
      const q = input.value.trim();
      const mine = ++seq;
      if (q.length < minChars) {
        items = [];
        paint(opts.hint || (minChars <= 1 ? 'Tapez pour chercher…' : 'Tapez au moins ' + minChars + ' caractères…'));
        return;
      }
      try {
        let res = await opts.search(q);
        if (mine !== seq) return;
        res = Array.isArray(res) ? res : [];
        if (opts.exclude) res = res.filter(function (it) { return !opts.exclude(it); });
        items = res;
        active = items.length ? 0 : -1;
        paint(items.length ? null : (opts.emptyText || 'Aucun résultat'));
      } catch (e) {
        if (mine !== seq) return;
        items = [];
        paint('Recherche impossible');
        if (global.JpToast && global.JpToast.fromError) global.JpToast.fromError(e);
      }
    }

    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(run, delay);
    }

    function pickAt(i) {
      const it = items[i];
      if (!it) return;
      close();
      onPick(it);
    }

    input.addEventListener('input', schedule);
    input.addEventListener('focus', function () { if (!isOpen()) void run(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!isOpen()) { void run(); return; }
        if (items.length) { active = (active + 1) % items.length; paintActive(); }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (isOpen() && items.length) { active = (active - 1 + items.length) % items.length; paintActive(); }
      } else if (e.key === 'Enter') {
        if (isOpen() && active >= 0 && items[active]) {
          e.preventDefault();
          pickAt(active);
        }
      } else if (e.key === 'Escape') {
        if (isOpen()) { e.preventDefault(); e.stopPropagation(); close(); }
      } else if (e.key === 'Tab') {
        close();
      }
    });

    // mousedown (pas click) : garde le focus du champ
    listEl.addEventListener('mousedown', function (e) {
      const el = e.target.closest('.jp-ta-item');
      if (!el) return;
      e.preventDefault();
      pickAt(Number(el.getAttribute('data-i')));
    });

    function onDocDown(e) {
      if (!wrap.isConnected) { document.removeEventListener('mousedown', onDocDown); return; }
      if (!wrap.contains(e.target)) close();
    }
    document.addEventListener('mousedown', onDocDown);

    return { run: run, close: close };
  }

  /**
   * Choix unique. `host` = conteneur vide.
   * @param {HTMLElement} host
   * @param {{
   *   search: (q: string) => Promise<Array<{id:any,label:string,sub?:string,group?:string,badge?:string,data?:any}>>,
   *   placeholder?: string, minChars?: number, debounce?: number, emptyText?: string, hint?: string,
   *   ariaLabel?: string, inputId?: string, initial?: object|null,
   *   clearOnPick?: boolean, onChange?: (item: object|null) => void, onPick?: (item: object) => void
   * }} opts
   */
  function combo(host, opts) {
    host.classList.add('jp-ta');
    host.innerHTML = '<input type="text" class="jp-ta-input" role="combobox" aria-autocomplete="list" '
      + 'aria-expanded="false" autocomplete="off" spellcheck="false">'
      + '<button type="button" class="jp-ta-clear" aria-label="Effacer" hidden>×</button>'
      + '<div class="jp-ta-list" role="listbox" hidden></div>';
    const input = host.querySelector('.jp-ta-input');
    const clearBtn = host.querySelector('.jp-ta-clear');
    const listEl = host.querySelector('.jp-ta-list');
    if (opts.placeholder) input.placeholder = opts.placeholder;
    if (opts.ariaLabel) input.setAttribute('aria-label', opts.ariaLabel);
    if (opts.inputId) input.id = opts.inputId;

    let selected = null;

    function syncClear() { clearBtn.hidden = !(input.value && !opts.clearOnPick) && !selected; }

    const eng = engine(host, input, listEl, opts, function (it) {
      if (opts.clearOnPick) {
        input.value = '';
        selected = null;
        syncClear();
        if (opts.onPick) opts.onPick(it);
        return;
      }
      selected = it;
      input.value = it.label;
      syncClear();
      if (opts.onChange) opts.onChange(it);
      if (opts.onPick) opts.onPick(it);
    });

    input.addEventListener('input', function () {
      if (selected && input.value !== selected.label) {
        selected = null;
        if (opts.onChange) opts.onChange(null);
      }
      syncClear();
    });

    clearBtn.addEventListener('click', function () {
      const had = !!selected;
      input.value = '';
      selected = null;
      syncClear();
      eng.close();
      if (had && opts.onChange) opts.onChange(null);
      input.focus();
    });

    if (opts.initial) {
      selected = opts.initial;
      input.value = opts.initial.label;
      syncClear();
    }

    return {
      input: input,
      getItem: function () { return selected; },
      getId: function () { return selected ? selected.id : null; },
      setItem: function (it, silent) {
        selected = it || null;
        input.value = it ? it.label : '';
        syncClear();
        if (!silent && opts.onChange) opts.onChange(selected);
      },
      clear: function (silent) { this.setItem(null, silent); },
      focus: function () { input.focus(); },
      setDisabled: function (v) { input.disabled = !!v; clearBtn.disabled = !!v; },
    };
  }

  const CHIP_EDIT_ICON = '<svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

  /**
   * Choix multiple (pastilles). Les éléments déjà choisis sont exclus des résultats.
   * @param {HTMLElement} host
   * @param {object} opts  mêmes options que combo + `initial: item[]`, `onChange(items)`, `chipEditHref(id, item)?`
   */
  function chips(host, opts) {
    host.classList.add('jp-ta', 'jp-ta-multi');
    host.innerHTML = '<div class="jp-ta-box"><span class="jp-ta-chips"></span>'
      + '<input type="text" class="jp-ta-input" role="combobox" aria-autocomplete="list" '
      + 'aria-expanded="false" autocomplete="off" spellcheck="false"></div>'
      + '<div class="jp-ta-list" role="listbox" hidden></div>';
    const box = host.querySelector('.jp-ta-box');
    const chipsEl = host.querySelector('.jp-ta-chips');
    const input = host.querySelector('.jp-ta-input');
    const listEl = host.querySelector('.jp-ta-list');
    if (opts.placeholder) input.placeholder = opts.placeholder;
    if (opts.ariaLabel) input.setAttribute('aria-label', opts.ariaLabel);

    const sel = new Map();

    function paintChips() {
      chipsEl.innerHTML = Array.from(sel.values()).map(function (it) {
        var edit = '';
        if (opts.chipEditHref) {
          var href = opts.chipEditHref(it.id, it);
          if (href) {
            edit = '<a class="jp-ta-chip-edit" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer" aria-label="Modifier">'
              + CHIP_EDIT_ICON + '</a>';
          }
        }
        return '<span class="jp-ta-chip" title="' + esc(it.sub || '') + '">' + esc(it.label)
          + edit
          + '<button type="button" class="jp-ta-chip-x" data-id="' + esc(it.id) + '" aria-label="Retirer">×</button></span>';
      }).join('');
    }

    function changed() {
      paintChips();
      if (opts.onChange) opts.onChange(Array.from(sel.values()));
    }

    const eng = engine(host, input, listEl, Object.assign({}, opts, {
      exclude: function (it) { return sel.has(String(it.id)); },
    }), function (it) {
      sel.set(String(it.id), it);
      input.value = '';
      changed();
      input.focus();
      void eng.run();
    });

    chipsEl.addEventListener('click', function (e) {
      const b = e.target.closest('.jp-ta-chip-x');
      if (!b) return;
      sel.delete(String(b.getAttribute('data-id')));
      changed();
    });
    box.addEventListener('click', function (e) {
      if (e.target === box || e.target === chipsEl) input.focus();
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && !input.value && sel.size) {
        const last = Array.from(sel.keys()).pop();
        sel.delete(last);
        changed();
      }
    });

    (opts.initial || []).forEach(function (it) { sel.set(String(it.id), it); });
    paintChips();

    return {
      input: input,
      getItems: function () { return Array.from(sel.values()); },
      getIds: function () { return Array.from(sel.values()).map(function (it) { return it.id; }); },
      add: function (it) { sel.set(String(it.id), it); changed(); },
      remove: function (id) { sel.delete(String(id)); changed(); },
      clear: function () { sel.clear(); changed(); },
    };
  }

  /* ------------------------------------------------------------------ */
  /* Sources de recherche réutilisables                                  */
  /* ------------------------------------------------------------------ */

  /** Filtre local insensible aux accents (petites listes déjà chargées). */
  function localSource(items, o) {
    const limit = (o && o.limit) || 12;
    return async function (q) {
      const n = norm(q);
      const out = n
        ? items.filter(function (it) { return norm(it.label + ' ' + (it.sub || '')).indexOf(n) !== -1; })
        : items;
      return out.slice(0, limit);
    };
  }

  /** Entité à valeur (secteurs, classes, indications…) : id + valeur + valeur_norm. */
  function entiteSource(table, o) {
    const limit = (o && o.limit) || 12;
    return async function (q) {
      const t = safeTerm(q);
      let query = sb().from(table).select('id, valeur, valeur_norm').eq('actif', true);
      if (t) query = query.or('valeur.ilike.%' + t + '%,valeur_norm.ilike.%' + norm(t) + '%');
      const { data, error } = await query.order('valeur').limit(limit);
      if (error) throw error;
      return (data || []).map(function (r) {
        return { id: r.id, label: r.valeur || '', data: { valeur_norm: r.valeur_norm || '' } };
      });
    };
  }

  function nomsToText(noms) {
    if (!noms) return '';
    if (typeof noms === 'string') return noms;
    if (Array.isArray(noms)) {
      return noms.map(function (n) { return n && typeof n === 'object' ? (n.valeur || '') : n; })
        .filter(Boolean).join(', ');
    }
    return '';
  }

  /** Molécules (1 fiche = 1 DCI) via RPC `v2_chercher_matrices`. */
  function matriceSource(o) {
    const limit = (o && o.limit) || 15;
    return async function (q) {
      const { data, error } = await sb().rpc('v2_chercher_matrices', {
        p_q: safeTerm(q) || null,
        p_secteur_norm: null,
        p_indication_norm: null,
        p_classe_ther_norm: null,
        p_classe_pharma_norm: null,
        p_limit: limit,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data : []).map(function (r) {
        return { id: r.id, label: r.dci || '—', sub: nomsToText(r.noms) };
      });
    };
  }

  global.JpTypeahead = {
    norm: norm,
    combo: combo,
    chips: chips,
    localSource: localSource,
    entiteSource: entiteSource,
    matriceSource: matriceSource,
    nomsToText: nomsToText,
  };
})(window);
