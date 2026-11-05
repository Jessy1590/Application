/* V3Champs — catalogue des champs pédagogiques. */
(function (global) {
  const LIST = [
    { code: 'dci', label: 'DCI', court: 'DCI', identite: true },
    { code: 'nom_commercial', label: 'Noms commerciaux', court: 'Noms', identite: true },
    { code: 'secteur_therapeutique', label: 'Secteur thérapeutique', court: 'Secteur', identite: false },
    { code: 'classe_therapeutique', label: 'Classe thérapeutique', court: 'Classe théra.', identite: false },
    { code: 'classe_pharmacologique', label: 'Classe pharmacologique', court: 'Classe pharma.', identite: false },
    { code: 'detail_pharmacologie', label: 'Détail pharmacologie', court: 'Détail', identite: false },
    { code: 'posologie_generale', label: 'Posologie générale', court: 'Posologie', identite: false },
    { code: 'grossesse_allaitement', label: 'Grossesse & allaitement', court: 'Grossesse', identite: false },
    { code: 'indications', label: 'Indications', court: 'Indications', identite: false },
    { code: 'contre_indications', label: 'Contre-indications', court: 'CI', identite: false },
    { code: 'effets_indesirables', label: 'Effets indésirables', court: 'EI', identite: false },
    { code: 'precautions_emploi', label: 'Précautions d’emploi', court: 'Précautions', identite: false },
    { code: 'interactions', label: 'Interactions', court: 'Interactions', identite: false },
    { code: 'surveillances', label: 'Surveillances', court: 'Surveillances', identite: false },
    { code: 'voies_administration', label: 'Voies d’administration', court: 'Voies', identite: false },
    { code: 'conditions_prescription_delivrance', label: 'Conditions prescription / délivrance', court: 'CPD', identite: false },
    { code: 'conseils_delivrance', label: 'Conseils de délivrance', court: 'Conseils', identite: false },
  ];

  const BY = {};
  LIST.forEach(function (c) { BY[c.code] = c; });

  function label(code) {
    return (BY[code] && BY[code].label) || code;
  }

  function valeurs(mol, code) {
    if (!mol || !mol.valeurs) return [];
    const v = mol.valeurs[code];
    return Array.isArray(v) ? v.slice() : [];
  }

  function presents(mols) {
    const out = [];
    LIST.forEach(function (c) {
      const ok = (mols || []).some(function (m) { return valeurs(m, c.code).length > 0; });
      if (ok) out.push(c.code);
    });
    return out;
  }

  global.V3Champs = {
    list: LIST,
    label: label,
    presents: presents,
    valeurs: valeurs,
  };
})(window);
