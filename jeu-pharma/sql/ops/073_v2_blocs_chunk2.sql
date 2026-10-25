
INSERT INTO jeupharma.module_blocs (
  module_id, ordre, type_bloc, titre, payload_json, visible, niveau_min, niveau_max
)
SELECT
  dst.id,
  b.ordre,
  b.type_bloc,
  b.titre,
  COALESCE(b.payload_json, '{}'::jsonb)
    || jsonb_build_object('seed_key', '073:v2:v2_med_digitaliques:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_med_digitaliques'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'cv_ic'
  AND b.ordre BETWEEN 210 AND 250
  AND NOT (b.type_bloc = ANY (ARRAY['jeu','molecule','recommandation']::text[]));


INSERT INTO jeupharma.module_blocs (
  module_id, ordre, type_bloc, titre, payload_json, visible, niveau_min, niveau_max
)
SELECT
  dst.id,
  b.ordre,
  b.type_bloc,
  b.titre,
  COALESCE(b.payload_json, '{}'::jsonb)
    || jsonb_build_object('seed_key', '073:v2:v2_med_autres_ic:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_med_autres_ic'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'cv_ic'
  AND b.ordre BETWEEN 260 AND 280
  AND NOT (b.type_bloc = ANY (ARRAY['jeu','molecule','recommandation']::text[]));


INSERT INTO jeupharma.module_blocs (
  module_id, ordre, type_bloc, titre, payload_json, visible, niveau_min, niveau_max
)
SELECT
  dst.id,
  b.ordre,
  b.type_bloc,
  b.titre,
  COALESCE(b.payload_json, '{}'::jsonb)
    || jsonb_build_object('seed_key', '073:v2:v2_med_arterite:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_med_arterite'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'cv_arterite'
  AND b.ordre BETWEEN 50 AND 60
  AND NOT (b.type_bloc = ANY (ARRAY['jeu','molecule','recommandation']::text[]));


INSERT INTO jeupharma.module_blocs (
  module_id, ordre, type_bloc, titre, payload_json, visible, niveau_min, niveau_max
)
SELECT
  dst.id,
  b.ordre,
  b.type_bloc,
  b.titre,
  COALESCE(b.payload_json, '{}'::jsonb)
    || jsonb_build_object('seed_key', '073:v2:v2_med_veines:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_med_veines'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'cv_veines'
  AND b.ordre BETWEEN 220 AND 260
  AND NOT (b.type_bloc = ANY (ARRAY['jeu','molecule','recommandation']::text[]));


INSERT INTO jeupharma.module_blocs (
  module_id, ordre, type_bloc, titre, payload_json, visible, niveau_min, niveau_max
)
SELECT
  dst.id,
  b.ordre,
  b.type_bloc,
  b.titre,
  COALESCE(b.payload_json, '{}'::jsonb)
    || jsonb_build_object('seed_key', '073:v2:v2_med_hemorroides:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_med_hemorroides'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'cv_veines'
  AND b.ordre BETWEEN 330 AND 330
  AND NOT (b.type_bloc = ANY (ARRAY['jeu','molecule','recommandation']::text[]));


INSERT INTO jeupharma.module_blocs (
  module_id, ordre, type_bloc, titre, payload_json, visible, niveau_min, niveau_max
)
SELECT
  dst.id,
  b.ordre,
  b.type_bloc,
  b.titre,
  COALESCE(b.payload_json, '{}'::jsonb)
    || jsonb_build_object('seed_key', '073:v2:v2_med_urgences:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_med_urgences'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'cv_urgences'
  AND b.ordre BETWEEN 60 AND 80
  AND NOT (b.type_bloc = ANY (ARRAY['jeu','molecule','recommandation']::text[]));


INSERT INTO jeupharma.module_blocs (
  module_id, ordre, type_bloc, titre, payload_json, visible, niveau_min, niveau_max
)
SELECT
  dst.id,
  b.ordre,
  b.type_bloc,
  b.titre,
  COALESCE(b.payload_json, '{}'::jsonb)
    || jsonb_build_object('seed_key', '073:v2:v2_med_hta_classes:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_med_hta_classes'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'hta_classes'
  AND b.ordre BETWEEN 10 AND 890
  AND NOT (b.type_bloc = ANY (ARRAY['jeu','molecule','recommandation']::text[]));


INSERT INTO jeupharma.module_blocs (
  module_id, ordre, type_bloc, titre, payload_json, visible, niveau_min, niveau_max
)
SELECT
  dst.id,
  b.ordre,
  b.type_bloc,
  b.titre,
  COALESCE(b.payload_json, '{}'::jsonb)
    || jsonb_build_object('seed_key', '073:v2:v2_med_hta_assoc:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_med_hta_assoc'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'hta_associations'
  AND b.ordre BETWEEN 10 AND 890
  AND NOT (b.type_bloc = ANY (ARRAY['jeu','molecule','recommandation']::text[]));


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 900, 'molecule', 'Molécules — anémies (à lier)',
  jsonb_build_object('mode','fiche','matrice_id','','matrice_ids','[]'::jsonb,'valeurs','{}'::jsonb,'seed_key','073:v2:mol:v2_med_anemies:900'),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_anemies';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 900, 'molecule', 'Molécules — antiagrégants (à lier)',
  jsonb_build_object('mode','fiche','matrice_id','','matrice_ids','[]'::jsonb,'valeurs','{}'::jsonb,'seed_key','073:v2:mol:v2_med_antiagregants:900'),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_antiagregants';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 900, 'molecule', 'Molécules — héparines (à lier)',
  jsonb_build_object('mode','fiche','matrice_id','','matrice_ids','[]'::jsonb,'valeurs','{}'::jsonb,'seed_key','073:v2:mol:v2_med_heparines:900'),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_heparines';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 900, 'molecule', 'Molécules — AOD (à lier)',
  jsonb_build_object('mode','fiche','matrice_id','','matrice_ids','[]'::jsonb,'valeurs','{}'::jsonb,'seed_key','073:v2:mol:v2_med_aod:900'),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_aod';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 900, 'molecule', 'Molécules — AVK (à lier)',
  jsonb_build_object('mode','fiche','matrice_id','','matrice_ids','[]'::jsonb,'valeurs','{}'::jsonb,'seed_key','073:v2:mol:v2_med_avk:900'),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_avk';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 900, 'molecule', 'Molécules — hémostatiques (à lier)',
  jsonb_build_object('mode','fiche','matrice_id','','matrice_ids','[]'::jsonb,'valeurs','{}'::jsonb,'seed_key','073:v2:mol:v2_med_hemostatiques:900'),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_hemostatiques';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 900, 'molecule', 'Molécules — crise angor (à lier)',
  jsonb_build_object('mode','fiche','matrice_id','','matrice_ids','[]'::jsonb,'valeurs','{}'::jsonb,'seed_key','073:v2:mol:v2_med_crise_angor:900'),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_crise_angor';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 900, 'molecule', 'Molécules — dérivés nitrés (à lier)',
  jsonb_build_object('mode','fiche','matrice_id','','matrice_ids','[]'::jsonb,'valeurs','{}'::jsonb,'seed_key','073:v2:mol:v2_med_nitrates:900'),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_nitrates';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 900, 'molecule', 'Molécules — bêtabloquants (à lier)',
  jsonb_build_object('mode','fiche','matrice_id','','matrice_ids','[]'::jsonb,'valeurs','{}'::jsonb,'seed_key','073:v2:mol:v2_med_betabloquants:900'),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_betabloquants';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 900, 'molecule', 'Molécules — inhibiteurs calciques (à lier)',
  jsonb_build_object('mode','fiche','matrice_id','','matrice_ids','[]'::jsonb,'valeurs','{}'::jsonb,'seed_key','073:v2:mol:v2_med_inca:900'),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_inca';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 900, 'molecule', 'Molécules — autres anti-angoreux (à lier)',
  jsonb_build_object('mode','fiche','matrice_id','','matrice_ids','[]'::jsonb,'valeurs','{}'::jsonb,'seed_key','073:v2:mol:v2_med_autres_angoreux:900'),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_autres_angoreux';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 900, 'molecule', 'Molécules — antiarythmiques classe 1 (à lier)',
  jsonb_build_object('mode','fiche','matrice_id','','matrice_ids','[]'::jsonb,'valeurs','{}'::jsonb,'seed_key','073:v2:mol:v2_med_antiarythmiques_c1:900'),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_antiarythmiques_c1';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 900, 'molecule', 'Molécules — antiarythmiques classe 3 (à lier)',
  jsonb_build_object('mode','fiche','matrice_id','','matrice_ids','[]'::jsonb,'valeurs','{}'::jsonb,'seed_key','073:v2:mol:v2_med_antiarythmiques_c3:900'),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_antiarythmiques_c3';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 900, 'molecule', 'Molécules — IEC (à lier)',
  jsonb_build_object('mode','fiche','matrice_id','','matrice_ids','[]'::jsonb,'valeurs','{}'::jsonb,'seed_key','073:v2:mol:v2_med_iec:900'),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_iec';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 900, 'molecule', 'Molécules — ARA 2 (à lier)',
  jsonb_build_object('mode','fiche','matrice_id','','matrice_ids','[]'::jsonb,'valeurs','{}'::jsonb,'seed_key','073:v2:mol:v2_med_ara2:900'),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_ara2';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 900, 'molecule', 'Molécules — digitaliques (à lier)',
  jsonb_build_object('mode','fiche','matrice_id','','matrice_ids','[]'::jsonb,'valeurs','{}'::jsonb,'seed_key','073:v2:mol:v2_med_digitaliques:900'),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_digitaliques';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 900, 'molecule', 'Molécules — antihypertenseurs (à lier)',
  jsonb_build_object('mode','fiche','matrice_id','','matrice_ids','[]'::jsonb,'valeurs','{}'::jsonb,'seed_key','073:v2:mol:v2_med_hta_classes:900'),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_hta_classes';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 900, 'molecule', 'Molécules — associations (à lier)',
  jsonb_build_object('mode','fiche','matrice_id','','matrice_ids','[]'::jsonb,'valeurs','{}'::jsonb,'seed_key','073:v2:mol:v2_med_hta_assoc:900'),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_hta_assoc';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 500, 'recommandation', 'Médicaments utilisables dans les anémies',
  jsonb_build_object(
    'corps_html', '<p>Les traitements des anémies (fer, vitamines B9/B12, érythropoïétines) sont détaillés dans la leçon médicaments dédiée.</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'Médicaments des anémies',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_anemies' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '073:v2:reco:v2_sang_anemies:500'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_sang_anemies';
