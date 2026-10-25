
INSERT INTO jeupharma.module_blocs (
  module_id, ordre, type_bloc, titre, payload_json, visible, niveau_min, niveau_max
)
SELECT
  dst.id,
  b.ordre,
  b.type_bloc,
  b.titre,
  COALESCE(b.payload_json, '{}'::jsonb)
    || jsonb_build_object('seed_key', '073:v2:v2_cv_arythmies:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_cv_arythmies'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'cv_arythmies'
  AND b.ordre BETWEEN 10 AND 80
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
    || jsonb_build_object('seed_key', '073:v2:v2_cv_ic:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_cv_ic'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'cv_ic'
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
    || jsonb_build_object('seed_key', '073:v2:v2_cv_arterite:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_cv_arterite'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'cv_arterite'
  AND b.ordre BETWEEN 10 AND 40
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
    || jsonb_build_object('seed_key', '073:v2:v2_cv_veines:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_cv_veines'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'cv_veines'
  AND b.ordre BETWEEN 10 AND 210
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
    || jsonb_build_object('seed_key', '073:v2:v2_cv_hemorroides:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_cv_hemorroides'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'cv_veines'
  AND b.ordre BETWEEN 280 AND 320
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
    || jsonb_build_object('seed_key', '073:v2:v2_cv_oap:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_cv_oap'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'cv_urgences'
  AND b.ordre BETWEEN 10 AND 50
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
    || jsonb_build_object('seed_key', '073:v2:v2_hta_pa:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_hta_pa'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'hta_rappel_pa'
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
    || jsonb_build_object('seed_key', '073:v2:v2_hta_raa:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_hta_raa'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'hta_raa'
  AND b.ordre BETWEEN 10 AND 900
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
    || jsonb_build_object('seed_key', '073:v2:v2_hta_clinique:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_hta_clinique'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'hta_clinique'
  AND b.ordre BETWEEN 10 AND 900
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
    || jsonb_build_object('seed_key', '073:v2:v2_med_crise_angor:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_med_crise_angor'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'cv_angor'
  AND b.ordre BETWEEN 80 AND 130
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
    || jsonb_build_object('seed_key', '073:v2:v2_med_nitrates:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_med_nitrates'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'cv_angor'
  AND b.ordre BETWEEN 140 AND 190
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
    || jsonb_build_object('seed_key', '073:v2:v2_med_betabloquants:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_med_betabloquants'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'cv_angor'
  AND b.ordre BETWEEN 200 AND 300
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
    || jsonb_build_object('seed_key', '073:v2:v2_med_inca:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_med_inca'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'cv_angor'
  AND b.ordre BETWEEN 320 AND 370
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
    || jsonb_build_object('seed_key', '073:v2:v2_med_autres_angoreux:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_med_autres_angoreux'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'cv_angor'
  AND b.ordre BETWEEN 390 AND 420
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
    || jsonb_build_object('seed_key', '073:v2:v2_med_post_idm:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_med_post_idm'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'cv_idm'
  AND b.ordre BETWEEN 130 AND 200
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
    || jsonb_build_object('seed_key', '073:v2:v2_med_antiarythmiques_c1:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_med_antiarythmiques_c1'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'cv_arythmies'
  AND b.ordre BETWEEN 90 AND 140
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
    || jsonb_build_object('seed_key', '073:v2:v2_med_antiarythmiques_c3:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_med_antiarythmiques_c3'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'cv_arythmies'
  AND b.ordre BETWEEN 190 AND 220
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
    || jsonb_build_object('seed_key', '073:v2:v2_med_iec:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_med_iec'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'cv_ic'
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
    || jsonb_build_object('seed_key', '073:v2:v2_med_ara2:' || b.ordre || ':' || b.type_bloc),
  COALESCE(b.visible, true),
  COALESCE(b.niveau_min, 1),
  COALESCE(b.niveau_max, 5)
FROM jeupharma.module_blocs b
JOIN jeupharma.modules_cours src ON src.id = b.module_id
JOIN jeupharma.parcours_apprentissage pv1 ON pv1.id = src.parcours_id AND pv1.code = 'cardiovasculaires_deust_2a'
JOIN jeupharma.modules_cours dst ON dst.code = 'v2_med_ara2'
JOIN jeupharma.parcours_apprentissage pv2 ON pv2.id = dst.parcours_id AND pv2.code = 'cardiovasculaires_v2'
WHERE src.code = 'cv_ic'
  AND b.ordre BETWEEN 160 AND 200
  AND NOT (b.type_bloc = ANY (ARRAY['jeu','molecule','recommandation']::text[]));
