-- =============================================================================
-- 032 : Jeux JP-CV* du parcours « CardioVasculaires - Deust 2A »
--
-- 1. Assouplit le format des codes jeu : `JP-` + 4 ou 5 caractères [A-Z0-9]
--    (les codes du plan JP-CVS1…, JP-CVC1…, JP-CVH1… n'ont que 4 caractères ;
--    le générateur du studio continue de produire 5 caractères).
-- 2. Crée / met à jour 17 `modeles_jeu` (JP-CVS1–5, JP-CVSO1, JP-CVC1–6, JP-CVH1–5) :
--    - `parcours_id` = cardiovasculaires_deust_2a, `module_ids` = leçons du pool ;
--    - AUCUN `matrice_ids` figé : le pool se résout via les publications
--      (`v2_connaissances_visibles`) des leçons débloquées de `module_ids` + ancêtres ;
--      tant que les pubs molécules ne sont pas posées, un jeu est « sans molécule ».
-- 3. Ajoute un bloc studio `type_bloc='jeu'` (ordre 999, CTA « Jouer ») dans la leçon cible.
-- 4. Met à jour `criteres_json` des leçons : lecture + jeu `score_min_pct` 70 (L17 : 80),
--    logique `et`. L6 (Définitions athérome) reste « lecture seule ». JP-CVSO1 (ordonnance
--    ACO, L4) est proposée mais NON requise (le critère L4 = JP-CVS4).
-- Idempotent : relançable (upsert jeu par code, bloc retrouvé par modele_id).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Format du code
-- ---------------------------------------------------------------------------
ALTER TABLE jeupharma.modeles_jeu DROP CONSTRAINT IF EXISTS modeles_jeu_code_format;
ALTER TABLE jeupharma.modeles_jeu
  ADD CONSTRAINT modeles_jeu_code_format CHECK (code_unique ~ '^JP-[A-Z0-9]{4,5}$');

-- ---------------------------------------------------------------------------
-- 2-4. Jeux + blocs + critères
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  pid uuid;
  def jsonb;
  defs constant jsonb := $json$
  [
    {"code":"JP-CVS1","type":"quiz","titre":"Sang — Quiz rappel : fer et carences",
     "mods":["sang_rappel"],"lecon":"sang_rappel","pct":70,"req":true,
     "cfg":{"champs":["indications","classe_pharmacologique","precautions_emploi"],"nb_questions":8,"nb_propositions":3}},

    {"code":"JP-CVS2","type":"trous","titre":"Sang — Tableau à trous anémies",
     "mods":["sang_rappel","sang_anemies"],"lecon":"sang_anemies","pct":70,"req":true,
     "cfg":{"champs":["classe_pharmacologique","indications","effets_indesirables"],"nb_fiches":5,"densite_trous":3}},

    {"code":"JP-CVS3","type":"fiche_aleatoire","titre":"Sang — Fiche aléatoire antiagrégants",
     "mods":["sang_antiagregants"],"lecon":"sang_antiagregants","pct":70,"req":true,
     "cfg":{"seuil_exclusion":8,"nb_notes_exclusion":3}},

    {"code":"JP-CVS4","type":"quiz","titre":"Sang — Quiz anticoagulants : sites d'action et surveillance",
     "mods":["sang_anticoagulants"],"lecon":"sang_anticoagulants","pct":70,"req":true,
     "cfg":{"champs":["classe_pharmacologique","surveillances","precautions_emploi"],"nb_questions":10,"nb_propositions":3}},

    {"code":"JP-CVSO1","type":"ordonnance","titre":"Sang — Ordonnance type anticoagulants",
     "mods":["sang_anticoagulants"],"lecon":"sang_anticoagulants","pct":70,"req":false,
     "cfg":{"champs":["indications","contre_indications","interactions","surveillances"],
            "regles":[
              {"type":"classe_pharmacologique","classe_id":"b83b9c18-208d-45c3-9ea0-e2f83958bba7","nombre":1},
              {"type":"classe_pharmacologique","classe_id":"107e9902-1d24-4ff8-b96e-a66ca9aa78a1","nombre":1},
              {"type":"classe_pharmacologique","classe_id":"2805e051-6614-47ed-b7c1-2d87518ce791","nombre":1}]}},

    {"code":"JP-CVS5","type":"quiz","titre":"Sang — Révision du chapitre",
     "mods":["sang_rappel","sang_anemies","sang_antiagregants","sang_anticoagulants","sang_hemophilies"],
     "lecon":"sang_hemophilies","pct":70,"req":true,
     "cfg":{"champs":["indications","contre_indications","effets_indesirables","classe_pharmacologique"],"nb_questions":15,"nb_propositions":3}},

    {"code":"JP-CVC1","type":"quiz","titre":"Angor — Quiz crise vs traitement de fond",
     "mods":["cv_angor"],"lecon":"cv_angor","pct":70,"req":true,
     "cfg":{"champs":["indications","classe_therapeutique","classe_pharmacologique","precautions_emploi"],"nb_questions":8,"nb_propositions":3}},

    {"code":"JP-CVC2","type":"ordonnance","titre":"IDM — Ordonnance de sortie BASIC (avec statine)",
     "mods":["sang_antiagregants","cv_angor","cv_idm"],"lecon":"cv_idm","pct":70,"req":true,
     "cfg":{"champs":["indications","contre_indications","interactions","surveillances"],
            "regles":[
              {"type":"classe_pharmacologique","classe_id":"421fd733-0f57-4512-881a-5b2cb5eab9a5","nombre":1},
              {"type":"classe_pharmacologique","classe_id":"0e1c086c-ea1e-45fa-b4cc-71cc247a12e8","nombre":1},
              {"type":"classe_pharmacologique","classe_id":"ab71d21f-fff8-4663-96b7-cdaff0add899","nombre":1},
              {"type":"classe_pharmacologique","classe_id":"491a844c-ed38-4a51-a220-8be553585b49","nombre":1}]}},

    {"code":"JP-CVC3","type":"quiz","titre":"Arythmies — Quiz classes de Vaughan-Williams",
     "mods":["cv_angor","cv_arythmies"],"lecon":"cv_arythmies","pct":70,"req":true,
     "cfg":{"champs":["classe_pharmacologique","indications","contre_indications","effets_indesirables"],"nb_questions":10,"nb_propositions":3}},

    {"code":"JP-CVC4","type":"trous","titre":"Insuffisance cardiaque — Tableau à trous",
     "mods":["cv_ic"],"lecon":"cv_ic","pct":70,"req":true,
     "cfg":{"champs":["classe_pharmacologique","indications","contre_indications","effets_indesirables"],"nb_fiches":5,"densite_trous":3}},

    {"code":"JP-CVC5","type":"quiz","titre":"Artérite et veines — Quiz conseil jambes lourdes",
     "mods":["cv_veines"],"lecon":"cv_veines","pct":70,"req":true,
     "cfg":{"champs":["indications","classe_pharmacologique","precautions_emploi","interactions"],"nb_questions":8,"nb_propositions":3}},

    {"code":"JP-CVC6","type":"quiz","titre":"Appareil CV — Révision du chapitre",
     "mods":["cv_definitions","cv_angor","cv_idm","cv_arythmies","cv_ic","cv_veines","cv_urgences"],
     "lecon":"cv_urgences","pct":70,"req":true,
     "cfg":{"champs":["indications","contre_indications","effets_indesirables","classe_pharmacologique"],"nb_questions":15,"nb_propositions":3}},

    {"code":"JP-CVH1","type":"quiz","titre":"Rappel PA — Quiz repères et molécules cibles",
     "mods":["cv_angor","cv_ic","hta_rappel_pa"],"lecon":"hta_rappel_pa","pct":70,"req":true,
     "cfg":{"champs":["indications","classe_pharmacologique","precautions_emploi"],"nb_questions":8,"nb_propositions":3}},

    {"code":"JP-CVH2","type":"trous","titre":"RAA — Tableau à trous IEC / sartans",
     "mods":["cv_ic","hta_raa"],"lecon":"hta_raa","pct":70,"req":true,
     "cfg":{"champs":["classe_pharmacologique","indications","contre_indications","effets_indesirables"],"nb_fiches":5,"densite_trous":3}},

    {"code":"JP-CVH3","type":"quiz","titre":"HTA clinique — Quiz cas patients",
     "mods":["cv_angor","cv_ic","hta_clinique"],"lecon":"hta_clinique","pct":70,"req":true,
     "cfg":{"champs":["indications","contre_indications","precautions_emploi","interactions"],"nb_questions":10,"nb_propositions":3}},

    {"code":"JP-CVH4","type":"quiz","titre":"Antihypertenseurs — Quiz cibles d'action",
     "mods":["cv_angor","cv_ic","hta_classes"],"lecon":"hta_classes","pct":70,"req":true,
     "cfg":{"champs":["classe_pharmacologique","classe_therapeutique","indications","effets_indesirables"],"nb_questions":12,"nb_propositions":3}},

    {"code":"JP-CVH5","type":"quiz","titre":"Révision finale du parcours",
     "mods":["sang_rappel","sang_anemies","sang_antiagregants","sang_anticoagulants","sang_hemophilies",
             "cv_definitions","cv_angor","cv_idm","cv_arythmies","cv_ic","cv_veines","cv_urgences",
             "hta_rappel_pa","hta_raa","hta_clinique","hta_classes","hta_associations"],
     "lecon":"hta_associations","pct":80,"req":true,
     "cfg":{"champs":["indications","contre_indications","effets_indesirables","classe_pharmacologique","interactions"],"nb_questions":20,"nb_propositions":3}}
  ]
  $json$::jsonb;
  v_mods uuid[];
  v_lecon uuid;
  v_modele uuid;
  v_cfg jsonb;
  v_champs jsonb;
  v_bloc uuid;
  m text;
  mid uuid;
BEGIN
  SELECT id INTO pid FROM jeupharma.parcours_apprentissage WHERE code = 'cardiovasculaires_deust_2a';
  IF pid IS NULL THEN RAISE EXCEPTION 'parcours cardiovasculaires_deust_2a manquant'; END IF;

  FOR def IN SELECT * FROM jsonb_array_elements(defs) LOOP
    -- Leçons du pool (ordre conservé)
    v_mods := '{}'::uuid[];
    FOR m IN SELECT jsonb_array_elements_text(def->'mods') LOOP
      SELECT id INTO mid FROM jeupharma.modules_cours
      WHERE parcours_id = pid AND code = m AND NOT est_groupe;
      IF mid IS NULL THEN RAISE EXCEPTION 'leçon % introuvable', m; END IF;
      v_mods := array_append(v_mods, mid);
    END LOOP;

    SELECT id INTO v_lecon FROM jeupharma.modules_cours
    WHERE parcours_id = pid AND code = def->>'lecon';
    IF v_lecon IS NULL THEN RAISE EXCEPTION 'leçon cible % introuvable', def->>'lecon'; END IF;

    -- Configuration (pas de matrice_ids : pool via publications)
    v_cfg := coalesce(def->'cfg', '{}'::jsonb);
    v_champs := v_cfg->'champs';
    IF v_champs IS NOT NULL THEN
      v_cfg := v_cfg || jsonb_build_object('champs_interroges', v_champs);
    END IF;
    v_cfg := v_cfg || jsonb_build_object('parcours_code', 'cardiovasculaires_deust_2a');

    INSERT INTO jeupharma.modeles_jeu (
      code_unique, type_jeu, titre, parcours_id, module_ids, mode,
      configuration_json, en_pause, actif
    ) VALUES (
      def->>'code', def->>'type', def->>'titre', pid, v_mods, 'entrainement',
      v_cfg, false, true
    )
    ON CONFLICT (code_unique) DO UPDATE SET
      type_jeu = EXCLUDED.type_jeu,
      titre = EXCLUDED.titre,
      parcours_id = EXCLUDED.parcours_id,
      module_ids = EXCLUDED.module_ids,
      configuration_json = EXCLUDED.configuration_json,
      en_pause = false,
      actif = true,
      updated_at = now()
    RETURNING id INTO v_modele;

    -- Bloc studio « jeu »
    SELECT id INTO v_bloc FROM jeupharma.module_blocs
    WHERE module_id = v_lecon AND type_bloc = 'jeu' AND payload_json->>'modele_id' = v_modele::text
    LIMIT 1;

    IF v_bloc IS NULL THEN
      INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
      VALUES (
        v_lecon, 999, 'jeu', def->>'titre',
        jsonb_build_object(
          'modele_id', v_modele,
          'code_unique', def->>'code',
          'libelle_cta', 'Jouer',
          'type_jeu', def->>'type'
        ),
        true
      );
    ELSE
      UPDATE jeupharma.module_blocs SET
        titre = def->>'titre',
        payload_json = payload_json || jsonb_build_object(
          'modele_id', v_modele, 'code_unique', def->>'code',
          'libelle_cta', 'Jouer', 'type_jeu', def->>'type'),
        updated_at = now()
      WHERE id = v_bloc;
    END IF;

    -- Critères de la leçon : lecture + jeu requis (sauf jeu complémentaire)
    IF (def->>'req')::boolean THEN
      UPDATE jeupharma.modules_cours SET
        criteres_json = jsonb_build_object(
          'lecture', true,
          'logique', 'et',
          'jeux', jsonb_build_array(jsonb_build_object(
            'modele_id', v_modele,
            'score_min_pct', (def->>'pct')::int
          ))
        ),
        contenu_maj_at = now(),
        updated_at = now()
      WHERE id = v_lecon;
    END IF;
  END LOOP;
END;
$$;
