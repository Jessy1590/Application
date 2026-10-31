-- =============================================================================
-- Ops 089 — Réorganisation des leçons PA / RAA / HTA
-- Parcours : cardiovasculaires_deust_2a
-- Chapitre : chap_cv (Appareil cardiovasculaire)
-- Projet : kpjflntnotftpzffjbud
--
-- Trois leçons, dans l’ordre :
--   1. Physiologie de la pression artérielle (pression_art_rielle)
--   2. Système RAA (systeme_raa, créée)
--   3. Pathologie de l’hypertension artérielle (hypertension_art_rielle)
-- Les blocs existants sont déplacés, pas réécrits.
-- Une phrase de conclusion relie chaque leçon à la suivante.
-- Chaque leçon se termine par une section « Test de connaissance ».
-- Aucune publication de connaissance n’est ajoutée ni supprimée.
-- Les autres leçons et parcours ne sont pas modifiés.
-- Idempotent.
-- =============================================================================

DO $$
DECLARE
  pid uuid;
  parent uuid;
  id_pa uuid;
  id_raa uuid;
  id_hta uuid;
BEGIN
  SELECT m.parcours_id, m.parent_id, m.id
    INTO pid, parent, id_pa
  FROM jeupharma.modules_cours m
  WHERE m.code = 'pression_art_rielle';

  IF pid IS NULL THEN
    RAISE EXCEPTION '089: leçon pression_art_rielle introuvable';
  END IF;

  SELECT id INTO id_hta
  FROM jeupharma.modules_cours
  WHERE parcours_id = pid AND code = 'hypertension_art_rielle';

  IF id_hta IS NULL THEN
    RAISE EXCEPTION '089: leçon hypertension_art_rielle introuvable';
  END IF;

  INSERT INTO jeupharma.modules_cours (
    parcours_id, parent_id, code, titre, resume, objectifs, ordre,
    publie, est_groupe, statut, criteres_json, contenu_maj_at,
    niveau_min, niveau_max, version_publication
  )
  SELECT
    pid, parent, 'systeme_raa', 'Système RAA',
    'Rénine, angiotensine II, aldostérone et régulation de la volémie.',
    '', 15,
    true, false, 'publie', '{}'::jsonb, now(),
    1, 5, 1
  WHERE NOT EXISTS (
    SELECT 1 FROM jeupharma.modules_cours
    WHERE parcours_id = pid AND code = 'systeme_raa'
  );

  SELECT id INTO id_raa
  FROM jeupharma.modules_cours
  WHERE parcours_id = pid AND code = 'systeme_raa';

  UPDATE jeupharma.modules_cours SET
    titre = 'Physiologie de la pression artérielle',
    resume = 'Définition de la pression artérielle, ses déterminants, sa régulation nerveuse et vasculaire.',
    ordre = 10,
    contenu_maj_at = now(),
    updated_at = now()
  WHERE id = id_pa;

  UPDATE jeupharma.modules_cours SET
    titre = 'Système RAA',
    resume = 'Rénine, angiotensine II, aldostérone et régulation de la volémie.',
    ordre = 15,
    parent_id = parent,
    publie = true,
    est_groupe = false,
    statut = 'publie',
    contenu_maj_at = now(),
    updated_at = now()
  WHERE id = id_raa;

  UPDATE jeupharma.modules_cours SET
    titre = 'Pathologie de l’hypertension artérielle',
    resume = 'Mesure, seuils, formes, signes, complications et conseils. L’HTA comme facteur de risque cardiovasculaire.',
    ordre = 20,
    contenu_maj_at = now(),
    updated_at = now()
  WHERE id = id_hta;

  -- Déplacement des blocs existants (contenu inchangé).
  UPDATE jeupharma.module_blocs AS b SET
    module_id = v.module_id,
    ordre = v.ordre,
    updated_at = now()
  FROM (VALUES
    -- Physiologie
    ('bf56ec34-8e66-4b37-a27a-3c71fdbf2ea5'::uuid, id_pa, 10),
    ('310cf95a-3d02-4dd7-acf0-6d9307b6d71e'::uuid, id_pa, 20),
    ('d0b71f70-6f0c-48b6-88c0-3c6899f44624'::uuid, id_pa, 30),
    ('5f72b551-1d3f-4dba-bc11-328a213581c5'::uuid, id_pa, 40),
    ('529b647f-201f-4003-9d8a-9ec21744089d'::uuid, id_pa, 50),
    ('9f0bc91b-806d-4a72-902b-8ecef10f7b0a'::uuid, id_pa, 60),
    ('b4982f15-9735-43e1-bd4b-9d66989b69ce'::uuid, id_pa, 70),
    ('8b0f4415-1bdf-4826-922d-c888fa6ac3f3'::uuid, id_pa, 80),
    ('9e5cd3d3-25e8-4417-a4cd-1e06bc3b4b69'::uuid, id_pa, 90),
    ('df32a769-c220-4b47-a16a-d9d25f6168bd'::uuid, id_pa, 100),
    ('d44c2b44-d25b-47c6-8449-f7064083e95c'::uuid, id_pa, 110),
    ('66ee6a9d-0ecd-4483-8dd3-0bf771347e98'::uuid, id_pa, 120),
    ('e79efe56-fd3e-4f02-8b6a-a49fefebc4c3'::uuid, id_pa, 130),
    ('0b84cf8e-b6bc-4c7f-ba4b-05fc0f8dfc9f'::uuid, id_pa, 140),
    ('55562725-d376-44bc-a8bc-e89681a2a3ef'::uuid, id_pa, 150),
    ('acba0641-2f7e-4220-a992-767e2f740020'::uuid, id_pa, 170),
    ('5beda56d-b351-4abf-adb7-2f3e840a44d7'::uuid, id_pa, 180),
    -- Système RAA
    ('31f100e6-0993-43fd-866c-9e47beee4721'::uuid, id_raa, 10),
    ('3ac45169-cfb6-4f09-9745-fe1a4a2276fb'::uuid, id_raa, 20),
    ('b042fe1a-61ce-4892-92da-a2b7876029dc'::uuid, id_raa, 30),
    ('e803bbce-2631-4938-b563-da3251871895'::uuid, id_raa, 40),
    ('a3323679-01eb-4552-8804-99eaf584ae9c'::uuid, id_raa, 50),
    ('f721dc72-197d-45d7-aae4-a649f903c0a2'::uuid, id_raa, 60),
    ('6ec17c66-b5ad-4a10-adb1-469a7d202acc'::uuid, id_raa, 70),
    ('957d3118-fa15-4754-9e4e-316fdfdb96ee'::uuid, id_raa, 80),
    ('cda7c056-5737-42af-b56b-410b7afe5e98'::uuid, id_raa, 90),
    ('e79bf0b6-c85d-4c11-9dec-9a897b0445fa'::uuid, id_raa, 100),
    ('bc7d3201-81ff-46f5-aa49-deb7dfc8f72e'::uuid, id_raa, 110),
    ('b9044812-a0f2-4ee6-8545-e2b8a55065aa'::uuid, id_raa, 120),
    ('32055212-9b48-471f-a815-e79672694082'::uuid, id_raa, 130),
    ('c2f0ce2f-2d06-4b03-9346-327527063e6c'::uuid, id_raa, 160),
    ('8d9b9fad-2d70-4635-85d3-5e742992d40e'::uuid, id_raa, 170),
    ('e071fa3f-84d6-4361-a39c-f022f04ec737'::uuid, id_raa, 180),
    -- Pathologie HTA
    ('b8ec50b7-cde2-4be3-b4d9-3cfa3a834981'::uuid, id_hta, 10),
    ('36b79829-720e-451d-a936-cc6261531064'::uuid, id_hta, 20),
    ('877b4fbe-26ed-456d-8798-20d08afa8978'::uuid, id_hta, 30),
    ('155c2818-da61-4bfa-906a-f10923170b3e'::uuid, id_hta, 40),
    ('aef4576a-17fd-4f73-9a62-c48be7a7fac4'::uuid, id_hta, 50),
    ('9f3ec116-3cdb-487d-be78-c55a9c279f8d'::uuid, id_hta, 60),
    ('30ae0801-a254-4880-a0c4-fb421c3e9a56'::uuid, id_hta, 70),
    ('10136ab0-5fc7-4204-8faf-763213ee7db7'::uuid, id_hta, 80),
    ('07c27e7b-afb2-4364-b360-81ad277bade5'::uuid, id_hta, 90),
    ('c19b3c9c-9d2f-4839-a493-fe92c6704853'::uuid, id_hta, 100),
    ('9df95fc2-8e0f-4f36-8f43-f4046ab2cb77'::uuid, id_hta, 110),
    ('90da8b45-df23-405e-bb34-a42154171164'::uuid, id_hta, 120),
    ('7b8092f4-16cc-465b-ba87-6677360269d4'::uuid, id_hta, 130),
    ('f2579c04-fe81-4213-acb7-bfd46dd28b2a'::uuid, id_hta, 140),
    ('ac12c22d-df2f-40d3-a563-d5cabc467cae'::uuid, id_hta, 150),
    ('14410a7c-867a-4192-baff-b0139222df74'::uuid, id_hta, 160)
  ) AS v(id, module_id, ordre)
  WHERE b.id = v.id;

  UPDATE jeupharma.module_blocs SET
    titre = 'Définition',
    updated_at = now()
  WHERE id = 'b8ec50b7-cde2-4be3-b4d9-3cfa3a834981';

  UPDATE jeupharma.module_blocs SET
    titre = 'Conclusion',
    payload_json = jsonb_build_object(
      'html', '<p>L’hypertension artérielle est une pathologie qui est un facteur de risque important des pathologies cardiovasculaires.</p><p>En rigidifiant les artères, elle favorise l’athérosclérose et les atteintes du cœur, du cerveau, des reins et des jambes : ce sont les pathologies des leçons suivantes.</p>'
    ),
    updated_at = now()
  WHERE id = '14410a7c-867a-4192-baff-b0139222df74';

  INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible, niveau_min, niveau_max)
  SELECT id_pa, 160, 'texte', 'Conclusion',
    jsonb_build_object(
      'seed_key', 'reorg-pa-raa-hta:pa:conclusion',
      'html', '<p>La pression artérielle dépend du débit cardiaque, de la volémie et des résistances des vaisseaux, et plusieurs systèmes la régulent en permanence.</p><p>Quand elle baisse, le rein sécrète de la rénine. La leçon suivante suit cette cascade : le système rénine-angiotensine-aldostérone.</p>'
    ),
    true, 1, 5
  WHERE NOT EXISTS (
    SELECT 1 FROM jeupharma.module_blocs
    WHERE payload_json->>'seed_key' = 'reorg-pa-raa-hta:pa:conclusion'
  );

  INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible, niveau_min, niveau_max)
  SELECT id_raa, 140, 'texte', 'Conclusion',
    jsonb_build_object(
      'seed_key', 'reorg-pa-raa-hta:raa:conclusion',
      'html', '<p>Le système rénine-angiotensine-aldostérone ramène la pression vers le haut, par vasoconstriction et par rétention d’eau et de sel.</p><p>Lorsque cette pression reste trop élevée dans la durée, les vaisseaux et les organes sont exposés : la leçon suivante décrit la pathologie de l’hypertension artérielle.</p>'
    ),
    true, 1, 5
  WHERE NOT EXISTS (
    SELECT 1 FROM jeupharma.module_blocs
    WHERE payload_json->>'seed_key' = 'reorg-pa-raa-hta:raa:conclusion'
  );

  INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible, niveau_min, niveau_max)
  SELECT id_raa, 150, 'section', 'Test de connaissance',
    jsonb_build_object('seed_key', 'reorg-pa-raa-hta:raa:test-sec'),
    true, 1, 5
  WHERE NOT EXISTS (
    SELECT 1 FROM jeupharma.module_blocs
    WHERE payload_json->>'seed_key' = 'reorg-pa-raa-hta:raa:test-sec'
  );

  INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible, niveau_min, niveau_max)
  SELECT id_hta, 170, 'section', 'Test de connaissance',
    jsonb_build_object('seed_key', 'reorg-pa-raa-hta:hta:test-sec'),
    true, 1, 5
  WHERE NOT EXISTS (
    SELECT 1 FROM jeupharma.module_blocs
    WHERE payload_json->>'seed_key' = 'reorg-pa-raa-hta:hta:test-sec'
  );

  INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible, niveau_min, niveau_max)
  SELECT id_hta, 180, 'texte', 'QCM — Seuil d’hypertension',
    jsonb_build_object(
      'seed_key', 'reorg-pa-raa-hta:hta:qcm-seuil',
      'html', '<p>QCM</p><p>Au repos, une personne est hypertendue si sa pression artérielle systolique est supérieure ou égale à 140 mm Hg et/ou sa pression diastolique supérieure ou égale à 90 mm Hg.</p><ul><li>Vrai</li><li>Faux</li></ul>'
    ),
    true, 1, 5
  WHERE NOT EXISTS (
    SELECT 1 FROM jeupharma.module_blocs
    WHERE payload_json->>'seed_key' = 'reorg-pa-raa-hta:hta:qcm-seuil'
  );

  INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible, niveau_min, niveau_max)
  SELECT id_hta, 190, 'texte', 'QCM — Hypertension essentielle',
    jsonb_build_object(
      'seed_key', 'reorg-pa-raa-hta:hta:qcm-essentielle',
      'html', '<p>QCM</p><p>L’hypertension artérielle essentielle, ou primaire, est :</p><ul><li>multifactorielle, sans cause précise</li><li>due à une affection des glandes surrénales</li><li>due à la grossesse</li><li>due à la prise d’un médicament vasoconstricteur</li></ul>'
    ),
    true, 1, 5
  WHERE NOT EXISTS (
    SELECT 1 FROM jeupharma.module_blocs
    WHERE payload_json->>'seed_key' = 'reorg-pa-raa-hta:hta:qcm-essentielle'
  );

  INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible, niveau_min, niveau_max)
  SELECT id_hta, 200, 'texte', 'QCM — HTA et risque cardiovasculaire',
    jsonb_build_object(
      'seed_key', 'reorg-pa-raa-hta:hta:qcm-risque',
      'html', '<p>QCM</p><p>Une hypertension non traitée favorise l’athérosclérose et augmente le risque d’accident vasculaire cérébral, d’insuffisance cardiaque, d’angor et d’artérite des membres inférieurs.</p><ul><li>Vrai</li><li>Faux</li></ul>'
    ),
    true, 1, 5
  WHERE NOT EXISTS (
    SELECT 1 FROM jeupharma.module_blocs
    WHERE payload_json->>'seed_key' = 'reorg-pa-raa-hta:hta:qcm-risque'
  );
END;
$$;
