/* V3UI — DOM builder + composants. */
(function (global) {
  let tipUid = 0;
  let toastHost = null;
  let modalHost = null;

  function isNode(c) {
    return !!(c && typeof c === 'object' && typeof c.nodeType === 'number' && c.nodeType > 0);
  }

  /** Texte sûr : null / undefined / Node / objet → chaîne affichable (jamais « null », « [object HTMLElement] »). */
  function txt(v) {
    if (v == null || v === false) return '';
    if (typeof v === 'string') {
      if (v === 'null' || v === 'undefined' || v === 'NaN') return '';
      return v.replace(/\[object HTML\w*\]/g, '').replace(/\[object Object\]/g, '').trim();
    }
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
    if (typeof v === 'boolean') return '';
    if (isNode(v)) return String(v.textContent || '').trim();
    if (Array.isArray(v)) return v.map(txt).filter(Boolean).join(' ');
    if (typeof v === 'object') {
      if (typeof v.label === 'string') return txt(v.label);
      if (typeof v.valeur === 'string') return txt(v.valeur);
      if (typeof v.texte === 'string') return txt(v.texte);
      if (typeof v.titre === 'string') return txt(v.titre);
      if (typeof v.dci === 'string') return txt(v.dci);
      return '';
    }
    return '';
  }

  function flatten(list, out) {
    (list || []).forEach(function (c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) flatten(c, out);
      else out.push(c);
    });
    return out;
  }

  function appendAny(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) {
      c.forEach(function (x) { appendAny(el, x); });
      return;
    }
    if (isNode(c)) {
      el.appendChild(c);
      return;
    }
    const s = txt(c);
    if (s) el.appendChild(document.createTextNode(s));
  }

  function h(tag, attrs) {
    const children = Array.prototype.slice.call(arguments, 2);
    if (attrs != null && (typeof attrs !== 'object' || attrs.nodeType || Array.isArray(attrs))) {
      children.unshift(attrs);
      attrs = null;
    }
    const el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        const v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class' || k === 'className') {
          el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : String(v);
        } else if (k === 'style' && typeof v === 'object') {
          Object.keys(v).forEach(function (sk) { el.style[sk] = v[sk]; });
        } else if (k === 'dataset' && typeof v === 'object') {
          Object.keys(v).forEach(function (dk) { el.dataset[dk] = txt(v[dk]); });
        } else if (k.length > 2 && k.slice(0, 2) === 'on' && typeof v === 'function') {
          el.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k === 'htmlFor' || k === 'for') {
          el.htmlFor = v;
        } else if (k === 'value' || k === 'disabled' || k === 'hidden' || k === 'checked' || k === 'selected') {
          el[k] = k === 'value' ? (isNode(v) ? txt(v) : v) : v;
        } else if (v === true) {
          el.setAttribute(k, '');
        } else {
          const s = txt(v);
          if (s) el.setAttribute(k, s);
        }
      });
    }
    flatten(children, []).forEach(function (c) { appendAny(el, c); });
    return el;
  }

  let tipBubble = null;
  function tipShow(el) {
    const text = el.getAttribute('data-tip');
    if (!text) return;
    if (!tipBubble || !tipBubble.isConnected) {
      tipBubble = h('div', { class: 'v3-tip-bubble', id: 'v3-tip-bubble', role: 'tooltip' });
      document.body.appendChild(tipBubble);
    }
    tipBubble.textContent = text;
    tipBubble.classList.add('is-on');
    const r = el.getBoundingClientRect();
    const bw = Math.min(280, window.innerWidth - 16);
    tipBubble.style.maxWidth = bw + 'px';
    const b = tipBubble.getBoundingClientRect();
    let left = r.left + r.width / 2 - b.width / 2;
    left = Math.max(8, Math.min(window.innerWidth - b.width - 8, left));
    let top = r.top - b.height - 8;
    if (top < 8) top = r.bottom + 8;
    if (top + b.height > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - b.height - 8);
    }
    tipBubble.style.left = left + 'px';
    tipBubble.style.top = top + 'px';
    el.setAttribute('aria-describedby', 'v3-tip-bubble');
  }
  function tipHide() {
    if (tipBubble) {
      tipBubble.classList.remove('is-on');
      tipBubble.textContent = '';
    }
  }
  window.addEventListener('scroll', tipHide, true);
  window.addEventListener('resize', tipHide);
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') tipHide();
  });

  /* Pastille « ? » ; texte obligatoire. span (pas button) : insérable dans un bouton. */
  function tip(text) {
    text = txt(text).trim();
    if (!text) return null;
    tipUid += 1;
    const el = h('span', {
      class: 'v3-tip',
      role: 'button',
      tabindex: '0',
      'aria-label': 'Aide : ' + text,
      'data-tip': text,
      onMouseenter: function () { tipShow(el); },
      onMouseleave: tipHide,
      onFocus: function () { tipShow(el); },
      onBlur: tipHide,
      onClick: function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        tipShow(el);
      },
    }, '?');
    return el;
  }

  function field(label, control, opts) {
    opts = opts || {};
    const lab = h('div', { class: 'v3-field-lab' }, txt(label), opts.tip ? tip(opts.tip) : null);
    const ctrl = h('div', { class: 'v3-field-ctrl' }, control);
    const wrap = h('div', { class: opts.col ? 'v3-field v3-field-col' : 'v3-field' }, lab, ctrl);
    if (opts.hint) wrap.appendChild(h('p', { class: 'v3-hint' }, opts.hint));
    return wrap;
  }

  function optList(options) {
    return (options || []).map(function (o) {
      return typeof o === 'string' ? { value: o, label: o } : o;
    });
  }

  function segmented(options, value, onChange) {
    const opts = optList(options);
    let cur = value;
    const wrap = h('div', { class: 'v3-seg', role: 'group' });
    function paint() {
      Array.prototype.forEach.call(wrap.children, function (b) {
        const on = b.getAttribute('data-value') === String(cur);
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    opts.forEach(function (o) {
      wrap.appendChild(h('button', {
        type: 'button',
        class: 'v3-seg-btn',
        dataset: { value: String(o.value) },
        'aria-pressed': o.value === cur ? 'true' : 'false',
        disabled: !!o.disabled,
        onClick: function () {
          if (o.disabled) return;
          cur = o.value;
          paint();
          if (onChange) onChange(o.value);
        },
      }, txt(o.label) || String(o.value), o.tip ? tip(o.tip) : null));
    });
    paint();
    wrap.setValue = function (v) { cur = v; paint(); };
    return wrap;
  }

  function number(value, opts) {
    opts = opts || {};
    const min = opts.min != null ? opts.min : 0;
    const max = opts.max != null ? opts.max : 999;
    const step = opts.step != null ? opts.step : 1;
    let cur = Number(value);
    if (!Number.isFinite(cur)) cur = min;
    const input = h('input', {
      type: 'number',
      min: min,
      max: max,
      step: step,
      value: cur,
      'aria-label': opts.label || 'Nombre',
    });
    function set(n) {
      let v = Number(n);
      if (!Number.isFinite(v)) v = min;
      v = Math.min(max, Math.max(min, v));
      if (step >= 1) v = Math.round(v / step) * step;
      cur = v;
      input.value = String(v);
      if (opts.onChange) opts.onChange(v);
    }
    input.addEventListener('change', function () { set(input.value); });
    const wrap = h('div', { class: 'v3-num' },
      h('button', { type: 'button', 'aria-label': 'Moins', onClick: function () { set(cur - step); } }, '−'),
      input,
      h('button', { type: 'button', 'aria-label': 'Plus', onClick: function () { set(cur + step); } }, '+')
    );
    wrap.setValue = set;
    return wrap;
  }

  function checks(options, values, onChange) {
    const opts = optList(options);
    const set = {};
    (values || []).forEach(function (v) { set[v] = true; });
    const wrap = h('div', { class: 'v3-checks' });
    opts.forEach(function (o) {
      const box = h('input', { type: 'checkbox', checked: !!set[o.value] });
      box.addEventListener('change', function () {
        set[o.value] = box.checked;
        if (onChange) {
          onChange(opts.filter(function (x) { return set[x.value]; }).map(function (x) { return x.value; }));
        }
      });
      wrap.appendChild(h('label', { class: 'v3-check' }, box, txt(o.label) || String(o.value)));
    });
    return wrap;
  }

  function toggle(label, value, onChange) {
    let on = !!value;
    const btn = h('button', {
      type: 'button',
      class: 'v3-toggle',
      'aria-pressed': on ? 'true' : 'false',
      onClick: function () {
        on = !on;
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (onChange) onChange(on);
      },
    }, txt(label));
    return btn;
  }

  function switchEl(label, value, onChange) {
    let on = !!value;
    const input = h('input', {
      type: 'checkbox',
      class: 'v3-switch-input',
      checked: on,
      'aria-label': txt(label) || 'Interrupteur',
    });
    const wrap = h('label', { class: 'v3-switch' },
      input,
      h('span', { class: 'v3-switch-ui', 'aria-hidden': 'true' }),
      txt(label) ? h('span', { class: 'v3-switch-lab' }, txt(label)) : null
    );
    input.addEventListener('change', function () {
      on = !!input.checked;
      if (onChange) onChange(on);
    });
    wrap.setValue = function (v) {
      on = !!v;
      input.checked = on;
    };
    return wrap;
  }

  function chip(label, opts) {
    opts = opts || {};
    const kids = [h('span', null, txt(label) || '—')];
    if (opts.onRemove) {
      kids.push(h('button', {
        type: 'button',
        'aria-label': 'Retirer',
        onClick: opts.onRemove,
      }, '×'));
    }
    return h('span', { class: 'v3-chip v3-chip-' + (opts.kind || 'molecule') }, kids);
  }

  function badge(label, kind) {
    return h('span', { class: 'v3-badge' + (kind ? ' v3-badge-' + kind : '') }, txt(label));
  }

  function button(label, opts) {
    opts = opts || {};
    const cls = ['v3-btn'];
    if (opts.variant === 'primary') cls.push('v3-btn-primary');
    else if (opts.variant === 'danger') cls.push('v3-btn-danger');
    else if (opts.variant === 'ghost') cls.push('v3-btn-ghost');
    return h('button', {
      type: 'button',
      class: cls.join(' '),
      disabled: !!opts.disabled,
      'aria-label': opts.ariaLabel || null,
      onClick: opts.onClick,
    }, opts.icon || null, isNode(label) ? label : txt(label));
  }

  function section(title) {
    const kids = Array.prototype.slice.call(arguments, 1);
    return h('section', { class: 'v3-section' }, h('h2', null, txt(title)), kids);
  }

  function card(title) {
    const kids = Array.prototype.slice.call(arguments, 1);
    const head = title ? h('h3', { class: 'v3-card-title' }, txt(title)) : null;
    return h('div', { class: 'v3-card' }, head, h('div', { class: 'v3-card-body' }, kids));
  }

  function grid(cols) {
    const kids = Array.prototype.slice.call(arguments, 1);
    const n = cols === 3 ? 3 : 2;
    return h('div', { class: 'v3-grid-' + n }, kids);
  }

  function list(items, render) {
    const el = h('div', { class: 'v3-list' });
    (items || []).forEach(function (it, i) {
      const row = h('div', { class: 'v3-list-item' });
      appendAny(row, render ? render(it, i) : txt(it));
      el.appendChild(row);
    });
    return el;
  }

  function empty(text) {
    return h('p', { class: 'v3-empty' }, txt(text) || '—');
  }

  function essaiPanel(opts) {
    opts = opts || {};
    const body = h('div', { class: 'v3-essai-body' });
    function close() {
      cardEl.hidden = true;
      if (opts.clearOnClose !== false) body.replaceChildren();
      if (opts.onClose) opts.onClose();
    }
    function open() {
      cardEl.hidden = false;
      if (opts.onOpen) opts.onOpen(body);
    }
    const closeBtn = button('Fermer', { variant: 'ghost', onClick: close });
    const head = h('div', { class: 'v3-essai-head' },
      h('span', { class: 'v3-essai-title' }, txt(opts.title) || 'Essai'),
      closeBtn
    );
    const cardEl = h('div', { class: 'v3-card v3-essai-card', hidden: true }, head, body);
    return {
      el: cardEl,
      body: body,
      open: open,
      close: close,
      isOpen: function () { return !cardEl.hidden; },
    };
  }

  function ensureToasts() {
    if (toastHost && toastHost.isConnected) return toastHost;
    toastHost = h('div', { class: 'v3-toasts', id: 'v3-toasts' });
    document.body.appendChild(toastHost);
    return toastHost;
  }

  function toast(msg, kind) {
    const host = ensureToasts();
    const el = h('div', {
      class: 'v3-toast' + (kind === 'ok' ? ' is-ok' : kind === 'err' ? ' is-err' : ''),
      role: 'status',
    }, txt(msg) || '—');
    host.appendChild(el);
    setTimeout(function () { el.remove(); }, 3200);
  }

  function ensureModal() {
    if (modalHost && modalHost.isConnected) return modalHost;
    modalHost = h('div', { id: 'v3-modal' });
    document.body.appendChild(modalHost);
    return modalHost;
  }

  function confirm(msg) {
    return new Promise(function (resolve) {
      const host = ensureModal();
      function close(ok) {
        host.replaceChildren();
        resolve(!!ok);
      }
      const dialog = h('div', { class: 'v3-dialog', role: 'dialog', 'aria-modal': 'true' },
        h('p', null, txt(msg)),
        h('div', { class: 'v3-actions' },
          button('Annuler', { variant: 'ghost', onClick: function () { close(false); } }),
          button('Confirmer', { variant: 'primary', onClick: function () { close(true); } })
        )
      );
      const overlay = h('div', {
        class: 'v3-modal',
        onClick: function (ev) { if (ev.target === overlay) close(false); },
      }, dialog);
      host.appendChild(overlay);
      function onKey(ev) {
        if (ev.key === 'Escape') { document.removeEventListener('keydown', onKey); close(false); }
      }
      document.addEventListener('keydown', onKey);
      dialog.querySelector('.v3-btn-primary').focus();
    });
  }

  function starBtn(n, on, onClick) {
    return h('button', {
      type: 'button',
      class: 'v3-star' + (on ? ' is-on' : ''),
      'aria-pressed': on ? 'true' : 'false',
      'aria-label': '★' + n,
      onClick: onClick,
    }, '★' + n);
  }

  function adder(opts) {
    opts = opts || {};
    const usePropose = opts.propose !== false;
    let propItems = [];
    let hasProps = false;
    let draftReady = false;

    const draftHost = h('div', { class: 'v3-adder-draft' });
    const propsHost = h('div', { class: 'v3-adder-props' });
    const propsTools = h('div', { class: 'v3-adder-props-tools' });
    const countEl = h('div', { class: 'v3-adder-count' });
    const itemsEl = h('div', { class: 'v3-adder-items v3-list' });
    const listWrap = h('div', { class: 'v3-adder-list' }, countEl, itemsEl);

    const addBtn = button('Ajouter', {
      variant: 'primary',
      disabled: true,
      onClick: function () {
        if (!canAdd()) return;
        const picked = hasProps
          ? propItems.filter(function (p) { return p.checked; }).map(function (p) { return p.value; })
          : [];
        if (opts.onAdd) opts.onAdd(picked);
        clearProps();
        draftReady = false;
        paintAddBtn();
        refresh();
        if (opts.onChange) opts.onChange();
      },
    });

    const panel = h('div', { class: 'v3-adder-panel' },
      h('h3', null, txt(opts.title) || 'Ajouter'),
      draftHost,
      propsHost,
      propsTools,
      addBtn
    );
    const root = h('div', { class: 'v3-adder' }, panel, listWrap);

    function canAdd() {
      if (hasProps) return propItems.some(function (p) { return p.checked; });
      return draftReady;
    }

    function paintAddBtn() {
      addBtn.disabled = !canAdd();
    }

    function clearProps() {
      propItems = [];
      hasProps = false;
      propsHost.replaceChildren();
      propsHost.hidden = true;
      propsTools.replaceChildren();
      propsTools.hidden = true;
      paintAddBtn();
    }

    function paintProps() {
      propsHost.replaceChildren();
      propsTools.replaceChildren();
      if (!usePropose || !hasProps) {
        propsHost.hidden = true;
        propsTools.hidden = true;
        paintAddBtn();
        return;
      }
      propsHost.hidden = false;
      propsTools.hidden = false;
      propItems.forEach(function (p) {
        const box = h('input', { type: 'checkbox', checked: !!p.checked });
        box.addEventListener('change', function () {
          p.checked = box.checked;
          paintAddBtn();
        });
        propsHost.appendChild(h('label', { class: 'v3-adder-prop' },
          box,
          h('span', { class: 'v3-adder-prop-lab' },
            txt(p.label) || '—',
            p.sub ? h('small', { class: 'v3-adder-prop-sub' }, txt(p.sub)) : null
          )
        ));
      });
      propsTools.append(
        button('Tout', {
          variant: 'ghost',
          onClick: function () {
            propItems.forEach(function (p) { p.checked = true; });
            paintProps();
          },
        }),
        button('Aucun', {
          variant: 'ghost',
          onClick: function () {
            propItems.forEach(function (p) { p.checked = false; });
            paintProps();
          },
        })
      );
      paintAddBtn();
    }

    function getItems() {
      return typeof opts.items === 'function' ? opts.items() : (opts.items || []);
    }

    function removeAt(i) {
      const items = getItems();
      if (i < 0 || i >= items.length) return;
      items.splice(i, 1);
      refresh();
      if (opts.onChange) opts.onChange();
    }

    function moveAt(i, delta) {
      const items = getItems();
      const j = i + delta;
      if (j < 0 || j >= items.length) return;
      const tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
      refresh();
      if (opts.onChange) opts.onChange();
    }

    function refresh() {
      const items = getItems();
      countEl.textContent = items.length + ' élément' + (items.length !== 1 ? 's' : '');
      itemsEl.replaceChildren();
      if (!items.length) {
        if (opts.empty !== '') itemsEl.appendChild(empty(opts.empty || '—'));
        return;
      }
      items.forEach(function (item, i) {
        const api = {
          propose: function (list) {
            if (!usePropose) return;
            propItems = (list || []).map(function (x) {
              return {
                label: txt(x.label),
                sub: txt(x.sub),
                value: x.value,
                checked: x.checked !== false,
              };
            });
            hasProps = propItems.length > 0;
            paintProps();
          },
          clearProps: clearProps,
          setDraftReady: function (bool) {
            draftReady = !!bool;
            paintAddBtn();
          },
          refresh: refresh,
          remove: function (idx) { removeAt(idx == null ? i : idx); },
          move: function (idx, delta) { moveAt(idx == null ? i : idx, delta); },
        };
        const row = h('div', { class: 'v3-adder-item v3-list-item' });
        const node = opts.renderItem ? opts.renderItem(item, i, api) : null;
        appendAny(row, node);
        itemsEl.appendChild(row);
      });
    }

    const draftApi = {
      propose: function (list) {
        if (!usePropose) return;
        propItems = (list || []).map(function (x) {
          return {
            label: txt(x.label),
            sub: txt(x.sub),
            value: x.value,
            checked: x.checked !== false,
          };
        });
        hasProps = propItems.length > 0;
        paintProps();
      },
      clearProps: clearProps,
      setDraftReady: function (bool) {
        draftReady = !!bool;
        paintAddBtn();
      },
      refresh: refresh,
      remove: removeAt,
      move: moveAt,
    };

    propsHost.hidden = true;
    propsTools.hidden = true;
    if (opts.draft) opts.draft(draftHost, draftApi);

    return { el: root, refresh: refresh };
  }

  function stars(min, max, onChange) {
    let a = Math.min(5, Math.max(1, Number(min) || 1));
    let b = Math.min(5, Math.max(1, Number(max) || 5));
    if (a > b) b = a;
    const left = h('div', { class: 'v3-stars-row' });
    const right = h('div', { class: 'v3-stars-row' });
    const wrap = h('div', { class: 'v3-stars' }, left, right);
    function paint() {
      left.replaceChildren(h('span', { class: 'v3-stars-lab' }, 'De'));
      right.replaceChildren(h('span', { class: 'v3-stars-lab' }, 'À'));
      for (let i = 1; i <= 5; i += 1) {
        left.appendChild(starBtn(i, i === a, function () {
          a = i;
          if (a > b) b = a;
          paint();
          if (onChange) onChange(a, b);
        }));
        right.appendChild(starBtn(i, i === b, function () {
          b = i;
          if (b < a) a = b;
          paint();
          if (onChange) onChange(a, b);
        }));
      }
    }
    paint();
    return wrap;
  }

  global.V3UI = {
    h: h,
    txt: txt,
    tip: tip,
    field: field,
    segmented: segmented,
    number: number,
    checks: checks,
    toggle: toggle,
    switch: switchEl,
    chip: chip,
    badge: badge,
    button: button,
    section: section,
    card: card,
    grid: grid,
    list: list,
    empty: empty,
    essaiPanel: essaiPanel,
    toast: toast,
    confirm: confirm,
    stars: stars,
    adder: adder,
  };
})(window);
