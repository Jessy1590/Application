-- Journal d’appels séparé des notes initiales (équivalent anciennelocation.journal)
-- Appliqué via Supabase (projet kpjflntnotftpzffjbud) — migration location_dossiers_journal

ALTER TABLE phieevreux.location_dossiers
  ADD COLUMN IF NOT EXISTS journal text;

COMMENT ON COLUMN phieevreux.location_dossiers.journal IS
  'Historique suivi appels / mails (JJ/MM/AAAA — …) ; distinct de notes (création / fiche)';

COMMENT ON COLUMN phieevreux.location_dossiers.notes IS
  'Notes initiales du dossier (création / fiche) — sans journal d’appels';

-- Migrer les lignes journal déjà mélangées dans notes
UPDATE phieevreux.location_dossiers d
SET
  journal = NULLIF(trim(both E'\n' FROM coalesce(
    (
      SELECT string_agg(line, E'\n' ORDER BY ord)
      FROM (
        SELECT trim(t.line) AS line, t.ord
        FROM unnest(string_to_array(coalesce(d.notes, ''), E'\n')) WITH ORDINALITY AS t(line, ord)
        WHERE trim(t.line) ~ '^\d{2}/\d{2}/\d{4}\s*[—\-–]'
      ) j
    ),
    ''
  )), ''),
  notes = NULLIF(trim(both E'\n' FROM coalesce(
    (
      SELECT string_agg(line, E'\n' ORDER BY ord)
      FROM (
        SELECT trim(t.line) AS line, t.ord
        FROM unnest(string_to_array(coalesce(d.notes, ''), E'\n')) WITH ORDINALITY AS t(line, ord)
        WHERE trim(t.line) <> ''
          AND trim(t.line) !~ '^\d{2}/\d{2}/\d{4}\s*[—\-–]'
      ) n
    ),
    ''
  )), '')
WHERE d.notes IS NOT NULL
  AND d.notes ~ '\d{2}/\d{2}/\d{4}\s*[—\-–]';
