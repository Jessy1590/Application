-- Ops lecture seule — baseline V1 vs V2 (ne pas appliquer comme migration).
-- Projet : kpjflntnotftpzffjbud — capturé 2026-10-11.

-- Volumes V1 attendus (référence) :
-- matrice_publie=161, archive=60, hospitalier=10, complexe=0
-- quizz=2, parties_trous=4, niveau_champs=81, niveau_secteurs=47

SELECT 'matrice_publie' AS metric, count(*)::bigint AS value
FROM jeupharma.matrice_medicaments WHERE statut = 'publie'
UNION ALL
SELECT 'matrice_archive', count(*) FROM jeupharma.matrice_medicaments WHERE statut = 'archive'
UNION ALL
SELECT 'hospitalier', count(*) FROM jeupharma.matrice_medicaments WHERE hospitalier AND statut = 'publie'
UNION ALL
SELECT 'complexe', count(*) FROM jeupharma.matrice_medicaments WHERE complexe AND statut = 'publie'
UNION ALL
SELECT 'quizz', count(*) FROM jeupharma.quizz
UNION ALL
SELECT 'parties_trous', count(*) FROM jeupharma.parties_tableau_trous
UNION ALL
SELECT 'connaissances_v2', count(*) FROM jeupharma.connaissances
UNION ALL
SELECT 'publications_v2', count(*) FROM jeupharma.publications_connaissances
UNION ALL
SELECT 'parcours_v2', count(*) FROM jeupharma.parcours_apprentissage
UNION ALL
SELECT 'modules_v2', count(*) FROM jeupharma.modules_cours
ORDER BY 1;

-- Droits vue catalogue (doit être authenticated uniquement, pas anon)
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'jeupharma'
  AND table_name = 'v_medicaments_complet'
ORDER BY 1, 2;

-- Snapshots quiz référencant des matrices archivées
SELECT q.code_unique, q.titre, q.actif,
       count(*) FILTER (WHERE m.statut = 'archive') AS nb_archive
FROM jeupharma.quizz q
CROSS JOIN LATERAL jsonb_array_elements(coalesce(q.snapshot_questions, '[]'::jsonb)) elem
LEFT JOIN jeupharma.matrice_medicaments m
  ON m.id = (elem->>'matrice_id')::uuid
GROUP BY q.id
HAVING count(*) FILTER (WHERE m.statut = 'archive') > 0;
