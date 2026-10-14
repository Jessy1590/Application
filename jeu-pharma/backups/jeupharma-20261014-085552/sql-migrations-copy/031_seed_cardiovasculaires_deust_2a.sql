-- =============================================================================
-- 031 : Remplacement des parcours DEUST/démo par « CardioVasculaires - Deust 2A »
--
-- 1. Supprime les parcours `deust_apprenti`, `etu_3a`, `introduction` :
--    - `modeles_jeu` liés (FK parcours = SET NULL → suppression explicite ; tentatives_jeu en CASCADE),
--      + blocs « jeu » externes qui les référençaient ;
--    - `parcours_apprentissage` → CASCADE : inscriptions_parcours, modules_cours
--      (→ module_blocs, publications_connaissances, progression_modules).
--    - `profil_apprentissage.parcours_id` / `prerequis_parcours_id` passent à NULL (FK SET NULL).
--    Le parcours `pharmacien` est conservé.
-- 2. Crée `cardiovasculaires_deust_2a` (mode publications) : 3 chapitres + 17 leçons,
--    chaîne Sang → Appareil CV → HTA ; verrous `prerequis_module_id`, `criteres_json` (lecture).
--    Aucun bloc, aucune publication, aucun jeu (phases ultérieures).
-- Idempotent : relançable (upsert parcours / modules).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Suppression des anciens parcours
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_pids uuid[];
  v_mj uuid[];
  v_mj_txt text[];
BEGIN
  SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO v_pids
  FROM jeupharma.parcours_apprentissage
  WHERE code IN ('deust_apprenti', 'etu_3a', 'introduction');

  IF cardinality(v_pids) = 0 THEN
    RETURN;
  END IF;

  SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO v_mj
  FROM jeupharma.modeles_jeu
  WHERE parcours_id = ANY (v_pids)
     OR module_ids && ARRAY(SELECT id FROM jeupharma.modules_cours WHERE parcours_id = ANY (v_pids));
  v_mj_txt := ARRAY(SELECT x::text FROM unnest(v_mj) AS x);

  -- Blocs « jeu » (hors parcours supprimés) pointant vers ces jeux
  DELETE FROM jeupharma.module_blocs
  WHERE type_bloc = 'jeu' AND payload_json->>'modele_id' = ANY (v_mj_txt);

  -- Critères de parcours restants (ex. pharmacien) : retrait des jeux supprimés
  UPDATE jeupharma.parcours_apprentissage p
  SET criteres_json = jsonb_set(
    p.criteres_json, '{jeux}',
    coalesce((
      SELECT jsonb_agg(e) FROM jsonb_array_elements(p.criteres_json->'jeux') AS e
      WHERE NOT ((e->>'modele_id') = ANY (v_mj_txt))
    ), '[]'::jsonb))
  WHERE NOT (p.id = ANY (v_pids))
    AND jsonb_typeof(p.criteres_json->'jeux') = 'array';

  UPDATE jeupharma.modules_cours c
  SET criteres_json = jsonb_set(
    c.criteres_json, '{jeux}',
    coalesce((
      SELECT jsonb_agg(e) FROM jsonb_array_elements(c.criteres_json->'jeux') AS e
      WHERE NOT ((e->>'modele_id') = ANY (v_mj_txt))
    ), '[]'::jsonb))
  WHERE NOT (c.parcours_id = ANY (v_pids))
    AND jsonb_typeof(c.criteres_json->'jeux') = 'array';

  -- Jeux (tentatives_jeu en CASCADE)
  DELETE FROM jeupharma.modeles_jeu WHERE id = ANY (v_mj);

  -- Parcours (modules, blocs, pubs, progression, inscriptions en CASCADE)
  DELETE FROM jeupharma.parcours_apprentissage WHERE id = ANY (v_pids);
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Parcours CardioVasculaires - Deust 2A
-- ---------------------------------------------------------------------------
INSERT INTO jeupharma.parcours_apprentissage (
  code, libelle, description, niveau_lie, mode_contenu, ordre, actif
) VALUES (
  'cardiovasculaires_deust_2a',
  'CardioVasculaires - Deust 2A',
  'Sang, appareil cardiovasculaire et HTA — contenus et molécules des supports de cours DEUST 2A, avec déblocage progressif des leçons et des molécules.',
  'apprenti',
  'publications',
  1,
  true
)
ON CONFLICT (code) DO UPDATE SET
  libelle = EXCLUDED.libelle,
  description = EXCLUDED.description,
  niveau_lie = EXCLUDED.niveau_lie,
  mode_contenu = EXCLUDED.mode_contenu,
  ordre = EXCLUDED.ordre,
  actif = true,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 3. Chapitres + leçons
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  pid uuid;
  ch_sang uuid;
  ch_cv uuid;
  ch_hta uuid;
  prev uuid;
  rec record;
  v_id uuid;
  v_crit constant jsonb := '{"lecture": true, "logique": "et"}'::jsonb;
BEGIN
  SELECT id INTO pid FROM jeupharma.parcours_apprentissage WHERE code = 'cardiovasculaires_deust_2a';
  IF pid IS NULL THEN RAISE EXCEPTION 'parcours cardiovasculaires_deust_2a manquant'; END IF;

  -- Chapitres (groupes) : Sang → Appareil CV → HTA
  INSERT INTO jeupharma.modules_cours (
    parcours_id, code, titre, resume, objectifs, ordre, publie, est_groupe,
    version_publication, statut, criteres_json, contenu_maj_at
  ) VALUES
    (pid, 'chap_sang', 'Sang',
     'Rappel sang, anémies, antiagrégants, anticoagulants, hémophilies et hémostatiques.',
     'Connaître le sang, l''hémostase et les traitements des anémies et des thromboses.',
     10, true, true, 1, 'publie', '{}'::jsonb, now()),
    (pid, 'chap_cv', 'Appareil cardiovasculaire',
     'Athérome, angor, IDM, arythmies, insuffisance cardiaque, artérite et veines, urgences.',
     'Maîtriser les pathologies cardiovasculaires et leurs traitements au comptoir.',
     20, true, true, 1, 'publie', '{}'::jsonb, now()),
    (pid, 'chap_hta', 'HTA',
     'Rappel PA, système RAA, HTA clinique, antihypertenseurs, associations et dispensation.',
     'Comprendre la régulation de la PA et dispenser les antihypertenseurs.',
     30, true, true, 1, 'publie', '{}'::jsonb, now())
  ON CONFLICT (parcours_id, code) DO UPDATE SET
    titre = EXCLUDED.titre, resume = EXCLUDED.resume, objectifs = EXCLUDED.objectifs,
    ordre = EXCLUDED.ordre, publie = true, est_groupe = true, parent_id = NULL,
    criteres_json = EXCLUDED.criteres_json, updated_at = now();

  SELECT id INTO ch_sang FROM jeupharma.modules_cours WHERE parcours_id = pid AND code = 'chap_sang';
  SELECT id INTO ch_cv   FROM jeupharma.modules_cours WHERE parcours_id = pid AND code = 'chap_cv';
  SELECT id INTO ch_hta  FROM jeupharma.modules_cours WHERE parcours_id = pid AND code = 'chap_hta';

  -- Verrous entre chapitres
  UPDATE jeupharma.modules_cours SET prerequis_module_id = NULL,   updated_at = now() WHERE id = ch_sang;
  UPDATE jeupharma.modules_cours SET prerequis_module_id = ch_sang, updated_at = now() WHERE id = ch_cv;
  UPDATE jeupharma.modules_cours SET prerequis_module_id = ch_cv,   updated_at = now() WHERE id = ch_hta;

  -- Leçons : (chapitre, code, titre, ordre, résumé)
  FOR rec IN
    SELECT * FROM (VALUES
      ('sang', 'sang_rappel',        'Rappel sang',                             11, 'Éléments figurés, hémostase primaire et secondaire, fer ; cas comptoir.'),
      ('sang', 'sang_anemies',       'Anémies',                                 12, 'Définition, classifications, ferriprive, macrocytaire, hémolytiques ; fer, folates, EPO.'),
      ('sang', 'sang_antiagregants', 'Thromboses et antiagrégants',             13, 'TVP, EP, thrombose artérielle ; antiagrégants plaquettaires.'),
      ('sang', 'sang_anticoagulants','Anticoagulants et thrombolytiques',       14, 'Héparines, fondaparinux, AOD, AVK, hirudines ; thrombolytiques.'),
      ('sang', 'sang_hemophilies',   'Hémophilies et hémostatiques',            15, 'Hémophilies A / B, thrombopénie, hémostatiques.'),
      ('cv',   'cv_definitions',     'Définitions athérome',                    21, 'Artériosclérose, athérosclérose, facteurs de risque, complications.'),
      ('cv',   'cv_angor',           'Angor',                                   22, 'Angor stable / instable, anti-angoreux, spray sublingual, patchs.'),
      ('cv',   'cv_idm',             'IDM',                                     23, 'Syndrome coronarien aigu, marqueurs, complications, BASIC post-infarctus.'),
      ('cv',   'cv_arythmies',       'Arythmies',                               24, 'Classification de Vaughan-Williams, BAV, antiarythmiques.'),
      ('cv',   'cv_ic',              'Insuffisance cardiaque',                  25, 'Définition, signes, classes thérapeutiques.'),
      ('cv',   'cv_veines',          'Artérite et insuffisance veineuse',       26, 'AOMI, retour veineux, stades, contention, veinotoniques.'),
      ('cv',   'cv_urgences',        'OAP et urgences CV',                      27, 'OAP, anaphylaxie, adrénaline, orientation 15.'),
      ('hta',  'hta_rappel_pa',      'Rappel PA',                               31, 'Pression artérielle, déterminants, régulation, mesure, valeurs OMS.'),
      ('hta',  'hta_raa',            'Système RAA',                             32, 'Rénine, angiotensine, aldostérone ; rétrocontrôle.'),
      ('hta',  'hta_clinique',       'HTA clinique',                            33, 'HTA essentielle / secondaire, signes, complications, hygiène de vie.'),
      ('hta',  'hta_classes',        'Antihypertenseurs par classe',            34, 'Cibles FC / volémie / vasodilatation ; classes et molécules.'),
      ('hta',  'hta_associations',   'Associations fixes et dispensation',      35, 'Associations fixes, hypotension orthostatique, conseils de dispensation.')
    ) AS t(chap, code, titre, ordre, resume)
    ORDER BY ordre
  LOOP
    -- Première leçon de chaque chapitre : pas de prérequis propre (le chapitre verrouille)
    IF rec.code IN ('sang_rappel', 'cv_definitions', 'hta_rappel_pa') THEN
      prev := NULL;
    END IF;

    INSERT INTO jeupharma.modules_cours (
      parcours_id, parent_id, code, titre, resume, objectifs, ordre, publie, est_groupe,
      prerequis_module_id, version_publication, statut, criteres_json, contenu_maj_at
    ) VALUES (
      pid,
      CASE rec.chap WHEN 'sang' THEN ch_sang WHEN 'cv' THEN ch_cv ELSE ch_hta END,
      rec.code, rec.titre, rec.resume, '', rec.ordre, true, false,
      prev, 1, 'publie', v_crit, now()
    )
    ON CONFLICT (parcours_id, code) DO UPDATE SET
      parent_id = EXCLUDED.parent_id,
      titre = EXCLUDED.titre,
      resume = EXCLUDED.resume,
      ordre = EXCLUDED.ordre,
      publie = true,
      est_groupe = false,
      prerequis_module_id = EXCLUDED.prerequis_module_id,
      criteres_json = EXCLUDED.criteres_json,
      updated_at = now()
    RETURNING id INTO v_id;

    prev := v_id;
  END LOOP;
END;
$$;
