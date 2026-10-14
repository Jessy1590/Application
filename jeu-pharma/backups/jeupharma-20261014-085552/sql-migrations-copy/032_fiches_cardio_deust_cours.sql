-- =============================================================================
-- 032 : Fiches molécules manquantes / incomplètes — CardioVasculaires Deust 2A
-- Source : extraits cours (.cursor/docs/cours-extract/*.txt) UNIQUEMENT.
-- Rubrique muette dans le cours => laissée vide (jamais inventée).
-- Idempotent. Aucune RPC admin (migration exécutée hors session portail).
--
-- Contenu :
--   1. Nouvelles fiches : Acide ascorbique, Colécalciférol (Zymad),
--      Atorvastatine (BASIC post-IDM), Triamtérène (réactive la fiche archivée
--      sans nom ni champs, reconstruite à partir du cours HTA diapos 54-55).
--   2. Enrichissements cours : AOD (rivaroxaban, apixaban, fondaparinux) —
--      diapos 55 / 58 ; hémostatiques locaux — diapos 74-78.
--   3. Miroir `connaissances` (nom, DCI, secteur, classes, détail, indications,
--      CI, EI, précautions, interactions, surveillances) pour toute fiche
--      `publie` qui n'en a pas encore.
-- Non créées (absentes des supports) : lacidipine ; sclérosants (déjà archivés).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers temporaires (session uniquement)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.jp_ent(p_table text, p_valeur text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
  v_norm text := jeupharma.normaliser_valeur(p_valeur);
BEGIN
  EXECUTE format('SELECT id FROM jeupharma.%I WHERE valeur_norm = $1 AND actif LIMIT 1', p_table)
    INTO v_id USING v_norm;
  IF v_id IS NULL THEN
    EXECUTE format('INSERT INTO jeupharma.%I (valeur, valeur_norm) VALUES ($1, $2) RETURNING id', p_table)
      INTO v_id USING p_valeur, v_norm;
  END IF;
  RETURN v_id;
END $$;

-- champ : secteurs | ct | cp | ind | ci | ei | pre | inter | surv | noms
CREATE OR REPLACE FUNCTION pg_temp.jp_fill(p_matrice uuid, p_champ text, p_vals text[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_tbl text; v_jt text; v_fk text; v_id uuid; i int;
BEGIN
  SELECT t.ent, t.jt, t.fk INTO v_tbl, v_jt, v_fk FROM (VALUES
    ('secteurs','secteurs_therapeutiques','matrice_secteurs_therapeutiques','secteur_therapeutique_id'),
    ('ct','classes_therapeutiques','matrice_classes_therapeutiques','classe_therapeutique_id'),
    ('cp','classes_pharmacologiques','matrice_classes_pharmacologiques','classe_pharmacologique_id'),
    ('ind','indications','matrice_indications','indication_id'),
    ('ci','contre_indications','matrice_contre_indications','contre_indication_id'),
    ('ei','effets_indesirables','matrice_effets_indesirables','effet_indesirable_id'),
    ('pre','precautions_emploi','matrice_precautions_emploi','precaution_emploi_id'),
    ('inter','interactions','matrice_interactions','interaction_id'),
    ('surv','surveillances','matrice_surveillances','surveillance_id'),
    ('noms','noms_commerciaux','matrice_noms_commerciaux','nom_commercial_id')
  ) AS t(champ, ent, jt, fk) WHERE t.champ = p_champ;
  IF v_tbl IS NULL THEN RAISE EXCEPTION 'champ inconnu %', p_champ; END IF;

  IF p_vals IS NULL THEN RETURN; END IF;
  FOR i IN 1 .. coalesce(array_length(p_vals, 1), 0) LOOP
    v_id := pg_temp.jp_ent(v_tbl, p_vals[i]);
    EXECUTE format(
      'INSERT INTO jeupharma.%I (matrice_id, %I, ordre)
       SELECT $1, $2, $3
       WHERE NOT EXISTS (SELECT 1 FROM jeupharma.%I WHERE matrice_id = $1 AND %I = $2)',
      v_jt, v_fk, v_jt, v_fk) USING p_matrice, v_id, i - 1;
  END LOOP;
END $$;

-- Fiche par DCI : réutilise l'active, sinon réactive l'archivée (vidée), sinon crée.
CREATE OR REPLACE FUNCTION pg_temp.jp_matrice(p_dci text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_dci uuid := pg_temp.jp_ent('dcis', p_dci);
  v_m uuid;
BEGIN
  SELECT id INTO v_m FROM jeupharma.matrice_medicaments
  WHERE dci_id = v_dci AND statut <> 'archive' LIMIT 1;
  IF v_m IS NOT NULL THEN RETURN v_m; END IF;

  SELECT id INTO v_m FROM jeupharma.matrice_medicaments
  WHERE dci_id = v_dci AND statut = 'archive' ORDER BY created_at LIMIT 1;
  IF v_m IS NOT NULL THEN
    DELETE FROM jeupharma.matrice_secteurs_therapeutiques WHERE matrice_id = v_m;
    DELETE FROM jeupharma.matrice_classes_therapeutiques WHERE matrice_id = v_m;
    DELETE FROM jeupharma.matrice_classes_pharmacologiques WHERE matrice_id = v_m;
    DELETE FROM jeupharma.matrice_indications WHERE matrice_id = v_m;
    DELETE FROM jeupharma.matrice_contre_indications WHERE matrice_id = v_m;
    DELETE FROM jeupharma.matrice_effets_indesirables WHERE matrice_id = v_m;
    DELETE FROM jeupharma.matrice_precautions_emploi WHERE matrice_id = v_m;
    DELETE FROM jeupharma.matrice_interactions WHERE matrice_id = v_m;
    DELETE FROM jeupharma.matrice_surveillances WHERE matrice_id = v_m;
    DELETE FROM jeupharma.matrice_noms_commerciaux WHERE matrice_id = v_m;
    UPDATE jeupharma.matrice_medicaments
    SET statut = 'publie', secteur_therapeutique_id = NULL, classe_therapeutique_id = NULL,
        classe_pharmacologique_id = NULL, detail_pharmacologie_id = NULL,
        fiche_validee = false, updated_at = now()
    WHERE id = v_m;
    RETURN v_m;
  END IF;

  INSERT INTO jeupharma.matrice_medicaments (dci_id, statut)
  VALUES (v_dci, 'publie') RETURNING id INTO v_m;
  RETURN v_m;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.jp_detail(p_matrice uuid, p_valeur text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE jeupharma.matrice_medicaments
  SET detail_pharmacologie_id = pg_temp.jp_ent('details_pharmacologie', p_valeur), updated_at = now()
  WHERE id = p_matrice AND detail_pharmacologie_id IS NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Nouvelles fiches
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE
  m uuid;
BEGIN
  -- Acide ascorbique (cours 1-1 diapo 18 : « La vitamine C augmente l'absorption du fer »)
  m := pg_temp.jp_matrice('Acide ascorbique');
  PERFORM pg_temp.jp_fill(m, 'secteurs', ARRAY['Voies digestives et métabolisme']);
  PERFORM pg_temp.jp_fill(m, 'ct', ARRAY['Vitamines']);
  PERFORM pg_temp.jp_fill(m, 'cp', ARRAY['Vitamine C']);
  PERFORM pg_temp.jp_detail(m, 'Augmente l''absorption du fer');

  -- Colécalciférol / Zymad (ordonnance du rappel sang : image, texte du cours muet)
  m := pg_temp.jp_matrice('Colécalciférol');
  PERFORM pg_temp.jp_fill(m, 'noms', ARRAY['Zymad']);
  PERFORM pg_temp.jp_fill(m, 'secteurs', ARRAY['Voies digestives et métabolisme']);
  PERFORM pg_temp.jp_fill(m, 'ct', ARRAY['Vitamines']);
  PERFORM pg_temp.jp_fill(m, 'cp', ARRAY['Vitamine D']);

  -- Atorvastatine (cours CV diapo 47 « BASIC » : 1 statine ; diapo 83 : traitement de la
  -- maladie athéromateuse ; HTA diapo 72 : Caduet = amlodipine + atorvastatine)
  m := pg_temp.jp_matrice('Atorvastatine');
  PERFORM pg_temp.jp_fill(m, 'secteurs', ARRAY['Système cardiovasculaire']);
  PERFORM pg_temp.jp_fill(m, 'ct', ARRAY['Agents modifiant les lipides']);
  PERFORM pg_temp.jp_fill(m, 'cp', ARRAY['Inhibiteurs de la HMG-CoA réductase']);
  PERFORM pg_temp.jp_detail(m, 'Statine (ordonnance de sortie BASIC post-infarctus)');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['IDM', 'Maladie athéromateuse']);

  -- Triamtérène (HTA diapos 54-55 : épargneur potassique non antialdostérone, « distal »)
  m := pg_temp.jp_matrice('Triamtérène');
  PERFORM pg_temp.jp_fill(m, 'secteurs', ARRAY['Système cardiovasculaire']);
  PERFORM pg_temp.jp_fill(m, 'ct', ARRAY['Diurétiques']);
  PERFORM pg_temp.jp_fill(m, 'cp', ARRAY['Diurétiques épargneurs de potassium']);
  PERFORM pg_temp.jp_detail(m, 'Épargneur potassique, non antialdostérone');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['HTA']);
  PERFORM pg_temp.jp_fill(m, 'ci', ARRAY['IH', 'IR', 'Hyperkaliémie', 'Potassium']);
  PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['Hyperkaliémie', 'Somnolence']);
  PERFORM pg_temp.jp_fill(m, 'inter', ARRAY['Potassium', 'Épargneurs potassiques']);
END
$mig$;

-- Nouvelles classes : disponibles pour tous les niveaux (comme les autres classes), hors legacy hospitalier
INSERT INTO jeupharma.niveau_classes_therapeutiques (niveau_id, classe_therapeutique_id)
SELECT n.code, e.id
FROM jeupharma.niveaux n
CROSS JOIN jeupharma.classes_therapeutiques e
WHERE e.actif AND e.valeur_norm = 'vitamines' AND n.code <> 'hospitalier'
  AND NOT EXISTS (
    SELECT 1 FROM jeupharma.niveau_classes_therapeutiques x
    WHERE x.niveau_id = n.code AND x.classe_therapeutique_id = e.id
  );

INSERT INTO jeupharma.niveau_classes_pharmacologiques (niveau_id, classe_pharmacologique_id)
SELECT n.code, e.id
FROM jeupharma.niveaux n
CROSS JOIN jeupharma.classes_pharmacologiques e
WHERE e.actif AND e.valeur_norm IN ('vitamine c', 'vitamine d') AND n.code <> 'hospitalier'
  AND NOT EXISTS (
    SELECT 1 FROM jeupharma.niveau_classes_pharmacologiques x
    WHERE x.niveau_id = n.code AND x.classe_pharmacologique_id = e.id
  );

-- ---------------------------------------------------------------------------
-- 2. Enrichissements issus du cours
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE
  m uuid;
  d text;
BEGIN
  -- AOD / apparentés (Sang diapos 55 et 58) : mêmes CI / EI / suivi que le bloc cours déjà posé sur Dabigatran
  FOREACH d IN ARRAY ARRAY['Rivaroxaban', 'Apixaban', 'Fondaparinux'] LOOP
    SELECT mm.id INTO m
    FROM jeupharma.matrice_medicaments mm JOIN jeupharma.dcis dc ON dc.id = mm.dci_id
    WHERE dc.valeur = d AND mm.statut = 'publie';
    IF m IS NULL THEN RAISE EXCEPTION 'fiche % introuvable', d; END IF;

    PERFORM pg_temp.jp_fill(m, 'ci',
      ARRAY['IR sévère', 'Hémorragies', 'G&A', 'Injections IM / IA']);
    IF d = 'Rivaroxaban' THEN
      PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['Hémorragies']);
    END IF;
    IF d IN ('Rivaroxaban', 'Apixaban') THEN
      PERFORM pg_temp.jp_fill(m, 'pre', ARRAY['Risque hémorragique', 'Pas de surveillance coag.']);
      PERFORM pg_temp.jp_fill(m, 'surv', ARRAY['Fonction rénale', 'Manifestations hémorragiques']);
    END IF;
  END LOOP;

  -- Hémostatiques locaux (Sang diapos 74 + 78) : classe = médicaments arrêtant l'écoulement sanguin / hémorragies
  FOR m IN
    SELECT mm.id FROM jeupharma.matrice_medicaments mm JOIN jeupharma.dcis dc ON dc.id = mm.dci_id
    WHERE dc.valeur IN ('Alginate de calcium', 'Peroxyde d''hydrogène') AND mm.statut = 'publie'
  LOOP
    PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['Hémorragies']);
  END LOOP;
END
$mig$;

-- ---------------------------------------------------------------------------
-- 3. Miroir `connaissances` pour toute fiche publie incomplète côté connaissances
-- ---------------------------------------------------------------------------
INSERT INTO jeupharma.sources_contenu (code, libelle, type_source, description)
VALUES ('cours_cardio_deust_2a', 'Cours DEUST 2A — Sang / CV / HTA', 'cours',
        'Extraits des supports de cours (Sang, Appareil CV, HTA). Rubriques muettes laissées vides.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO jeupharma.versions_source (source_id, version_label, statut, notes)
SELECT s.id, 'extraits-2026-10', 'valide', 'Fiches 032 : ascorbique, colécalciférol, atorvastatine, triamtérène + enrichissements.'
FROM jeupharma.sources_contenu s WHERE s.code = 'cours_cardio_deust_2a'
ON CONFLICT (source_id, version_label) DO NOTHING;

DO $mig$
DECLARE
  src uuid; ver uuid; r record;
BEGIN
  SELECT s.id, v.id INTO src, ver
  FROM jeupharma.sources_contenu s
  JOIN jeupharma.versions_source v ON v.source_id = s.id AND v.version_label = 'extraits-2026-10'
  WHERE s.code = 'cours_cardio_deust_2a';

  -- singuliers : DCI
  INSERT INTO jeupharma.connaissances (matrice_id, champ_code, entite_id, texte, texte_norm, statut, source_id, version_source_id, ordre)
  SELECT m.id, 'dci', d.id, d.valeur, d.valeur_norm, 'valide', src, ver, 0
  FROM jeupharma.matrice_medicaments m JOIN jeupharma.dcis d ON d.id = m.dci_id AND d.actif
  WHERE m.statut = 'publie'
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;

  -- singuliers : détail pharmacologie
  INSERT INTO jeupharma.connaissances (matrice_id, champ_code, entite_id, texte, texte_norm, statut, source_id, version_source_id, ordre)
  SELECT m.id, 'detail_pharmacologie', e.id, e.valeur, e.valeur_norm, 'valide', src, ver, 0
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.details_pharmacologie e ON e.id = m.detail_pharmacologie_id AND e.actif
  WHERE m.statut = 'publie'
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;

  -- multiples
  FOR r IN SELECT * FROM (VALUES
    ('nom_commercial',         'matrice_noms_commerciaux',            'nom_commercial_id',         'noms_commerciaux'),
    ('secteur_therapeutique',  'matrice_secteurs_therapeutiques',     'secteur_therapeutique_id',  'secteurs_therapeutiques'),
    ('classe_therapeutique',   'matrice_classes_therapeutiques',      'classe_therapeutique_id',   'classes_therapeutiques'),
    ('classe_pharmacologique', 'matrice_classes_pharmacologiques',    'classe_pharmacologique_id', 'classes_pharmacologiques'),
    ('indications',            'matrice_indications',                 'indication_id',             'indications'),
    ('contre_indications',     'matrice_contre_indications',          'contre_indication_id',      'contre_indications'),
    ('effets_indesirables',    'matrice_effets_indesirables',         'effet_indesirable_id',      'effets_indesirables'),
    ('precautions_emploi',     'matrice_precautions_emploi',          'precaution_emploi_id',      'precautions_emploi'),
    ('interactions',           'matrice_interactions',                'interaction_id',            'interactions'),
    ('surveillances',          'matrice_surveillances',               'surveillance_id',           'surveillances')
  ) AS t(champ, jt, fk, ent)
  LOOP
    EXECUTE format($q$
      INSERT INTO jeupharma.connaissances
        (matrice_id, champ_code, entite_id, texte, texte_norm, statut, source_id, version_source_id, ordre)
      SELECT m.id, %L, e.id, e.valeur, e.valeur_norm, 'valide', $1, $2, j.ordre
      FROM jeupharma.matrice_medicaments m
      JOIN jeupharma.%I j ON j.matrice_id = m.id
      JOIN jeupharma.%I e ON e.id = j.%I AND e.actif
      WHERE m.statut = 'publie'
      ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING
    $q$, r.champ, r.jt, r.ent, r.fk) USING src, ver;
  END LOOP;
END
$mig$;
