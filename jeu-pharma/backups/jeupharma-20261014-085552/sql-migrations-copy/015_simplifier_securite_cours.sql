-- 015 : Simplifier indications / CI / EI / précautions / interactions / surveillances
-- Vocabulaire court isolable (ex. IDM), aligné cours Sang / CV / HTA — pas de RCP.

CREATE OR REPLACE FUNCTION jeupharma._simp_merge_rename(
  p_table text,
  p_fk_col text,
  p_jonction text,
  p_old text,
  p_new text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
DECLARE
  id_src uuid;
  id_dst uuid;
  niv text[];
BEGIN
  IF p_old IS NULL OR p_new IS NULL OR btrim(p_old) = '' OR btrim(p_new) = '' THEN
    RETURN;
  END IF;
  IF p_old = p_new THEN
    RETURN;
  END IF;

  EXECUTE format(
    'SELECT id FROM jeupharma.%I WHERE actif AND valeur = $1 LIMIT 1',
    p_table
  ) INTO id_src USING p_old;
  IF id_src IS NULL THEN
    RETURN;
  END IF;

  EXECUTE format(
    'SELECT id FROM jeupharma.%I WHERE actif AND valeur_norm = jeupharma.normaliser_valeur($1) LIMIT 1',
    p_table
  ) INTO id_dst USING p_new;

  IF id_dst IS NULL THEN
    EXECUTE format(
      'UPDATE jeupharma.%I SET valeur = $1, updated_at = now() WHERE id = $2',
      p_table
    ) USING p_new, id_src;
    RETURN;
  END IF;

  IF id_dst = id_src THEN
    EXECUTE format(
      'UPDATE jeupharma.%I SET valeur = $1, updated_at = now() WHERE id = $2 AND valeur IS DISTINCT FROM $1',
      p_table
    ) USING p_new, id_src;
    RETURN;
  END IF;

  EXECUTE format(
    'SELECT ARRAY(SELECT DISTINCT unnest(a.niveaux_connus || b.niveaux_connus)
       FROM jeupharma.%1$I a, jeupharma.%1$I b WHERE a.id = $1 AND b.id = $2)',
    p_table
  ) INTO niv USING id_dst, id_src;

  EXECUTE format(
    'UPDATE jeupharma.%I SET niveaux_connus = $1, valeur = $2, updated_at = now() WHERE id = $3',
    p_table
  ) USING coalesce(niv, '{}'::text[]), p_new, id_dst;

  EXECUTE format(
    'UPDATE jeupharma.%I j SET %I = $1
     WHERE j.%I = $2
       AND NOT EXISTS (
         SELECT 1 FROM jeupharma.%I x
         WHERE x.matrice_id = j.matrice_id AND x.%I = $1
       )',
    p_jonction, p_fk_col, p_fk_col, p_jonction, p_fk_col
  ) USING id_dst, id_src;

  EXECUTE format(
    'DELETE FROM jeupharma.%I WHERE %I = $1',
    p_jonction, p_fk_col
  ) USING id_src;

  EXECUTE format(
    'UPDATE jeupharma.%I SET actif = false, updated_at = now() WHERE id = $1',
    p_table
  ) USING id_src;
END;
$$;

DO $$
DECLARE
  old_v text;
  new_v text;
BEGIN
  -- Indications
  FOR old_v, new_v IN SELECT * FROM (VALUES
    ('IDM (en aigu ou en prévention des récidives)', 'IDM'),
    ('IDM en phase aiguë et en post-infarctus', 'IDM'),
    ('Post-infarctus', 'IDM'),
    ('Réduction des risques d''IDM chez les patients à antécédents d''athérosclérose, d''artérite ou à angor instable', 'IDM'),
    ('Thrombolyse dans l''IDM (avant la 6e heure)', 'Thrombolyse IDM'),
    ('Traitement de l''angor', 'Angor'),
    ('Traitement de fond de l''angor', 'Angor'),
    ('Traitement de l''angor stable', 'Angor'),
    ('Traitement de référence de l''angor', 'Angor'),
    ('Traitement de la crise d''angor', 'Angor'),
    ('Traitement d''appoint de l''angor', 'Angor'),
    ('Traitement prophylactique de la crise d''angor', 'Angor'),
    ('Traitement symptomatique de l''angor chez des patients avec une contre-indication ou une intolérance aux bêtabloquants', 'Angor'),
    ('Traitement de l''HTA', 'HTA'),
    ('HTA de la femme enceinte', 'HTA grossesse'),
    ('Insuffisance cardiaque', 'IC'),
    ('AVC ischémique (dans les 3 h suivant les symptômes)', 'AVC ischémique'),
    ('Suites des AVC', 'Suites AVC'),
    ('Réduction du risque d''AVC après un AIT', 'AVC après AIT'),
    ('Réduction du risque d''embolie en cas de fibrillation auriculaire', 'FA'),
    ('Prévention des complications thromboemboliques avec troubles du rythme', 'FA'),
    ('Troubles du rythme supraventriculaire : ralentissement ou réduction de la fibrillation auriculaire ou du flutter auriculaire', 'FA'),
    ('Troubles du rythme cardiaque', 'Troubles du rythme'),
    ('Traitement des troubles du rythme pour les INCA à visée cardiaque', 'Troubles du rythme'),
    ('Tachycardies', 'Troubles du rythme'),
    ('Syndrome coronarien', 'SCA'),
    ('Traitement curatif du syndrome coronarien aigu', 'SCA'),
    ('Prévention des accidents athéro-thrombotiques chez l''adulte ayant un syndrome coronarien aigu (angor instable, IDM), en association avec l''aspirine (dose < 300 mg)', 'SCA'),
    ('Traitement de la thrombose veineuse profonde', 'TVP'),
    ('Traitement curatif des thromboses veineuses profondes, avec ou sans embolie pulmonaire sans signe de gravité', 'TVP'),
    ('Traitement des thromboses veineuses superficielles', 'TVS'),
    ('EP massive', 'EP'),
    ('Antécédents d''embolie pulmonaire', 'EP'),
    ('Traitement et prévention de la maladie thrombo-embolique veineuse', 'MTEV'),
    ('Traitement curatif des maladies veineuses thrombo-emboliques', 'MTEV'),
    ('Prévention des maladies veineuses thrombo-emboliques en médecine et chirurgie', 'Prévention MTEV'),
    ('Prévention des accidents thrombo-emboliques (interventions chirurgicales orthopédiques, patients à haut risque)', 'Prévention MTEV'),
    ('Prévention des accidents thromboemboliques (interventions chirurgicales orthopédiques)', 'Prévention MTEV'),
    ('Prévention des événements thrombo-emboliques veineux en chirurgie abdominale', 'Prévention MTEV'),
    ('Prévention des événements thrombo-emboliques veineux en chirurgie orthopédique', 'Prévention MTEV'),
    ('Traitement préventif des accidents thrombo-emboliques artériels et veineux et des circuits extracorporels', 'Prévention MTEV'),
    ('Coagulation dans les circuits extracorporels', 'Circuits extracorporels'),
    ('Prévention des thromboses sur cathéter', 'Thrombose cathéter'),
    ('Thromboses artérielles et veineuses récentes', 'Thromboses'),
    ('Traitement curatif des embolies artérielles extracérébrales', 'Embolies artérielles'),
    ('Patients développant une thrombopénie avec les héparines', 'HIT'),
    ('Réduction du risque d''occlusion après pontage coronarien', 'Pontage coronarien'),
    ('Prévention de l''AVC et des accidents thromboemboliques chez les porteurs de prothèses valvulaires', 'Prothèses valvulaires'),
    ('Traitement curatif des anémies ferriprives', 'Anémie ferriprive'),
    ('Anémie, carence en fer', 'Anémie ferriprive'),
    ('Traitement préventif des carences martiales', 'Carence martiale'),
    ('Traitement des anémies mégaloblastiques, des carences d''absorption ou d''apport (5 mg)', 'Anémie mégaloblastique'),
    ('Traitement des carences d''absorption ou d''apport et de l''anémie de Biermer', 'Anémie de Biermer'),
    ('Prévention du spina bifida (0,4 mg), prescrit au moment de la conception et pendant la grossesse', 'Spina bifida'),
    ('Prévention de la toxicité du méthotrexate (5 mg, prise un jour différent de la prise du MTX)', 'Toxicité méthotrexate'),
    ('Traitement des anémies chez les insuffisants rénaux chroniques, les myélodysplasiques, certains patients traités par chimiothérapies', 'Anémie (EPO)'),
    ('Prévention et traitement des hémorragies dues à une carence en vitamine K', 'Carence vitamine K'),
    ('Prophylaxie de la maladie hémorragique du nouveau-né', 'Maladie hémorragique NN'),
    ('Prévention des hémorragies (stomatologie ou ORL)', 'Hémorragies ORL'),
    ('Accidents hémorragiques (méno-métrorragies, hémorragies digestives, ORL, stomatologiques)', 'Hémorragies'),
    ('Syndromes hémorragiques fibrinolytiques', 'Hémorragies fibrinolytiques'),
    ('Symptômes en rapport avec l''insuffisance veineuse (jambes lourdes, douleurs, impatiences)', 'Insuffisance veineuse'),
    ('Signes fonctionnels liés à la crise hémorroïdaire', 'Hémorroïdes'),
    ('Traitement de fond de la migraine', 'Migraine'),
    ('Diabète de type 2', 'Diabète type 2'),
    ('Antidote du dabigatran (Pradaxa)', 'Antidote dabigatran'),
    ('Injecté à la mère pour éviter les anémies hémolytiques lors des grossesses suivantes, en l''empêchant de fabriquer des anticorps anti-rhésus +', 'Anti-rhésus'),
    ('Déficit intellectuel du sujet âgé', 'Déficit intellectuel'),
    ('Troubles de la mémoire', 'Troubles mémoire'),
    ('Troubles cochléaires et auditifs', 'Troubles auditifs'),
    ('Atteintes vasculaires de la rétine', 'Atteintes rétine')
  ) AS t(o, n)
  LOOP
    PERFORM jeupharma._simp_merge_rename('indications', 'indication_id', 'matrice_indications', old_v, new_v);
  END LOOP;

  -- Contre-indications
  FOR old_v, new_v IN SELECT * FROM (VALUES
    ('Bloc auriculo-ventriculaire', 'BAV'),
    ('Bloc auriculo-ventriculaire (BAV)', 'BAV'),
    ('Bradycardie excessive', 'Bradycardie'),
    ('Bradycardie sévère', 'Bradycardie'),
    ('Fréquence cardiaque < 60 bpm', 'Bradycardie'),
    ('Hypotension artérielle', 'Hypotension'),
    ('Hypotension artérielle sévère', 'Hypotension'),
    ('Hypotension sévère', 'Hypotension'),
    ('Phénomène de Raynaud', 'Raynaud'),
    ('Maladie de Raynaud', 'Raynaud'),
    ('Insuffisance cardiaque', 'IC'),
    ('IC non contrôlée', 'IC'),
    ('Insuffisance ventriculaire gauche', 'IC'),
    ('Infarctus récent', 'IDM'),
    ('Insuffisance rénale', 'IR'),
    ('IR sévère', 'IR sévère'),
    ('Insuffisance hépatique', 'IH'),
    ('IH sévère', 'IH sévère'),
    ('Insuffisance hépatique sévère', 'IH sévère'),
    ('IH et IR sévères', 'IH/IR sévères'),
    ('IR et IH', 'IH/IR'),
    ('Sténose artérielle rénale', 'Sténose artères rénales'),
    ('Sténose des artères rénales', 'Sténose artères rénales'),
    ('2e et 3e trimestre de la grossesse', 'Grossesse'),
    ('Lésions hémorragiques évolutives (UGD)', 'UGD / lésions hémorragiques'),
    ('UGD évolutif, AVC hémorragique', 'UGD / AVC hémorragique'),
    ('Syndrome hémorragique, lésions susceptibles de saigner', 'Hémorragies'),
    ('Saignements évolutifs ou hémorragies', 'Hémorragies'),
    ('Déplétion hydro-sodée excessive', 'Déplétion hydro-sodée'),
    ('Association au sultopride, aux sels de calcium par voie IV et au millepertuis', 'Sultopride / Ca IV / millepertuis'),
    ('Association aux autres alpha-1 bloquants', 'Alpha-1 bloquants'),
    ('Association au potassium', 'Potassium'),
    ('Fibrillation auriculaire associée à un syndrome de Wolff-Parkinson-White', 'FA + WPW'),
    ('Hyperexcitabilité ventriculaire (extrasystoles) survenant encore sous digitalique', 'Extrasystoles sous digitalique'),
    ('Tachycardie et fibrillation ventriculaires', 'TV / FV'),
    ('Certaines tachycardies', 'Tachycardies'),
    ('Endocardites et péricardites', 'Endocardite / péricardite'),
    ('États dépressifs majeurs', 'Dépression majeure'),
    ('Injections et ponctions IM, intra-articulaires et intra-artérielles', 'Injections IM / IA'),
    ('ATCD de thrombopénie', 'Thrombopénie'),
    ('Sténose de l''isthme aortique', 'Sténose aortique'),
    ('Allergie aux sulfamides', 'Allergie sulfamides'),
    ('Hypokaliémie non corrigée', 'Hypokaliémie')
  ) AS t(o, n)
  LOOP
    PERFORM jeupharma._simp_merge_rename('contre_indications', 'contre_indication_id', 'matrice_contre_indications', old_v, new_v);
  END LOOP;

  -- Effets indésirables
  FOR old_v, new_v IN SELECT * FROM (VALUES
    ('Toux sèche persistante', 'Toux sèche'),
    ('Œdèmes des jambes', 'Œdèmes MI'),
    ('Œdèmes des membres inférieurs', 'Œdèmes MI'),
    ('Bouffées de chaleur, rougeurs de la face', 'Bouffées de chaleur'),
    ('Vasodilatation cutanée avec rougeur de la face et bouffées de chaleur', 'Bouffées de chaleur'),
    ('Rougeurs', 'Bouffées de chaleur'),
    ('Hypotension artérielle', 'Hypotension'),
    ('Impuissance ou priapisme (rare)', 'Impuissance'),
    ('Cauchemars, insomnie', 'Cauchemars'),
    ('Troubles digestifs (nausées et vomissements)', 'Troubles digestifs'),
    ('Digestifs (nausées et vomissements)', 'Troubles digestifs'),
    ('Nausées et vomissements', 'Troubles digestifs'),
    ('Douleurs abdominales', 'Troubles digestifs'),
    ('Diarrhée', 'Troubles digestifs'),
    ('Risque hémorragique', 'Hémorragies'),
    ('Risque hémorragique (INR > 5)', 'Hémorragies'),
    ('Risque hémorragique et hématomes', 'Hémorragies'),
    ('Saignements', 'Hémorragies'),
    ('Hématomes en IM', 'Hématomes'),
    ('Insuffisance rénale', 'IR'),
    ('Insuffisance cardiaque', 'IC'),
    ('Hyperkaliémie et ostéoporose si traitement prolongé', 'Hyperkaliémie'),
    ('Hypokaliémie si traitement prolongé', 'Hypokaliémie'),
    ('Cardiaques (aggravation des troubles)', 'Troubles cardiaques'),
    ('Troubles cardiaques type extrasystoles et torsades de pointe aggravées par l''hypokaliémie', 'Torsades de pointes'),
    ('Masquent les signes d''une hypoglycémie', 'Masque hypoglycémie'),
    ('Refroidissement des extrémités', 'Extrémités froides'),
    ('Diminution de l''effet thérapeutique en cas d''utilisation prolongée', 'Échappement thérapeutique'),
    ('Tachycardie réactionnelle', 'Tachycardie'),
    ('Allergies graves', 'Allergies'),
    ('Alopécie (coumarines)', 'Alopécie'),
    ('Phosphènes (taches lumineuses du champ visuel)', 'Phosphènes'),
    ('Vision colorée en jaune', 'Vision jaune'),
    ('Vertiges, céphalées', 'Vertiges'),
    ('Fatigue', 'Asthénie'),
    ('Tendance dépressive', 'Dépression'),
    ('Accidents thrombo-emboliques', 'Thrombo-embolies'),
    ('Thrombopénies', 'Thrombopénie'),
    ('Coloration des selles', 'Coloration selles'),
    ('Coloration rouge des urines', 'Coloration urines'),
    ('Noircissement des dents (formes orales liquides)', 'Noircissement dents'),
    ('Syndrome pseudo-grippal transitoire', 'Syndrome grippal'),
    ('Dysfonctionnement de la thyroïde', 'Troubles thyroïde')
  ) AS t(o, n)
  LOOP
    PERFORM jeupharma._simp_merge_rename('effets_indesirables', 'effet_indesirable_id', 'matrice_effets_indesirables', old_v, new_v);
  END LOOP;

  -- Précautions
  FOR old_v, new_v IN SELECT * FROM (VALUES
    ('En cas de crise ou en prévention (avant un effort ou une exposition au froid brutale) : 1 pulvérisation sublinguale en position assise. Si pas d''amélioration, une 2e pulvérisation est possible au bout de quelques minutes. Si pas d''amélioration après la 2e prise, appeler le 15 (risque d''IDM)', 'Crise angor : 1–2 sprays, sinon 15'),
    ('Dispositifs transdermiques prescrits de façon continue : respecter un intervalle de 8 à 12 heures entre 2 applications (sinon risque d''échappement thérapeutique)', 'Fenêtre thérapeutique 8–12 h'),
    ('Ne jamais interrompre brutalement le traitement', 'Arrêt non brutal'),
    ('Interventions chirurgicales : arrêter 7 jours avant', 'Arrêt 7 j avant chirurgie'),
    ('Arrêt immédiat si troubles inattendus', 'Arrêt si troubles inattendus'),
    ('Grossesse : utiliser que si nécessité stricte', 'Grossesse si nécessité'),
    ('Aliments riches en vitamine K', 'Aliments riches en vit. K'),
    ('Bilan hépatique et sanguin préalables (NFS, TP, TCA)', 'Bilan NFS / TP / TCA'),
    ('Bilan rénal et sanguin préalable (NFS, INR, TCA, plaquettes)', 'Bilan NFS / INR / TCA'),
    ('Bilan sanguin préalable (NFS, INR, TCA, plaquettes)', 'Bilan NFS / INR / TCA'),
    ('Bilan sanguin régulier (fer, NFS, ionogramme)', 'Bilan fer / NFS / iono'),
    ('Surveillance pendant le traitement', 'Surveillance traitement'),
    ('Mise en place du traitement en milieu hospitalier, puis relais par le médecin traitant une fois la dose d''entretien atteinte', 'Instauration hospitalière'),
    ('Relais héparine vers AVK : commencer les AVK tout en continuant l''héparine jusqu''à obtenir l''INR voulu à 2 reprises à 24 ou 48 h d''intervalle, puis arrêter l''héparine', 'Relais héparine → AVK'),
    ('Ne nécessite pas de surveillance biologique de l''activité anticoagulante', 'Pas de surveillance coag.'),
    ('Des cas d''hémorragies parfois fatales ont été observés', 'Risque hémorragique'),
    ('Il n''est plus possible d''instaurer de nouveaux traitements par Préviscan. Seuls les patients déjà traités peuvent continuer à se voir prescrire ce médicament', 'Préviscan : pas de nouvel instaur.')
  ) AS t(o, n)
  LOOP
    PERFORM jeupharma._simp_merge_rename('precautions_emploi', 'precaution_emploi_id', 'matrice_precautions_emploi', old_v, new_v);
  END LOOP;

  -- Interactions
  FOR old_v, new_v IN SELECT * FROM (VALUES
    ('Floctafénine (contre-indiquée)', 'Floctafénine'),
    ('Dantrolène injectable (contre-indiqué)', 'Dantrolène'),
    ('Lithium (déconseillé)', 'Lithium'),
    ('Potassium (déconseillé)', 'Potassium'),
    ('Sels de potassium (contre-indiqués)', 'Potassium'),
    ('Potassium ou épargneurs potassiques', 'Potassium / épargneurs K'),
    ('Autres diurétiques épargneurs potassiques', 'Épargneurs potassiques'),
    ('Vérapamil et tout médicament bradycardisant (déconseillé)', 'Vérapamil / bradycardisants'),
    ('Association avec les alpha-1 bloquants', 'Alpha-1 bloquants'),
    ('Médicaments susceptibles de favoriser les torsades de pointe', 'Torsadogènes'),
    ('Intervalle de 2 h avec la majorité des médicaments administrés en même temps (surtout quinolones, tétracyclines, topiques gastro-intestinaux, hormones thyroïdiennes)', 'Intervalle 2 h (quinolones…)'),
    ('L''absorption du fer pourrait être inhibée par une consommation importante de thé', 'Thé (↓ absorption fer)')
  ) AS t(o, n)
  LOOP
    PERFORM jeupharma._simp_merge_rename('interactions', 'interaction_id', 'matrice_interactions', old_v, new_v);
  END LOOP;

  -- Surveillances
  FOR old_v, new_v IN SELECT * FROM (VALUES
    ('INR le plus souvent situé entre 2 et 3', 'INR 2–3'),
    ('L''INR se dose le matin afin d''avoir le résultat dans la journée et de corriger le dosage le soir même', 'INR le matin'),
    ('Quand l''INR souhaité est stable, surveillance de l''INR 1 fois par mois', 'INR 1× / mois si stable'),
    ('Dosage régulier des taux sanguins en digitaliques (marge thérapeutique étroite)', 'Taux digitaliques'),
    ('Surveillance de la fonction rénale', 'Fonction rénale'),
    ('Surveillance de toute manifestation hémorragique', 'Manifestations hémorragiques')
  ) AS t(o, n)
  LOOP
    PERFORM jeupharma._simp_merge_rename('surveillances', 'surveillance_id', 'matrice_surveillances', old_v, new_v);
  END LOOP;
END $$;

DROP FUNCTION jeupharma._simp_merge_rename(text, text, text, text, text);
