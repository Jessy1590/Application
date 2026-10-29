-- =============================================================================
-- Ops 085 — Quiz validation « à savoir absolument »
-- Leçons : b_tabloquants (Bétabloquants) + inhibiteur_calciques (INCA)
-- Parcours : cardiovasculaires_deust_2a
-- Projet : kpjflntnotftpzffjbud
--
-- - JP-CVBB1 : quiz manuel bêtabloquants (faits du support uniquement)
-- - JP-CVIN1 : quiz manuel inhibiteurs calciques
-- - Publie les sections « Test de connaissances » (étaient en _brouillon)
-- - Bloc jeu + criteres_json lecture + quiz ≥ 70 %
-- Idempotent (upsert modeles_jeu par code_unique).
-- =============================================================================

DO $$
DECLARE
  pid uuid;
  def jsonb;
  defs constant jsonb := $json$
  [
    {
      "code": "JP-CVBB1",
      "type": "quiz",
      "titre": "Bétabloquants — Quiz à savoir absolument",
      "lecon": "b_tabloquants",
      "pct": 70,
      "cfg": {
        "nb_questions": 5,
        "nb_propositions": 3,
        "nb_auto_max": 0,
        "champs": [],
        "champs_interroges": [],
        "consigne": "Questions sur les points à savoir absolument de la leçon Bétabloquants",
        "questions_manuelles": [
          {
            "id": "cvbb1-q01",
            "question": "Les bêtabloquants sont des…",
            "propositions": [
              "Antagonistes des récepteurs bêta du système sympathique",
              "Agonistes des récepteurs bêta du système sympathique",
              "Inhibiteurs de l’enzyme de conversion"
            ],
            "correct": "Antagonistes des récepteurs bêta du système sympathique"
          },
          {
            "id": "cvbb1-q02",
            "question": "L’action chronotrope négative des bêtabloquants signifie…",
            "propositions": [
              "Une diminution de la fréquence cardiaque",
              "Une augmentation de la fréquence cardiaque",
              "Une augmentation de la contractilité"
            ],
            "correct": "Une diminution de la fréquence cardiaque"
          },
          {
            "id": "cvbb1-q03",
            "question": "L’action inotrope négative des bêtabloquants signifie…",
            "propositions": [
              "Une diminution de l’amplitude de la contractilité du myocarde",
              "Une diminution de la pression veineuse seule",
              "Une augmentation du débit cardiaque"
            ],
            "correct": "Une diminution de l’amplitude de la contractilité du myocarde"
          },
          {
            "id": "cvbb1-q04",
            "question": "Les bêtabloquants cardiosélectifs bloquent principalement les récepteurs…",
            "propositions": ["Bêta 1", "Bêta 2", "Alpha 1"],
            "correct": "Bêta 1"
          },
          {
            "id": "cvbb1-q05",
            "question": "Selon le cours, les cardiosélectifs sont plus utilisables chez les patients…",
            "propositions": [
              "Asthmatiques ou diabétiques",
              "Uniquement en insuffisance rénale terminale",
              "Uniquement en angor instable"
            ],
            "correct": "Asthmatiques ou diabétiques"
          },
          {
            "id": "cvbb1-q06",
            "question": "Effet indésirable important : les bêtabloquants masquent…",
            "propositions": [
              "Les signes d’une hypoglycémie",
              "Les signes d’une hyperkaliémie",
              "Les signes d’une toux sèche"
            ],
            "correct": "Les signes d’une hypoglycémie"
          },
          {
            "id": "cvbb1-q07",
            "question": "Parmi les contre-indications du cours, on trouve…",
            "propositions": [
              "Le bloc auriculo-ventriculaire (BAV)",
              "L’hypertension artérielle",
              "Le traitement de fond de la migraine"
            ],
            "correct": "Le bloc auriculo-ventriculaire (BAV)"
          },
          {
            "id": "cvbb1-q08",
            "question": "Conseil absolu du cours concernant l’arrêt…",
            "propositions": [
              "Ne jamais interrompre brutalement le traitement",
              "Arrêter dès la disparition des symptômes",
              "Doubler la dose avant l’arrêt"
            ],
            "correct": "Ne jamais interrompre brutalement le traitement"
          },
          {
            "id": "cvbb1-q09",
            "question": "Quels bêtabloquants sont cités pour l’insuffisance cardiaque ?",
            "propositions": [
              "Carvédilol, bisoprolol, métoprolol, nébivolol",
              "Nifédipine, amlodipine, félodipine",
              "Vérapamil et diltiazem uniquement"
            ],
            "correct": "Carvédilol, bisoprolol, métoprolol, nébivolol"
          },
          {
            "id": "cvbb1-q10",
            "question": "Parmi les indications du cours (hors HTA), on trouve…",
            "propositions": [
              "Le traitement de fond de la migraine",
              "L’angor instable en première intention exclusive",
              "La constipation chronique"
            ],
            "correct": "Le traitement de fond de la migraine"
          }
        ]
      }
    },
    {
      "code": "JP-CVIN1",
      "type": "quiz",
      "titre": "Inhibiteurs calciques — Quiz à savoir absolument",
      "lecon": "inhibiteur_calciques",
      "pct": 70,
      "cfg": {
        "nb_questions": 5,
        "nb_propositions": 3,
        "nb_auto_max": 0,
        "champs": [],
        "champs_interroges": [],
        "consigne": "Questions sur les points à savoir absolument de la leçon Inhibiteurs calciques",
        "questions_manuelles": [
          {
            "id": "cvin1-q01",
            "question": "Les dihydropyridines (suffixe -dipine) ont surtout des effets…",
            "propositions": [
              "Vasculaires prédominants",
              "Cardiaques prédominants",
              "Diurétiques prédominants"
            ],
            "correct": "Vasculaires prédominants"
          },
          {
            "id": "cvin1-q02",
            "question": "Vérapamil (Isoptine®) et diltiazem (Tildiem®) appartiennent au groupe…",
            "propositions": [
              "INCA à effets cardiaques prédominants",
              "Dihydropyridines à effets vasculaires",
              "Bêtabloquants cardiosélectifs"
            ],
            "correct": "INCA à effets cardiaques prédominants"
          },
          {
            "id": "cvin1-q03",
            "question": "Mécanisme d’action des INCA (cours)…",
            "propositions": [
              "Ils diminuent les mouvements transmembranaires du calcium (myocarde et muscle lisse)",
              "Ils bloquent les récepteurs bêta 1 cardiaques",
              "Ils inhibent l’enzyme de conversion de l’angiotensine"
            ],
            "correct": "Ils diminuent les mouvements transmembranaires du calcium (myocarde et muscle lisse)"
          },
          {
            "id": "cvin1-q04",
            "question": "Conséquence du relâchement de la fibre musculaire lisse…",
            "propositions": [
              "Vasodilatation et diminution de la pression artérielle",
              "Vasoconstriction et hausse de la pré-charge",
              "Augmentation exclusive de la fréquence cardiaque"
            ],
            "correct": "Vasodilatation et diminution de la pression artérielle"
          },
          {
            "id": "cvin1-q05",
            "question": "Indication citée pour les INCA…",
            "propositions": [
              "Traitement de l’angor stable",
              "Traitement exclusif de l’angor instable",
              "Traitement de l’insuffisance cardiaque congestive"
            ],
            "correct": "Traitement de l’angor stable"
          },
          {
            "id": "cvin1-q06",
            "question": "Les troubles du rythme sont une indication surtout pour…",
            "propositions": [
              "Les INCA à visée cardiaque",
              "Toutes les dihydropyridines sans distinction",
              "Les diurétiques de l’anse"
            ],
            "correct": "Les INCA à visée cardiaque"
          },
          {
            "id": "cvin1-q07",
            "question": "Effet indésirable typique des INCA cité dans le cours…",
            "propositions": [
              "Œdèmes des jambes",
              "Toux sèche persistante",
              "Photosensibilisation cornéenne"
            ],
            "correct": "Œdèmes des jambes"
          },
          {
            "id": "cvin1-q08",
            "question": "Parmi les contre-indications du cours…",
            "propositions": [
              "Angor instable",
              "Hypertension artérielle",
              "Angor stable d’effort"
            ],
            "correct": "Angor instable"
          },
          {
            "id": "cvin1-q09",
            "question": "Autre contre-indication citée…",
            "propositions": [
              "Insuffisance cardiaque",
              "Migraine en traitement de fond",
              "Diabète de type 2"
            ],
            "correct": "Insuffisance cardiaque"
          },
          {
            "id": "cvin1-q10",
            "question": "Isoptine® correspond à quelle DCI ?",
            "propositions": ["Vérapamil", "Diltiazem", "Amlodipine"],
            "correct": "Vérapamil"
          }
        ]
      }
    }
  ]
  $json$::jsonb;
  v_lecon uuid;
  v_modele uuid;
  v_cfg jsonb;
  v_bloc uuid;
  v_sec uuid;
BEGIN
  SELECT id INTO pid FROM jeupharma.parcours_apprentissage
  WHERE code = 'cardiovasculaires_deust_2a';
  IF pid IS NULL THEN
    RAISE EXCEPTION 'parcours cardiovasculaires_deust_2a manquant';
  END IF;

  FOR def IN SELECT * FROM jsonb_array_elements(defs) LOOP
    SELECT id INTO v_lecon FROM jeupharma.modules_cours
    WHERE parcours_id = pid AND code = def->>'lecon' AND NOT coalesce(est_groupe, false);
    IF v_lecon IS NULL THEN
      RAISE EXCEPTION 'leçon % introuvable', def->>'lecon';
    END IF;

    -- Publier la section « Test de connaissances » (brouillon → titre publié)
    SELECT id INTO v_sec FROM jeupharma.module_blocs
    WHERE module_id = v_lecon
      AND type_bloc = 'section'
      AND (
        titre ILIKE '%test de connaissance%'
        OR coalesce(payload_json->'_brouillon'->>'titre', '') ILIKE '%test de connaissance%'
        OR (coalesce(titre, '') = '' AND ordre >= 80)
      )
    ORDER BY ordre DESC
    LIMIT 1;

    IF v_sec IS NOT NULL THEN
      UPDATE jeupharma.module_blocs SET
        titre = 'Test de connaissances',
        payload_json = coalesce(payload_json, '{}'::jsonb) - '_brouillon',
        visible = true,
        updated_at = now()
      WHERE id = v_sec;
    ELSE
      INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
      VALUES (v_lecon, 900, 'section', 'Test de connaissances', '{}'::jsonb, true)
      RETURNING id INTO v_sec;
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

    SELECT id INTO v_bloc FROM jeupharma.module_blocs
    WHERE module_id = v_lecon
      AND type_bloc = 'jeu'
      AND (
        payload_json->>'modele_id' = v_modele::text
        OR payload_json->>'code_unique' = def->>'code'
      )
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
        ordre = GREATEST(ordre, 900),
        payload_json = coalesce(payload_json, '{}'::jsonb) || jsonb_build_object(
          'modele_id', v_modele,
          'code_unique', def->>'code',
          'libelle_cta', 'Jouer',
          'type_jeu', def->>'type'
        ),
        visible = true,
        updated_at = now()
      WHERE id = v_bloc;
    END IF;

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
  END LOOP;
END;
$$;
