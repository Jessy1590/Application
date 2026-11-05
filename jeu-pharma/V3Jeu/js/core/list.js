/* V3List — liste des jeux V3. */
(function (global) {
  const U = global.V3UI;
  const h = U.h;

  function typeLab(t) {
    const d = global.V3Games.get(t);
    return (d && d.label) || t;
  }

  function when(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  }

  function stars(a, b) {
    return '★' + (a || 1) + '–★' + (b || 5);
  }

  function group(rows) {
    const by = {};
    const order = [];
    (rows || []).forEach(function (r) {
      const k = r.famille_code || r.code_unique;
      if (!by[k]) { by[k] = { live: null, arch: [] }; order.push(k); }
      if (r.statut === 'archive') by[k].arch.push(r);
      else by[k].live = r;
    });
    return order.map(function (k) { return by[k]; });
  }

  function acts(row, reload) {
    const live = row.statut !== 'archive';
    const nodes = [];
    if (live) {
      nodes.push(U.button('Jouer', { variant: 'ghost', onClick: function () { location.hash = '#/jouer/' + row.code_unique; } }));
      nodes.push(U.button('Éditer', { variant: 'ghost', onClick: function () { location.hash = '#/edit/' + row.code_unique; } }));
      if (row.statut === 'pause') {
        nodes.push(U.button('Relancer', { onClick: function () { void setStatut(row.id, 'actif', reload); } }));
      } else if (row.statut === 'actif') {
        nodes.push(U.button('Pause', { onClick: function () { void setStatut(row.id, 'pause', reload); } }));
      }
      nodes.push(U.button('Archiver', { onClick: function () { void setStatut(row.id, 'archive', reload); } }));
      if (!row.nb_tentatives) {
        nodes.push(U.button('Supprimer', {
          variant: 'danger',
          onClick: function () { void del(row, reload); },
        }));
      }
    }
    return h('div', { class: 'v3-row-act' }, nodes);
  }

  async function setStatut(id, s, reload) {
    try {
      await global.V3Store.statut(id, s);
      U.toast('OK', 'ok');
      reload();
    } catch (e) { U.toast(e.message, 'err'); }
  }

  async function del(row, reload) {
    const ok = await U.confirm('Supprimer ' + row.code_unique + ' ?');
    if (!ok) return;
    try {
      await global.V3Store.supprimer(row.id);
      U.toast('Supprimé', 'ok');
      reload();
    } catch (e) { U.toast(e.message, 'err'); }
  }

  function rowEl(r, reload, extraClass, prefix) {
    return h('tr', { class: extraClass || '' },
      h('td', null, prefix || null, r.code_unique),
      h('td', null, r.titre || '—'),
      h('td', null, typeLab(r.type_jeu)),
      h('td', null, stars(r.niveau_min, r.niveau_max)),
      h('td', null, String(r.nb_tentatives || 0)),
      h('td', null, when(r.updated_at)),
      h('td', null, acts(r, reload))
    );
  }

  async function render(el, filtre) {
    el.replaceChildren(U.empty('Chargement…'));
    let rows;
    try {
      rows = await global.V3Store.lister(null);
    } catch (e) {
      el.replaceChildren(U.empty(e.message || 'Erreur'));
      return;
    }
    const groups = group(rows);
    const shown = groups.filter(function (g) {
      if (filtre === 'archive') return g.arch.length;
      if (filtre === 'actif') return g.live && g.live.statut === 'actif';
      if (filtre === 'pause') return g.live && g.live.statut === 'pause';
      return g.live || g.arch.length;
    });
    if (!shown.length) {
      el.replaceChildren(U.empty('Aucun jeu.'));
      return;
    }

    const body = h('tbody');
    shown.forEach(function (g) {
      const live = g.live;
      const arch = g.arch.sort(function (a, b) { return (b.revision || 0) - (a.revision || 0); });
      if (filtre === 'archive') {
        arch.forEach(function (r) { body.appendChild(rowEl(r, function () { void render(el, filtre); }, 'v3-arch')); });
        return;
      }
      if (!live) {
        arch.forEach(function (r) { body.appendChild(rowEl(r, function () { void render(el, filtre); }, 'v3-arch')); });
        return;
      }
      const tog = arch.length
        ? h('button', {
          type: 'button',
          class: 'v3-fam-tog',
          'aria-label': 'Archives',
          onClick: function () {
            const on = tog.getAttribute('aria-expanded') !== 'true';
            tog.setAttribute('aria-expanded', on ? 'true' : 'false');
            tog.textContent = on ? '▾' : '▸';
            Array.prototype.forEach.call(body.querySelectorAll('[data-fam="' + live.famille_code + '"]'), function (tr) {
              tr.hidden = !on;
            });
          },
        }, '▸')
        : null;
      if (tog) tog.setAttribute('aria-expanded', 'false');
      body.appendChild(rowEl(live, function () { void render(el, filtre); }, '', tog));
      arch.forEach(function (r) {
        const tr = rowEl(r, function () { void render(el, filtre); }, 'v3-arch');
        tr.dataset.fam = live.famille_code;
        tr.hidden = true;
        body.appendChild(tr);
      });
    });

    el.replaceChildren(h('div', { class: 'v3-table-wrap' },
      h('table', { class: 'v3-table' },
        h('thead', null, h('tr', null,
          h('th', null, 'Code'), h('th', null, 'Titre'), h('th', null, 'Type'),
          h('th', null, '★'), h('th', null, 'Tentatives'), h('th', null, 'Maj'), h('th', null, '')
        )),
        body
      )
    ));
  }

  function mount(el) {
    let filtre = 'actif';
    const tableHost = h('div');
    const seg = U.segmented(
      [
        { value: 'actif', label: 'Actif' },
        { value: 'pause', label: 'Pause' },
        { value: 'archive', label: 'Archivé' },
        { value: 'tous', label: 'Tous' },
      ],
      filtre,
      function (v) {
        filtre = v;
        void render(tableHost, filtre === 'tous' ? null : filtre);
      }
    );
    el.replaceChildren(
      h('div', { class: 'v3-page-head' },
        h('h1', null, 'Jeux V3'),
        U.button('+ Jeu', { variant: 'primary', onClick: function () { location.hash = '#/nouveau'; } })
      ),
      h('div', { class: 'v3-row', style: { marginBottom: '16px' } }, seg),
      tableHost
    );
    void render(tableHost, filtre);
  }

  global.V3List = { mount: mount };
})(window);
