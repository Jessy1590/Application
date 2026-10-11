-- 022 : pause pédagogique quiz V1 (distinct de actif=false).
-- Appliqué remote via MCP jeupharma_022_quiz_en_pause.

ALTER TABLE jeupharma.quizz
  ADD COLUMN IF NOT EXISTS en_pause boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS quizz_en_pause_idx
  ON jeupharma.quizz (en_pause) WHERE actif;

COMMENT ON COLUMN jeupharma.quizz.en_pause IS
  'Pause pédagogique (distinct de actif=false archivage).';
