-- =============================================================================
-- 035 : Publications DEUST — connaissances source « cours » uniquement
-- Désactive les pubs migration_v1 sur cardiovasculaires_deust_2a et republie
-- depuis les lots 033 en ne liant que source cours_cardio_deust_2a.
-- (Les connaissances cours sont posées par 032 + sync admin ; le surplus RCP
--  reste sur matrice_medicaments pour référentiel — règle duale.)
-- Idempotent. Ne touche pas module_blocs / modeles_jeu.
-- =============================================================================

DO $mig$
DECLARE
  v_parcours uuid;
  v_cours_src uuid;
  v_depub int;
  v_ins int;
  v_mods int;
BEGIN
  SELECT id INTO v_parcours FROM jeupharma.parcours_apprentissage WHERE code = 'cardiovasculaires_deust_2a';
  IF v_parcours IS NULL THEN RAISE EXCEPTION 'parcours cardiovasculaires_deust_2a introuvable'; END IF;

  SELECT id INTO v_cours_src FROM jeupharma.sources_contenu WHERE code = 'cours_cardio_deust_2a';
  IF v_cours_src IS NULL THEN RAISE EXCEPTION 'source cours_cardio_deust_2a introuvable'; END IF;

  UPDATE jeupharma.publications_connaissances pc
  SET actif = false
  FROM jeupharma.modules_cours mc, jeupharma.connaissances c
  WHERE pc.module_id = mc.id
    AND pc.connaissance_id = c.id
    AND mc.parcours_id = v_parcours
    AND c.source_id IS DISTINCT FROM v_cours_src
    AND pc.actif;
  GET DIAGNOSTICS v_depub = ROW_COUNT;

  CREATE TEMP TABLE _lots_cv (
    module_code text NOT NULL,
    dci_norm text NOT NULL,
    champs text[]
  ) ON COMMIT DROP;

  INSERT INTO _lots_cv (module_code, dci_norm, champs) VALUES
    ('sang_rappel', 'sels ferreux', NULL),
    ('sang_rappel', 'acide ascorbique', NULL),
    ('sang_rappel', 'colecalciferol', NULL),
    ('sang_rappel', 'cyanocobalamine', ARRAY['nom_commercial', 'dci', 'secteur_therapeutique']),
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
    ('sang_antiagregants', 'acide acetylsalicylique', NULL),
    ('sang_antiagregants', 'clopidogrel', NULL),
    ('sang_antiagregants', 'prasugrel', NULL),
    ('sang_antiagregants', 'ticagrelor', NULL),
    ('sang_antiagregants', 'clopidogrel + aspirine', NULL),
    ('sang_antiagregants', 'dipyridamole', NULL),
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
    ('sang_hemophilies', 'phytomenadione', NULL),
    ('sang_hemophilies', 'acide tranexamique', NULL),
    ('sang_hemophilies', 'alginate de calcium', NULL),
    ('sang_hemophilies', 'peroxyde d''hydrogene', NULL),
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
    ('cv_idm', 'atorvastatine', NULL),
    ('cv_idm', 'enalapril', NULL),
    ('cv_idm', 'ramipril', NULL),
    ('cv_idm', 'captopril', NULL),
    ('cv_idm', 'lisinopril', NULL),
    ('cv_idm', 'perindopril', NULL),
    ('cv_arythmies', 'hydroquinidine', NULL),
    ('cv_arythmies', 'disopyramide', NULL),
    ('cv_arythmies', 'flecainide', NULL),
    ('cv_arythmies', 'propafenone', NULL),
    ('cv_arythmies', 'amiodarone', NULL),
    ('cv_arythmies', 'sotalol', NULL),
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
    ('cv_veines', 'naftidrofuryl', NULL),
    ('cv_veines', 'trimetazidine', NULL),
    ('cv_veines', 'piribedil', NULL),
    ('cv_veines', 'fraction flavonoique', NULL),
    ('cv_veines', 'diosmine', NULL),
    ('cv_veines', 'ginkgo biloba', NULL),
    ('cv_veines', 'troxerutine', NULL),
    ('cv_veines', 'ruscoside', NULL),
    ('cv_veines', 'naftazone', NULL),
    ('cv_urgences', 'adrenaline', NULL),
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

  INSERT INTO _lots_cv (module_code, dci_norm, champs)
  SELECT 'hta_associations', d.valeur_norm, NULL
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.dcis d ON d.id = m.dci_id
  WHERE m.statut = 'publie' AND d.valeur_norm LIKE '% + %'
    AND d.valeur_norm NOT IN (SELECT dci_norm FROM _lots_cv);

  INSERT INTO jeupharma.publications_connaissances (module_id, connaissance_id, ordre, actif)
  SELECT mc.id, c.id, c.ordre, true
  FROM _lots_cv l
  JOIN jeupharma.modules_cours mc ON mc.parcours_id = v_parcours AND mc.code = l.module_code
  JOIN jeupharma.dcis d ON d.valeur_norm = l.dci_norm
  JOIN jeupharma.matrice_medicaments m ON m.dci_id = d.id AND m.statut = 'publie'
  JOIN jeupharma.connaissances c ON c.matrice_id = m.id AND c.statut = 'valide' AND c.source_id = v_cours_src
  WHERE l.champs IS NULL OR c.champ_code = ANY (l.champs)
  ON CONFLICT (module_id, connaissance_id) DO UPDATE SET actif = true;
  GET DIAGNOSTICS v_ins = ROW_COUNT;

  UPDATE jeupharma.modules_cours mc
  SET version_publication = mc.version_publication + 1, contenu_maj_at = now(), updated_at = now()
  WHERE mc.parcours_id = v_parcours
    AND mc.code IN (SELECT DISTINCT module_code FROM _lots_cv);
  GET DIAGNOSTICS v_mods = ROW_COUNT;

  RAISE NOTICE '035 : depub non-cours=%, pubs cours upsert=%, lecons=%', v_depub, v_ins, v_mods;
END
$mig$;
