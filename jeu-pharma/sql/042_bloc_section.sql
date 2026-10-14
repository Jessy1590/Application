-- =============================================================================
-- 042 : Bloc « section » — séparateur / titre de groupe dans une leçon
-- =============================================================================

ALTER TABLE jeupharma.module_blocs
  DROP CONSTRAINT IF EXISTS module_blocs_type_bloc_check;

ALTER TABLE jeupharma.module_blocs
  ADD CONSTRAINT module_blocs_type_bloc_check
  CHECK (type_bloc = ANY (ARRAY[
    'texte'::text, 'video'::text, 'photo'::text, 'molecule'::text,
    'conseil'::text, 'jeu'::text, 'recommandation'::text, 'section'::text
  ]));
