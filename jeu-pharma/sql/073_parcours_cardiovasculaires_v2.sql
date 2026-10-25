-- =============================================================================
-- 073 : Parcours « Cardiovasculaire v2 »
--
-- Nouveau parcours `cardiovasculaires_v2` reconstruit depuis le contenu de
-- `cardiovasculaires_deust_2a` (V1), sans inventer de texte pédagogique.
-- Architecture :
--   1. Physiopathologie du Sang
--   2. Médicaments du sang
--   3. Physiopathologie du cœur
--   4. Médicaments du cœur
--
-- - Blocs contenu (texte/photo/conseil/section/video) copiés depuis V1
-- - Blocs jeu V1 NON repris ; jeux JP-V2* créés à part (074)
-- - Blocs molecule V1 NON repris ; placeholders vides + rapport molécules
-- - Blocs recommandation : liens vers leçons médicaments du même parcours
-- Idempotent : relançable (purge modules/jeux du parcours V2 puis recreate).
-- =============================================================================

DO $$
DECLARE
  v1 uuid;
  v2 uuid;
  ch_physio_sang uuid;
  ch_med_sang uuid;
  ch_physio_coeur uuid;
  ch_med_coeur uuid;
  prev uuid;
  rec record;
  v_id uuid;
  v_src uuid;
  v_crit_lecture constant jsonb := '{"lecture": true, "logique": "et", "jeux": []}'::jsonb;
BEGIN
  SELECT id INTO v1 FROM jeupharma.parcours_apprentissage WHERE code = 'cardiovasculaires_deust_2a';
  IF v1 IS NULL THEN
    RAISE EXCEPTION '073: parcours source cardiovasculaires_deust_2a manquant';
  END IF;

  -- ------------------------------------------------------------------
  -- Parcours (upsert)
  -- ------------------------------------------------------------------
  INSERT INTO jeupharma.parcours_apprentissage (
    code, libelle, description, mode_contenu, ordre, actif, criteres_json
  ) VALUES (
    'cardiovasculaires_v2',
    'Cardiovasculaire v2',
    'Sang puis cœur : physiopathologie, puis médicaments par classe — reconstruction pédagogique du parcours Cardio DEUST (contenus V1, architecture séparée).',
    'publications',
    2,
    true,
    '{}'::jsonb
  )
  ON CONFLICT (code) DO UPDATE SET
    libelle = EXCLUDED.libelle,
    description = EXCLUDED.description,
    mode_contenu = EXCLUDED.mode_contenu,
    ordre = EXCLUDED.ordre,
    actif = true,
    updated_at = now()
  RETURNING id INTO v2;

  SELECT id INTO v2 FROM jeupharma.parcours_apprentissage WHERE code = 'cardiovasculaires_v2';

  -- Purge contenu V2 (jeux liés + modules CASCADE blocs/pubs/progression)
  DELETE FROM jeupharma.modeles_jeu
  WHERE parcours_id = v2
     OR module_ids && ARRAY(SELECT id FROM jeupharma.modules_cours WHERE parcours_id = v2);

  DELETE FROM jeupharma.modules_cours WHERE parcours_id = v2;

  -- ------------------------------------------------------------------
  -- Chapitres
  -- ------------------------------------------------------------------
  INSERT INTO jeupharma.modules_cours (
    parcours_id, code, titre, resume, objectifs, ordre, publie, est_groupe,
    version_publication, statut, criteres_json, contenu_maj_at
  ) VALUES
    (v2, 'chap_physio_sang', 'Physiopathologie du Sang',
     'Composition du sang, hémostase, anémies, thromboses, hémophilies.',
     'Comprendre le sang et ses pathologies avant les traitements.',
     10, true, true, 1, 'publie', '{}'::jsonb, now()),
    (v2, 'chap_med_sang', 'Médicaments du sang',
     'Anémies, antiagrégants, héparines, AOD, AVK, hémostatiques.',
     'Dispenser les médicaments du sang par classe thérapeutique.',
     20, true, true, 1, 'publie', '{}'::jsonb, now()),
    (v2, 'chap_physio_coeur', 'Physiopathologie du cœur',
     'Athérome, angor, IDM, arythmies, IC, artères/veines, OAP, HTA.',
     'Comprendre les pathologies cardiovasculaires et l’HTA.',
     30, true, true, 1, 'publie', '{}'::jsonb, now()),
    (v2, 'chap_med_coeur', 'Médicaments du cœur',
     'Anti-angoreux, antiarythmiques, IC, artères/veines, urgences, HTA.',
     'Dispenser les médicaments cardiovasculaires et antihypertenseurs.',
     40, true, true, 1, 'publie', '{}'::jsonb, now());

  SELECT id INTO ch_physio_sang  FROM jeupharma.modules_cours WHERE parcours_id = v2 AND code = 'chap_physio_sang';
  SELECT id INTO ch_med_sang     FROM jeupharma.modules_cours WHERE parcours_id = v2 AND code = 'chap_med_sang';
  SELECT id INTO ch_physio_coeur FROM jeupharma.modules_cours WHERE parcours_id = v2 AND code = 'chap_physio_coeur';
  SELECT id INTO ch_med_coeur    FROM jeupharma.modules_cours WHERE parcours_id = v2 AND code = 'chap_med_coeur';

  UPDATE jeupharma.modules_cours SET prerequis_module_id = NULL,             updated_at = now() WHERE id = ch_physio_sang;
  UPDATE jeupharma.modules_cours SET prerequis_module_id = ch_physio_sang,   updated_at = now() WHERE id = ch_med_sang;
  UPDATE jeupharma.modules_cours SET prerequis_module_id = ch_med_sang,      updated_at = now() WHERE id = ch_physio_coeur;
  UPDATE jeupharma.modules_cours SET prerequis_module_id = ch_physio_coeur,  updated_at = now() WHERE id = ch_med_coeur;

  -- ------------------------------------------------------------------
  -- Leçons (structure)
  -- chap | code | titre | ordre | resume
  -- ------------------------------------------------------------------
  prev := NULL;
  FOR rec IN
    SELECT * FROM (VALUES
      -- Physiopathologie du Sang
      ('physio_sang', 'v2_sang_composition',  'Composition du sang',                         11,
       'Plasma, éléments figurés, globules rouges, plaquettes, globules blancs.'),
      ('physio_sang', 'v2_sang_hemostase',     'Hémostase',                                   12,
       'Hémostase primaire, secondaire et tertiaire.'),
      ('physio_sang', 'v2_sang_anemies',       'Anémies',                                     13,
       'Définition, causes, ferriprive, macrocytaire, aplasiques, thalassémie, drépanocytose, MHNN.'),
      ('physio_sang', 'v2_sang_thromboses',    'Thromboses',                                  14,
       'Thrombose veineuse et thrombose artérielle.'),
      ('physio_sang', 'v2_sang_hemophilies',   'Hémophilies et thrombopénie',                 15,
       'Hémophilies A/B et thrombopénie.'),
      ('physio_sang', 'v2_sang_globule_blanc', 'Pathologie du globule blanc',                 16,
       'Renvoi vers le parcours infections.'),

      -- Médicaments du sang
      ('med_sang', 'v2_med_anemies',       'Médicaments des anémies',                       21,
       'Fer, vitamines B9/B12, érythropoïétines.'),
      ('med_sang', 'v2_med_antiagregants', 'Antiagrégants plaquettaires',                   22,
       'Mécanisme, indications, EI, CI, surveillance.'),
      ('med_sang', 'v2_med_heparines',     'Héparines',                                     23,
       'HNF, HBPM, héparinoïdes.'),
      ('med_sang', 'v2_med_aod',           'Anticoagulants oraux directs',                 24,
       'AOD : mécanisme, indications, EI, CI, surveillance.'),
      ('med_sang', 'v2_med_avk',           'Antivitamines K',                              25,
       'AVK : mécanisme, INR, relais héparine.'),
      ('med_sang', 'v2_med_hemostatiques', 'Hémostatiques',                                 26,
       'Hémostatiques locaux et généraux (acide tranéxamique).'),

      -- Physiopathologie du cœur
      ('physio_coeur', 'v2_cv_atherome',     'Athérome et artériosclérose',                 31,
       'Définitions, facteurs de risque, complications.'),
      ('physio_coeur', 'v2_cv_angor',        'Angor — physiopathologie',                    32,
       'Définition, types, symptômes.'),
      ('physio_coeur', 'v2_cv_idm',          'Infarctus du myocarde — physiopathologie',    33,
       'Définition, signes, diagnostic, évolution, urgence.'),
      ('physio_coeur', 'v2_cv_arythmies',    'Arythmies — physiopathologie',                34,
       'Définition, diagnostic, troubles du rythme.'),
      ('physio_coeur', 'v2_cv_ic',           'Insuffisance cardiaque — physiopathologie',   35,
       'Définition, signes cliniques.'),
      ('physio_coeur', 'v2_cv_arterite',     'Artérite — physiopathologie',                 36,
       'Définition et signes cliniques.'),
      ('physio_coeur', 'v2_cv_veines',       'Insuffisance veineuse — physiopathologie',    37,
       'Mécanismes, stades, conseils hygiéno-diététiques.'),
      ('physio_coeur', 'v2_cv_hemorroides',  'Crises hémorroïdaires — physiopathologie',    38,
       'Définition, symptômes, facteurs favorisants.'),
      ('physio_coeur', 'v2_cv_oap',          'OAP — physiopathologie',                      39,
       'Définition et signes cliniques de l’œdème aigu du poumon.'),
      ('physio_coeur', 'v2_hta_pa',          'Rappel pression artérielle',                  40,
       'Déterminants, régulation, mesure, valeurs.'),
      ('physio_coeur', 'v2_hta_raa',         'Système rénine-angiotensine-aldostérone',     41,
       'RAA et régulation de la pression artérielle.'),
      ('physio_coeur', 'v2_hta_clinique',    'HTA clinique',                                42,
       'HTA essentielle / secondaire, signes, complications, hygiène de vie.'),

      -- Médicaments du cœur
      ('med_coeur', 'v2_med_crise_angor',      'Traitement de crise de l''angor',           51,
       'Spray sublingual et conduite en crise.'),
      ('med_coeur', 'v2_med_nitrates',         'Dérivés nitrés',                            52,
       'Trinitrine / dérivés nitrés à action prolongée.'),
      ('med_coeur', 'v2_med_betabloquants',    'Bêtabloquants',                             53,
       'Mécanisme, indications, cardiosélectivité, EI, CI.'),
      ('med_coeur', 'v2_med_inca',             'Inhibiteurs calciques',                     54,
       'Groupes, mécanisme, indications, EI, CI.'),
      ('med_coeur', 'v2_med_autres_angoreux',  'Autres anti-angoreux',                      55,
       'Molsidomine, nicorandil, ivabradine.'),
      ('med_coeur', 'v2_med_post_idm',         'Traitement du post-infarctus',              56,
       'Prévention, ordonnance BASIC, conseils.'),
      ('med_coeur', 'v2_med_antiarythmiques_c1','Antiarythmiques de classe 1',              57,
       'Classe 1 : mécanismes, EI, CI.'),
      ('med_coeur', 'v2_med_antiarythmiques_c3','Antiarythmiques de classe 3',              58,
       'Amiodarone / sotalol : EI, CI.'),
      ('med_coeur', 'v2_med_iec',              'IEC',                                       59,
       'Inhibiteurs de l''enzyme de conversion.'),
      ('med_coeur', 'v2_med_ara2',             'ARA 2 (sartans)',                           60,
       'Antagonistes des récepteurs de l''angiotensine II.'),
      ('med_coeur', 'v2_med_digitaliques',     'Cardiotoniques digitaliques',               61,
       'Digoxine : EI, CI.'),
      ('med_coeur', 'v2_med_autres_ic',        'Autres traitements de l''insuffisance cardiaque', 62,
       'ARNI, gliflozines.'),
      ('med_coeur', 'v2_med_arterite',         'Traitements de l''artérite',                63,
       'Vasodilatateurs et indications.'),
      ('med_coeur', 'v2_med_veines',           'Traitements de l''insuffisance veineuse',   64,
       'Contention, sclérothérapie, veinotoniques.'),
      ('med_coeur', 'v2_med_hemorroides',      'Traitements des crises hémorroïdaires',     65,
       'Règles hygiéno-diététiques et traitements locaux.'),
      ('med_coeur', 'v2_med_urgences',         'Médicaments des urgences cardiovasculaires',66,
       'Médicaments de l''urgence, indications et disponibilités.'),
      ('med_coeur', 'v2_med_hta_classes',      'Antihypertenseurs par classe',             67,
       'Cibles d''action et classes thérapeutiques.'),
      ('med_coeur', 'v2_med_hta_assoc',        'Associations fixes et dispensation',        68,
       'Associations fixes et conseils de dispensation.')
    ) AS t(chap, code, titre, ordre, resume)
    ORDER BY ordre
  LOOP
    IF rec.code IN (
      'v2_sang_composition', 'v2_med_anemies',
      'v2_cv_atherome', 'v2_med_crise_angor'
    ) THEN
      prev := NULL;
    END IF;

    INSERT INTO jeupharma.modules_cours (
      parcours_id, parent_id, code, titre, resume, objectifs, ordre, publie, est_groupe,
      prerequis_module_id, version_publication, statut, criteres_json, contenu_maj_at
    ) VALUES (
      v2,
      CASE rec.chap
        WHEN 'physio_sang'  THEN ch_physio_sang
        WHEN 'med_sang'     THEN ch_med_sang
        WHEN 'physio_coeur' THEN ch_physio_coeur
        ELSE ch_med_coeur
      END,
      rec.code, rec.titre, rec.resume, '', rec.ordre, true, false,
      prev, 1, 'publie', v_crit_lecture, now()
    )
    RETURNING id INTO v_id;

    prev := v_id;
  END LOOP;

  RAISE NOTICE '073: parcours % créé avec chapitres + leçons', v2;
END;
$$;

-- =============================================================================
-- Copie des blocs contenu depuis V1 (hors jeu / molecule)
-- =============================================================================
CREATE OR REPLACE FUNCTION pg_temp.jp_v2_src(p_code text)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT id FROM jeupharma.modules_cours
  WHERE parcours_id = (SELECT id FROM jeupharma.parcours_apprentissage WHERE code = 'cardiovasculaires_deust_2a')
    AND code = p_code
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION pg_temp.jp_v2_dst(p_code text)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT id FROM jeupharma.modules_cours
  WHERE parcours_id = (SELECT id FROM jeupharma.parcours_apprentissage WHERE code = 'cardiovasculaires_v2')
    AND code = p_code
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION pg_temp.jp_v2_copy_blocs(
  p_src text,
  p_dst text,
  p_min int,
  p_max int,
  p_exclude_types text[] DEFAULT ARRAY['jeu', 'molecule', 'recommandation']
)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  sid uuid := pg_temp.jp_v2_src(p_src);
  did uuid := pg_temp.jp_v2_dst(p_dst);
  n int;
BEGIN
  IF sid IS NULL THEN RAISE EXCEPTION 'source % manquante', p_src; END IF;
  IF did IS NULL THEN RAISE EXCEPTION 'destination % manquante', p_dst; END IF;

  INSERT INTO jeupharma.module_blocs (
    module_id, ordre, type_bloc, titre, payload_json, visible, niveau_min, niveau_max
  )
  SELECT
    did,
    b.ordre,
    b.type_bloc,
    b.titre,
    COALESCE(b.payload_json, '{}'::jsonb)
      || jsonb_build_object('seed_key', '073:v2:' || p_dst || ':' || b.ordre || ':' || b.type_bloc),
    COALESCE(b.visible, true),
    COALESCE(b.niveau_min, 1),
    COALESCE(b.niveau_max, 5)
  FROM jeupharma.module_blocs b
  WHERE b.module_id = sid
    AND b.ordre >= p_min
    AND b.ordre <= p_max
    AND NOT (b.type_bloc = ANY (p_exclude_types));

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.jp_v2_reco(
  p_dst text,
  p_ordre int,
  p_titre text,
  p_corps text,
  p_refs jsonb  -- [{label, code_lecon}]
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  did uuid := pg_temp.jp_v2_dst(p_dst);
  pid uuid;
  refs jsonb := '[]'::jsonb;
  r jsonb;
  mid uuid;
BEGIN
  IF did IS NULL THEN RAISE EXCEPTION 'destination % manquante', p_dst; END IF;
  SELECT parcours_id INTO pid FROM jeupharma.modules_cours WHERE id = did;

  FOR r IN SELECT * FROM jsonb_array_elements(p_refs) LOOP
    SELECT id INTO mid FROM jeupharma.modules_cours
    WHERE parcours_id = pid AND code = r->>'code' AND NOT est_groupe;
    IF mid IS NULL THEN
      RAISE EXCEPTION 'leçon cible reco % introuvable', r->>'code';
    END IF;
    refs := refs || jsonb_build_array(jsonb_build_object(
      'label', r->>'label',
      'module_id', mid,
      'parcours_id', pid,
      'target_kind', 'lecon',
      'href', '',
      'bloc_id', ''
    ));
  END LOOP;

  INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
  VALUES (
    did, p_ordre, 'recommandation', p_titre,
    jsonb_build_object(
      'corps_html', p_corps,
      'references', refs,
      'lien_label', '',
      'lien_href', '',
      'lien_module_id', '',
      'lien_parcours_id', '',
      'seed_key', '073:v2:reco:' || p_dst || ':' || p_ordre
    ),
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.jp_v2_mol_placeholder(
  p_dst text,
  p_ordre int,
  p_titre text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  did uuid := pg_temp.jp_v2_dst(p_dst);
BEGIN
  INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
  VALUES (
    did, p_ordre, 'molecule', p_titre,
    jsonb_build_object(
      'mode', 'fiche',
      'matrice_id', '',
      'matrice_ids', '[]'::jsonb,
      'valeurs', '{}'::jsonb,
      'seed_key', '073:v2:mol:' || p_dst || ':' || p_ordre
    ),
    true
  );
END;
$$;

DO $$
DECLARE
  n int;
BEGIN
  -- ===== Physiopathologie du Sang =====
  n := pg_temp.jp_v2_copy_blocs('rappel_sang', 'v2_sang_composition', 10, 150);
  n := pg_temp.jp_v2_copy_blocs('pathologie_plaquettes', 'v2_sang_hemostase', 10, 90);
  -- Anémies patho (sans médicaments / molécules)
  n := pg_temp.jp_v2_copy_blocs('pathologie_du_globule_rouge', 'v2_sang_anemies', 10, 100);
  n := pg_temp.jp_v2_copy_blocs('pathologie_du_globule_rouge', 'v2_sang_anemies', 160, 190);
  n := pg_temp.jp_v2_copy_blocs('pathologie_du_globule_rouge', 'v2_sang_anemies', 220, 380);
  PERFORM pg_temp.jp_v2_reco(
    'v2_sang_anemies', 500,
    'Médicaments utilisables dans les anémies',
    '<p>Les traitements des anémies (fer, vitamines B9/B12, érythropoïétines) sont détaillés dans la leçon médicaments dédiée.</p>',
    '[{"label":"Médicaments des anémies","code":"v2_med_anemies"}]'::jsonb
  );

  n := pg_temp.jp_v2_copy_blocs('pathologie_plaquettes', 'v2_sang_thromboses', 100, 170);
  PERFORM pg_temp.jp_v2_reco(
    'v2_sang_thromboses', 500,
    'Médicaments utilisables dans les thromboses',
    '<p>Selon le terrain (artériel ou veineux), on utilise des antiagrégants et/ou des anticoagulants.</p>',
    '[
      {"label":"Antiagrégants plaquettaires","code":"v2_med_antiagregants"},
      {"label":"Héparines","code":"v2_med_heparines"},
      {"label":"Anticoagulants oraux directs","code":"v2_med_aod"},
      {"label":"Antivitamines K","code":"v2_med_avk"}
    ]'::jsonb
  );

  n := pg_temp.jp_v2_copy_blocs('pathologie_plaquettes', 'v2_sang_hemophilies', 180, 230);
  PERFORM pg_temp.jp_v2_reco(
    'v2_sang_hemophilies', 500,
    'Médicaments utilisables (hémostatiques)',
    '<p>Les hémostatiques locaux et généraux (dont l’acide tranéxamique) sont détaillés dans la leçon dédiée.</p>',
    '[{"label":"Hémostatiques","code":"v2_med_hemostatiques"}]'::jsonb
  );

  n := pg_temp.jp_v2_copy_blocs('pathologie_du_globule_blanc', 'v2_sang_globule_blanc', 10, 999, ARRAY['jeu','molecule']);

  -- ===== Médicaments du sang =====
  n := pg_temp.jp_v2_copy_blocs('pathologie_du_globule_rouge', 'v2_med_anemies', 110, 150);
  n := pg_temp.jp_v2_copy_blocs('pathologie_du_globule_rouge', 'v2_med_anemies', 210, 210); -- conseil B9/B12
  n := pg_temp.jp_v2_copy_blocs('pathologie_du_globule_rouge', 'v2_med_anemies', 250, 250); -- texte EPO
  PERFORM pg_temp.jp_v2_mol_placeholder('v2_med_anemies', 900, 'Molécules — anémies (à lier)');

  n := pg_temp.jp_v2_copy_blocs('m_dicaments_du_gr', 'v2_med_antiagregants', 10, 90);
  PERFORM pg_temp.jp_v2_mol_placeholder('v2_med_antiagregants', 900, 'Molécules — antiagrégants (à lier)');

  n := pg_temp.jp_v2_copy_blocs('m_dicaments_du_gr', 'v2_med_heparines', 100, 190);
  PERFORM pg_temp.jp_v2_mol_placeholder('v2_med_heparines', 900, 'Molécules — héparines (à lier)');

  n := pg_temp.jp_v2_copy_blocs('m_dicaments_du_gr', 'v2_med_aod', 210, 300);
  PERFORM pg_temp.jp_v2_mol_placeholder('v2_med_aod', 900, 'Molécules — AOD (à lier)');

  n := pg_temp.jp_v2_copy_blocs('m_dicaments_du_gr', 'v2_med_avk', 310, 410);
  PERFORM pg_temp.jp_v2_mol_placeholder('v2_med_avk', 900, 'Molécules — AVK (à lier)');

  n := pg_temp.jp_v2_copy_blocs('pathologie_plaquettes', 'v2_med_hemostatiques', 240, 250);
  PERFORM pg_temp.jp_v2_mol_placeholder('v2_med_hemostatiques', 900, 'Molécules — hémostatiques (à lier)');

  -- ===== Physiopathologie du cœur =====
  -- Conserver la reco « artériosclérose vs athérosclérose » du V1
  n := pg_temp.jp_v2_copy_blocs('cv_definitions', 'v2_cv_atherome', 10, 999, ARRAY['jeu', 'molecule']);

  n := pg_temp.jp_v2_copy_blocs('cv_angor', 'v2_cv_angor', 10, 70);
  PERFORM pg_temp.jp_v2_reco(
    'v2_cv_angor', 500,
    'Médicaments utilisables dans l’angor',
    '<p>Le traitement de l’angor se décline en traitement de crise et traitements de fond.</p>',
    '[
      {"label":"Traitement de crise de l''angor","code":"v2_med_crise_angor"},
      {"label":"Dérivés nitrés","code":"v2_med_nitrates"},
      {"label":"Bêtabloquants","code":"v2_med_betabloquants"},
      {"label":"Inhibiteurs calciques","code":"v2_med_inca"},
      {"label":"Autres anti-angoreux","code":"v2_med_autres_angoreux"}
    ]'::jsonb
  );

  n := pg_temp.jp_v2_copy_blocs('cv_idm', 'v2_cv_idm', 10, 120);
  PERFORM pg_temp.jp_v2_reco(
    'v2_cv_idm', 500,
    'Médicaments utilisables après un IDM',
    '<p>Le traitement du post-infarctus (prévention, ordonnance type BASIC) est détaillé dans la leçon médicaments dédiée.</p>',
    '[{"label":"Traitement du post-infarctus","code":"v2_med_post_idm"}]'::jsonb
  );

  n := pg_temp.jp_v2_copy_blocs('cv_arythmies', 'v2_cv_arythmies', 10, 80);
  PERFORM pg_temp.jp_v2_reco(
    'v2_cv_arythmies', 500,
    'Médicaments utilisables dans les arythmies',
    '<p>Les antiarythmiques se classent selon Vaughan-Williams. Les classes 2 et 4 correspondent aux bêtabloquants et aux inhibiteurs calciques déjà vus.</p>',
    '[
      {"label":"Antiarythmiques de classe 1","code":"v2_med_antiarythmiques_c1"},
      {"label":"Bêtabloquants (classe 2)","code":"v2_med_betabloquants"},
      {"label":"Antiarythmiques de classe 3","code":"v2_med_antiarythmiques_c3"},
      {"label":"Inhibiteurs calciques (classe 4)","code":"v2_med_inca"}
    ]'::jsonb
  );

  n := pg_temp.jp_v2_copy_blocs('cv_ic', 'v2_cv_ic', 10, 70);
  PERFORM pg_temp.jp_v2_reco(
    'v2_cv_ic', 500,
    'Médicaments utilisables dans l’insuffisance cardiaque',
    '<p>Plusieurs classes interviennent dans l’insuffisance cardiaque (bêtabloquants, IEC, ARA 2, digitaliques, ARNI, gliflozines…).</p>',
    '[
      {"label":"Bêtabloquants","code":"v2_med_betabloquants"},
      {"label":"IEC","code":"v2_med_iec"},
      {"label":"ARA 2 (sartans)","code":"v2_med_ara2"},
      {"label":"Cardiotoniques digitaliques","code":"v2_med_digitaliques"},
      {"label":"Autres traitements de l''IC","code":"v2_med_autres_ic"}
    ]'::jsonb
  );

  n := pg_temp.jp_v2_copy_blocs('cv_arterite', 'v2_cv_arterite', 10, 40);
  PERFORM pg_temp.jp_v2_reco(
    'v2_cv_arterite', 500,
    'Médicaments utilisables dans l’artérite',
    '<p>Les traitements médicamenteux de l’artérite (dont vasodilatateurs) sont détaillés dans la leçon dédiée.</p>',
    '[{"label":"Traitements de l''artérite","code":"v2_med_arterite"}]'::jsonb
  );

  n := pg_temp.jp_v2_copy_blocs('cv_veines', 'v2_cv_veines', 10, 210);
  PERFORM pg_temp.jp_v2_reco(
    'v2_cv_veines', 500,
    'Médicaments / traitements de l’insuffisance veineuse',
    '<p>Contention, sclérothérapie et veinotoniques sont détaillés dans la leçon médicaments dédiée.</p>',
    '[{"label":"Traitements de l''insuffisance veineuse","code":"v2_med_veines"}]'::jsonb
  );

  n := pg_temp.jp_v2_copy_blocs('cv_veines', 'v2_cv_hemorroides', 280, 320);
  PERFORM pg_temp.jp_v2_reco(
    'v2_cv_hemorroides', 500,
    'Médicaments utilisables dans les crises hémorroïdaires',
    '<p>Les traitements (veinotoniques, locaux, etc.) sont détaillés dans la leçon médicaments dédiée.</p>',
    '[{"label":"Traitements des crises hémorroïdaires","code":"v2_med_hemorroides"}]'::jsonb
  );

  n := pg_temp.jp_v2_copy_blocs('cv_urgences', 'v2_cv_oap', 10, 50);
  PERFORM pg_temp.jp_v2_reco(
    'v2_cv_oap', 500,
    'Médicaments des urgences cardiovasculaires',
    '<p>Les médicaments de l’urgence (indications et disponibilités) sont détaillés dans la leçon dédiée.</p>',
    '[{"label":"Médicaments des urgences cardiovasculaires","code":"v2_med_urgences"}]'::jsonb
  );

  n := pg_temp.jp_v2_copy_blocs('hta_rappel_pa', 'v2_hta_pa', 10, 100);
  n := pg_temp.jp_v2_copy_blocs('hta_raa', 'v2_hta_raa', 10, 900);
  n := pg_temp.jp_v2_copy_blocs('hta_clinique', 'v2_hta_clinique', 10, 900);
  PERFORM pg_temp.jp_v2_reco(
    'v2_hta_clinique', 500,
    'Médicaments utilisables dans l’HTA',
    '<p>Les antihypertenseurs par classe et les associations fixes / dispensation sont détaillés dans les leçons médicaments du cœur.</p>',
    '[
      {"label":"Antihypertenseurs par classe","code":"v2_med_hta_classes"},
      {"label":"Associations fixes et dispensation","code":"v2_med_hta_assoc"}
    ]'::jsonb
  );

  -- ===== Médicaments du cœur =====
  n := pg_temp.jp_v2_copy_blocs('cv_angor', 'v2_med_crise_angor', 80, 130);
  PERFORM pg_temp.jp_v2_mol_placeholder('v2_med_crise_angor', 900, 'Molécules — crise angor (à lier)');

  n := pg_temp.jp_v2_copy_blocs('cv_angor', 'v2_med_nitrates', 140, 190);
  PERFORM pg_temp.jp_v2_mol_placeholder('v2_med_nitrates', 900, 'Molécules — dérivés nitrés (à lier)');

  n := pg_temp.jp_v2_copy_blocs('cv_angor', 'v2_med_betabloquants', 200, 300);
  PERFORM pg_temp.jp_v2_mol_placeholder('v2_med_betabloquants', 900, 'Molécules — bêtabloquants (à lier)');

  n := pg_temp.jp_v2_copy_blocs('cv_angor', 'v2_med_inca', 320, 370);
  PERFORM pg_temp.jp_v2_mol_placeholder('v2_med_inca', 900, 'Molécules — inhibiteurs calciques (à lier)');

  n := pg_temp.jp_v2_copy_blocs('cv_angor', 'v2_med_autres_angoreux', 390, 420);
  PERFORM pg_temp.jp_v2_mol_placeholder('v2_med_autres_angoreux', 900, 'Molécules — autres anti-angoreux (à lier)');

  n := pg_temp.jp_v2_copy_blocs('cv_idm', 'v2_med_post_idm', 130, 200);

  n := pg_temp.jp_v2_copy_blocs('cv_arythmies', 'v2_med_antiarythmiques_c1', 90, 140);
  PERFORM pg_temp.jp_v2_mol_placeholder('v2_med_antiarythmiques_c1', 900, 'Molécules — antiarythmiques classe 1 (à lier)');

  n := pg_temp.jp_v2_copy_blocs('cv_arythmies', 'v2_med_antiarythmiques_c3', 190, 220);
  PERFORM pg_temp.jp_v2_mol_placeholder('v2_med_antiarythmiques_c3', 900, 'Molécules — antiarythmiques classe 3 (à lier)');

  n := pg_temp.jp_v2_copy_blocs('cv_ic', 'v2_med_iec', 110, 150);
  PERFORM pg_temp.jp_v2_mol_placeholder('v2_med_iec', 900, 'Molécules — IEC (à lier)');

  n := pg_temp.jp_v2_copy_blocs('cv_ic', 'v2_med_ara2', 160, 200);
  PERFORM pg_temp.jp_v2_mol_placeholder('v2_med_ara2', 900, 'Molécules — ARA 2 (à lier)');

  n := pg_temp.jp_v2_copy_blocs('cv_ic', 'v2_med_digitaliques', 210, 250);
  PERFORM pg_temp.jp_v2_mol_placeholder('v2_med_digitaliques', 900, 'Molécules — digitaliques (à lier)');

  n := pg_temp.jp_v2_copy_blocs('cv_ic', 'v2_med_autres_ic', 260, 280);

  n := pg_temp.jp_v2_copy_blocs('cv_arterite', 'v2_med_arterite', 50, 60);
  n := pg_temp.jp_v2_copy_blocs('cv_veines', 'v2_med_veines', 220, 260);
  n := pg_temp.jp_v2_copy_blocs('cv_veines', 'v2_med_hemorroides', 330, 330);
  n := pg_temp.jp_v2_copy_blocs('cv_urgences', 'v2_med_urgences', 60, 80);

  n := pg_temp.jp_v2_copy_blocs('hta_classes', 'v2_med_hta_classes', 10, 890);
  PERFORM pg_temp.jp_v2_mol_placeholder('v2_med_hta_classes', 900, 'Molécules — antihypertenseurs (à lier)');

  n := pg_temp.jp_v2_copy_blocs('hta_associations', 'v2_med_hta_assoc', 10, 890);
  PERFORM pg_temp.jp_v2_mol_placeholder('v2_med_hta_assoc', 900, 'Molécules — associations (à lier)');

  RAISE NOTICE '073: blocs contenus + recommandations + placeholders molécules copiés';
END;
$$;
