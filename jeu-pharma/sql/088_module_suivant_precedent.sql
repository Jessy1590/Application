-- 088 : bouton « Leçon suivante » peut viser la leçon précédente (ordre officiel)
-- Appliqué remote : module_suivant_precedent + upsert + progression.

ALTER TABLE jeupharma.modules_cours
  ADD COLUMN IF NOT EXISTS module_suivant_precedent boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN jeupharma.modules_cours.module_suivant_precedent IS
  'Si true, le bouton « Leçon suivante » pointe vers la feuille précédente dans l’ordre officiel (ignore module_suivant_id).';
