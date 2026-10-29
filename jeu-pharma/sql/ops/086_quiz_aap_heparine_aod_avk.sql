-- =============================================================================
-- Ops 086 — Quiz « à savoir absolument » AAP / Héparine / AOD / AVK
-- Parcours : cardiovasculaires_deust_2a (chapitre Sang)
-- Projet : kpjflntnotftpzffjbud
--
-- Pour chaque leçon :
--   - section « Test de connaissances » + quiz manuel (nb_auto_max=0)
--   - criteres_json : lecture + quiz ≥ 70 %
--   - prerequis_module_id = pathologie_du_globule_rouge
--     → ouvertes dès que Pathologie du Globule Rouge est validée
-- Idempotent (upsert modeles_jeu par code_unique).
-- =============================================================================

DO $$
DECLARE
  pid uuid;
  v_gr uuid;
  def jsonb;
  defs constant jsonb := $json$
  [
    {
      "code": "JP-CVAAP",
      "type": "quiz",
      "titre": "Anti-agrégants — Quiz à savoir absolument",
      "lecon": "anti_agr_gants_plaquettaire",
      "pct": 70,
      "cfg": {
        "nb_questions": 5,
        "nb_propositions": 3,
        "nb_auto_max": 0,
        "champs": [],
        "champs_interroges": [],
        "consigne": "Points à savoir absolument — anti-agrégants plaquettaires",
        "questions_manuelles": [
          {
            "id": "cvaap-q01",
            "question": "Les anti-agrégants agissent principalement sur…",
            "propositions": [
              "L’hémostase primaire (agrégation plaquettaire)",
              "La voie de la vitamine K uniquement",
              "Le facteur Xa exclusivement"
            ],
            "correct": "L’hémostase primaire (agrégation plaquettaire)"
          },
          {
            "id": "cvaap-q02",
            "question": "Les salicylés bloquent de façon irréversible…",
            "propositions": [
              "La synthèse du TX A2 via les cyclooxygénases (COX)",
              "Le récepteur P2Y12",
              "Le facteur II activé"
            ],
            "correct": "La synthèse du TX A2 via les cyclooxygénases (COX)"
          },
          {
            "id": "cvaap-q03",
            "question": "La famille « -grel- » agit en bloquant…",
            "propositions": [
              "Le récepteur P2Y12 sur les plaquettes",
              "Les cyclooxygénases COX",
              "Le facteur Xa"
            ],
            "correct": "Le récepteur P2Y12 sur les plaquettes"
          },
          {
            "id": "cvaap-q04",
            "question": "Effet indésirable majeur cité dans le cours…",
            "propositions": ["Hémorragies", "Toux sèche persistante", "Hyperkaliémie"],
            "correct": "Hémorragies"
          },
          {
            "id": "cvaap-q05",
            "question": "Contre-indication citée…",
            "propositions": [
              "Lésions hémorragiques évolutives (UGD…)",
              "Angor stable d’effort",
              "Hypertension artérielle essentielle"
            ],
            "correct": "Lésions hémorragiques évolutives (UGD…)"
          },
          {
            "id": "cvaap-q06",
            "question": "Avant une intervention, les anti-agrégants doivent au mieux être arrêtés environ…",
            "propositions": ["7 jours avant", "24 heures avant", "1 mois avant"],
            "correct": "7 jours avant"
          },
          {
            "id": "cvaap-q07",
            "question": "Indication citée dans le cours…",
            "propositions": [
              "Réduction du risque d’IDM / AVC / embolie (selon contexte)",
              "Traitement exclusif de l’anémie ferriprive",
              "Remplacement de la contention veineuse"
            ],
            "correct": "Réduction du risque d’IDM / AVC / embolie (selon contexte)"
          },
          {
            "id": "cvaap-q08",
            "question": "Conseil du cours en cas de troubles inattendus…",
            "propositions": [
              "Arrêt immédiat",
              "Doubler la dose",
              "Associer systématiquement un AVK"
            ],
            "correct": "Arrêt immédiat"
          }
        ]
      }
    },
    {
      "code": "JP-CVHEP",
      "type": "quiz",
      "titre": "Héparine — Quiz à savoir absolument",
      "lecon": "h_parine",
      "pct": 70,
      "cfg": {
        "nb_questions": 5,
        "nb_propositions": 3,
        "nb_auto_max": 0,
        "champs": [],
        "champs_interroges": [],
        "consigne": "Points à savoir absolument — héparines",
        "questions_manuelles": [
          {
            "id": "cvhep-q01",
            "question": "Les héparines agissent principalement sur…",
            "propositions": [
              "Le facteur X activé et le facteur II activé",
              "Uniquement le TX A2",
              "Uniquement les facteurs vitamine K dépendants"
            ],
            "correct": "Le facteur X activé et le facteur II activé"
          },
          {
            "id": "cvhep-q02",
            "question": "Suffixe typique des HBPM (héparine de bas poids moléculaire)…",
            "propositions": ["-parine", "-xaban", "-grel-"],
            "correct": "-parine"
          },
          {
            "id": "cvhep-q03",
            "question": "Contre-indication importante des HBPM citée…",
            "propositions": [
              "Insuffisance rénale",
              "Migraine en traitement de fond",
              "Diabète de type 2"
            ],
            "correct": "Insuffisance rénale"
          },
          {
            "id": "cvhep-q04",
            "question": "Effet indésirable typique des héparines…",
            "propositions": [
              "Thrombopénies",
              "Toux sèche",
              "Photosensibilisation cornéenne"
            ],
            "correct": "Thrombopénies"
          },
          {
            "id": "cvhep-q05",
            "question": "Sous traitement prolongé d’héparine non fractionnée, le cours cite aussi…",
            "propositions": [
              "Hyperkaliémie et ostéoporose",
              "Alopécie uniquement",
              "Constipation réflexe"
            ],
            "correct": "Hyperkaliémie et ostéoporose"
          },
          {
            "id": "cvhep-q06",
            "question": "Précautions d’emploi : bilan préalable comprenant notamment…",
            "propositions": [
              "NFS, INR, TCA, plaquettes",
              "Uniquement la glycémie à jeun",
              "Uniquement l’albuminémie"
            ],
            "correct": "NFS, INR, TCA, plaquettes"
          },
          {
            "id": "cvhep-q07",
            "question": "Les héparinoïdes se distinguent notamment par…",
            "propositions": [
              "Un risque de thrombopénie et une surveillance des plaquettes",
              "Une action exclusive sur le P2Y12",
              "L’absence totale de risque hémorragique"
            ],
            "correct": "Un risque de thrombopénie et une surveillance des plaquettes"
          },
          {
            "id": "cvhep-q08",
            "question": "Contre-indication citée (hors IR)…",
            "propositions": [
              "ATCD de thrombopénie / hémorragies / UGD évolutif",
              "Hypertension artérielle contrôlée",
              "Angor stable sous dérivés nitrés"
            ],
            "correct": "ATCD de thrombopénie / hémorragies / UGD évolutif"
          }
        ]
      }
    },
    {
      "code": "JP-CVAOD",
      "type": "quiz",
      "titre": "AOD — Quiz à savoir absolument",
      "lecon": "anti_coagulant_oraux_directs",
      "pct": 70,
      "cfg": {
        "nb_questions": 5,
        "nb_propositions": 3,
        "nb_auto_max": 0,
        "champs": [],
        "champs_interroges": [],
        "consigne": "Points à savoir absolument — anticoagulants oraux directs",
        "questions_manuelles": [
          {
            "id": "cvaod-q01",
            "question": "La famille des -xaban bloque…",
            "propositions": ["Le facteur Xa", "Le facteur IIa", "Le récepteur P2Y12"],
            "correct": "Le facteur Xa"
          },
          {
            "id": "cvaod-q02",
            "question": "La famille des -gatran bloque…",
            "propositions": ["Le facteur IIa (2a)", "Le facteur Xa", "Les COX plaquettaires"],
            "correct": "Le facteur IIa (2a)"
          },
          {
            "id": "cvaod-q03",
            "question": "Surveillance biologique de l’activité anticoagulante des AOD…",
            "propositions": [
              "Aucune (mais suivi des saignements et de la fonction rénale)",
              "INR obligatoire tous les 3 jours",
              "TCA quotidien obligatoire"
            ],
            "correct": "Aucune (mais suivi des saignements et de la fonction rénale)"
          },
          {
            "id": "cvaod-q04",
            "question": "Seul AOD cité avec antidote (idarucizumab / Praxbind®)…",
            "propositions": ["Dabigatran", "Rivaroxaban", "Apixaban"],
            "correct": "Dabigatran"
          },
          {
            "id": "cvaod-q05",
            "question": "Contre-indication citée…",
            "propositions": [
              "Insuffisance rénale sévère",
              "Angor d’effort stable",
              "Hypertension contrôlée"
            ],
            "correct": "Insuffisance rénale sévère"
          },
          {
            "id": "cvaod-q06",
            "question": "Autre contre-indication du cours…",
            "propositions": [
              "Grossesse et allaitement",
              "Migraine avec aura uniquement",
              "Diabète bien équilibré"
            ],
            "correct": "Grossesse et allaitement"
          },
          {
            "id": "cvaod-q07",
            "question": "Effet indésirable central des AOD…",
            "propositions": [
              "Risque hémorragique",
              "Toux sèche",
              "Bradycardie sinusale"
            ],
            "correct": "Risque hémorragique"
          },
          {
            "id": "cvaod-q08",
            "question": "Selon le cours, le suivi recommandé porte surtout sur…",
            "propositions": [
              "Les manifestations hémorragiques et la fonction rénale",
              "Uniquement le cholestérol LDL",
              "Uniquement l’hémoglobine glyquée"
            ],
            "correct": "Les manifestations hémorragiques et la fonction rénale"
          }
        ]
      }
    },
    {
      "code": "JP-CVAVK",
      "type": "quiz",
      "titre": "AVK — Quiz à savoir absolument",
      "lecon": "antivitamine_k",
      "pct": 70,
      "cfg": {
        "nb_questions": 5,
        "nb_propositions": 3,
        "nb_auto_max": 0,
        "champs": [],
        "champs_interroges": [],
        "consigne": "Points à savoir absolument — antivitamines K",
        "questions_manuelles": [
          {
            "id": "cvavk-q01",
            "question": "Les AVK agissent sur les facteurs vitamine K dépendants…",
            "propositions": [
              "Facteurs 2, 7, 9 et 10",
              "Facteurs VIII et XIII uniquement",
              "Uniquement le facteur Xa"
            ],
            "correct": "Facteurs 2, 7, 9 et 10"
          },
          {
            "id": "cvavk-q02",
            "question": "Délai d’action des AVK (cours)…",
            "propositions": [
              "Différé : à partir de 24–72 h, jusqu’à 2–5 jours",
              "Immédiat en quelques minutes",
              "Uniquement après 3 semaines"
            ],
            "correct": "Différé : à partir de 24–72 h, jusqu’à 2–5 jours"
          },
          {
            "id": "cvavk-q03",
            "question": "Zone thérapeutique d’INR sous AVK (cours)…",
            "propositions": ["Entre 2 et 3", "Entre 0,5 et 1", "Supérieur à 5"],
            "correct": "Entre 2 et 3"
          },
          {
            "id": "cvavk-q04",
            "question": "Pourquoi prendre l’AVK le soir (cours) ?",
            "propositions": [
              "Pour mesurer l’INR le matin à heure fixe et adapter le dosage le soir",
              "Parce que l’absorption est nulle le matin",
              "Pour éviter toute surveillance biologique"
            ],
            "correct": "Pour mesurer l’INR le matin à heure fixe et adapter le dosage le soir"
          },
          {
            "id": "cvavk-q05",
            "question": "Si l’INR est trop bas…",
            "propositions": [
              "Risque de caillot → augmenter le dosage",
              "Risque de saignement → diminuer le dosage",
              "Aucun ajustement n’est jamais nécessaire"
            ],
            "correct": "Risque de caillot → augmenter le dosage"
          },
          {
            "id": "cvavk-q06",
            "question": "Si l’INR est trop élevé…",
            "propositions": [
              "Risque de saignement → diminuer le dosage",
              "Risque de caillot → augmenter le dosage",
              "Arrêt définitif obligatoire dès INR = 2,1"
            ],
            "correct": "Risque de saignement → diminuer le dosage"
          },
          {
            "id": "cvavk-q07",
            "question": "Relais héparine → AVK (cours)…",
            "propositions": [
              "Poursuivre l’héparine et démarrer l’AVK jusqu’à INR 2–3 (2 fois à 24/48 h)",
              "Arrêter immédiatement l’héparine dès la 1re prise d’AVK",
              "Remplacer l’héparine par un AAP"
            ],
            "correct": "Poursuivre l’héparine et démarrer l’AVK jusqu’à INR 2–3 (2 fois à 24/48 h)"
          },
          {
            "id": "cvavk-q08",
            "question": "Surveillance INR jusqu’à zone thérapeutique…",
            "propositions": [
              "Tous les 3 jours puis 1 fois par mois",
              "Une seule fois à vie",
              "Uniquement en cas de migraine"
            ],
            "correct": "Tous les 3 jours puis 1 fois par mois"
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

  SELECT id INTO v_gr FROM jeupharma.modules_cours
  WHERE parcours_id = pid AND code = 'pathologie_du_globule_rouge'
    AND NOT coalesce(est_groupe, false);
  IF v_gr IS NULL THEN
    RAISE EXCEPTION 'leçon pathologie_du_globule_rouge introuvable';
  END IF;

  FOR def IN SELECT * FROM jsonb_array_elements(defs) LOOP
    SELECT id INTO v_lecon FROM jeupharma.modules_cours
    WHERE parcours_id = pid AND code = def->>'lecon' AND NOT coalesce(est_groupe, false);
    IF v_lecon IS NULL THEN
      RAISE EXCEPTION 'leçon % introuvable', def->>'lecon';
    END IF;

    -- Déblocage dès Pathologie du Globule Rouge validée
    UPDATE jeupharma.modules_cours SET
      prerequis_module_id = v_gr,
      updated_at = now()
    WHERE id = v_lecon
      AND (prerequis_module_id IS DISTINCT FROM v_gr);

    -- Section Test de connaissances
    SELECT id INTO v_sec FROM jeupharma.module_blocs
    WHERE module_id = v_lecon
      AND type_bloc = 'section'
      AND (
        titre ILIKE '%test de connaissance%'
        OR coalesce(payload_json->'_brouillon'->>'titre', '') ILIKE '%test de connaissance%'
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
