-- =============================================================================
-- 038 : Bloc « recommandation » pour les leçons
--  - module_blocs.type_bloc accepte 'recommandation'
--  - payload_json : {
--      corps_html?,
--      lien_bloc_id?,      -- ancre vers un autre bloc de la même leçon (#jp-bloc-<id>)
--      lien_module_id?,    -- leçon cible → lecon.html?module=…
--      lien_parcours_id?,  -- parcours (facultatif, sinon parcours courant)
--      lien_href?,         -- lien relatif in-app ou https
--      lien_label?         -- libellé du lien
--    }
--  - RPC v2_* inchangées (génériques)
-- =============================================================================

ALTER TABLE jeupharma.module_blocs
  DROP CONSTRAINT IF EXISTS module_blocs_type_bloc_check;

ALTER TABLE jeupharma.module_blocs
  ADD CONSTRAINT module_blocs_type_bloc_check
  CHECK (type_bloc = ANY (ARRAY[
    'texte'::text, 'video'::text, 'photo'::text, 'molecule'::text,
    'conseil'::text, 'jeu'::text, 'recommandation'::text
  ]));
