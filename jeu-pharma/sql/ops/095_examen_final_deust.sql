-- =============================================================================
-- Ops 095 — Examen final DEUST (leçon examen_destination_des_deust)
-- 5 épreuves, une note de passage (table passages_examen), reprises libres.
-- Quiz : banque manuelle du parcours (≥ 50), 10 questions par partie.
-- Tableau à trous : molécules publiées du parcours, 4 lignes par partie.
-- Appariements et classement : classes réellement liées aux molécules du parcours.
-- Projet : kpjflntnotftpzffjbud
-- =============================================================================

DO $$
DECLARE
  pid uuid;
  v_sec uuid;
  bank jsonb := '[]'::jsonb;
  extras jsonb;
  q_cfg jsonb;
  app_ct jsonb;
  app_cp jsonb;
  cls_items jsonb := '[]'::jsonb;
  cls_zones jsonb := '[]'::jsonb;
  cls jsonb;
  trous jsonb;
  def jsonb;
  defs jsonb;
  v_modele uuid;
  v_bloc uuid;
  jeux jsonb := '[]'::jsonb;
  nq int;
  zone_n int := 0;
  item_n int := 0;
  r record;
  m record;
  zone_id text;
  item_id text;
  ids jsonb;
  n_pairs int;
BEGIN
  SELECT id INTO pid FROM jeupharma.parcours_apprentissage
  WHERE code = 'cardiovasculaires_deust_2a';
  IF pid IS NULL THEN
    RAISE EXCEPTION '095: parcours cardiovasculaires_deust_2a manquant';
  END IF;

  SELECT id INTO v_sec FROM jeupharma.modules_cours
  WHERE parcours_id = pid AND code = 'examen_destination_des_deust' AND NOT coalesce(est_groupe, false);
  IF v_sec IS NULL THEN
    RAISE EXCEPTION '095: leçon examen_destination_des_deust introuvable';
  END IF;

  CREATE TEMP TABLE _095_pubs ON COMMIT DROP AS
  SELECT DISTINCT c.matrice_id
  FROM jeupharma.publications_connaissances p
  JOIN jeupharma.connaissances c ON c.id = p.connaissance_id
  JOIN jeupharma.modules_cours mo ON mo.id = p.module_id
  WHERE mo.parcours_id = pid
    AND p.actif IS DISTINCT FROM false
    AND c.matrice_id IS NOT NULL
    AND c.statut = 'valide';

  CREATE TEMP TABLE _095_ct ON COMMIT DROP AS
  SELECT d.valeur AS dci, min(ct.valeur) AS classe
  FROM _095_pubs u
  JOIN jeupharma.matrice_medicaments mm ON mm.id = u.matrice_id AND mm.statut <> 'archive'
  JOIN jeupharma.dcis d ON d.id = mm.dci_id
  JOIN jeupharma.matrice_classes_therapeutiques j ON j.matrice_id = mm.id
  JOIN jeupharma.classes_therapeutiques ct ON ct.id = j.classe_therapeutique_id AND ct.actif
  GROUP BY mm.id, d.valeur
  HAVING count(*) = 1;

  CREATE TEMP TABLE _095_cp ON COMMIT DROP AS
  SELECT d.valeur AS dci, min(cp.valeur) AS classe
  FROM _095_pubs u
  JOIN jeupharma.matrice_medicaments mm ON mm.id = u.matrice_id AND mm.statut <> 'archive'
  JOIN jeupharma.dcis d ON d.id = mm.dci_id
  JOIN jeupharma.matrice_classes_pharmacologiques j ON j.matrice_id = mm.id
  JOIN jeupharma.classes_pharmacologiques cp ON cp.id = j.classe_pharmacologique_id AND cp.actif
  GROUP BY mm.id, d.valeur
  HAVING count(*) = 1;

  SELECT coalesce(jsonb_agg(item ORDER BY item->>'id'), '[]'::jsonb)
  INTO bank
  FROM (
    SELECT DISTINCT ON (lower(btrim(q->>'question')))
      jsonb_build_object(
        'id', 'exq-' || mj.code_unique || '-' || (t.ord::int),
        'question', q->>'question',
        'propositions', q->'propositions',
        'correct', q->>'correct'
      ) AS item
    FROM jeupharma.modeles_jeu mj
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(mj.configuration_json->'questions_manuelles', '[]'::jsonb))
      WITH ORDINALITY AS t(q, ord)
    WHERE mj.parcours_id = pid
      AND mj.type_jeu = 'quiz'
      AND mj.actif
      AND mj.code_unique <> 'JP-EXQZ1'
      AND jsonb_typeof(q->'propositions') = 'array'
      AND jsonb_array_length(q->'propositions') >= 2
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(q->'propositions') prop
        WHERE prop = q->>'correct'
      )
      AND btrim(coalesce(q->>'question', '')) <> ''
    ORDER BY lower(btrim(q->>'question')), mj.code_unique
  ) s;

  extras := $q$
  [
    {"id":"exq-gap-gr-01","question":"Dans le cours, l’anémie est définie par un taux d’hémoglobine…","propositions":["Inférieur à 13 g/dL chez l’homme et inférieur à 12 g/dL chez la femme","Inférieur à 10 g/dL chez l’homme uniquement","Supérieur à 15 g/dL chez la femme"],"correct":"Inférieur à 13 g/dL chez l’homme et inférieur à 12 g/dL chez la femme"},
    {"id":"exq-gap-gr-02","question":"L’anémie ferriprive donne des globules rouges…","propositions":["Microcytaires et hypochromes","Macrocytaires et normochromes","Uniquement en faucille"],"correct":"Microcytaires et hypochromes"},
    {"id":"exq-gap-gr-03","question":"Pour corriger l’anémie ferriprive, le cours indique une prise pendant au moins…","propositions":["6 mois","24 heures","3 jours"],"correct":"6 mois"},
    {"id":"exq-gap-gr-04","question":"Selon le cours, l’absorption du fer est…","propositions":["Augmentée par la vitamine C et diminuée par le thé et le café","Augmentée par le thé","Diminuée par les agrumes"],"correct":"Augmentée par la vitamine C et diminuée par le thé et le café"},
    {"id":"exq-gap-gr-05","question":"L’anémie par manque de vitamine B9 ± B12 donne des globules rouges…","propositions":["Macrocytaires et normochromes","Microcytaires et hypochromes","En faucille dès la naissance uniquement"],"correct":"Macrocytaires et normochromes"},
    {"id":"exq-gap-gr-06","question":"Facteurs déclenchants de la drépanocytose cités dans le cours…","propositions":["Froid, déshydratation, stress physique, altitude, infections","Uniquement un repas sans sel","Uniquement la station debout"],"correct":"Froid, déshydratation, stress physique, altitude, infections"},
    {"id":"exq-gap-ath-01","question":"L’artériosclérose, dans le cours, désigne…","propositions":["Le durcissement des artères et la perte d’élasticité","Le dépôt focal de lipides formant la plaque d’athérome","Une anomalie du retour veineux"],"correct":"Le durcissement des artères et la perte d’élasticité"},
    {"id":"exq-gap-ath-02","question":"L’athérosclérose, dans le cours, est…","propositions":["Le dépôt focal de lipides (plaque d’athérome) dans l’intima","La perte générale d’élasticité liée seulement à l’âge","Une dilatation des veines hémorroïdaires"],"correct":"Le dépôt focal de lipides (plaque d’athérome) dans l’intima"},
    {"id":"exq-gap-ath-03","question":"Facteurs favorisants majeurs cités pour l’athérome…","propositions":["Tabac, stress, sédentarité, excès alimentaires, surcharge pondérale (IMC > 35)","Uniquement une carence en fer","Uniquement la vitamine C"],"correct":"Tabac, stress, sédentarité, excès alimentaires, surcharge pondérale (IMC > 35)"},
    {"id":"exq-gap-idm-01","question":"L’infarctus du myocarde est, dans le cours…","propositions":["Une nécrose ischémique du muscle cardiaque due à une obstruction brutale totale d’une coronaire","Une simple accélération du rythme au-dessus de 100/min","Une insuffisance veineuse des membres inférieurs"],"correct":"Une nécrose ischémique du muscle cardiaque due à une obstruction brutale totale d’une coronaire"},
    {"id":"exq-gap-idm-02","question":"La douleur d’IDM décrite dans le cours est…","propositions":["Constrictive, rétrosternale, résistante à la trinitrine","Calmée dès la première pulvérisation de trinitrine","Limitée aux jambes lourdes"],"correct":"Constrictive, rétrosternale, résistante à la trinitrine"},
    {"id":"exq-gap-idm-03","question":"L’ordonnance de sortie BASIC du cours associe…","propositions":["Bêtabloquant, antiagrégant plaquettaire, statine, IEC, et contrôle des facteurs de risque","Uniquement un veinotonique","Uniquement de la digoxine"],"correct":"Bêtabloquant, antiagrégant plaquettaire, statine, IEC, et contrôle des facteurs de risque"},
    {"id":"exq-gap-idm-04","question":"En cas de crise, le cours dit d’appeler…","propositions":["Le SAMU / le 15","Uniquement le pharmacien de garde le lendemain","Uniquement le laboratoire pour une NFS"],"correct":"Le SAMU / le 15"},
    {"id":"exq-gap-sta-01","question":"Les statines, dans le cours, servent à…","propositions":["Réduire le mauvais cholestérol et les désordres lipidiques (suffixe -statine)","Fluidifier le sang comme une héparine","Accélérer le retour veineux"],"correct":"Réduire le mauvais cholestérol et les désordres lipidiques (suffixe -statine)"},
    {"id":"exq-gap-ary-01","question":"Dans le cours, la tachycardie et la bradycardie sont…","propositions":["Une accélération > 100/min et un ralentissement < 60/min","L’inverse : tachycardie < 60/min","Deux noms de la fibrillation"],"correct":"Une accélération > 100/min et un ralentissement < 60/min"},
    {"id":"exq-gap-ary-02","question":"Classification de Vaughan-Williams citée dans le cours…","propositions":["Classe 1 canaux sodium, classe 2 bêtabloquants, classe 3 canaux potassium, classe 4 inhibiteurs calciques","Classe 1 diurétiques, classe 2 statines, classe 3 veinotoniques, classe 4 fer","Une seule classe, les AVK"],"correct":"Classe 1 canaux sodium, classe 2 bêtabloquants, classe 3 canaux potassium, classe 4 inhibiteurs calciques"},
    {"id":"exq-gap-ary-03","question":"Antiarythmiques de classe 3 cités…","propositions":["Amiodarone et sotalol (le sotalol a aussi des propriétés de classe 2)","Furosémide et spironolactone","Diosmine et troxérutine"],"correct":"Amiodarone et sotalol (le sotalol a aussi des propriétés de classe 2)"},
    {"id":"exq-gap-ic-01","question":"Le sigle des signes cliniques de l’insuffisance cardiaque dans le cours est…","propositions":["EPOF (essoufflement, prise de poids, œdèmes, asthénie)","BASIC","INR"],"correct":"EPOF (essoufflement, prise de poids, œdèmes, asthénie)"},
    {"id":"exq-gap-ic-02","question":"La règle des 3 R de la digoxine dans le cours…","propositions":["Renforce la contractilité, régularise le débit, ralentit le rythme","Réduit le fer, relève l’INR, relance la diurèse","Rien, régule, retire"],"correct":"Renforce la contractilité, régularise le débit, ralentit le rythme"},
    {"id":"exq-gap-ic-03","question":"Effet secondaire de la digoxine cité dans le cours…","propositions":["Vision colorée en jaune","Toux sèche isolée comme seul effet cité","Coloration noire des selles"],"correct":"Vision colorée en jaune"},
    {"id":"exq-gap-ic-04","question":"Sacubitril + valsartan (Entresto), dans le cours, est…","propositions":["Une association d’un ARA 2 et d’un inhibiteur de la néprilysine","Une héparine de bas poids moléculaire","Un veinotonique"],"correct":"Une association d’un ARA 2 et d’un inhibiteur de la néprilysine"},
    {"id":"exq-gap-hta-01","question":"Antihypertenseur central cité pour l’HTA de la femme enceinte…","propositions":["Méthyldopa (Aldomet)","Furosémide","Warfarine"],"correct":"Méthyldopa (Aldomet)"},
    {"id":"exq-gap-hta-02","question":"Effets secondaires communs des vasodilatateurs cités dans la leçon anti-hypertenseur…","propositions":["Hypotension orthostatique, céphalées, bouffées de chaleur, œdèmes des membres inférieurs, tachycardie réactionnelle","Uniquement une constipation due au fer","Uniquement une vision jaune"],"correct":"Hypotension orthostatique, céphalées, bouffées de chaleur, œdèmes des membres inférieurs, tachycardie réactionnelle"},
    {"id":"exq-gap-vei-01","question":"L’insuffisance veineuse, dans le cours, touche surtout…","propositions":["Les femmes (ratio 3 / 1)","Uniquement les hommes de moins de 20 ans","Uniquement le nourrisson"],"correct":"Les femmes (ratio 3 / 1)"},
    {"id":"exq-gap-vei-02","question":"Le retour veineux repose, dans le cours, sur…","propositions":["La semelle de Lejars, la pompe musculaire du mollet, les valvules et le diaphragme","Uniquement la fréquence cardiaque","Uniquement les plaquettes"],"correct":"La semelle de Lejars, la pompe musculaire du mollet, les valvules et le diaphragme"},
    {"id":"exq-gap-vei-03","question":"Le traitement de base de l’insuffisance veineuse dans le cours est…","propositions":["La contention veineuse","La digoxine","L’énoxaparine"],"correct":"La contention veineuse"},
    {"id":"exq-gap-vei-04","question":"Produits sclérosants cités…","propositions":["Trombovar, Aetoxisclérol, Sclérémo","Entresto, Aldomet, Hyperium","Coumadine, Préviscan, Sintrom uniquement"],"correct":"Trombovar, Aetoxisclérol, Sclérémo"}
  ]
  $q$::jsonb;

  SELECT bank || coalesce(jsonb_agg(e ORDER BY e->>'id'), '[]'::jsonb)
  INTO bank
  FROM jsonb_array_elements(extras) e
  WHERE NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(bank) b
    WHERE lower(btrim(b->>'question')) = lower(btrim(e->>'question'))
  );

  nq := jsonb_array_length(bank);
  IF nq < 50 THEN
    RAISE EXCEPTION '095: banque quiz % questions, minimum 50', nq;
  END IF;

  q_cfg := jsonb_build_object(
    'parcours_code', 'cardiovasculaires_deust_2a',
    'nb_questions', 10,
    'nb_propositions', 3,
    'nb_auto_max', 0,
    'champs', '[]'::jsonb,
    'champs_interroges', '[]'::jsonb,
    'repertoire', 'parcours',
    'consigne', 'Examen DEUST — 10 questions tirées sur l’ensemble du parcours',
    'questions_manuelles', bank
  );

  SELECT jsonb_build_object(
    'parcours_code', 'cardiovasculaires_deust_2a',
    'consigne', 'Reliez chaque molécule à sa classe thérapeutique (parcours)',
    'gauche', coalesce(jsonb_agg(jsonb_build_object('id', 'g' || n, 'label', dci) ORDER BY n), '[]'::jsonb),
    'droite', coalesce(jsonb_agg(jsonb_build_object('id', 'd' || n, 'label', classe) ORDER BY n), '[]'::jsonb),
    'paires', coalesce(jsonb_agg(jsonb_build_object('gauche_id', 'g' || n, 'droite_id', 'd' || n) ORDER BY n), '[]'::jsonb)
  )
  INTO app_ct
  FROM (
    SELECT dci, classe, row_number() OVER (ORDER BY classe, dci) AS n
    FROM (
      SELECT DISTINCT ON (classe) dci, classe
      FROM _095_ct
      ORDER BY classe, dci
    ) u
    LIMIT 8
  ) p;
  n_pairs := jsonb_array_length(coalesce(app_ct->'paires', '[]'::jsonb));
  IF n_pairs < 2 THEN
    RAISE EXCEPTION '095: appariement classes thérapeutiques insuffisant (%)', n_pairs;
  END IF;

  SELECT jsonb_build_object(
    'parcours_code', 'cardiovasculaires_deust_2a',
    'consigne', 'Reliez chaque molécule à sa classe pharmacologique (parcours)',
    'gauche', coalesce(jsonb_agg(jsonb_build_object('id', 'g' || n, 'label', dci) ORDER BY n), '[]'::jsonb),
    'droite', coalesce(jsonb_agg(jsonb_build_object('id', 'd' || n, 'label', classe) ORDER BY n), '[]'::jsonb),
    'paires', coalesce(jsonb_agg(jsonb_build_object('gauche_id', 'g' || n, 'droite_id', 'd' || n) ORDER BY n), '[]'::jsonb)
  )
  INTO app_cp
  FROM (
    SELECT dci, classe, row_number() OVER (ORDER BY classe, dci) AS n
    FROM (
      SELECT DISTINCT ON (classe) dci, classe
      FROM _095_cp
      ORDER BY classe, dci
    ) u
    LIMIT 8
  ) p;
  n_pairs := jsonb_array_length(coalesce(app_cp->'paires', '[]'::jsonb));
  IF n_pairs < 2 THEN
    RAISE EXCEPTION '095: appariement classes pharmacologiques insuffisant (%)', n_pairs;
  END IF;

  FOR r IN
    SELECT classe
    FROM _095_ct
    GROUP BY classe
    HAVING count(*) >= 2
    ORDER BY count(*) DESC, classe
    LIMIT 4
  LOOP
    zone_n := zone_n + 1;
    zone_id := 'z' || zone_n;
    ids := '[]'::jsonb;
    FOR m IN
      SELECT dci FROM _095_ct WHERE classe = r.classe ORDER BY dci LIMIT 2
    LOOP
      item_n := item_n + 1;
      item_id := 'i' || item_n;
      cls_items := cls_items || jsonb_build_array(jsonb_build_object('id', item_id, 'label', m.dci));
      ids := ids || jsonb_build_array(item_id);
    END LOOP;
    cls_zones := cls_zones || jsonb_build_array(jsonb_build_object(
      'id', zone_id,
      'label', r.classe,
      'item_ids', ids
    ));
  END LOOP;
  IF jsonb_array_length(cls_items) < 2 OR jsonb_array_length(cls_zones) < 2 THEN
    RAISE EXCEPTION '095: classement incomplet';
  END IF;
  cls := jsonb_build_object(
    'parcours_code', 'cardiovasculaires_deust_2a',
    'consigne', 'Classez chaque molécule dans sa classe thérapeutique du parcours',
    'items', cls_items,
    'zones', cls_zones
  );

  trous := jsonb_build_object(
    'parcours_code', 'cardiovasculaires_deust_2a',
    'repertoire', 'parcours',
    'nb_lignes', 4,
    'taux_trous', 100,
    'colonnes', jsonb_build_array('classe_therapeutique', 'classe_pharmacologique'),
    'toujours_visibles', jsonb_build_array('dci'),
    'consigne', 'Quatre molécules tirées parmi celles du parcours'
  );

  defs := jsonb_build_array(
    jsonb_build_object('code', 'JP-EXQZ1', 'type', 'quiz', 'titre', 'Examen DEUST — Quiz du parcours', 'ordre', 10, 'cfg', q_cfg),
    jsonb_build_object('code', 'JP-EXAPP', 'type', 'appariement', 'titre', 'Examen DEUST — Classes thérapeutiques', 'ordre', 20, 'cfg', app_ct),
    jsonb_build_object('code', 'JP-EXCLS', 'type', 'classement', 'titre', 'Examen DEUST — Classement des molécules', 'ordre', 30, 'cfg', cls),
    jsonb_build_object('code', 'JP-EXAPH', 'type', 'appariement', 'titre', 'Examen DEUST — Classes pharmacologiques', 'ordre', 40, 'cfg', app_cp),
    jsonb_build_object('code', 'JP-EXTRO', 'type', 'trous', 'titre', 'Examen DEUST — Tableau à trous', 'ordre', 50, 'cfg', trous)
  );

  FOR def IN SELECT value FROM jsonb_array_elements(defs) LOOP
    INSERT INTO jeupharma.modeles_jeu (
      code_unique, type_jeu, titre, parcours_id, module_ids, mode,
      configuration_json, en_pause, actif
    ) VALUES (
      def->>'code', def->>'type', def->>'titre', pid, ARRAY[v_sec], 'entrainement',
      def->'cfg', false, true
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

    jeux := jeux || jsonb_build_array(jsonb_build_object(
      'modele_id', v_modele,
      'score_min_pct', 70
    ));

    SELECT id INTO v_bloc FROM jeupharma.module_blocs
    WHERE module_id = v_sec AND type_bloc = 'jeu'
      AND (
        payload_json->>'code_unique' = def->>'code'
        OR payload_json->>'modele_id' = v_modele::text
      )
    LIMIT 1;

    IF v_bloc IS NULL THEN
      INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
      VALUES (
        v_sec, (def->>'ordre')::int, 'jeu', def->>'titre',
        jsonb_build_object(
          'modele_id', v_modele,
          'code_unique', def->>'code',
          'libelle_cta', 'Jouer',
          'type_jeu', def->>'type',
          'seed_key', '095:examen:' || (def->>'code')
        ),
        true
      );
    ELSE
      UPDATE jeupharma.module_blocs SET
        titre = def->>'titre',
        ordre = (def->>'ordre')::int,
        visible = true,
        payload_json = coalesce(payload_json, '{}'::jsonb) || jsonb_build_object(
          'modele_id', v_modele,
          'code_unique', def->>'code',
          'libelle_cta', 'Jouer',
          'type_jeu', def->>'type',
          'seed_key', '095:examen:' || (def->>'code')
        ),
        updated_at = now()
      WHERE id = v_bloc;
    END IF;
  END LOOP;

  UPDATE jeupharma.modules_cours SET
    criteres_json = coalesce(criteres_json, '{}'::jsonb) || jsonb_build_object(
      'lecture', true,
      'logique', 'et',
      'examen', true,
      'jeux', jeux
    ),
    contenu_maj_at = now(),
    updated_at = now()
  WHERE id = v_sec;

  RAISE NOTICE '095 examen: quiz_banque=%', nq;
END;
$$;
