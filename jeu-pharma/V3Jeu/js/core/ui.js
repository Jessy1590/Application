/* V3UI — DOM builder + composants. */
(function (global) {
  let tipUid = 0;
  let toastHost = null;
  let modalHost = null;

  function flatten(list, out) {
    (list || []).forEach(function (c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) flatten(c, out);
      else out.push(c);
    });
    return out;
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
          Object.keys(v).forEach(function (dk) { el.dataset[dk] = v[dk]; });
        } else if (k.length > 2 && k.slice(0, 2) === 'on' && typeof v === 'function') {
          el.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k === 'htmlFor' || k === 'for') {
          el.htmlFor = v;
        } else if (k === 'value' || k === 'disabled' || k === 'hidden' || k === 'checked' || k === 'selected') {
          el[k] = v;
        } else if (v === true) {
          el.setAttribute(k, '');
        } else {
          el.setAttribute(k, String(v));
        }
      });
    }
    flatten(children, []).forEach(function (c) {
      if (c == null || c === false) return;
      el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return el;
  }

  function tip(text) {
    if (!text) return null;
    const id = 'v3tip-' + (++tipUid);
    const bubble = h('span', { class: 'v3-tip-bubble', id: id, role: 'tooltip' }, text);
    return h('button', {
      type: 'button',
      class: 'v3-tip',
      'aria-describedby': id,
      'aria-label': 'Aide',
      onClick: function (ev) { ev.preventDefault(); ev.stopPropagation(); },
    }, '?', bubble);
  }

  function field(label, control, opts) {
    opts = opts || {};
    const lab = h('div', { class: 'v3-field-lab' }, label, opts.tip ? tip(opts.tip) : null);
    const wrap = h('div', { class: opts.col ? 'v3-field v3-field-col' : 'v3-field' }, lab, control);
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
      }, o.label, o.tip ? tip(o.tip) : null));
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
      wrap.appendChild(h('label', { class: 'v3-check' }, box, o.label));
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
    }, label);
    return btn;
  }

  function chip(label, opts) {
    opts = opts || {};
    const kids = [h('span', null, label)];
    if (opts.onRemove) {
      kids.push(h('button', {
        type: 'button',
        'aria-label': 'Retirer',
        onClick: opts.onRemove,
      }, '×'));
    }
    return h('span', { class: 'v3-chip v3-chip-' + (opts.kind || 'molecule') }, kids);
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
      onClick: opts.onClick,
    }, opts.icon || null, label);
  }

  function section(title) {
    const kids = Array.prototype.slice.call(arguments, 1);
    return h('section', { class: 'v3-section' }, h('h2', null, title), kids);
  }

  function empty(text) {
    return h('p', { class: 'v3-empty' }, text || '—');
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
    }, msg);
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
        h('p', null, msg),
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
    tip: tip,
    field: field,
    segmented: segmented,
    number: number,
    checks: checks,
    toggle: toggle,
    chip: chip,
    button: button,
    section: section,
    empty: empty,
    toast: toast,
    confirm: confirm,
    stars: stars,
  };
})(window);
