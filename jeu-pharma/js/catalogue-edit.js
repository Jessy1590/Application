/**
 * Éditeur fiche catalogue V2 (sans legacy).
 */
(function (global) {
  function sb() { return global.JpApp.sbJeu(); }
  function esc(s) { return global.JpUi.escapeHtml(String(s ?? '')); }

  async function loadFiche(matriceId) {
    const { data: m, error } = await sb()
      .from('matrice_medicaments')
      .select('id, dci_id, hospitalier, complexe, fiche_validee, statut')
      .eq('id', matriceId)
      .maybeSingle();
    if (error) throw error;
    if (!m) throw new Error('Fiche introuvable');

    let dci = '';
    if (m.dci_id) {
      const { data: d } = await sb().from('dcis').select('valeur').eq('id', m.dci_id).maybeSingle();
      dci = d?.valeur || '';
    }
    const { data: noms } = await sb()
      .from('matrice_noms_commerciaux')
      .select('ordre, noms_commerciaux(valeur)')
      .eq('matrice_id', matriceId)
      .order('ordre');
    const { data: conn } = await sb()
      .from('connaissances')
      .select('id, champ_code, texte, statut, ordre')
      .eq('matrice_id', matriceId)
      .eq('statut', 'valide')
      .order('champ_code')
      .order('ordre');

    return {
      ...m,
      dci,
      noms: (noms || []).map((n) => n.noms_commerciaux?.valeur).filter(Boolean),
      connaissances: conn || [],
    };
  }

  async function boot(root) {
    global.JpUi.bootPage({ module: 'admin-fiche', homeHref: 'catalogue.html' });
    const id = new URLSearchParams(location.search).get('id');
    if (!id) {
      root.innerHTML = '<p class="jp-muted">id manquant</p>';
      return;
    }
    root.innerHTML = '<p class="jp-muted">…</p>';
    const fiche = await loadFiche(id);
    let html = '<h1 class="jp-title">' + esc(fiche.dci || 'Fiche') + '</h1>'
      + '<p class="jp-muted">' + esc(fiche.noms.join(', ')) + '</p>'
      + '<div class="jp-toolbar" style="gap:0.5rem;margin:1rem 0">'
      + '<button type="button" class="jp-btn jp-btn-primary" id="btnValider">'
      + (fiche.fiche_validee ? 'Remettre à 0' : 'Valider fiche') + '</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="btnBdm">BDPM</button>'
      + '</div>'
      + '<div id="bdmBox" hidden class="jp-field"><input id="bdmQ" placeholder="Recherche BDPM"><button type="button" class="jp-btn jp-btn-ghost" id="bdmGo">OK</button><div id="bdmRes"></div></div>'
      + '<h2 class="jp-title" style="font-size:1.1rem">Connaissances</h2><ul class="jp-list-clean">';
    fiche.connaissances.forEach((c) => {
      html += '<li class="jp-list-row"><span><span class="jp-badge-soft">' + esc(c.champ_code)
        + '</span> ' + esc(c.texte) + '</span></li>';
    });
    html += '</ul>';
    root.innerHTML = html;

    root.querySelector('#btnValider').addEventListener('click', async () => {
      try {
        const { error } = await sb().from('matrice_medicaments').update({
          fiche_validee: !fiche.fiche_validee,
          updated_at: new Date().toISOString(),
        }).eq('id', id);
        if (error) throw error;
        global.JpToast?.ok?.('OK');
        location.reload();
      } catch (e) {
        global.JpToast?.fromError?.(e);
      }
    });

    root.querySelector('#btnBdm').addEventListener('click', () => {
      const box = root.querySelector('#bdmBox');
      box.hidden = !box.hidden;
    });
    root.querySelector('#bdmGo')?.addEventListener('click', async () => {
      const q = root.querySelector('#bdmQ').value.trim();
      if (!q || !global.JpBdm?.search) {
        global.JpToast?.warn?.('BDPM indisponible');
        return;
      }
      try {
        const res = await global.JpBdm.search(q);
        const rows = Array.isArray(res) ? res : (res?.results || res?.data || []);
        root.querySelector('#bdmRes').innerHTML = (rows.slice(0, 8).map((r) =>
          '<p class="jp-muted">' + esc(r.denomination || r.name || r.libelle || JSON.stringify(r).slice(0, 80)) + '</p>'
        ).join('')) || '<p class="jp-muted">—</p>';
      } catch (e) {
        global.JpToast?.fromError?.(e);
      }
    });
  }

  async function bootList() {
    // used from catalogue.html via admin.js replacement
  }

  global.JpCatalogueEdit = { boot, loadFiche, bootList };
})(window);
