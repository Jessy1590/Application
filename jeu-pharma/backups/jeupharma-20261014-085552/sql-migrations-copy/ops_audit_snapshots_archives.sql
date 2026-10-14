-- Ops (lecture seule) : quiz / trous dont le snapshot référence des matrices archivées.
-- Exécuter via MCP execute_sql ou SQL Editor. Pas une migration DDL.
-- Projet : kpjflntnotftpzffjbud / schéma jeupharma.
-- L’UI admin Historique (JpSnapshotsAudit) expose le même contrôle + régénération quiz.

-- Quiz touchés
SELECT
  q.id,
  q.code_unique,
  q.titre,
  q.actif,
  q.niveau_cible,
  count(DISTINCT m.id) AS nb_matrices_archivees
FROM jeupharma.quizz q
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(q.snapshot_questions, '[]'::jsonb)) elem
JOIN jeupharma.matrice_medicaments m
  ON m.id = NULLIF(elem->>'matrice_id', '')::uuid
 AND m.statut = 'archive'
GROUP BY q.id, q.code_unique, q.titre, q.actif, q.niveau_cible
ORDER BY q.created_at DESC;

-- Parties tableau à trous touchées
SELECT
  p.id,
  p.code_unique,
  p.titre,
  p.actif,
  p.niveau_cible,
  count(DISTINCT m.id) AS nb_matrices_archivees
FROM jeupharma.parties_tableau_trous p
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.snapshot_grille->'lignes', '[]'::jsonb)) ligne
JOIN jeupharma.matrice_medicaments m
  ON m.id = NULLIF(ligne->>'matrice_id', '')::uuid
 AND m.statut = 'archive'
GROUP BY p.id, p.code_unique, p.titre, p.actif, p.niveau_cible
ORDER BY p.created_at DESC;
