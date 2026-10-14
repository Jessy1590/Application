-- =============================================================================
-- 030 : Studio — suppression réelle d'un chapitre / d'une leçon (+ descendants)
--
-- `modules_cours` n'a pas de colonne `actif` : la suppression est donc physique.
-- Les FK déjà en place nettoient `module_blocs`, `publications_connaissances` et
-- `progression_modules` (ON DELETE CASCADE). Cette RPC gère en plus ce que les FK ne
-- couvrent pas :
--   * `parent_id` / `prerequis_module_id` (SET NULL) : les enfants sont supprimés avec le
--     chapitre ; les éléments extérieurs qui avaient un prérequis dans le sous-arbre sont
--     raccrochés au prérequis du module supprimé (la chaîne de déblocage n'est pas rompue) ;
--   * `modeles_jeu.module_ids` (uuid[], sans FK) : ids retirés du pool ; un jeu dont le pool
--     devient vide est ARCHIVÉ (`actif = false`, scores conservés) — un pool vide signifierait
--     « tout le parcours » ;
--   * `criteres_json` : entrées de jeux archivés retirées ; blocs « jeu » extérieurs pointant
--     vers un jeu archivé supprimés.
-- Les fichiers photo du bucket de blocs ne sont pas purgés.
-- Remplace l'ancienne `v2_supprimer_module` (simple dépublication, jamais appelée par le client).
-- Réordonnancement : `v2_reorder_modules` (027) suffit, aucune modification.
-- =============================================================================

CREATE OR REPLACE FUNCTION jeupharma.v2_supprimer_module(p_module_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  v_root jeupharma.modules_cours%ROWTYPE;
  v_ids uuid[];
  v_prereq uuid;
  v_arch uuid[] := '{}'::uuid[];
  v_arch_txt text[] := '{}'::text[];
  v_n_modules int := 0;
  v_n_blocs int := 0;
  v_n_jeux_maj int := 0;
  v_n_blocs_jeu int := 0;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;

  SELECT * INTO v_root FROM jeupharma.modules_cours WHERE id = p_module_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Module introuvable'; END IF;

  -- Sous-arbre (UNION : tolère un éventuel cycle parent_id)
  WITH RECURSIVE sub AS (
    SELECT id FROM jeupharma.modules_cours WHERE id = p_module_id
    UNION
    SELECT c.id FROM jeupharma.modules_cours c JOIN sub s ON c.parent_id = s.id
  )
  SELECT array_agg(id) INTO v_ids FROM sub;
  v_n_modules := cardinality(v_ids);

  SELECT count(*) INTO v_n_blocs FROM jeupharma.module_blocs WHERE module_id = ANY (v_ids);

  -- Prérequis : les éléments extérieurs héritent du prérequis du module supprimé
  v_prereq := v_root.prerequis_module_id;
  IF v_prereq IS NOT NULL AND v_prereq = ANY (v_ids) THEN v_prereq := NULL; END IF;
  UPDATE jeupharma.modules_cours
  SET prerequis_module_id = v_prereq, updated_at = now()
  WHERE prerequis_module_id = ANY (v_ids) AND NOT (id = ANY (v_ids));

  -- Jeux : retrait des modules supprimés du pool ; pool vide => archivage
  WITH touched AS (
    UPDATE jeupharma.modeles_jeu mj
    SET module_ids = ARRAY(SELECT x FROM unnest(mj.module_ids) AS x WHERE NOT (x = ANY (v_ids))),
        updated_at = now()
    WHERE mj.module_ids && v_ids
    RETURNING mj.id, mj.module_ids
  )
  SELECT count(*), coalesce(array_agg(id) FILTER (WHERE cardinality(module_ids) = 0), '{}'::uuid[])
  INTO v_n_jeux_maj, v_arch
  FROM touched;

  IF cardinality(v_arch) > 0 THEN
    v_arch_txt := ARRAY(SELECT x::text FROM unnest(v_arch) AS x);

    UPDATE jeupharma.modeles_jeu SET actif = false, updated_at = now() WHERE id = ANY (v_arch);

    -- Blocs « jeu » d'autres leçons pointant vers un jeu archivé : supprimés
    DELETE FROM jeupharma.module_blocs
    WHERE type_bloc = 'jeu'
      AND payload_json->>'modele_id' = ANY (v_arch_txt)
      AND NOT (module_id = ANY (v_ids));
    GET DIAGNOSTICS v_n_blocs_jeu = ROW_COUNT;

    -- Critères de déblocage : retrait des jeux archivés
    UPDATE jeupharma.modules_cours c
    SET criteres_json = jsonb_set(
      c.criteres_json, '{jeux}',
      coalesce((
        SELECT jsonb_agg(e)
        FROM jsonb_array_elements(c.criteres_json->'jeux') AS e
        WHERE NOT ((e->>'modele_id') = ANY (v_arch_txt))
      ), '[]'::jsonb)
    )
    WHERE jsonb_typeof(c.criteres_json->'jeux') = 'array'
      AND NOT (c.id = ANY (v_ids))
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(c.criteres_json->'jeux') AS e
        WHERE (e->>'modele_id') = ANY (v_arch_txt)
      );

    UPDATE jeupharma.parcours_apprentissage p
    SET criteres_json = jsonb_set(
      p.criteres_json, '{jeux}',
      coalesce((
        SELECT jsonb_agg(e)
        FROM jsonb_array_elements(p.criteres_json->'jeux') AS e
        WHERE NOT ((e->>'modele_id') = ANY (v_arch_txt))
      ), '[]'::jsonb)
    )
    WHERE jsonb_typeof(p.criteres_json->'jeux') = 'array'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(p.criteres_json->'jeux') AS e
        WHERE (e->>'modele_id') = ANY (v_arch_txt)
      );
  END IF;

  -- Suppression : blocs, publications, progression en cascade
  DELETE FROM jeupharma.modules_cours WHERE id = ANY (v_ids);

  RETURN jsonb_build_object(
    'id', p_module_id,
    'deleted', true,
    'modules', v_n_modules,
    'blocs', v_n_blocs,
    'jeux_modifies', v_n_jeux_maj,
    'jeux_archives', cardinality(v_arch),
    'blocs_jeu_retires', v_n_blocs_jeu
  );
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_supprimer_module(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_supprimer_module(uuid) TO authenticated;
