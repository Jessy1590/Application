/* V3Notation — Rapide /10 · Détaillé 0/½/1. */
(function (global) {
  const U = global.V3UI;
  const h = U.h;

  function choixMode(el, opts) {
    opts = opts || {};
    el.replaceChildren(U.segmented([
      {
        value: 'rapide',
        label: 'Rapide',
        tip: opts.tipRapide || 'Une note /10 pour l’ensemble.',
        disabled: !!opts.forceDetaille,
      },
      {
        value: 'detaille',
        label: 'Détaillé',
        tip: opts.tipDetaille || '0 · ½ · 1 par valeur masquée.',
      },
    ], opts.forceDetaille ? 'detaille' : null, function (v) {
      if (opts.onPick) opts.onPick(v);
    }));
  }

  function rapide(el, opts) {
    opts = opts || {};
    let cur = null;
    const row = h('div', { class: 'v3-score10', role: 'group', 'aria-label': 'Note /10' });
    function paint() {
      Array.prototype.forEach.call(row.children, function (b) {
        b.classList.toggle('is-on', Number(b.getAttribute('data-n')) === cur);
      });
    }
    for (let i = 0; i <= 10; i += 1) {
      row.appendChild(h('button', {
        type: 'button',
        dataset: { n: String(i) },
        'aria-label': i + ' / 10',
        onClick: function () {
          cur = Number(this.getAttribute('data-n'));
          paint();
          if (opts.onScore) opts.onScore(cur);
        },
      }, String(i)));
    }
    el.replaceChildren(row);
  }

  function detaille(el, items, opts) {
    opts = opts || {};
    const list = items || [];
    const notes = list.map(function () { return null; });
    const groups = [];
    const by = {};
    list.forEach(function (it, i) {
      const g = it.groupe || '—';
      if (!by[g]) {
        by[g] = { groupe: g, idxs: [] };
        groups.push(by[g]);
      }
      by[g].idxs.push(i);
    });

    const totalEl = h('p', { class: 'v3-note-total' });
    function tot() {
      let o = 0;
      let n = 0;
      notes.forEach(function (v) {
        if (v == null) return;
        o += v;
        n += 1;
      });
      totalEl.textContent = o + ' / ' + list.length;
      if (opts.onChange) opts.onChange({ obtenu: o, max: list.length, notes: notes.slice(), remplis: n });
    }

    const cards = groups.map(function (g) {
      const body = g.idxs.map(function (i) {
        const it = list[i];
        const btns = h('div', { class: 'v3-notes' });
        [0, 0.5, 1].forEach(function (n) {
          const lab = n === 0.5 ? '½' : String(n);
          btns.appendChild(h('button', {
            type: 'button',
            class: 'v3-note',
            'aria-label': lab,
            onClick: function () {
              notes[i] = n;
              Array.prototype.forEach.call(btns.children, function (b, k) {
                b.classList.toggle('is-on', [0, 0.5, 1][k] === n);
              });
              tot();
            },
          }, lab));
        });
        const ctxLab = it.contexte && it.contexte !== g.groupe ? it.contexte : '';
        return h('div', { class: 'v3-note-item' },
          h('div', null,
            ctxLab ? h('div', null, ctxLab) : null,
            it.saisie ? h('div', null, it.saisie) : null,
            h('div', { class: 'v3-note-attendu' }, it.attendu || '')
          ),
          btns
        );
      });
      return h('article', { class: 'v3-note-card' }, h('h3', null, g.groupe), body);
    });

    tot();
    el.replaceChildren.apply(el, (cards.length ? cards : [U.empty('—')]).concat([totalEl]));
  }

  function resultat(obtenu, max) {
    const o = Number(obtenu);
    const m = Number(max);
    return h('p', { class: 'v3-fin-score' },
      (Number.isFinite(o) ? String(o) : '0') + ' / ' + (Number.isFinite(m) ? String(m) : '0')
    );
  }

  global.V3Notation = {
    choixMode: choixMode,
    rapide: rapide,
    detaille: detaille,
    resultat: resultat,
  };
})(window);
