/**
 * Ordonnance type — joueur V2.
 */
(function (global) {
  function sb() {
    return global.JpApp.sbJeu();
  }

  async function demarrer(code) {
    const { data, error } = await sb().rpc('v2_demarrer_ordonnance', {
      p_code: String(code || '').trim().toUpperCase(),
    });
    if (error) throw error;
    void global.JpLogs?.action?.('v2_ordonnance_start', { code: data?.code_unique });
    return data;
  }

  async function reveler(tentativeId) {
    const { data, error } = await sb().rpc('v2_reveler_ordonnance', {
      p_tentative_id: tentativeId,
    });
    if (error) throw error;
    void global.JpLogs?.action?.('v2_ordonnance_reveal', { tentative_id: tentativeId });
    return data;
  }

  async function noter(tentativeId, scoreObtenu, scoreMax, details) {
    const { data, error } = await sb().rpc('v2_noter_ordonnance', {
      p_tentative_id: tentativeId,
      p_score_obtenu: scoreObtenu,
      p_score_max: scoreMax,
      p_details: details || [],
    });
    if (error) throw error;
    void global.JpLogs?.action?.('v2_ordonnance_score', {
      tentative_id: tentativeId,
      score: scoreObtenu,
      max: scoreMax,
    });
    return data;
  }

  async function listActives() {
    const { data, error } = await sb()
      .from('modeles_jeu')
      .select('id, code_unique, titre, mode, created_at')
      .eq('type_jeu', 'ordonnance')
      .eq('actif', true)
      .eq('en_pause', false)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  function champLibelle(code) {
    const c = (global.JpConstants?.CHAMP_CODES || []).find((x) => x.code === code);
    return c?.libelle || code;
  }

  function renderMoleculesMasquees(molecules, champs) {
    return (molecules || []).map(function (mol, idx) {
      const noms = Array.isArray(mol.noms_commerciaux)
        ? mol.noms_commerciaux.map((n) => n.valeur).filter(Boolean).join(', ')
        : '';
      return '<article class="jp-v2-mol-card" data-mol="' + idx + '">'
        + '<h3>' + global.JpUi.escapeHtml(mol.dci || 'Molécule') + '</h3>'
        + '<p class="jp-muted">' + global.JpUi.escapeHtml(noms || '—') + '</p>'
        + '<p class="jp-muted">À restituer : '
        + global.JpUi.escapeHtml((champs || []).map(champLibelle).join(', '))
        + '</p></article>';
    }).join('');
  }

  function renderMoleculesRevelees(molecules, champs) {
    return (molecules || []).map(function (mol) {
      const noms = Array.isArray(mol.noms_commerciaux)
        ? mol.noms_commerciaux.map((n) => n.valeur).filter(Boolean).join(', ')
        : '';
      const champsObj = mol.champs || {};
      let dl = '<dl class="jp-v2-champs-revealed">';
      (champs || Object.keys(champsObj)).forEach(function (code) {
        const items = champsObj[code] || [];
        const vals = items.map((it) => it.valeur).filter(Boolean).join(' · ') || '—';
        dl += '<dt>' + global.JpUi.escapeHtml(champLibelle(code)) + '</dt>'
          + '<dd>' + global.JpUi.escapeHtml(vals) + '</dd>';
      });
      dl += '</dl>';
      return '<article class="jp-v2-mol-card">'
        + '<h3>' + global.JpUi.escapeHtml(mol.dci || '') + '</h3>'
        + '<p class="jp-muted">' + global.JpUi.escapeHtml(noms) + '</p>'
        + dl + '</article>';
    }).join('');
  }

  global.JpV2Ordonnances = {
    demarrer,
    reveler,
    noter,
    listActives,
    champLibelle,
    renderMoleculesMasquees,
    renderMoleculesRevelees,
  };
})(window);
