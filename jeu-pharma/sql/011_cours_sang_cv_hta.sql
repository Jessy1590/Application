-- Jeu Pharma — 011 : compléments cours Sang / CV / HTA
-- Sources : ppt/slides/*.xml (pas d'OCR). Aucune donnée inventée.
-- Réutilise les entités par valeur_norm. Ne change pas niveaux_connus des fiches
-- existantes, sauf thrombolytiques explicitement « réservés à l'usage hospitalier ».
-- Niveaux des entités NOUVELLES = ceux d'une entité sœur déjà en base (cours muet).
-- Ne pas réappliquer sans vérifier : les INSERT sont idempotents (NOT EXISTS).

-- ---------------------------------------------------------------------------
-- Classes manquantes (libellés du cours, sœurs de « classe 1 / 3 »)
-- ---------------------------------------------------------------------------

INSERT INTO jeupharma.classes_pharmacologiques (valeur, niveaux_connus)
SELECT v.valeur, src.niveaux_connus
FROM (VALUES
  ('Anti-arythmiques de classe 2'),
  ('Anti-arythmiques de classe 4'),
  ('Inhibiteurs de la thrombine (IIa)')
) AS v(valeur)
CROSS JOIN LATERAL (
  SELECT niveaux_connus
  FROM jeupharma.classes_pharmacologiques
  WHERE valeur = 'Anti-arythmiques de classe 3' AND actif
  LIMIT 1
) src
WHERE NOT EXISTS (
  SELECT 1 FROM jeupharma.classes_pharmacologiques c
  WHERE c.actif AND c.valeur_norm = jeupharma.normaliser_valeur(v.valeur)
);

-- Sotalol : bêtabloquant (cours HTA + « propriétés des classes 2 et 3 »)
INSERT INTO jeupharma.matrice_classes_pharmacologiques (matrice_id, classe_pharmacologique_id, ordre)
SELECT m.id, c.id, COALESCE((SELECT max(j.ordre) + 1 FROM jeupharma.matrice_classes_pharmacologiques j WHERE j.matrice_id = m.id), 0)
FROM jeupharma.matrice_medicaments m
JOIN jeupharma.dcis d ON d.id = m.dci_id AND d.valeur = 'Sotalol'
JOIN jeupharma.classes_pharmacologiques c ON c.actif AND c.valeur = 'Bêtabloquants'
WHERE m.statut <> 'archive'
  AND NOT EXISTS (
    SELECT 1 FROM jeupharma.matrice_classes_pharmacologiques x
    WHERE x.matrice_id = m.id AND x.classe_pharmacologique_id = c.id
  );

-- Bêtabloquants du cours = anti-arythmiques de classe 2 (Vaughan-Williams)
INSERT INTO jeupharma.matrice_classes_pharmacologiques (matrice_id, classe_pharmacologique_id, ordre)
SELECT m.id, c.id, COALESCE((SELECT max(j.ordre) + 1 FROM jeupharma.matrice_classes_pharmacologiques j WHERE j.matrice_id = m.id), 0)
FROM jeupharma.matrice_medicaments m
JOIN jeupharma.classes_pharmacologiques c ON c.actif AND c.valeur = 'Anti-arythmiques de classe 2'
WHERE m.statut <> 'archive'
  AND EXISTS (
    SELECT 1
    FROM jeupharma.matrice_classes_pharmacologiques j
    JOIN jeupharma.classes_pharmacologiques bb ON bb.id = j.classe_pharmacologique_id AND bb.valeur = 'Bêtabloquants'
    WHERE j.matrice_id = m.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM jeupharma.matrice_classes_pharmacologiques x
    WHERE x.matrice_id = m.id AND x.classe_pharmacologique_id = c.id
  );

-- Vérapamil, diltiazem : classe 4 + classe thérapeutique anti-arythmiques
INSERT INTO jeupharma.matrice_classes_pharmacologiques (matrice_id, classe_pharmacologique_id, ordre)
SELECT m.id, c.id, COALESCE((SELECT max(j.ordre) + 1 FROM jeupharma.matrice_classes_pharmacologiques j WHERE j.matrice_id = m.id), 0)
FROM jeupharma.matrice_medicaments m
JOIN jeupharma.dcis d ON d.id = m.dci_id AND d.valeur IN ('Vérapamil', 'Diltiazem')
JOIN jeupharma.classes_pharmacologiques c ON c.actif AND c.valeur = 'Anti-arythmiques de classe 4'
WHERE m.statut <> 'archive'
  AND NOT EXISTS (
    SELECT 1 FROM jeupharma.matrice_classes_pharmacologiques x
    WHERE x.matrice_id = m.id AND x.classe_pharmacologique_id = c.id
  );

INSERT INTO jeupharma.matrice_classes_therapeutiques (matrice_id, classe_therapeutique_id, ordre)
SELECT m.id, c.id, COALESCE((SELECT max(j.ordre) + 1 FROM jeupharma.matrice_classes_therapeutiques j WHERE j.matrice_id = m.id), 0)
FROM jeupharma.matrice_medicaments m
JOIN jeupharma.dcis d ON d.id = m.dci_id AND d.valeur IN ('Vérapamil', 'Diltiazem')
JOIN jeupharma.classes_therapeutiques c ON c.actif AND c.valeur = 'Anti-arythmiques'
WHERE m.statut <> 'archive'
  AND NOT EXISTS (
    SELECT 1 FROM jeupharma.matrice_classes_therapeutiques x
    WHERE x.matrice_id = m.id AND x.classe_therapeutique_id = c.id
  );

-- Trinitrine : dérivé nitré d'action immédiate ET prolongée
INSERT INTO jeupharma.matrice_classes_pharmacologiques (matrice_id, classe_pharmacologique_id, ordre)
SELECT m.id, c.id, COALESCE((SELECT max(j.ordre) + 1 FROM jeupharma.matrice_classes_pharmacologiques j WHERE j.matrice_id = m.id), 0)
FROM jeupharma.matrice_medicaments m
JOIN jeupharma.dcis d ON d.id = m.dci_id AND d.valeur = 'Trinitrine'
JOIN jeupharma.classes_pharmacologiques c ON c.actif AND c.valeur = 'Dérivés nitrés d''action immédiate'
WHERE m.statut <> 'archive'
  AND NOT EXISTS (
    SELECT 1 FROM jeupharma.matrice_classes_pharmacologiques x
    WHERE x.matrice_id = m.id AND x.classe_pharmacologique_id = c.id
  );

-- Dabigatran : inhibiteur de la thrombine (IIa), en plus de la classe AOD
INSERT INTO jeupharma.matrice_classes_pharmacologiques (matrice_id, classe_pharmacologique_id, ordre)
SELECT m.id, c.id, COALESCE((SELECT max(j.ordre) + 1 FROM jeupharma.matrice_classes_pharmacologiques j WHERE j.matrice_id = m.id), 0)
FROM jeupharma.matrice_medicaments m
JOIN jeupharma.dcis d ON d.id = m.dci_id AND d.valeur = 'Dabigatran étexilate'
JOIN jeupharma.classes_pharmacologiques c ON c.actif AND c.valeur = 'Inhibiteurs de la thrombine (IIa)'
WHERE m.statut <> 'archive'
  AND NOT EXISTS (
    SELECT 1 FROM jeupharma.matrice_classes_pharmacologiques x
    WHERE x.matrice_id = m.id AND x.classe_pharmacologique_id = c.id
  );

-- ---------------------------------------------------------------------------
-- Précautions nitrés (texte des diapositives) + arrêt brutal des bêtabloquants
-- ---------------------------------------------------------------------------

INSERT INTO jeupharma.precautions_emploi (valeur, niveaux_connus)
SELECT v.valeur, src.niveaux_connus
FROM (VALUES
  ('En cas de crise ou en prévention (avant un effort ou une exposition au froid brutale) : 1 pulvérisation sublinguale en position assise. Si pas d''amélioration, une 2e pulvérisation est possible au bout de quelques minutes. Si pas d''amélioration après la 2e prise, appeler le 15 (risque d''IDM)'),
  ('Dispositifs transdermiques prescrits de façon continue : respecter un intervalle de 8 à 12 heures entre 2 applications (sinon risque d''échappement thérapeutique)')
) AS v(valeur)
CROSS JOIN LATERAL (
  SELECT niveaux_connus
  FROM jeupharma.precautions_emploi
  WHERE valeur = 'Ne jamais interrompre brutalement le traitement' AND actif
  LIMIT 1
) src
WHERE NOT EXISTS (
  SELECT 1 FROM jeupharma.precautions_emploi p
  WHERE p.actif AND p.valeur_norm = jeupharma.normaliser_valeur(v.valeur)
);

INSERT INTO jeupharma.matrice_precautions_emploi (matrice_id, precaution_emploi_id, ordre)
SELECT m.id, p.id, COALESCE((SELECT max(j.ordre) + 1 FROM jeupharma.matrice_precautions_emploi j WHERE j.matrice_id = m.id), 0)
FROM jeupharma.matrice_medicaments m
JOIN jeupharma.dcis d ON d.id = m.dci_id AND d.valeur IN ('Trinitrine', 'Isosorbide dinitrate')
JOIN jeupharma.precautions_emploi p ON p.actif
  AND p.valeur_norm = jeupharma.normaliser_valeur('En cas de crise ou en prévention (avant un effort ou une exposition au froid brutale) : 1 pulvérisation sublinguale en position assise. Si pas d''amélioration, une 2e pulvérisation est possible au bout de quelques minutes. Si pas d''amélioration après la 2e prise, appeler le 15 (risque d''IDM)')
WHERE m.statut <> 'archive'
  AND NOT EXISTS (
    SELECT 1 FROM jeupharma.matrice_precautions_emploi x
    WHERE x.matrice_id = m.id AND x.precaution_emploi_id = p.id
  );

INSERT INTO jeupharma.matrice_precautions_emploi (matrice_id, precaution_emploi_id, ordre)
SELECT m.id, p.id, COALESCE((SELECT max(j.ordre) + 1 FROM jeupharma.matrice_precautions_emploi j WHERE j.matrice_id = m.id), 0)
FROM jeupharma.matrice_medicaments m
JOIN jeupharma.dcis d ON d.id = m.dci_id AND d.valeur = 'Trinitrine'
JOIN jeupharma.precautions_emploi p ON p.actif
  AND p.valeur_norm = jeupharma.normaliser_valeur('Dispositifs transdermiques prescrits de façon continue : respecter un intervalle de 8 à 12 heures entre 2 applications (sinon risque d''échappement thérapeutique)')
WHERE m.statut <> 'archive'
  AND NOT EXISTS (
    SELECT 1 FROM jeupharma.matrice_precautions_emploi x
    WHERE x.matrice_id = m.id AND x.precaution_emploi_id = p.id
  );

INSERT INTO jeupharma.matrice_precautions_emploi (matrice_id, precaution_emploi_id, ordre)
SELECT m.id, p.id, COALESCE((SELECT max(j.ordre) + 1 FROM jeupharma.matrice_precautions_emploi j WHERE j.matrice_id = m.id), 0)
FROM jeupharma.matrice_medicaments m
JOIN jeupharma.precautions_emploi p ON p.actif AND p.valeur = 'Ne jamais interrompre brutalement le traitement'
WHERE m.statut <> 'archive'
  AND EXISTS (
    SELECT 1
    FROM jeupharma.matrice_classes_pharmacologiques j
    JOIN jeupharma.classes_pharmacologiques bb ON bb.id = j.classe_pharmacologique_id AND bb.valeur = 'Bêtabloquants'
    WHERE j.matrice_id = m.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM jeupharma.matrice_precautions_emploi x
    WHERE x.matrice_id = m.id AND x.precaution_emploi_id = p.id
  );

-- ---------------------------------------------------------------------------
-- Indications explicitement enseignées et encore absentes
-- ---------------------------------------------------------------------------

INSERT INTO jeupharma.indications (valeur, niveaux_connus)
SELECT 'Traitement de l''angor', src.niveaux_connus
FROM jeupharma.indications src
WHERE src.actif AND src.valeur = 'Traitement de la crise d''angor'
  AND NOT EXISTS (
    SELECT 1 FROM jeupharma.indications i
    WHERE i.actif AND i.valeur_norm = jeupharma.normaliser_valeur('Traitement de l''angor')
  )
LIMIT 1;

INSERT INTO jeupharma.matrice_indications (matrice_id, indication_id, ordre)
SELECT m.id, i.id, COALESCE((SELECT max(j.ordre) + 1 FROM jeupharma.matrice_indications j WHERE j.matrice_id = m.id), 0)
FROM jeupharma.matrice_medicaments m
JOIN jeupharma.dcis d ON d.id = m.dci_id AND d.valeur = 'Molsidomine'
JOIN jeupharma.indications i ON i.actif AND i.valeur = 'Traitement de l''angor'
WHERE m.statut <> 'archive'
  AND NOT EXISTS (
    SELECT 1 FROM jeupharma.matrice_indications x
    WHERE x.matrice_id = m.id AND x.indication_id = i.id
  );

INSERT INTO jeupharma.matrice_indications (matrice_id, indication_id, ordre)
SELECT m.id, i.id, COALESCE((SELECT max(j.ordre) + 1 FROM jeupharma.matrice_indications j WHERE j.matrice_id = m.id), 0)
FROM jeupharma.matrice_medicaments m
JOIN jeupharma.dcis d ON d.id = m.dci_id AND d.valeur = 'Amiodarone'
JOIN jeupharma.indications i ON i.actif AND i.valeur = 'Troubles du rythme cardiaque'
WHERE m.statut <> 'archive'
  AND NOT EXISTS (
    SELECT 1 FROM jeupharma.matrice_indications x
    WHERE x.matrice_id = m.id AND x.indication_id = i.id
  );

INSERT INTO jeupharma.matrice_indications (matrice_id, indication_id, ordre)
SELECT m.id, i.id, COALESCE((SELECT max(j.ordre) + 1 FROM jeupharma.matrice_indications j WHERE j.matrice_id = m.id), 0)
FROM jeupharma.matrice_medicaments m
JOIN jeupharma.dcis d ON d.id = m.dci_id AND d.valeur = 'Sacubitril + valsartan'
JOIN jeupharma.indications i ON i.actif AND i.valeur = 'Insuffisance cardiaque'
WHERE m.statut <> 'archive'
  AND NOT EXISTS (
    SELECT 1 FROM jeupharma.matrice_indications x
    WHERE x.matrice_id = m.id AND x.indication_id = i.id
  );

-- Fer + B9 : indications importantes de l'acide folique (cours), sans doublon
INSERT INTO jeupharma.matrice_indications (matrice_id, indication_id, ordre)
SELECT dest.id, src.indication_id, COALESCE((SELECT max(j.ordre) + 1 FROM jeupharma.matrice_indications j WHERE j.matrice_id = dest.id), 0)
FROM jeupharma.matrice_medicaments dest
JOIN jeupharma.dcis dd ON dd.id = dest.dci_id AND dd.valeur = 'Sels ferreux + acide folique'
JOIN jeupharma.matrice_medicaments orig
  ON orig.statut <> 'archive'
JOIN jeupharma.dcis od ON od.id = orig.dci_id AND od.valeur = 'Acide folique'
JOIN jeupharma.matrice_indications src ON src.matrice_id = orig.id
WHERE dest.statut <> 'archive'
  AND NOT EXISTS (
    SELECT 1 FROM jeupharma.matrice_indications x
    WHERE x.matrice_id = dest.id AND x.indication_id = src.indication_id
  );

-- ---------------------------------------------------------------------------
-- Nom commercial Bisoce (bisoprolol). Niveaux = ceux d'un nom déjà lié.
-- ---------------------------------------------------------------------------

INSERT INTO jeupharma.noms_commerciaux (valeur, niveaux_connus)
SELECT 'Bisoce', nc.niveaux_connus
FROM jeupharma.matrice_medicaments m
JOIN jeupharma.dcis d ON d.id = m.dci_id AND d.valeur = 'Bisoprolol'
JOIN jeupharma.matrice_noms_commerciaux mnc ON mnc.matrice_id = m.id
JOIN jeupharma.noms_commerciaux nc ON nc.id = mnc.nom_commercial_id AND nc.actif
WHERE m.statut <> 'archive'
  AND NOT EXISTS (
    SELECT 1 FROM jeupharma.noms_commerciaux x
    WHERE x.actif AND x.valeur_norm = jeupharma.normaliser_valeur('Bisoce')
  )
ORDER BY mnc.ordre
LIMIT 1;

INSERT INTO jeupharma.matrice_noms_commerciaux (matrice_id, nom_commercial_id, ordre)
SELECT m.id, nc.id, COALESCE((SELECT max(j.ordre) + 1 FROM jeupharma.matrice_noms_commerciaux j WHERE j.matrice_id = m.id), 0)
FROM jeupharma.matrice_medicaments m
JOIN jeupharma.dcis d ON d.id = m.dci_id AND d.valeur = 'Bisoprolol'
JOIN jeupharma.noms_commerciaux nc ON nc.actif AND nc.valeur = 'Bisoce'
WHERE m.statut <> 'archive'
  AND NOT EXISTS (
    SELECT 1 FROM jeupharma.matrice_noms_commerciaux x
    WHERE x.matrice_id = m.id AND x.nom_commercial_id = nc.id
  );

-- ---------------------------------------------------------------------------
-- Thrombolytiques : cours « réservés à l'usage hospitalier »
-- ---------------------------------------------------------------------------

UPDATE jeupharma.matrice_medicaments m
SET hospitalier = true
FROM jeupharma.dcis d
WHERE d.id = m.dci_id
  AND m.statut <> 'archive'
  AND d.valeur IN ('Altéplase', 'Ténectéplase', 'Rétéplase', 'Streptokinase', 'Urokinase')
  AND m.hospitalier IS NOT TRUE;

UPDATE jeupharma.dcis d
SET niveaux_connus = ARRAY['hospitalier']::text[]
FROM jeupharma.matrice_medicaments m
WHERE m.dci_id = d.id
  AND m.statut <> 'archive'
  AND d.valeur IN ('Altéplase', 'Ténectéplase', 'Rétéplase', 'Streptokinase', 'Urokinase')
  AND d.niveaux_connus IS DISTINCT FROM ARRAY['hospitalier']::text[];

UPDATE jeupharma.noms_commerciaux nc
SET niveaux_connus = ARRAY['hospitalier']::text[]
FROM jeupharma.matrice_noms_commerciaux mnc
JOIN jeupharma.matrice_medicaments m ON m.id = mnc.matrice_id
JOIN jeupharma.dcis d ON d.id = m.dci_id
WHERE mnc.nom_commercial_id = nc.id
  AND m.statut <> 'archive'
  AND d.valeur IN ('Altéplase', 'Ténectéplase', 'Rétéplase', 'Streptokinase', 'Urokinase')
  AND nc.niveaux_connus IS DISTINCT FROM ARRAY['hospitalier']::text[];

-- ---------------------------------------------------------------------------
-- Adrénaline : le cours distingue IV hospitalière et Anapen / Jext d'officine
-- ---------------------------------------------------------------------------

INSERT INTO jeupharma.details_pharmacologie (valeur, niveaux_connus)
SELECT
  'Adrénaline IV réservée à l''usage hospitalier. Anapen et Jext disponibles en officine, en IM, dans le choc anaphylactique',
  dp.niveaux_connus
FROM jeupharma.matrice_medicaments m
JOIN jeupharma.dcis d ON d.id = m.dci_id AND d.valeur = 'Adrénaline'
JOIN jeupharma.details_pharmacologie dp ON dp.id = m.detail_pharmacologie_id
WHERE m.statut <> 'archive'
  AND NOT EXISTS (
    SELECT 1 FROM jeupharma.details_pharmacologie x
    WHERE x.actif AND x.valeur_norm = jeupharma.normaliser_valeur(
      'Adrénaline IV réservée à l''usage hospitalier. Anapen et Jext disponibles en officine, en IM, dans le choc anaphylactique'
    )
  )
LIMIT 1;

UPDATE jeupharma.matrice_medicaments m
SET detail_pharmacologie_id = dp.id
FROM jeupharma.dcis d, jeupharma.details_pharmacologie dp
WHERE d.id = m.dci_id
  AND d.valeur = 'Adrénaline'
  AND m.statut <> 'archive'
  AND dp.actif
  AND dp.valeur_norm = jeupharma.normaliser_valeur(
    'Adrénaline IV réservée à l''usage hospitalier. Anapen et Jext disponibles en officine, en IM, dans le choc anaphylactique'
  );

-- ---------------------------------------------------------------------------
-- Associations : cumuler CI, EI, précautions, interactions, surveillances
-- des molécules enseignées (pas les indications hors chapitre de l'association)
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE cours_assoc (
  assoc text NOT NULL,
  comp text NOT NULL
) ON COMMIT DROP;

INSERT INTO cours_assoc (assoc, comp) VALUES
  ('Amiloride + furosémide', 'Amiloride'),
  ('Amiloride + furosémide', 'Furosémide'),
  ('Amiloride + hydrochlorothiazide', 'Amiloride'),
  ('Amiloride + hydrochlorothiazide', 'Hydrochlorothiazide'),
  ('Amlodipine + atorvastatine', 'Amlodipine'),
  ('Amlodipine + indapamide', 'Amlodipine'),
  ('Amlodipine + indapamide', 'Indapamide'),
  ('Aténolol + chlortalidone', 'Aténolol'),
  ('Aténolol + nifédipine', 'Aténolol'),
  ('Aténolol + nifédipine', 'Nifédipine'),
  ('Bénazépril + hydrochlorothiazide', 'Bénazépril'),
  ('Bénazépril + hydrochlorothiazide', 'Hydrochlorothiazide'),
  ('Bisoprolol + hydrochlorothiazide', 'Bisoprolol'),
  ('Bisoprolol + hydrochlorothiazide', 'Hydrochlorothiazide'),
  ('Candésartan + hydrochlorothiazide', 'Candésartan'),
  ('Candésartan + hydrochlorothiazide', 'Hydrochlorothiazide'),
  ('Captopril + hydrochlorothiazide', 'Captopril'),
  ('Captopril + hydrochlorothiazide', 'Hydrochlorothiazide'),
  ('Clopidogrel + aspirine', 'Clopidogrel'),
  ('Clopidogrel + aspirine', 'Acide acétylsalicylique'),
  ('Énalapril + hydrochlorothiazide', 'Enalapril'),
  ('Énalapril + hydrochlorothiazide', 'Hydrochlorothiazide'),
  ('Énalapril + lercanidipine', 'Enalapril'),
  ('Énalapril + lercanidipine', 'Lercanidipine'),
  ('Félodipine + métoprolol', 'Félodipine'),
  ('Félodipine + métoprolol', 'Métoprolol'),
  ('Fosinopril + hydrochlorothiazide', 'Fosinopril'),
  ('Fosinopril + hydrochlorothiazide', 'Hydrochlorothiazide'),
  ('Irbésartan + amlodipine', 'Irbésartan'),
  ('Irbésartan + amlodipine', 'Amlodipine'),
  ('Irbésartan + hydrochlorothiazide', 'Irbésartan'),
  ('Irbésartan + hydrochlorothiazide', 'Hydrochlorothiazide'),
  ('Lisinopril + hydrochlorothiazide', 'Lisinopril'),
  ('Lisinopril + hydrochlorothiazide', 'Hydrochlorothiazide'),
  ('Losartan + hydrochlorothiazide', 'Losartan'),
  ('Losartan + hydrochlorothiazide', 'Hydrochlorothiazide'),
  ('Métoprolol + chlortalidone', 'Métoprolol'),
  ('Nébivolol + hydrochlorothiazide', 'Nébivolol'),
  ('Nébivolol + hydrochlorothiazide', 'Hydrochlorothiazide'),
  ('Olmésartan + amlodipine', 'Olmésartan'),
  ('Olmésartan + amlodipine', 'Amlodipine'),
  ('Olmésartan + hydrochlorothiazide', 'Olmésartan'),
  ('Olmésartan + hydrochlorothiazide', 'Hydrochlorothiazide'),
  ('Périndopril + amlodipine', 'Perindopril'),
  ('Périndopril + amlodipine', 'Amlodipine'),
  ('Périndopril + indapamide', 'Perindopril'),
  ('Périndopril + indapamide', 'Indapamide'),
  ('Quinapril + hydrochlorothiazide', 'Quinapril'),
  ('Quinapril + hydrochlorothiazide', 'Hydrochlorothiazide'),
  ('Ramipril + amlodipine', 'Ramipril'),
  ('Ramipril + amlodipine', 'Amlodipine'),
  ('Ramipril + hydrochlorothiazide', 'Ramipril'),
  ('Ramipril + hydrochlorothiazide', 'Hydrochlorothiazide'),
  ('Sacubitril + valsartan', 'Valsartan'),
  ('Spironolactone + altizide', 'Spironolactone'),
  ('Telmisartan + amlodipine', 'Telmisartan'),
  ('Telmisartan + amlodipine', 'Amlodipine'),
  ('Telmisartan + hydrochlorothiazide', 'Telmisartan'),
  ('Telmisartan + hydrochlorothiazide', 'Hydrochlorothiazide'),
  ('Timolol + amiloride + hydrochlorothiazide', 'Timolol'),
  ('Timolol + amiloride + hydrochlorothiazide', 'Amiloride'),
  ('Timolol + amiloride + hydrochlorothiazide', 'Hydrochlorothiazide'),
  ('Triamtérène + hydrochlorothiazide', 'Amiloride'),
  ('Triamtérène + hydrochlorothiazide', 'Hydrochlorothiazide'),
  ('Triamtérène + méthyclothiazide', 'Amiloride'),
  ('Valsartan + amlodipine', 'Valsartan'),
  ('Valsartan + amlodipine', 'Amlodipine'),
  ('Valsartan + hydrochlorothiazide', 'Valsartan'),
  ('Valsartan + hydrochlorothiazide', 'Hydrochlorothiazide'),
  ('Vérapamil + trandolapril', 'Vérapamil'),
  ('Vérapamil + trandolapril', 'Trandolapril'),
  ('Zofénopril + hydrochlorothiazide', 'Zofénopril'),
  ('Zofénopril + hydrochlorothiazide', 'Hydrochlorothiazide');

-- Énalapril : la DCI mono est « Enalapril » sans accent dans la base
-- (les associations portent l'accent). Le mapping ci-dessus utilise la DCI mono.

INSERT INTO jeupharma.matrice_contre_indications (matrice_id, contre_indication_id, ordre)
SELECT DISTINCT dest.id, src.contre_indication_id, 0
FROM cours_assoc map
JOIN jeupharma.dcis da ON da.valeur = map.assoc
JOIN jeupharma.matrice_medicaments dest ON dest.dci_id = da.id AND dest.statut <> 'archive'
JOIN jeupharma.dcis dc ON dc.valeur = map.comp
JOIN jeupharma.matrice_medicaments orig ON orig.dci_id = dc.id AND orig.statut <> 'archive'
JOIN jeupharma.matrice_contre_indications src ON src.matrice_id = orig.id
WHERE NOT EXISTS (
  SELECT 1 FROM jeupharma.matrice_contre_indications x
  WHERE x.matrice_id = dest.id AND x.contre_indication_id = src.contre_indication_id
)
ON CONFLICT DO NOTHING;

INSERT INTO jeupharma.matrice_effets_indesirables (matrice_id, effet_indesirable_id, ordre)
SELECT DISTINCT dest.id, src.effet_indesirable_id, 0
FROM cours_assoc map
JOIN jeupharma.dcis da ON da.valeur = map.assoc
JOIN jeupharma.matrice_medicaments dest ON dest.dci_id = da.id AND dest.statut <> 'archive'
JOIN jeupharma.dcis dc ON dc.valeur = map.comp
JOIN jeupharma.matrice_medicaments orig ON orig.dci_id = dc.id AND orig.statut <> 'archive'
JOIN jeupharma.matrice_effets_indesirables src ON src.matrice_id = orig.id
WHERE NOT EXISTS (
  SELECT 1 FROM jeupharma.matrice_effets_indesirables x
  WHERE x.matrice_id = dest.id AND x.effet_indesirable_id = src.effet_indesirable_id
)
ON CONFLICT DO NOTHING;

INSERT INTO jeupharma.matrice_precautions_emploi (matrice_id, precaution_emploi_id, ordre)
SELECT DISTINCT dest.id, src.precaution_emploi_id, 0
FROM cours_assoc map
JOIN jeupharma.dcis da ON da.valeur = map.assoc
JOIN jeupharma.matrice_medicaments dest ON dest.dci_id = da.id AND dest.statut <> 'archive'
JOIN jeupharma.dcis dc ON dc.valeur = map.comp
JOIN jeupharma.matrice_medicaments orig ON orig.dci_id = dc.id AND orig.statut <> 'archive'
JOIN jeupharma.matrice_precautions_emploi src ON src.matrice_id = orig.id
WHERE NOT EXISTS (
  SELECT 1 FROM jeupharma.matrice_precautions_emploi x
  WHERE x.matrice_id = dest.id AND x.precaution_emploi_id = src.precaution_emploi_id
)
ON CONFLICT DO NOTHING;

INSERT INTO jeupharma.matrice_interactions (matrice_id, interaction_id, ordre)
SELECT DISTINCT dest.id, src.interaction_id, 0
FROM cours_assoc map
JOIN jeupharma.dcis da ON da.valeur = map.assoc
JOIN jeupharma.matrice_medicaments dest ON dest.dci_id = da.id AND dest.statut <> 'archive'
JOIN jeupharma.dcis dc ON dc.valeur = map.comp
JOIN jeupharma.matrice_medicaments orig ON orig.dci_id = dc.id AND orig.statut <> 'archive'
JOIN jeupharma.matrice_interactions src ON src.matrice_id = orig.id
WHERE NOT EXISTS (
  SELECT 1 FROM jeupharma.matrice_interactions x
  WHERE x.matrice_id = dest.id AND x.interaction_id = src.interaction_id
)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Digoxine : indications et CI graves absentes du cours
-- Source : RCP BDPM CIS 67681303 (DIGOXINE NATIVELLE 0,25 mg), rubriques 4.1 et 4.3
-- ---------------------------------------------------------------------------

INSERT INTO jeupharma.indications (valeur, niveaux_connus)
SELECT
  'Troubles du rythme supraventriculaire : ralentissement ou réduction de la fibrillation auriculaire ou du flutter auriculaire',
  src.niveaux_connus
FROM jeupharma.indications src
WHERE src.actif AND src.valeur = 'Insuffisance cardiaque'
  AND NOT EXISTS (
    SELECT 1 FROM jeupharma.indications i
    WHERE i.actif AND i.valeur_norm = jeupharma.normaliser_valeur(
      'Troubles du rythme supraventriculaire : ralentissement ou réduction de la fibrillation auriculaire ou du flutter auriculaire'
    )
  )
LIMIT 1;

INSERT INTO jeupharma.matrice_indications (matrice_id, indication_id, ordre)
SELECT m.id, i.id, COALESCE((SELECT max(j.ordre) + 1 FROM jeupharma.matrice_indications j WHERE j.matrice_id = m.id), 0)
FROM jeupharma.matrice_medicaments m
JOIN jeupharma.dcis d ON d.id = m.dci_id AND d.valeur = 'Digoxine'
JOIN jeupharma.indications i ON i.actif AND i.valeur IN (
  'Insuffisance cardiaque',
  'Troubles du rythme supraventriculaire : ralentissement ou réduction de la fibrillation auriculaire ou du flutter auriculaire'
)
WHERE m.statut <> 'archive'
  AND NOT EXISTS (
    SELECT 1 FROM jeupharma.matrice_indications x
    WHERE x.matrice_id = m.id AND x.indication_id = i.id
  );

INSERT INTO jeupharma.contre_indications (valeur, niveaux_connus)
SELECT v.valeur, src.niveaux_connus
FROM (VALUES
  ('Hyperexcitabilité ventriculaire (extrasystoles) survenant encore sous digitalique'),
  ('Fibrillation auriculaire associée à un syndrome de Wolff-Parkinson-White'),
  ('Tachycardie et fibrillation ventriculaires'),
  ('Association au sultopride, aux sels de calcium par voie IV et au millepertuis')
) AS v(valeur)
CROSS JOIN LATERAL (
  SELECT niveaux_connus FROM jeupharma.indications
  WHERE actif AND valeur = 'Insuffisance cardiaque'
  LIMIT 1
) src
WHERE NOT EXISTS (
  SELECT 1 FROM jeupharma.contre_indications c
  WHERE c.actif AND c.valeur_norm = jeupharma.normaliser_valeur(v.valeur)
);

INSERT INTO jeupharma.matrice_contre_indications (matrice_id, contre_indication_id, ordre)
SELECT m.id, c.id, COALESCE((SELECT max(j.ordre) + 1 FROM jeupharma.matrice_contre_indications j WHERE j.matrice_id = m.id), 0)
FROM jeupharma.matrice_medicaments m
JOIN jeupharma.dcis d ON d.id = m.dci_id AND d.valeur = 'Digoxine'
JOIN jeupharma.contre_indications c ON c.actif AND c.valeur IN (
  'Hyperexcitabilité ventriculaire (extrasystoles) survenant encore sous digitalique',
  'Fibrillation auriculaire associée à un syndrome de Wolff-Parkinson-White',
  'Tachycardie et fibrillation ventriculaires',
  'Association au sultopride, aux sels de calcium par voie IV et au millepertuis'
)
WHERE m.statut <> 'archive'
  AND NOT EXISTS (
    SELECT 1 FROM jeupharma.matrice_contre_indications x
    WHERE x.matrice_id = m.id AND x.contre_indication_id = c.id
  );

INSERT INTO jeupharma.matrice_surveillances (matrice_id, surveillance_id, ordre)
SELECT DISTINCT dest.id, src.surveillance_id, 0
FROM cours_assoc map
JOIN jeupharma.dcis da ON da.valeur = map.assoc
JOIN jeupharma.matrice_medicaments dest ON dest.dci_id = da.id AND dest.statut <> 'archive'
JOIN jeupharma.dcis dc ON dc.valeur = map.comp
JOIN jeupharma.matrice_medicaments orig ON orig.dci_id = dc.id AND orig.statut <> 'archive'
JOIN jeupharma.matrice_surveillances src ON src.matrice_id = orig.id
WHERE NOT EXISTS (
  SELECT 1 FROM jeupharma.matrice_surveillances x
  WHERE x.matrice_id = dest.id AND x.surveillance_id = src.surveillance_id
)
ON CONFLICT DO NOTHING;
