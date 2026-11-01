-- 093 : passage d’examen (plusieurs jeux, une note, reprises).
-- Chaque reprise est une ligne. Une ligne close n’est plus modifiable.
-- Les tentatives de jeu restent dans tentatives_jeu (snapshot_json.passage_id).

CREATE TABLE IF NOT EXISTS jeupharma.passages_examen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES portail.profiles(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES jeupharma.modules_cours(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  termine_at timestamptz,
  score_obtenu numeric,
  score_max numeric,
  note_pct numeric,
  detail jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS passages_examen_user_module_idx
  ON jeupharma.passages_examen (user_id, module_id, started_at DESC);

COMMENT ON TABLE jeupharma.passages_examen IS
  'Un passage d’examen = une suite de jeux et la note moyenne. Reprises = nouvelles lignes.';

ALTER TABLE jeupharma.passages_examen ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON jeupharma.passages_examen TO authenticated;
GRANT ALL ON jeupharma.passages_examen TO service_role;

DROP POLICY IF EXISTS passages_examen_select ON jeupharma.passages_examen;
CREATE POLICY passages_examen_select ON jeupharma.passages_examen
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR jeupharma.is_portail_admin());

DROP POLICY IF EXISTS passages_examen_insert ON jeupharma.passages_examen;
CREATE POLICY passages_examen_insert ON jeupharma.passages_examen
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS passages_examen_update ON jeupharma.passages_examen;
CREATE POLICY passages_examen_update ON jeupharma.passages_examen
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND termine_at IS NULL)
  WITH CHECK (user_id = auth.uid());
