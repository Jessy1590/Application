-- =============================================================================
-- 029 : Bloc « photo » (image) pour les leçons + bucket privé Storage
--  - module_blocs.type_bloc accepte 'photo'
--  - payload_json : { path?, url?, alt?, legende? }  (path = objet du bucket, url = lien externe)
--  - bucket privé `jeupharma-lecons` : écriture admin portail, lecture joueurs Jeu Pharma (URL signées)
-- =============================================================================

ALTER TABLE jeupharma.module_blocs
  DROP CONSTRAINT IF EXISTS module_blocs_type_bloc_check;

ALTER TABLE jeupharma.module_blocs
  ADD CONSTRAINT module_blocs_type_bloc_check
  CHECK (type_bloc = ANY (ARRAY[
    'texte'::text, 'video'::text, 'photo'::text, 'molecule'::text, 'conseil'::text, 'jeu'::text
  ]));

-- Bucket privé (images uniquement, 5 Mo)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'jeupharma-lecons', 'jeupharma-lecons', false, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS jeupharma_lecons_select ON storage.objects;
CREATE POLICY jeupharma_lecons_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'jeupharma-lecons'
    AND (jeupharma.has_jeupharma_access() OR jeupharma.is_portail_admin())
  );

DROP POLICY IF EXISTS jeupharma_lecons_insert ON storage.objects;
CREATE POLICY jeupharma_lecons_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'jeupharma-lecons' AND jeupharma.is_portail_admin());

DROP POLICY IF EXISTS jeupharma_lecons_update ON storage.objects;
CREATE POLICY jeupharma_lecons_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'jeupharma-lecons' AND jeupharma.is_portail_admin())
  WITH CHECK (bucket_id = 'jeupharma-lecons' AND jeupharma.is_portail_admin());

DROP POLICY IF EXISTS jeupharma_lecons_delete ON storage.objects;
CREATE POLICY jeupharma_lecons_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'jeupharma-lecons' AND jeupharma.is_portail_admin());

-- RPC inchangées : v2_upsert_bloc / v2_lecon_joueur / v2_lister_blocs renvoient type_bloc + payload_json génériques.
