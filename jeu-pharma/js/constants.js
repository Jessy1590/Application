/**
 * Référentiels UI Jeu Pharma (codes de champs quiz).
 * `actif: false` = legacy (gardé en base, masqué UI / CSV / quiz / trous).
 * Niveau d’accès parcours = étoiles 1–5 sur l’inscription (pas de profil métier).
 */
(function (global) {
  /** Codes champ pour configuration quiz / affichage fiches */
  const CHAMP_CODES = [
    { code: 'nom_commercial', libelle: 'Noms commerciaux', table: 'noms_commerciaux', card: 'N', liaison: 'matrice_noms_commerciaux', liaisonFk: 'nom_commercial_id', actif: true },
    { code: 'dci', libelle: 'DCI', table: 'dcis', card: 1, fk: 'dci_id', actif: true },
    { code: 'secteur_therapeutique', libelle: 'Secteur thérapeutique', table: 'secteurs_therapeutiques', card: 'N', liaison: 'matrice_secteurs_therapeutiques', liaisonFk: 'secteur_therapeutique_id', fk: 'secteur_therapeutique_id', actif: true },
    { code: 'classe_therapeutique', libelle: 'Classe thérapeutique', table: 'classes_therapeutiques', card: 'N', liaison: 'matrice_classes_therapeutiques', liaisonFk: 'classe_therapeutique_id', fk: 'classe_therapeutique_id', actif: true },
    { code: 'classe_pharmacologique', libelle: 'Classe pharmacologique', table: 'classes_pharmacologiques', card: 'N', liaison: 'matrice_classes_pharmacologiques', liaisonFk: 'classe_pharmacologique_id', fk: 'classe_pharmacologique_id', actif: true },
    { code: 'detail_pharmacologie', libelle: 'Détail pharmacologie', table: 'details_pharmacologie', card: 1, fk: 'detail_pharmacologie_id', actif: true },
    { code: 'posologie_generale', libelle: 'Posologie générale', table: 'posologies_generales', card: 1, fk: 'posologie_generale_id', actif: true },
    { code: 'grossesse_allaitement', libelle: 'Grossesse & allaitement', table: 'grossesse_allaitement', card: 1, fk: 'grossesse_allaitement_id', actif: true },
    { code: 'indications', libelle: 'Indications', table: 'indications', card: 'N', liaison: 'matrice_indications', liaisonFk: 'indication_id', actif: true },
    { code: 'contre_indications', libelle: 'Contre-indications', table: 'contre_indications', card: 'N', liaison: 'matrice_contre_indications', liaisonFk: 'contre_indication_id', actif: true },
    { code: 'effets_indesirables', libelle: 'Effets indésirables', table: 'effets_indesirables', card: 'N', liaison: 'matrice_effets_indesirables', liaisonFk: 'effet_indesirable_id', actif: true },
    { code: 'precautions_emploi', libelle: 'Précautions d’emploi', table: 'precautions_emploi', card: 'N', liaison: 'matrice_precautions_emploi', liaisonFk: 'precaution_emploi_id', actif: true },
    { code: 'interactions', libelle: 'Interactions', table: 'interactions', card: 'N', liaison: 'matrice_interactions', liaisonFk: 'interaction_id', actif: true },
    { code: 'surveillances', libelle: 'Surveillances', table: 'surveillances', card: 'N', liaison: 'matrice_surveillances', liaisonFk: 'surveillance_id', actif: true },
    { code: 'voies_administration', libelle: 'Voies d’administration', table: 'voies_administration', card: 'N', liaison: 'matrice_voies_administration', liaisonFk: 'voie_administration_id', actif: true },
    { code: 'conditions_prescription_delivrance', libelle: 'Conditions prescription / délivrance', table: 'conditions_prescription_delivrance', card: 'N', liaison: 'matrice_conditions_prescription_delivrance', liaisonFk: 'condition_prescription_delivrance_id', actif: true },
    { code: 'conseils_delivrance', libelle: 'Conseils de délivrance', table: 'conseils_delivrance', card: 'N', liaison: 'matrice_conseils_delivrance', liaisonFk: 'conseil_delivrance_id', actif: true },
  ];

  function champsActifs() {
    return CHAMP_CODES.filter((c) => c.actif !== false);
  }

  function isChampActif(code) {
    const c = CHAMP_CODES.find((x) => x.code === code);
    return !!(c && c.actif !== false);
  }

  const ENTITY_TABLES = CHAMP_CODES.map((c) => ({
    table: c.table,
    libelle: c.libelle,
    code: c.code,
    card: c.card,
    actif: c.actif !== false,
  }));

  const STATUTS_FICHE = [
    { code: 'brouillon', libelle: 'Brouillon' },
    { code: 'publie', libelle: 'Publié' },
    { code: 'archive', libelle: 'Archivé' },
  ];

  const QUIZ_MODES = [
    { code: 'entrainement', libelle: 'Entraînement' },
    { code: 'evaluation', libelle: 'Évaluation' },
  ];

  /** Même palette que le carrousel de leçon (composant 0…n). */
  const ASSO_PALETTE = [
    { bg: '#dbeafe', fg: '#1e3a8a', border: '#3b82f6' },
    { bg: '#fce7f3', fg: '#9d174d', border: '#ec4899' },
    { bg: '#dcfce7', fg: '#14532d', border: '#22c55e' },
    { bg: '#ffedd5', fg: '#9a3412', border: '#f97316' },
    { bg: '#e0e7ff', fg: '#3730a3', border: '#6366f1' },
  ];
  const ASSO_BLEND = { bg: '#ede9fe', fg: '#5b21b6', border: '#8b5cf6' };

  function assoNorm(s) {
    return String(s || '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function assoTone(comp, index) {
    const i = Number(index) || 0;
    if (comp && comp.couleur && /^#[0-9a-f]{3,8}$/i.test(String(comp.couleur).trim())) {
      const hex = String(comp.couleur).trim();
      return { bg: hex + '22', fg: hex, border: hex };
    }
    return ASSO_PALETTE[i % ASSO_PALETTE.length];
  }

  function assoTones(indexes, comps) {
    return (indexes || []).map((i) => assoTone(comps && comps[i], i));
  }

  /** CSS inline. Plusieurs tons = bandes de toutes les couleurs. */
  function assoStyle(tones) {
    const list = (tones || []).filter((t) => t && t.bg && t.fg && t.border);
    if (!list.length) return '';
    if (list.length === 1) {
      const t = list[0];
      return 'background:' + t.bg + ';color:' + t.fg + ';border:1px solid ' + t.border;
    }
    const n = list.length;
    const stops = list.map((t, i) => {
      const a = ((i / n) * 100).toFixed(2);
      const b = (((i + 1) / n) * 100).toFixed(2);
      return t.bg + ' ' + a + '%,' + t.bg + ' ' + b + '%';
    }).join(',');
    return 'background:linear-gradient(90deg,' + stops + ');color:#1e293b;border:1px solid ' + list[0].border;
  }

  /**
   * Regroupe les valeurs amenées par les molécules séparées.
   * Même libellé → une seule entrée, `indexes` = toutes les sources.
   * @param {Array<{champ:string,id?:string,label:string,index?:number,own?:boolean,on?:boolean}>} entries
   */
  function groupHeritage(entries) {
    const byChamp = new Map();
    (entries || []).forEach((e) => {
      if (!e || !e.champ || e.champ === 'dci' || e.champ === 'nom_commercial') return;
      const label = String(e.label || '').trim();
      if (!label) return;
      const key = assoNorm(label) || String(e.id || '');
      if (!key) return;
      if (!byChamp.has(e.champ)) byChamp.set(e.champ, new Map());
      const map = byChamp.get(e.champ);
      let row = map.get(key);
      if (!row) {
        row = { id: e.id, label, indexes: [], own: false, on: false };
        map.set(key, row);
      }
      if (e.index != null && row.indexes.indexOf(e.index) < 0) row.indexes.push(e.index);
      if (e.own) row.own = true;
      if (e.on) row.on = true;
      if (label.length > String(row.label || '').length) row.label = label;
    });
    const out = {};
    byChamp.forEach((map, code) => { out[code] = Array.from(map.values()); });
    return out;
  }

  global.JpConstants = {
    CHAMP_CODES,
    champsActifs,
    isChampActif,
    ENTITY_TABLES,
    STATUTS_FICHE,
    QUIZ_MODES,
    ASSO_PALETTE,
    ASSO_BLEND,
    assoNorm,
    assoTone,
    assoTones,
    assoStyle,
    groupHeritage,
  };
})(window);
