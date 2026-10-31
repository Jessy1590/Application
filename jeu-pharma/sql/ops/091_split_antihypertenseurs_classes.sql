-- =============================================================================
-- Ops 091 — Découpage « Antihypertenseurs par classe »
-- - Classes déjà en Appareil CV : enrichir CV (pas de doublon HTA)
-- - Classes absentes du CV : créer leçon HTA
-- - hta_classes : ne garde que le panorama « cibles d’action »
-- Sans invention : uniquement contenu déjà présent.
-- Idempotent (codes stables).
-- =============================================================================

DO $$
DECLARE
  pid uuid := 'b0d4c335-717c-4574-aa81-3391cbce70a3';
  chap_hta uuid := '7dcc101f-0951-43e5-b65a-7bb6f0a9f506';
  id_hta_classes uuid := 'f0382a46-ee1d-4a53-8ef8-fdd8ea17bd6e';
  id_bb uuid := '59da7730-7876-43e3-8381-c923805ffeeb';
  id_inca uuid := '78ed835c-3438-492b-859c-c92f01dcb91c';
  id_iec uuid := 'a23e7036-63ba-4a06-8c38-b19e299ab85c';
  id_ara uuid := '0e6f8656-f2ac-435c-bac5-9e39ff1514da';
  id_alpha uuid;
  id_centraux uuid;
BEGIN
  -- -------------------------------------------------------------------------
  -- 1) Leçons HTA nouvelles : Alpha-1 et Centraux
  -- -------------------------------------------------------------------------
  INSERT INTO jeupharma.modules_cours (
    parcours_id, parent_id, code, titre, resume, objectifs, ordre,
    publie, est_groupe, statut, criteres_json, contenu_maj_at,
    niveau_min, niveau_max, version_publication
  ) VALUES (
    pid, chap_hta, 'alpha_1_bloquants', 'Alpha-1 bloquants',
    'Alpha-1 bloquants : spécialités, mécanisme, EI / CI / interactions.',
    '', 52, true, false, 'publie', '{}'::jsonb, now(), 1, 5, 1
  )
  ON CONFLICT (parcours_id, code) DO UPDATE SET
    titre = EXCLUDED.titre, resume = EXCLUDED.resume, parent_id = chap_hta,
    ordre = EXCLUDED.ordre, publie = true, updated_at = now(), contenu_maj_at = now()
  RETURNING id INTO id_alpha;

  SELECT id INTO id_alpha FROM jeupharma.modules_cours
  WHERE parcours_id = pid AND code = 'alpha_1_bloquants';

  INSERT INTO jeupharma.modules_cours (
    parcours_id, parent_id, code, titre, resume, objectifs, ordre,
    publie, est_groupe, statut, criteres_json, contenu_maj_at,
    niveau_min, niveau_max, version_publication
  ) VALUES (
    pid, chap_hta, 'antihypertenseurs_centraux', 'Antihypertenseurs centraux',
    'Antihypertenseurs centraux : spécialités, mécanisme, EI / CI.',
    '', 54, true, false, 'publie', '{}'::jsonb, now(), 1, 5, 1
  )
  ON CONFLICT (parcours_id, code) DO UPDATE SET
    titre = EXCLUDED.titre, resume = EXCLUDED.resume, parent_id = chap_hta,
    ordre = EXCLUDED.ordre, publie = true, updated_at = now(), contenu_maj_at = now()
  RETURNING id INTO id_centraux;

  SELECT id INTO id_centraux FROM jeupharma.modules_cours
  WHERE parcours_id = pid AND code = 'antihypertenseurs_centraux';

  -- Sections d’ouverture (idempotentes via seed_key)
  INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
  SELECT id_alpha, 10, 'section', 'Alpha-1 bloquants',
         jsonb_build_object('seed_key', '091:alpha:sec'), true
  WHERE NOT EXISTS (
    SELECT 1 FROM jeupharma.module_blocs WHERE payload_json->>'seed_key' = '091:alpha:sec'
  );

  INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
  SELECT id_centraux, 10, 'section', 'Antihypertenseurs centraux',
         jsonb_build_object('seed_key', '091:centraux:sec'), true
  WHERE NOT EXISTS (
    SELECT 1 FROM jeupharma.module_blocs WHERE payload_json->>'seed_key' = '091:centraux:sec'
  );

  -- Déplacer blocs Alpha-1
  UPDATE jeupharma.module_blocs SET module_id = id_alpha, ordre = 20, titre = 'Spécialités', updated_at = now()
  WHERE id = '55b17381-2610-4835-8fad-03f39a33f557';
  UPDATE jeupharma.module_blocs SET module_id = id_alpha, ordre = 30, titre = 'Mécanisme d’action', updated_at = now()
  WHERE id = 'c9bff952-7b6f-4fb8-9f3e-d5a134633258';
  UPDATE jeupharma.module_blocs SET module_id = id_alpha, ordre = 40, titre = 'Effets indésirables, contre-indications, interactions', updated_at = now()
  WHERE id = '8f3ce3c4-d3ff-461b-9a3a-b3c3e8b89087';

  -- Déplacer blocs Centraux
  UPDATE jeupharma.module_blocs SET module_id = id_centraux, ordre = 20, titre = 'Spécialités', updated_at = now()
  WHERE id = '1577abe1-038f-4ea3-993f-8c79cb63718a';
  UPDATE jeupharma.module_blocs SET module_id = id_centraux, ordre = 30, titre = 'Mécanisme d’action', updated_at = now()
  WHERE id = '66b40144-facc-41ae-b8fb-480e8e5ea472';
  UPDATE jeupharma.module_blocs SET module_id = id_centraux, ordre = 40, updated_at = now()
  WHERE id = '8c3b8a0c-755f-44fd-b75a-5dd5b4de5d3e';
  UPDATE jeupharma.module_blocs SET module_id = id_centraux, ordre = 50, titre = 'Schéma noradrénaline et récepteurs', updated_at = now()
  WHERE id = 'd3db5c83-f4d9-495a-8bac-14404e5397b2';
  UPDATE jeupharma.module_blocs SET module_id = id_centraux, ordre = 60, titre = 'Effets indésirables et contre-indications', updated_at = now()
  WHERE id = 'a673f259-fa36-48c7-9502-3e2fe3bf191d';

  -- -------------------------------------------------------------------------
  -- 2) Peupler IEC / ARA2 (leçons CV vides) depuis hta_classes
  -- -------------------------------------------------------------------------
  INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
  SELECT id_iec, 10, 'section', 'Inhibiteurs de l’enzyme de conversion',
         jsonb_build_object('seed_key', '091:iec:sec'), true
  WHERE NOT EXISTS (
    SELECT 1 FROM jeupharma.module_blocs WHERE payload_json->>'seed_key' = '091:iec:sec'
  );

  UPDATE jeupharma.module_blocs SET module_id = id_iec, ordre = 20, titre = 'Spécialités', updated_at = now()
  WHERE id = '460d2403-73ca-4643-8f75-9d41e81a3a38';
  UPDATE jeupharma.module_blocs SET module_id = id_iec, ordre = 30, updated_at = now()
  WHERE id = '8e3069f8-e583-4735-b412-baa8df7e3e5c';
  UPDATE jeupharma.module_blocs SET module_id = id_iec, ordre = 40, titre = 'Schéma angiotensinogène — ECA — effets', updated_at = now()
  WHERE id = '9424ba00-5c43-4b53-915b-e1e8d1fbf510';
  UPDATE jeupharma.module_blocs SET module_id = id_iec, ordre = 50, updated_at = now()
  WHERE id = '49d9f27e-d6de-4b5d-837f-741bfe92c604';
  UPDATE jeupharma.module_blocs SET module_id = id_iec, ordre = 60, titre = 'Schéma IEC et ARA II', updated_at = now()
  WHERE id = 'e307cb9b-6e71-4ad8-8a77-16dd4b839327';
  UPDATE jeupharma.module_blocs SET module_id = id_iec, ordre = 70, titre = 'Effets indésirables, contre-indications, interactions', updated_at = now()
  WHERE id = 'fc0e8823-51aa-4cde-ade8-7b93aef96b3b';

  UPDATE jeupharma.modules_cours SET
    titre = 'Inhibiteurs de l’enzyme de conversion (IEC)',
    resume = 'IEC : spécialités, mécanisme via le SRAA, EI / CI / interactions.',
    contenu_maj_at = now(), updated_at = now()
  WHERE id = id_iec;

  INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
  SELECT id_ara, 10, 'section', 'Sartans / ARA II',
         jsonb_build_object('seed_key', '091:ara:sec'), true
  WHERE NOT EXISTS (
    SELECT 1 FROM jeupharma.module_blocs WHERE payload_json->>'seed_key' = '091:ara:sec'
  );

  UPDATE jeupharma.module_blocs SET module_id = id_ara, ordre = 20, titre = 'Spécialités', updated_at = now()
  WHERE id = '7f2d9004-6590-42b6-8c2a-d43c5261a3fa';
  UPDATE jeupharma.module_blocs SET module_id = id_ara, ordre = 30, titre = 'Mécanisme d’action', updated_at = now()
  WHERE id = 'd434fec7-920e-4a98-aa8d-feeb495108b1';
  UPDATE jeupharma.module_blocs SET module_id = id_ara, ordre = 40, titre = 'Effets indésirables, contre-indications, interactions', updated_at = now()
  WHERE id = '2aba8e0a-bdf7-47da-9a2d-2c172dd8e7d9';

  UPDATE jeupharma.modules_cours SET
    titre = 'Sartans / ARA II',
    resume = 'Antagonistes des récepteurs de l’angiotensine II : spécialités, mécanisme, EI / CI / interactions.',
    contenu_maj_at = now(), updated_at = now()
  WHERE id = id_ara;

  -- -------------------------------------------------------------------------
  -- 3) Enrichir Bétabloquants CV
  -- -------------------------------------------------------------------------
  -- Mécanisme
  UPDATE jeupharma.module_blocs SET titre = 'ancien bloc - Mécanisme d''action', ordre = 22, updated_at = now()
  WHERE id = '49aa418a-de2a-44ed-a788-f32a3cc2f10f';
  INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
  SELECT id_bb, 20, 'texte', 'Mécanisme d''action',
    jsonb_build_object(
      'seed_key', '091:bb:mecanique',
      'html', $h$<p>Antagonistes des récepteurs bêta du système sympathique.</p><p>Effet sur les récepteurs β-1 adrénergiques (cœur)</p><ul><li>Réduction de la fréquence cardiaque (effet chronotrope négatif)</li><li>Diminution de l'excitabilité cardiaque (effet bathmotrope négatif)</li><li>Diminution de la contractilité myocardique (effet inotrope négatif)</li><li>Diminution de la vitesse de conduction (effet dromotrope négatif)</li><li>Baisse de la production de rénine</li></ul><p>Effet sur les récepteurs β-2 adrénergiques (bronches, vaisseaux, utérus)</p><p>Provoque la constriction des fibres musculaires lisses du poumon, des vaisseaux et de l’utérus =&gt; effets secondaires des bêtabloquants</p>$h$
    ), true
  WHERE NOT EXISTS (SELECT 1 FROM jeupharma.module_blocs WHERE payload_json->>'seed_key' = '091:bb:mecanique');

  -- Cardiosélectivité
  UPDATE jeupharma.module_blocs SET titre = 'ancien bloc - Cardiosélectivité', ordre = 62, updated_at = now()
  WHERE id = '4fc977e3-0529-475c-a5c1-cd15a6c8ddd9';
  INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
  SELECT id_bb, 60, 'texte', 'Cardiosélectivité',
    jsonb_build_object(
      'seed_key', '091:bb:cardio',
      'html', $h$<p>Les bêtabloquants cardiosélectifs bloquent principalement les récepteurs bêta 1 (qui sont surtout cardiaques). Ce qui diminue les effets sur les récepteurs bêta 2 (vasoconstriction, bronchoconstriction, et hypoglycémie), ils sont donc utilisables chez les patients asthmatiques ou diabétiques.</p>$h$
    ), true
  WHERE NOT EXISTS (SELECT 1 FROM jeupharma.module_blocs WHERE payload_json->>'seed_key' = '091:bb:cardio');

  -- Spécialités (déplacées depuis hta_classes)
  UPDATE jeupharma.module_blocs SET module_id = id_bb, ordre = 64, titre = 'Bêtabloquants cardiosélectifs', updated_at = now()
  WHERE id = '33f6ecda-fbd5-4d6f-a134-404f996f663e';
  UPDATE jeupharma.module_blocs SET module_id = id_bb, ordre = 66, titre = 'Bêtabloquants non cardiosélectifs', updated_at = now()
  WHERE id = '5141691d-ba9d-495c-af0f-522b38370aab';

  -- EI
  UPDATE jeupharma.module_blocs SET titre = 'ancien bloc - Effets indésirables', ordre = 92, updated_at = now()
  WHERE id = '17b99ecd-104a-4127-9e0f-9744d129c54e';
  INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
  SELECT id_bb, 90, 'texte', 'Effets indésirables',
    jsonb_build_object(
      'seed_key', '091:bb:ei',
      'html', $h$<ul><li>Hypotension artérielle</li><li>Bradycardie</li><li>Fatigue / asthénie</li><li>Refroidissement des extrémités</li><li>Cauchemars, insomnie</li><li>Dyspnée</li><li>Hypoglycémie</li><li>Impuissance</li><li>Insuffisance cardiaque</li></ul><p>De plus, les bêta-bloquants masquent les signes d’une hypoglycémie.</p>$h$
    ), true
  WHERE NOT EXISTS (SELECT 1 FROM jeupharma.module_blocs WHERE payload_json->>'seed_key' = '091:bb:ei');

  -- CI
  UPDATE jeupharma.module_blocs SET titre = 'ancien bloc - Contre Indication', ordre = 102, updated_at = now()
  WHERE id = '535cd2ba-030b-40f4-b8cc-fbb66c70f3ff';
  INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
  SELECT id_bb, 100, 'texte', 'Contre-indications et interactions',
    jsonb_build_object(
      'seed_key', '091:bb:ci',
      'html', $h$<p>Contre-indications :</p><ul><li>Bloc auriculo-ventriculaire (BAV)</li><li>Asthme</li><li>Bradycardie / bradycardie excessive</li><li>Maladie de Raynaud / phénomène de Raynaud</li><li>Choc anaphylactique</li><li>Hypotension artérielle sévère</li><li>Insuffisance cardiaque</li></ul><p>Interactions :</p><ul><li>Floctafénine (contre-indication)</li><li>Vérapamil, et tout médicament bradycardisant (à discuter)</li></ul>$h$
    ), true
  WHERE NOT EXISTS (SELECT 1 FROM jeupharma.module_blocs WHERE payload_json->>'seed_key' = '091:bb:ci');

  -- Masquer le bloc « action sur le cœur » source (contenu repris) s’il restait
  UPDATE jeupharma.module_blocs SET visible = false, ordre = 2000, updated_at = now()
  WHERE id = '8bf755ac-c101-483c-be8c-8bfe79cade81';
  UPDATE jeupharma.module_blocs SET visible = false, ordre = 2001, updated_at = now()
  WHERE id = '13ee4ba8-4c6b-4fa3-baf9-0f1c4c10acf2';

  UPDATE jeupharma.modules_cours SET contenu_maj_at = now(), updated_at = now() WHERE id = id_bb;

  -- -------------------------------------------------------------------------
  -- 4) Enrichir Inhibiteurs calciques CV
  -- -------------------------------------------------------------------------
  UPDATE jeupharma.module_blocs SET titre = 'ancien bloc - Différents groupes', ordre = 22, updated_at = now()
  WHERE id = '83fd718c-19df-405f-99bb-e35ace912fcd';
  INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
  SELECT id_inca, 20, 'texte', 'Différents groupes',
    jsonb_build_object(
      'seed_key', '091:inca:groupes',
      'html', $h$<p>Les inhibiteurs calciques (INCA) sont composés de deux groupes :</p><ul><li>Groupe des dihydropyridines (-dipine) : effets vasculaires prédominants (inhibiteurs calciques périphériques)</li><li>Groupe INCA à effets cardiaques prédominants : vérapamil (Isoptine®) et diltiazem (Tildiem®, Mono-tildiem®)</li></ul>$h$
    ), true
  WHERE NOT EXISTS (SELECT 1 FROM jeupharma.module_blocs WHERE payload_json->>'seed_key' = '091:inca:groupes');

  UPDATE jeupharma.module_blocs SET titre = 'ancien bloc - Mécanisme d''action', ordre = 32, updated_at = now()
  WHERE id = '5fd166e1-2077-4459-b241-2c6af063dc11';
  INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
  SELECT id_inca, 30, 'texte', 'Mécanisme d''action',
    jsonb_build_object(
      'seed_key', '091:inca:mecanique',
      'html', $h$<p>Ils bloquent l’ouverture des canaux calciques du myocarde et/ou des muscles vasculaires.</p><p><b>INCA à action cardiaque</b></p><ul><li>freinent l'entrée transmembranaire du calcium au niveau de la fibre musculaire myocardique</li><li>diminution des contractions du myocarde, diminution du rythme cardiaque</li></ul><p><b>INCA périphériques (dihydropyridines)</b></p><ul><li>action vasculaire, périphérique, sans effet dépresseur cardiaque (pas d’action sur le cœur)</li><li>pas d’effet inotrope</li><li>bloquent l’ouverture des canaux calciques des vaisseaux, provoquant une vasodilatation</li></ul><p>Relâchement de la fibre musculaire lisse entraînant une vasodilatation et une diminution de la pression artérielle.</p>$h$
    ), true
  WHERE NOT EXISTS (SELECT 1 FROM jeupharma.module_blocs WHERE payload_json->>'seed_key' = '091:inca:mecanique');

  UPDATE jeupharma.module_blocs SET titre = 'ancien bloc - Indication', ordre = 42, updated_at = now()
  WHERE id = 'a0a69ec2-420f-4e65-8f35-8cd4e9fa4762';
  INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
  SELECT id_inca, 40, 'texte', 'Indications',
    jsonb_build_object(
      'seed_key', '091:inca:ind',
      'html', $h$<ul><li>Traitement de l’angor stable</li><li>Traitement de l’HTA</li><li>Traitement des troubles du rythme pour les INCA à visée cardiaque</li></ul><p>INCA à action cardiaque : HTA, angor. Seules les formes LP du diltiazem sont indiquées dans l’HTA, les autres dans la prévention de l’angor.</p>$h$
    ), true
  WHERE NOT EXISTS (SELECT 1 FROM jeupharma.module_blocs WHERE payload_json->>'seed_key' = '091:inca:ind');

  -- Spécialités déplacées
  UPDATE jeupharma.module_blocs SET module_id = id_inca, ordre = 44, titre = 'INCA à action cardiaque — spécialités', updated_at = now()
  WHERE id = '74e08c24-0d9d-42ba-8481-c9268f4939fe';
  -- Retirer le doublon mécanisme déjà fusionné : on garde le bloc spécialités tel quel (contient aussi mécanisme/indications d’origine)
  UPDATE jeupharma.module_blocs SET module_id = id_inca, ordre = 46, titre = 'INCA périphériques — spécialités', updated_at = now()
  WHERE id = '728b26ea-a2bd-43d1-9b84-47bae28300b2';

  UPDATE jeupharma.module_blocs SET titre = 'ancien bloc - Effets indésirables', ordre = 52, updated_at = now()
  WHERE id = 'de37691a-a2f4-4270-802d-f6345d34bfd3';
  INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
  SELECT id_inca, 50, 'texte', 'Effets indésirables',
    jsonb_build_object(
      'seed_key', '091:inca:ei',
      'html', $h$<p>Effets observés :</p><ul><li>Rougeurs, céphalées, bouffées de chaleur</li><li>Œdèmes des jambes / membres inférieurs</li><li>Hypotension / hypotension orthostatique</li><li>Bradycardie</li><li>Troubles du rythme pour diltiazem et vérapamil</li><li>Constipation ou diarrhée</li></ul>$h$
    ), true
  WHERE NOT EXISTS (SELECT 1 FROM jeupharma.module_blocs WHERE payload_json->>'seed_key' = '091:inca:ei');

  UPDATE jeupharma.module_blocs SET titre = 'ancien bloc - Contre Indication', ordre = 62, updated_at = now()
  WHERE id = '8aac1641-c77c-4ea3-8b9c-7db2d3d55201';
  INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
  SELECT id_inca, 60, 'texte', 'Contre-indications et interactions',
    jsonb_build_object(
      'seed_key', '091:inca:ci',
      'html', $h$<p>Contre-indications :</p><ul><li>Angor instable</li><li>Insuffisance cardiaque</li><li>Bradycardie sévère / bradycardie ou hypotension artérielle</li><li>Bloc auriculo-ventriculaire (INCA cardiaques)</li><li>Insuffisance hépatique sévère et/ou infarctus récent (INCA périphériques)</li></ul><p>Interactions :</p><ul><li>Dantrolène inj (contre-indication — INCA cardiaques)</li><li>Attention au dantrolène et vérapamil inj (INCA périphériques)</li></ul>$h$
    ), true
  WHERE NOT EXISTS (SELECT 1 FROM jeupharma.module_blocs WHERE payload_json->>'seed_key' = '091:inca:ci');

  -- Masquer sources EI/CI/mécanisme périphérique déjà fusionnés
  UPDATE jeupharma.module_blocs SET visible = false, ordre = 2100, updated_at = now()
  WHERE id IN (
    '0cf65f66-c67e-4ccd-a9eb-bb6e0abd08c8',
    'd2166dc1-4ccb-4ee9-806c-fcee677254ee',
    'c697bd7f-e59e-468c-b723-bf8c2ff9c1d0'
  );

  UPDATE jeupharma.modules_cours SET contenu_maj_at = now(), updated_at = now() WHERE id = id_inca;

  -- -------------------------------------------------------------------------
  -- 5) hta_classes = panorama cibles uniquement
  -- -------------------------------------------------------------------------
  UPDATE jeupharma.modules_cours SET
    titre = 'Cibles d’action des antihypertenseurs',
    resume = 'Panorama des cibles d’action : fréquence cardiaque, volémie, vasodilatation.',
    contenu_maj_at = now(), updated_at = now()
  WHERE id = id_hta_classes;

  UPDATE jeupharma.module_blocs SET ordre = 10, titre = 'Cibles d’action', updated_at = now()
  WHERE id = 'f60f8742-404e-4cac-b8f0-6a02edede977';
  UPDATE jeupharma.module_blocs SET ordre = 20, updated_at = now()
  WHERE id = '46dde994-dc5c-44ba-856a-b451f7501472';
  UPDATE jeupharma.module_blocs SET ordre = 30, updated_at = now()
  WHERE id = '1816f9c7-40a9-4c06-8a7e-0e3d8c5a1f78';
  UPDATE jeupharma.module_blocs SET ordre = 40, updated_at = now()
  WHERE id = '7df180db-e8af-4393-90b4-37c6f8927665';
  UPDATE jeupharma.module_blocs SET ordre = 50, updated_at = now()
  WHERE id = 'cffc1d71-b9e9-45e3-af3d-5a21d5533edd';
  UPDATE jeupharma.module_blocs SET ordre = 60, updated_at = now()
  WHERE id = '6088747c-8ddd-4c17-ab1b-5f98290b34e6';
  UPDATE jeupharma.module_blocs SET ordre = 900, updated_at = now()
  WHERE id = '45eccb96-2663-48bb-8aec-fa0e0af87feb';
  UPDATE jeupharma.module_blocs SET ordre = 999, updated_at = now()
  WHERE id = 'dbf4bb68-db81-4d50-bdc4-830c1e191749';

  UPDATE jeupharma.modules_cours SET contenu_maj_at = now(), updated_at = now()
  WHERE id IN (id_alpha, id_centraux, id_iec, id_ara, id_hta_classes);
END;
$$;
