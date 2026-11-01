-- =============================================================================
-- Ops 094 — Quiz de fin de leçon « Association anti-hypertenseur »
-- Questions limitées au texte de la leçon. 8 tirées à chaque partie.
-- Projet : kpjflntnotftpzffjbud
-- =============================================================================

DO $$
DECLARE
  pid uuid;
  v_sec uuid;
  v_modele uuid;
  v_bloc uuid;
  cfg jsonb;
BEGIN
  SELECT id INTO pid FROM jeupharma.parcours_apprentissage
  WHERE code = 'cardiovasculaires_deust_2a';
  IF pid IS NULL THEN
    RAISE EXCEPTION '094: parcours cardiovasculaires_deust_2a manquant';
  END IF;

  SELECT id INTO v_sec FROM jeupharma.modules_cours
  WHERE parcours_id = pid AND code = 'association_anti_hypertenseur' AND NOT coalesce(est_groupe, false);
  IF v_sec IS NULL THEN
    RAISE EXCEPTION '094: leçon association_anti_hypertenseur introuvable';
  END IF;

  cfg := jsonb_build_object(
    'parcours_code', 'cardiovasculaires_deust_2a',
    'nb_questions', 8,
    'nb_propositions', 3,
    'nb_auto_max', 0,
    'champs', '[]'::jsonb,
    'champs_interroges', '[]'::jsonb,
    'consigne', 'Questions sur la leçon Association anti-hypertenseur',
    'questions_manuelles', $q$
    [
      {"id":"cvas1-q01","question":"Les associations fixes d’antihypertenseurs sont arrivées sur le marché pour…","propositions":["Améliorer l’observance et l’adhésion au traitement","Remplacer la surveillance de la pression artérielle","Traiter uniquement l’hypotension orthostatique"],"correct":"Améliorer l’observance et l’adhésion au traitement"},
      {"id":"cvas1-q02","question":"Parmi les associations fixes citées dans la leçon, on trouve…","propositions":["IEC + diurétiques","Statine + veinotonique","Thrombolytique + héparine"],"correct":"IEC + diurétiques"},
      {"id":"cvas1-q03","question":"Autre association fixe citée…","propositions":["IEC + inhibiteurs calciques","AVK + aspirine en association fixe de la leçon","Érythropoïétine + fer"],"correct":"IEC + inhibiteurs calciques"},
      {"id":"cvas1-q04","question":"Les ARA II sont cités en association fixe avec…","propositions":["Les diurétiques et les inhibiteurs calciques","Uniquement les statines","Uniquement les veinotoniques"],"correct":"Les diurétiques et les inhibiteurs calciques"},
      {"id":"cvas1-q05","question":"Les bêtabloquants sont cités en association fixe avec…","propositions":["Les diurétiques et les inhibiteurs calciques","Les thrombolytiques","Les antiarythmiques de classe I uniquement"],"correct":"Les diurétiques et les inhibiteurs calciques"},
      {"id":"cvas1-q06","question":"Association de diurétiques citée dans la leçon…","propositions":["Diurétiques hyperkaliémiants + diurétiques hypokaliémiants","Deux diurétiques de l’anse ensemble comme seule association citée","Diurétique + statine"],"correct":"Diurétiques hyperkaliémiants + diurétiques hypokaliémiants"},
      {"id":"cvas1-q07","question":"À la dispensation, la leçon demande d’être attentif…","propositions":["Aux associations de vasodilatateurs et aux cumuls d’effets indésirables","Uniquement à la couleur du conditionnement","Uniquement au numéro de lot"],"correct":"Aux associations de vasodilatateurs et aux cumuls d’effets indésirables"},
      {"id":"cvas1-q08","question":"Signal d’effet iatrogène cité (source AFSSAPS)…","propositions":["Somnolence, fatigue inhabituelle, malaise, étourdissement, vertiges, chutes","Une toux sèche isolée comme seul signal de la leçon","Une coloration jaune de la vision"],"correct":"Somnolence, fatigue inhabituelle, malaise, étourdissement, vertiges, chutes"},
      {"id":"cvas1-q09","question":"La leçon demande de diminuer…","propositions":["L’apport de potassium (sel de régime, médicament), l’alcool, les excitants et le tabac","Uniquement les fruits et légumes","L’activité physique"],"correct":"L’apport de potassium (sel de régime, médicament), l’alcool, les excitants et le tabac"},
      {"id":"cvas1-q10","question":"Conseil écrit : ne pas arrêter brutalement le traitement, à cause…","propositions":["Du risque de poussée hypertensive","Du risque de coloration noire des selles","Du risque de spina bifida"],"correct":"Du risque de poussée hypertensive"},
      {"id":"cvas1-q11","question":"Autres conseils écrits de la leçon…","propositions":["Perdre du poids et pratiquer une activité physique régulière","Rester alité au soleil","Doubler la dose en cas d’oubli"],"correct":"Perdre du poids et pratiquer une activité physique régulière"},
      {"id":"cvas1-q12","question":"L’hypotension orthostatique est définie dans la leçon par…","propositions":["Une chute de PAS ≥ 20 mmHg et/ou de PAD ≥ 10 mmHg","Une chute de PAS ≥ 5 mmHg","Une hausse de la PAD de 10 mmHg"],"correct":"Une chute de PAS ≥ 20 mmHg et/ou de PAD ≥ 10 mmHg"},
      {"id":"cvas1-q13","question":"Ce seuil se mesure…","propositions":["1, 2 ou 3 minutes après l’orthostatisme","Uniquement après 30 minutes couchées","Uniquement à l’effort"],"correct":"1, 2 ou 3 minutes après l’orthostatisme"},
      {"id":"cvas1-q14","question":"La leçon présente l’hypotension orthostatique comme…","propositions":["Une pathologie fréquente chez le sujet âgé (consensus de 1996)","Une pathologie réservée au nourrisson","Un effet uniquement des veinotoniques"],"correct":"Une pathologie fréquente chez le sujet âgé (consensus de 1996)"},
      {"id":"cvas1-q15","question":"La chute peut être due, selon la leçon, à…","propositions":["Aux antihypertenseurs, à une hypovolémie, à une déshydratation ou à une hypokaliémie","Uniquement à une statine","Uniquement à un repas gras"],"correct":"Aux antihypertenseurs, à une hypovolémie, à une déshydratation ou à une hypokaliémie"},
      {"id":"cvas1-q16","question":"« Fatiguée depuis le début du traitement » est interprété dans la leçon comme…","propositions":["Un bêtabloquant","Une statine","Un veinotonique"],"correct":"Un bêtabloquant"},
      {"id":"cvas1-q17","question":"Des vertiges lors des changements de position orientent, dans la leçon, vers…","propositions":["Alpha-bloquant, inhibiteurs calciques périphériques, IEC, ARA II, diurétiques, antihypertenseurs centraux","Uniquement une statine","Uniquement un thrombolytique"],"correct":"Alpha-bloquant, inhibiteurs calciques périphériques, IEC, ARA II, diurétiques, antihypertenseurs centraux"},
      {"id":"cvas1-q18","question":"Des courbatures sous traitement sont interprétées dans la leçon comme…","propositions":["Une statine","Un bêtabloquant","Un diurétique de l’anse"],"correct":"Une statine"},
      {"id":"cvas1-q19","question":"Un œdème rétro-malléolaire sous antihypertenseur oriente, dans la leçon, vers…","propositions":["Les inhibiteurs calciques cardiaques ou périphériques, parfois un alpha-bloquant","Une statine uniquement","Un veinotonique"],"correct":"Les inhibiteurs calciques cardiaques ou périphériques, parfois un alpha-bloquant"}
    ]
    $q$::jsonb
  );

  INSERT INTO jeupharma.modeles_jeu (
    code_unique, type_jeu, titre, parcours_id, module_ids, mode,
    configuration_json, en_pause, actif
  ) VALUES (
    'JP-CVAS1', 'quiz', 'Association anti-hypertenseur — Quiz',
    pid, ARRAY[v_sec], 'entrainement', cfg, false, true
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
  WHERE module_id = v_sec AND type_bloc = 'jeu'
    AND (payload_json->>'code_unique' = 'JP-CVAS1' OR payload_json->>'modele_id' = v_modele::text)
  LIMIT 1;

  IF v_bloc IS NULL THEN
    INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
    VALUES (
      v_sec, 130, 'jeu', 'Association anti-hypertenseur — Quiz',
      jsonb_build_object(
        'modele_id', v_modele,
        'code_unique', 'JP-CVAS1',
        'libelle_cta', 'Jouer',
        'type_jeu', 'quiz',
        'seed_key', '094:association_anti_hypertenseur:quiz'
      ),
      true
    );
  ELSE
    UPDATE jeupharma.module_blocs SET
      titre = 'Association anti-hypertenseur — Quiz',
      ordre = 130,
      visible = true,
      payload_json = coalesce(payload_json, '{}'::jsonb) || jsonb_build_object(
        'modele_id', v_modele,
        'code_unique', 'JP-CVAS1',
        'libelle_cta', 'Jouer',
        'type_jeu', 'quiz'
      ),
      updated_at = now()
    WHERE id = v_bloc;
  END IF;

  UPDATE jeupharma.modules_cours SET
    criteres_json = coalesce(criteres_json, '{}'::jsonb) || jsonb_build_object(
      'lecture', true,
      'logique', 'et',
      'jeux', jsonb_build_array(jsonb_build_object(
        'modele_id', v_modele,
        'score_min_pct', 70
      ))
    ),
    contenu_maj_at = now(),
    updated_at = now()
  WHERE id = v_sec;
END;
$$;
