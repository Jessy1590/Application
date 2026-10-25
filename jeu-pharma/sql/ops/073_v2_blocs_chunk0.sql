
DELETE FROM jeupharma.module_blocs b
USING jeupharma.modules_cours m, jeupharma.parcours_apprentissage p
WHERE b.module_id = m.id AND m.parcours_id = p.id AND p.code = 'cardiovasculaires_v2';


INSERT INTO jeupharma.module_blocs (
  module_id, ordre, type_bloc, titre, payload_json, visible, niveau_min, niveau_max
)
SELECT
  dst.id,
  b.ordre,
  b.type_bloc,
  b.titre,
  COALESCE(b.payload_json, '{}'::jsonb)
    || jsonb_build_object('seed_key', '073:v2:v2_sang_composition:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_sang_composition'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'rappel_sang'
  AND b.ordre BETWEEN 10 AND 150
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
    || jsonb_build_object('seed_key', '073:v2:v2_sang_hemostase:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_sang_hemostase'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'pathologie_plaquettes'
  AND b.ordre BETWEEN 10 AND 90
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
    || jsonb_build_object('seed_key', '073:v2:v2_sang_anemies:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_sang_anemies'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'pathologie_du_globule_rouge'
  AND b.ordre BETWEEN 10 AND 100
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
    || jsonb_build_object('seed_key', '073:v2:v2_sang_anemies:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_sang_anemies'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'pathologie_du_globule_rouge'
  AND b.ordre BETWEEN 160 AND 190
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
    || jsonb_build_object('seed_key', '073:v2:v2_sang_anemies:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_sang_anemies'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'pathologie_du_globule_rouge'
  AND b.ordre BETWEEN 220 AND 380
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
    || jsonb_build_object('seed_key', '073:v2:v2_sang_thromboses:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_sang_thromboses'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'pathologie_plaquettes'
  AND b.ordre BETWEEN 100 AND 170
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
    || jsonb_build_object('seed_key', '073:v2:v2_sang_hemophilies:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_sang_hemophilies'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'pathologie_plaquettes'
  AND b.ordre BETWEEN 180 AND 230
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
    || jsonb_build_object('seed_key', '073:v2:v2_sang_globule_blanc:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_sang_globule_blanc'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'pathologie_du_globule_blanc'
  AND b.ordre BETWEEN 10 AND 999
  AND NOT (b.type_bloc = ANY (ARRAY['jeu','molecule']::text[]));


INSERT INTO jeupharma.module_blocs (
  module_id, ordre, type_bloc, titre, payload_json, visible, niveau_min, niveau_max
)
SELECT
  dst.id,
  b.ordre,
  b.type_bloc,
  b.titre,
  COALESCE(b.payload_json, '{}'::jsonb)
    || jsonb_build_object('seed_key', '073:v2:v2_med_anemies:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_med_anemies'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'pathologie_du_globule_rouge'
  AND b.ordre BETWEEN 110 AND 150
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
    || jsonb_build_object('seed_key', '073:v2:v2_med_anemies:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_med_anemies'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'pathologie_du_globule_rouge'
  AND b.ordre BETWEEN 210 AND 210
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
    || jsonb_build_object('seed_key', '073:v2:v2_med_anemies:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_med_anemies'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'pathologie_du_globule_rouge'
  AND b.ordre BETWEEN 250 AND 250
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
    || jsonb_build_object('seed_key', '073:v2:v2_med_antiagregants:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_med_antiagregants'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'm_dicaments_du_gr'
  AND b.ordre BETWEEN 10 AND 90
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
    || jsonb_build_object('seed_key', '073:v2:v2_med_heparines:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_med_heparines'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'm_dicaments_du_gr'
  AND b.ordre BETWEEN 100 AND 190
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
    || jsonb_build_object('seed_key', '073:v2:v2_med_aod:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_med_aod'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'm_dicaments_du_gr'
  AND b.ordre BETWEEN 210 AND 300
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
    || jsonb_build_object('seed_key', '073:v2:v2_med_avk:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_med_avk'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'm_dicaments_du_gr'
  AND b.ordre BETWEEN 310 AND 410
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
    || jsonb_build_object('seed_key', '073:v2:v2_med_hemostatiques:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_med_hemostatiques'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'pathologie_plaquettes'
  AND b.ordre BETWEEN 240 AND 250
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
    || jsonb_build_object('seed_key', '073:v2:v2_cv_atherome:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_cv_atherome'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'cv_definitions'
  AND b.ordre BETWEEN 10 AND 999
  AND NOT (b.type_bloc = ANY (ARRAY['jeu','molecule']::text[]));


INSERT INTO jeupharma.module_blocs (
  module_id, ordre, type_bloc, titre, payload_json, visible, niveau_min, niveau_max
)
SELECT
  dst.id,
  b.ordre,
  b.type_bloc,
  b.titre,
  COALESCE(b.payload_json, '{}'::jsonb)
    || jsonb_build_object('seed_key', '073:v2:v2_cv_angor:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_cv_angor'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'cv_angor'
  AND b.ordre BETWEEN 10 AND 70
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
    || jsonb_build_object('seed_key', '073:v2:v2_cv_idm:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_cv_idm'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'cv_idm'
  AND b.ordre BETWEEN 10 AND 120
  AND NOT (b.type_bloc = ANY (ARRAY['jeu','molecule','recommandation']::text[]));
