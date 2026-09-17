-- Retirer des notes initiales les lignes auto-ajoutées à la clôture ([Clôture AAAA-MM-JJ] …)
-- Non appliqué tant que non exécuté sur le projet Supabase

UPDATE phieevreux.location_dossiers d
SET
  notes = NULLIF(trim(both E'\n' FROM coalesce(
    (
      SELECT string_agg(line, E'\n' ORDER BY ord)
      FROM (
        SELECT trim(t.line) AS line, t.ord
        FROM unnest(string_to_array(coalesce(d.notes, ''), E'\n')) WITH ORDINALITY AS t(line, ord)
        WHERE trim(t.line) <> ''
          AND trim(t.line) !~ '^\[Clôture '
      ) n
    ),
    ''
  )), '')
WHERE d.notes IS NOT NULL
  AND d.notes ~ '\[Clôture ';
