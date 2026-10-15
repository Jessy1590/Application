-- =============================================================================
-- 060 : Quiz connaissance de déblocage — Composition Sang + Pathologie Plaquettes
--
-- Parcours `cardiovasculaires_deust_2a`, chapitre Sang.
-- Pattern aligné sur 032 (modeles_jeu + bloc studio type_bloc='jeu' + criteres_json)
-- et sur le wizard quiz manuel (questions_manuelles + nb_auto_max).
--
-- Pour chaque leçon :
--   - banque de 10 QCM factuels DEUST ;
--   - tirage : 5 questions notées (nb_questions=5, nb_auto_max=0) ;
--   - seuil de réussite : score_min_pct=60 (≥ 3/5) pour valider la leçon
--     et débloquer la suivante via prerequis_module_id.
--
-- Cibles :
--   1. rappel_sang (Composition Sang) → débloque pathologie_du_globule_rouge
--      (prérequis déjà en place).
--   2. pathologie_plaquettes → débloque m_dicaments_du_gr (Médicaments plaquettes)
--      (prérequis posé ici si absent).
--
-- Codes : JP-CSANG, JP-PPLAQ. Idempotent (upsert par code_unique).
-- =============================================================================

DO $$
DECLARE
  pid uuid;
  def jsonb;
  defs constant jsonb := $json$
  [
    {
      "code": "JP-CSANG",
      "type": "quiz",
      "titre": "Composition Sang — Quiz connaissance",
      "lecon": "rappel_sang",
      "suivante": "pathologie_du_globule_rouge",
      "pct": 60,
      "cfg": {
        "nb_questions": 5,
        "nb_propositions": 3,
        "nb_auto_max": 0,
        "champs": [],
        "champs_interroges": [],
        "questions_manuelles": [
          {
            "id": "csang-q01",
            "question": "Le sang représente environ quel pourcentage du poids corporel ?",
            "propositions": ["Environ 8 %", "Environ 25 %", "Environ 50 %"],
            "correct": "Environ 8 %"
          },
          {
            "id": "csang-q02",
            "question": "Quelles sont les deux grandes parties du sang ?",
            "propositions": [
              "Le plasma et les éléments figurés",
              "Uniquement des globules rouges et de l’eau",
              "La lymphe et la moelle osseuse"
            ],
            "correct": "Le plasma et les éléments figurés"
          },
          {
            "id": "csang-q03",
            "question": "Le plasma est composé principalement de…",
            "propositions": ["Eau (environ 91 %)", "Hémoglobine", "Plaquettes"],
            "correct": "Eau (environ 91 %)"
          },
          {
            "id": "csang-q04",
            "question": "Quel est le rôle principal des globules rouges (hématies) ?",
            "propositions": [
              "Transporter l’oxygène",
              "Former le clou plaquettaire",
              "Produire des anticorps"
            ],
            "correct": "Transporter l’oxygène"
          },
          {
            "id": "csang-q05",
            "question": "Quel est le rôle principal des plaquettes ?",
            "propositions": [
              "Participer à l’hémostase",
              "Transporter le CO₂ uniquement",
              "Digérer les bactéries"
            ],
            "correct": "Participer à l’hémostase"
          },
          {
            "id": "csang-q06",
            "question": "Quel est le rôle principal des globules blancs (leucocytes) ?",
            "propositions": [
              "Défense contre les agents pathogènes",
              "Transporter le fer vers les tissus",
              "Stabiliser le caillot de fibrine"
            ],
            "correct": "Défense contre les agents pathogènes"
          },
          {
            "id": "csang-q07",
            "question": "Quelle est la durée de vie approximative d’un globule rouge ?",
            "propositions": ["Environ 120 jours", "Environ 7 jours", "Environ 24 heures"],
            "correct": "Environ 120 jours"
          },
          {
            "id": "csang-q08",
            "question": "Quelle est la durée de vie approximative des plaquettes ?",
            "propositions": ["Environ 7 jours", "Environ 120 jours", "Plusieurs années"],
            "correct": "Environ 7 jours"
          },
          {
            "id": "csang-q09",
            "question": "Où sont principalement produits les éléments figurés du sang ?",
            "propositions": ["Dans la moelle osseuse", "Dans le plasma uniquement", "Dans les ganglions seulement"],
            "correct": "Dans la moelle osseuse"
          },
          {
            "id": "csang-q10",
            "question": "L’hémoglobine transporte l’oxygène grâce à quel atome présent dans le groupement hème ?",
            "propositions": ["Le fer", "Le calcium", "Le sodium"],
            "correct": "Le fer"
          }
        ]
      }
    },
    {
      "code": "JP-PPLAQ",
      "type": "quiz",
      "titre": "Pathologie Plaquettes — Quiz connaissance",
      "lecon": "pathologie_plaquettes",
      "suivante": "m_dicaments_du_gr",
      "pct": 60,
      "cfg": {
        "nb_questions": 5,
        "nb_propositions": 3,
        "nb_auto_max": 0,
        "champs": [],
        "champs_interroges": [],
        "questions_manuelles": [
          {
            "id": "pplaq-q01",
            "question": "L’hémostase primaire aboutit principalement à…",
            "propositions": [
              "Un clou plaquettaire fragile",
              "Une fibrine définitive seule",
              "Une destruction des globules rouges"
            ],
            "correct": "Un clou plaquettaire fragile"
          },
          {
            "id": "pplaq-q02",
            "question": "Comment appelle-t-on aussi l’hémostase secondaire ?",
            "propositions": ["La coagulation", "L’érythropoïèse", "La diapédèse"],
            "correct": "La coagulation"
          },
          {
            "id": "pplaq-q03",
            "question": "Qu’est-ce qu’une thrombose ?",
            "propositions": [
              "La formation d’un caillot dans un vaisseau",
              "Une diminution des globules blancs",
              "Une carence en fer isolée"
            ],
            "correct": "La formation d’un caillot dans un vaisseau"
          },
          {
            "id": "pplaq-q04",
            "question": "Une thrombose artérielle peut notamment entraîner…",
            "propositions": [
              "Un infarctus du myocarde ou un AVC",
              "Uniquement une carence en vitamine K",
              "Une augmentation des lymphocytes uniquement"
            ],
            "correct": "Un infarctus du myocarde ou un AVC"
          },
          {
            "id": "pplaq-q05",
            "question": "Une thrombose veineuse profonde peut se compliquer d’…",
            "propositions": [
              "Une embolie pulmonaire",
              "Une otite moyenne",
              "Une fracture spontanée"
            ],
            "correct": "Une embolie pulmonaire"
          },
          {
            "id": "pplaq-q06",
            "question": "Qu’est-ce qu’une thrombopénie ?",
            "propositions": [
              "Une diminution du nombre de plaquettes",
              "Une augmentation du nombre de plaquettes",
              "Une absence totale de plasma"
            ],
            "correct": "Une diminution du nombre de plaquettes"
          },
          {
            "id": "pplaq-q07",
            "question": "Quelle manifestation cutanée est typique d’une thrombopénie ?",
            "propositions": ["Le purpura", "L’ictère isolé", "L’alopécie"],
            "correct": "Le purpura"
          },
          {
            "id": "pplaq-q08",
            "question": "Qu’est-ce qu’une thrombocytose (thrombocytémie) ?",
            "propositions": [
              "Une augmentation du nombre de plaquettes",
              "Une diminution du nombre de plaquettes",
              "Une absence d’hémoglobine"
            ],
            "correct": "Une augmentation du nombre de plaquettes"
          },
          {
            "id": "pplaq-q09",
            "question": "L’agrégation plaquettaire excessive favorise surtout…",
            "propositions": [
              "La thrombose",
              "L’anémie ferriprive",
              "L’infection virale"
            ],
            "correct": "La thrombose"
          },
          {
            "id": "pplaq-q10",
            "question": "Dans le cadre d’une thrombose veineuse, on utilise principalement des…",
            "propositions": [
              "Anticoagulants",
              "Antibiotiques",
              "Antiémétiques"
            ],
            "correct": "Anticoagulants"
          }
        ]
      }
    }
  ]
  $json$::jsonb;
  v_lecon uuid;
  v_suiv uuid;
  v_modele uuid;
  v_cfg jsonb;
  v_bloc uuid;
BEGIN
  SELECT id INTO pid FROM jeupharma.parcours_apprentissage WHERE code = 'cardiovasculaires_deust_2a';
  IF pid IS NULL THEN
    RAISE EXCEPTION 'parcours cardiovasculaires_deust_2a manquant';
  END IF;

  FOR def IN SELECT * FROM jsonb_array_elements(defs) LOOP
    SELECT id INTO v_lecon FROM jeupharma.modules_cours
    WHERE parcours_id = pid AND code = def->>'lecon' AND NOT est_groupe;
    IF v_lecon IS NULL THEN
      RAISE EXCEPTION 'leçon % introuvable', def->>'lecon';
    END IF;

    SELECT id INTO v_suiv FROM jeupharma.modules_cours
    WHERE parcours_id = pid AND code = def->>'suivante' AND NOT est_groupe;
    IF v_suiv IS NULL THEN
      RAISE EXCEPTION 'leçon suivante % introuvable', def->>'suivante';
    END IF;

    v_cfg := coalesce(def->'cfg', '{}'::jsonb)
      || jsonb_build_object('parcours_code', 'cardiovasculaires_deust_2a');

    INSERT INTO jeupharma.modeles_jeu (
      code_unique, type_jeu, titre, parcours_id, module_ids, mode,
      configuration_json, en_pause, actif
    ) VALUES (
      def->>'code', def->>'type', def->>'titre', pid, ARRAY[v_lecon], 'entrainement',
      v_cfg, false, true
    )
    ON CONFLICT (code_unique) DO UPDATE SET
      type_jeu = EXCLUDED.type_jeu,
      titre = EXCLUDED.titre,
      parcours_id = EXCLUDED.parcours_id,
      module_ids = EXCLUDED.module_ids,
      mode = EXCLUDED.mode,
      configuration_json = EXCLUDED.configuration_json,
      en_pause = false,
      actif = true,
      updated_at = now()
    RETURNING id INTO v_modele;

    -- Bloc studio « jeu » (ordre 999, comme 032)
    SELECT id INTO v_bloc FROM jeupharma.module_blocs
    WHERE module_id = v_lecon
      AND type_bloc = 'jeu'
      AND payload_json->>'modele_id' = v_modele::text
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
          'modele_id', v_modele,
          'code_unique', def->>'code',
          'libelle_cta', 'Jouer',
          'type_jeu', def->>'type'
        ),
        visible = true,
        updated_at = now()
      WHERE id = v_bloc;
    END IF;

    -- Critères de la leçon : lecture + quiz ≥ 60 % (3/5), logique ET
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

    -- Brancher le déblocage de la leçon suivante si pas déjà verrouillée ailleurs
    UPDATE jeupharma.modules_cours SET
      prerequis_module_id = v_lecon,
      updated_at = now()
    WHERE id = v_suiv
      AND (prerequis_module_id IS NULL OR prerequis_module_id = v_lecon);
  END LOOP;
END;
$$;
