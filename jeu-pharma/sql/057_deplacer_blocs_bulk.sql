-- =============================================================================
-- 057 — Déplacement bulk de blocs entre leçons (même parcours)
-- =============================================================================
-- RPC v2_deplacer_blocs : déplace plusieurs blocs dans l’ordre donné, réordonne
-- la leçon cible, re-sync pubs molécule (sources + cible) comme v2_deplacer_bloc.
-- =============================================================================

CREATE OR REPLACE FUNCTION jeupharma.v2_deplacer_blocs(
  p_bloc_ids uuid[],
  p_module_cible_id uuid,
  p_avant_bloc_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  dst_parcours uuid;
  ordered_ids uuid[] := ARRAY[]::uuid[];
  seen uuid[] := ARRAY[]::uuid[];
  bid uuid;
  b jeupharma.module_blocs%ROWTYPE;
  src_parcours uuid;
  src_modules uuid[] := ARRAY[]::uuid[];
  src uuid;
  ids uuid[];
  new_ids uuid[] := ARRAY[]::uuid[];
  i int;
  inserted boolean := false;
  any_mol boolean := false;
  n_moved int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF p_module_cible_id IS NULL THEN
    RAISE EXCEPTION 'module cible requis';
  END IF;
  IF p_bloc_ids IS NULL OR coalesce(array_length(p_bloc_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'au moins un bloc requis';
  END IF;

  SELECT parcours_id INTO dst_parcours
  FROM jeupharma.modules_cours
  WHERE id = p_module_cible_id;
  IF dst_parcours IS NULL THEN
    RAISE EXCEPTION 'Leçon cible introuvable';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jeupharma.modules_cours m
    WHERE m.id = p_module_cible_id AND m.est_groupe
  ) THEN
    RAISE EXCEPTION 'Cible doit être une leçon';
  END IF;

  -- Dédupliquer en préservant l’ordre demandé
  FOREACH bid IN ARRAY p_bloc_ids LOOP
    IF bid IS NULL THEN
      CONTINUE;
    END IF;
    IF bid = ANY (seen) THEN
      CONTINUE;
    END IF;
    seen := array_append(seen, bid);
    ordered_ids := array_append(ordered_ids, bid);
  END LOOP;

  IF coalesce(array_length(ordered_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'au moins un bloc requis';
  END IF;

  FOREACH bid IN ARRAY ordered_ids LOOP
    SELECT * INTO b FROM jeupharma.module_blocs WHERE id = bid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Bloc introuvable';
    END IF;

    SELECT parcours_id INTO src_parcours
    FROM jeupharma.modules_cours
    WHERE id = b.module_id;
    IF src_parcours IS NULL OR src_parcours <> dst_parcours THEN
      RAISE EXCEPTION 'Leçon cible hors parcours';
    END IF;

    IF b.module_id IS DISTINCT FROM p_module_cible_id THEN
      IF NOT (b.module_id = ANY (src_modules)) THEN
        src_modules := array_append(src_modules, b.module_id);
      END IF;
      UPDATE jeupharma.module_blocs
      SET module_id = p_module_cible_id, updated_at = now()
      WHERE id = bid;
      n_moved := n_moved + 1;
    END IF;

    IF b.type_bloc = 'molecule' THEN
      any_mol := true;
    END IF;
  END LOOP;

  -- Réordonner la cible : blocs déjà présents (hors sélection) + sélection dans l’ordre
  SELECT array_agg(id ORDER BY ordre, created_at)
  INTO ids
  FROM jeupharma.module_blocs
  WHERE module_id = p_module_cible_id
    AND NOT (id = ANY (ordered_ids));

  ids := coalesce(ids, ARRAY[]::uuid[]);
  IF p_avant_bloc_id IS NOT NULL AND p_avant_bloc_id = ANY (ids) THEN
    FOR i IN 1 .. coalesce(array_length(ids, 1), 0) LOOP
      IF ids[i] = p_avant_bloc_id AND NOT inserted THEN
        new_ids := new_ids || ordered_ids;
        inserted := true;
      END IF;
      new_ids := array_append(new_ids, ids[i]);
    END LOOP;
    IF NOT inserted THEN
      new_ids := ids || ordered_ids;
    END IF;
  ELSE
    new_ids := ids || ordered_ids;
  END IF;

  PERFORM jeupharma.v2_reorder_blocs(p_module_cible_id, new_ids);

  IF any_mol THEN
    FOREACH src IN ARRAY src_modules LOOP
      PERFORM jeupharma.v2_sync_pubs_depuis_blocs_molecule(src);
    END LOOP;
    PERFORM jeupharma.v2_sync_pubs_depuis_blocs_molecule(p_module_cible_id);
  END IF;

  RETURN jsonb_build_object(
    'moved', n_moved,
    'bloc_ids', to_jsonb(ordered_ids),
    'module_cible_id', p_module_cible_id
  );
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_deplacer_blocs(uuid[], uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_deplacer_blocs(uuid[], uuid, uuid) TO authenticated;
