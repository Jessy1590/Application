-- =============================================================================
-- 025 : RPC admin — créer parcours/module + publier molécules/champs ciblés
-- =============================================================================

CREATE OR REPLACE FUNCTION jeupharma.v2_publier_module_matrices(
  p_module_id uuid,
  p_matrice_ids uuid[],
  p_champ_codes text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  n int;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF p_module_id IS NULL OR p_matrice_ids IS NULL OR cardinality(p_matrice_ids) = 0 THEN
    RAISE EXCEPTION 'module et molécules requis';
  END IF;

  INSERT INTO jeupharma.publications_connaissances (module_id, connaissance_id, ordre, publie_par)
  SELECT p_module_id, c.id, c.ordre, auth.uid()
  FROM jeupharma.connaissances c
  WHERE c.statut = 'valide'
    AND c.matrice_id = ANY (p_matrice_ids)
    AND (p_champ_codes IS NULL OR cardinality(p_champ_codes) = 0 OR c.champ_code = ANY (p_champ_codes))
  ON CONFLICT (module_id, connaissance_id) DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE jeupharma.modules_cours
  SET publie = true, version_publication = version_publication + 1, updated_at = now()
  WHERE id = p_module_id;

  RETURN jsonb_build_object(
    'module_id', p_module_id,
    'inserted', n,
    'matrices', cardinality(p_matrice_ids),
    'champs', COALESCE(p_champ_codes, ARRAY[]::text[])
  );
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_creer_parcours(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  row jeupharma.parcours_apprentissage%ROWTYPE;
  v_code text;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  v_code := lower(trim(both FROM regexp_replace(
    coalesce(p_payload->>'code', p_payload->>'libelle'),
    '[^a-zA-Z0-9]+', '_', 'g'
  )));
  v_code := trim(both '_' FROM v_code);
  IF v_code = '' THEN RAISE EXCEPTION 'code invalide'; END IF;

  INSERT INTO jeupharma.parcours_apprentissage (
    code, libelle, description, niveau_lie, mode_contenu, ordre, actif, created_by
  ) VALUES (
    v_code,
    trim(p_payload->>'libelle'),
    coalesce(p_payload->>'description', ''),
    nullif(p_payload->>'niveau_lie', ''),
    coalesce(nullif(p_payload->>'mode_contenu', ''), 'publications'),
    coalesce((p_payload->>'ordre')::int, 50),
    coalesce((p_payload->>'actif')::boolean, true),
    auth.uid()
  )
  RETURNING * INTO row;

  RETURN to_jsonb(row);
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_creer_module(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  row jeupharma.modules_cours%ROWTYPE;
  v_code text;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  v_code := lower(trim(both FROM regexp_replace(
    coalesce(p_payload->>'code', p_payload->>'titre'),
    '[^a-zA-Z0-9]+', '_', 'g'
  )));
  v_code := trim(both '_' FROM v_code);

  INSERT INTO jeupharma.modules_cours (
    parcours_id, parent_id, code, titre, resume, objectifs, ordre,
    publie, est_groupe, prerequis_module_id, created_by, version_publication
  ) VALUES (
    (p_payload->>'parcours_id')::uuid,
    nullif(p_payload->>'parent_id', '')::uuid,
    v_code,
    trim(p_payload->>'titre'),
    coalesce(p_payload->>'resume', ''),
    coalesce(p_payload->>'objectifs', ''),
    coalesce((p_payload->>'ordre')::int, 100),
    coalesce((p_payload->>'publie')::boolean, true),
    coalesce((p_payload->>'est_groupe')::boolean, false),
    nullif(p_payload->>'prerequis_module_id', '')::uuid,
    auth.uid(),
    1
  )
  RETURNING * INTO row;

  RETURN to_jsonb(row);
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_publier_module_matrices(uuid, uuid[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_creer_parcours(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_creer_module(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_publier_module_matrices(uuid, uuid[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_creer_parcours(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_creer_module(jsonb) TO authenticated;
