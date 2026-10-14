-- =============================================================================
-- 033 : Publications molécules par leçon — parcours cardiovasculaires_deust_2a
-- Plan : lots 1–13 (formation_cardio_deust). Publication au PREMIER lot où la
-- molécule apparaît ; les leçons suivantes héritent (mode publications).
-- Publié = toutes les connaissances `valide` de la fiche (nom, DCI, secteur,
-- classes, détail, indications, CI, EI, précautions, interactions, surveillances).
-- Exceptions : cyanocobalamine — L1 identité + secteur seulement (« contexte cas »,
-- pas encore classe anémie), reste en L2 ; lacidipine absente du cours, non publiée.
-- Idempotent (ON CONFLICT DO NOTHING). Aucune création de blocs / jeux / images.
-- =============================================================================

-- Détail pharmacologique AOD Xa (Sang diapo 53 : « Inhibiteurs du facteur Xa ») + miroir connaissances
DO $mig$
DECLARE
  v_det uuid;
  src uuid; ver uuid;
BEGIN
  SELECT id INTO v_det FROM jeupharma.details_pharmacologie
  WHERE valeur_norm = jeupharma.normaliser_valeur('Inhibiteur du facteur Xa') AND actif LIMIT 1;
  IF v_det IS NULL THEN
    INSERT INTO jeupharma.details_pharmacologie (valeur, valeur_norm)
    VALUES ('Inhibiteur du facteur Xa', jeupharma.normaliser_valeur('Inhibiteur du facteur Xa'))
    RETURNING id INTO v_det;
  END IF;

  UPDATE jeupharma.matrice_medicaments m
  SET detail_pharmacologie_id = v_det, updated_at = now()
  FROM jeupharma.dcis d
  WHERE d.id = m.dci_id AND m.statut = 'publie'
    AND d.valeur IN ('Rivaroxaban', 'Apixaban') AND m.detail_pharmacologie_id IS NULL;

  SELECT s.id, v.id INTO src, ver
  FROM jeupharma.sources_contenu s
  JOIN jeupharma.versions_source v ON v.source_id = s.id AND v.version_label = 'extraits-2026-10'
  WHERE s.code = 'cours_cardio_deust_2a';

  INSERT INTO jeupharma.connaissances (matrice_id, champ_code, entite_id, texte, texte_norm, statut, source_id, version_source_id, ordre)
  SELECT m.id, 'detail_pharmacologie', e.id, e.valeur, e.valeur_norm, 'valide', src, ver, 0
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.details_pharmacologie e ON e.id = m.detail_pharmacologie_id AND e.actif
  WHERE m.statut = 'publie'
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;
END
$mig$;

-- ---------------------------------------------------------------------------
-- Lots (clé = DCI normalisée sans accents)
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _lots_cv (
  module_code text NOT NULL,
  dci_norm text NOT NULL,
  champs text[]            -- NULL = toutes les connaissances ; sinon liste de champ_code
) ON COMMIT DROP;

INSERT INTO _lots_cv (module_code, dci_norm, champs) VALUES
  -- L1 · Rappel sang (lot 1)
  ('sang_rappel', 'sels ferreux', NULL),
  ('sang_rappel', 'acide ascorbique', NULL),
  ('sang_rappel', 'colecalciferol', NULL),
  ('sang_rappel', 'cyanocobalamine', ARRAY['nom_commercial', 'dci', 'secteur_therapeutique']),
  -- L2 · Anémies (lot 2)
  ('sang_anemies', 'cyanocobalamine',
     ARRAY['classe_therapeutique', 'classe_pharmacologique', 'detail_pharmacologie', 'indications',
           'contre_indications', 'effets_indesirables', 'precautions_emploi', 'interactions', 'surveillances']),
  ('sang_anemies', 'sels ferreux + acide folique', NULL),
  ('sang_anemies', 'acide folique', NULL),
  ('sang_anemies', 'acide folinique', NULL),
  ('sang_anemies', 'epoetine alfa', NULL),
  ('sang_anemies', 'epoetine beta', NULL),
  ('sang_anemies', 'darbepoetine alfa', NULL),
  ('sang_anemies', 'immunoglobulines anti-d', NULL),
  -- L3 · Thromboses / antiagrégants (lot 3)
  ('sang_antiagregants', 'acide acetylsalicylique', NULL),
  ('sang_antiagregants', 'clopidogrel', NULL),
  ('sang_antiagregants', 'prasugrel', NULL),
  ('sang_antiagregants', 'ticagrelor', NULL),
  ('sang_antiagregants', 'clopidogrel + aspirine', NULL),
  ('sang_antiagregants', 'dipyridamole', NULL),
  -- L4 · Anticoagulants et thrombolytiques (lot 4)
  ('sang_anticoagulants', 'heparinate de sodium', NULL),
  ('sang_anticoagulants', 'heparinate de calcium', NULL),
  ('sang_anticoagulants', 'dalteparine', NULL),
  ('sang_anticoagulants', 'enoxaparine sodique', NULL),
  ('sang_anticoagulants', 'tinzaparine', NULL),
  ('sang_anticoagulants', 'nadroparine', NULL),
  ('sang_anticoagulants', 'danaparoide', NULL),
  ('sang_anticoagulants', 'fondaparinux', NULL),
  ('sang_anticoagulants', 'rivaroxaban', NULL),
  ('sang_anticoagulants', 'apixaban', NULL),
  ('sang_anticoagulants', 'dabigatran etexilate', NULL),
  ('sang_anticoagulants', 'idarucizumab', NULL),
  ('sang_anticoagulants', 'warfarine', NULL),
  ('sang_anticoagulants', 'acenocoumarol', NULL),
  ('sang_anticoagulants', 'fluindione', NULL),
  ('sang_anticoagulants', 'desirudine', NULL),
  ('sang_anticoagulants', 'lepirudine', NULL),
  ('sang_anticoagulants', 'alteplase', NULL),
  ('sang_anticoagulants', 'tenecteplase', NULL),
  ('sang_anticoagulants', 'reteplase', NULL),
  ('sang_anticoagulants', 'streptokinase', NULL),
  ('sang_anticoagulants', 'urokinase', NULL),
  -- L5 · Hémophilies / hémostatiques (lot 5)
  ('sang_hemophilies', 'phytomenadione', NULL),
  ('sang_hemophilies', 'acide tranexamique', NULL),
  ('sang_hemophilies', 'alginate de calcium', NULL),
  ('sang_hemophilies', 'peroxyde d''hydrogene', NULL),
  -- L7 · Angor (lot 6)
  ('cv_angor', 'trinitrine', NULL),
  ('cv_angor', 'isosorbide dinitrate', NULL),
  ('cv_angor', 'molsidomine', NULL),
  ('cv_angor', 'nicorandil', NULL),
  ('cv_angor', 'ivabradine', NULL),
  ('cv_angor', 'nifedipine', NULL),
  ('cv_angor', 'nicardipine', NULL),
  ('cv_angor', 'nitrendipine', NULL),
  ('cv_angor', 'isradipine', NULL),
  ('cv_angor', 'amlodipine', NULL),
  ('cv_angor', 'felodipine', NULL),
  ('cv_angor', 'manidipine', NULL),
  ('cv_angor', 'lercanidipine', NULL),
  ('cv_angor', 'verapamil', NULL),
  ('cv_angor', 'diltiazem', NULL),
  ('cv_angor', 'carvedilol', NULL),
  ('cv_angor', 'bisoprolol', NULL),
  ('cv_angor', 'metoprolol', NULL),
  ('cv_angor', 'nebivolol', NULL),
  -- L8 · IDM / BASIC (lot 7)
  ('cv_idm', 'atorvastatine', NULL),
  ('cv_idm', 'enalapril', NULL),
  ('cv_idm', 'ramipril', NULL),
  ('cv_idm', 'captopril', NULL),
  ('cv_idm', 'lisinopril', NULL),
  ('cv_idm', 'perindopril', NULL),
  -- L9 · Arythmies (lot 8)
  ('cv_arythmies', 'hydroquinidine', NULL),
  ('cv_arythmies', 'disopyramide', NULL),
  ('cv_arythmies', 'flecainide', NULL),
  ('cv_arythmies', 'propafenone', NULL),
  ('cv_arythmies', 'amiodarone', NULL),
  ('cv_arythmies', 'sotalol', NULL),
  -- L10 · Insuffisance cardiaque (lot 9)
  ('cv_ic', 'fosinopril', NULL),
  ('cv_ic', 'losartan', NULL),
  ('cv_ic', 'valsartan', NULL),
  ('cv_ic', 'candesartan', NULL),
  ('cv_ic', 'sacubitril + valsartan', NULL),
  ('cv_ic', 'dapagliflozine', NULL),
  ('cv_ic', 'digoxine', NULL),
  ('cv_ic', 'furosemide', NULL),
  ('cv_ic', 'spironolactone', NULL),
  ('cv_ic', 'eplerenone', NULL),
  -- L11 · Artérite / veines (lot 10) — sclérosants archivés (004), HE / homéo = conseil texte
  ('cv_veines', 'naftidrofuryl', NULL),
  ('cv_veines', 'trimetazidine', NULL),
  ('cv_veines', 'piribedil', NULL),
  ('cv_veines', 'fraction flavonoique', NULL),
  ('cv_veines', 'diosmine', NULL),
  ('cv_veines', 'ginkgo biloba', NULL),
  ('cv_veines', 'troxerutine', NULL),
  ('cv_veines', 'ruscoside', NULL),
  ('cv_veines', 'naftazone', NULL),
  -- L12 · OAP / urgences (lot 11)
  ('cv_urgences', 'adrenaline', NULL),
  -- L16 · Antihypertenseurs par classe (lot 12) — union deck HTA hors lots précédents
  ('hta_classes', 'acebutolol', NULL),
  ('hta_classes', 'atenolol', NULL),
  ('hta_classes', 'celiprolol', NULL),
  ('hta_classes', 'betaxolol', NULL),
  ('hta_classes', 'propranolol', NULL),
  ('hta_classes', 'pindolol', NULL),
  ('hta_classes', 'nadolol', NULL),
  ('hta_classes', 'labetalol', NULL),
  ('hta_classes', 'timolol', NULL),
  ('hta_classes', 'tertatolol', NULL),
  ('hta_classes', 'piretanide', NULL),
  ('hta_classes', 'bumetanide', NULL),
  ('hta_classes', 'hydrochlorothiazide', NULL),
  ('hta_classes', 'indapamide', NULL),
  ('hta_classes', 'cicletanine', NULL),
  ('hta_classes', 'amiloride', NULL),
  ('hta_classes', 'triamterene', NULL),
  ('hta_classes', 'urapidil', NULL),
  ('hta_classes', 'prazosine', NULL),
  ('hta_classes', 'doxazosine', NULL),
  ('hta_classes', 'minoxidil', NULL),
  ('hta_classes', 'rilmenidine', NULL),
  ('hta_classes', 'methyldopa', NULL),
  ('hta_classes', 'moxonidine', NULL),
  ('hta_classes', 'clonidine', NULL),
  ('hta_classes', 'benazepril', NULL),
  ('hta_classes', 'quinapril', NULL),
  ('hta_classes', 'trandolapril', NULL),
  ('hta_classes', 'zofenopril', NULL),
  ('hta_classes', 'irbesartan', NULL),
  ('hta_classes', 'telmisartan', NULL),
  ('hta_classes', 'eprosartan', NULL),
  ('hta_classes', 'olmesartan', NULL);

-- L17 · Associations fixes (lot 13) : toute fiche association (« + ») pas encore publiée dans le parcours
INSERT INTO _lots_cv (module_code, dci_norm, champs)
SELECT 'hta_associations', d.valeur_norm, NULL
FROM jeupharma.matrice_medicaments m
JOIN jeupharma.dcis d ON d.id = m.dci_id
WHERE m.statut = 'publie' AND d.valeur_norm LIKE '% + %'
  AND d.valeur_norm NOT IN (SELECT dci_norm FROM _lots_cv);

DO $mig$
DECLARE
  v_parcours uuid;
  v_missing text;
  v_dup text;
  v_ins int;
  v_mods int;
BEGIN
  SELECT id INTO v_parcours FROM jeupharma.parcours_apprentissage WHERE code = 'cardiovasculaires_deust_2a';
  IF v_parcours IS NULL THEN RAISE EXCEPTION 'parcours cardiovasculaires_deust_2a introuvable'; END IF;

  -- Toute DCI du plan doit correspondre à exactement une fiche publie
  SELECT string_agg(DISTINCT l.dci_norm, ', ') INTO v_missing
  FROM _lots_cv l
  WHERE NOT EXISTS (
    SELECT 1 FROM jeupharma.matrice_medicaments m JOIN jeupharma.dcis d ON d.id = m.dci_id
    WHERE m.statut = 'publie' AND d.valeur_norm = l.dci_norm
  );
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'DCI sans fiche publie : %', v_missing; END IF;

  SELECT string_agg(x.dci_norm, ', ') INTO v_dup FROM (
    SELECT d.valeur_norm dci_norm FROM jeupharma.matrice_medicaments m JOIN jeupharma.dcis d ON d.id = m.dci_id
    WHERE m.statut = 'publie' AND d.valeur_norm IN (SELECT dci_norm FROM _lots_cv)
    GROUP BY d.valeur_norm HAVING count(*) > 1) x;
  IF v_dup IS NOT NULL THEN RAISE EXCEPTION 'DCI en doublon actif : %', v_dup; END IF;

  INSERT INTO jeupharma.publications_connaissances (module_id, connaissance_id, ordre, actif)
  SELECT mc.id, c.id, c.ordre, true
  FROM _lots_cv l
  JOIN jeupharma.modules_cours mc ON mc.parcours_id = v_parcours AND mc.code = l.module_code
  JOIN jeupharma.dcis d ON d.valeur_norm = l.dci_norm
  JOIN jeupharma.matrice_medicaments m ON m.dci_id = d.id AND m.statut = 'publie'
  JOIN jeupharma.connaissances c ON c.matrice_id = m.id AND c.statut = 'valide'
  WHERE l.champs IS NULL OR c.champ_code = ANY (l.champs)
  ON CONFLICT (module_id, connaissance_id) DO UPDATE SET actif = true;
  GET DIAGNOSTICS v_ins = ROW_COUNT;

  -- Leçons concernées : nouvelle version de contenu
  UPDATE jeupharma.modules_cours mc
  SET version_publication = mc.version_publication + 1, contenu_maj_at = now(), updated_at = now()
  WHERE mc.parcours_id = v_parcours
    AND mc.code IN (SELECT DISTINCT module_code FROM _lots_cv);
  GET DIAGNOSTICS v_mods = ROW_COUNT;

  RAISE NOTICE '033 : % publications (upsert), % leçons mises à jour', v_ins, v_mods;
END
$mig$;
