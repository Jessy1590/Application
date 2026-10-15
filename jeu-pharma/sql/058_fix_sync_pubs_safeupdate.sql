-- 058 : pg-safeupdate bloque DELETE FROM _jp_sync_pubs sans WHERE
-- → erreur PostgREST « DELETE requires a WHERE clause » à la publication / sync pubs.

CREATE OR REPLACE FUNCTION jeupharma.v2_sync_pubs_depuis_blocs_molecule(p_module_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  n_up int := 0;
  n_off int := 0;
BEGIN
  -- Migration SQL (auth.uid NULL) autorisée ; clients = admin portail uniquement
  IF auth.uid() IS NOT NULL AND NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF p_module_id IS NULL THEN
    RAISE EXCEPTION 'module requis';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _jp_sync_pubs (
    connaissance_id uuid PRIMARY KEY,
    niveau_min int NOT NULL
  ) ON COMMIT DROP;
  -- WHERE true : pg-safeupdate refuse DELETE sans clause
  DELETE FROM _jp_sync_pubs WHERE true;

  INSERT INTO _jp_sync_pubs (connaissance_id, niveau_min)
  SELECT x.connaissance_id, min(x.niveau_min)
  FROM jeupharma.module_blocs b
  CROSS JOIN LATERAL jeupharma.v2__pubs_depuis_payload_molecule(b.payload_json) x
  WHERE b.module_id = p_module_id
    AND b.type_bloc = 'molecule'
  GROUP BY x.connaissance_id;

  INSERT INTO jeupharma.publications_connaissances (
    module_id, connaissance_id, ordre, publie_par, actif, niveau_min, niveau_max
  )
  SELECT
    p_module_id,
    s.connaissance_id,
    coalesce(c.ordre, 100),
    auth.uid(),
    true,
    s.niveau_min,
    5
  FROM _jp_sync_pubs s
  JOIN jeupharma.connaissances c ON c.id = s.connaissance_id AND c.statut = 'valide'
  ON CONFLICT (module_id, connaissance_id) DO UPDATE SET
    actif = true,
    niveau_min = EXCLUDED.niveau_min,
    niveau_max = 5,
    publie_par = auth.uid();

  GET DIAGNOSTICS n_up = ROW_COUNT;

  UPDATE jeupharma.publications_connaissances pub
  SET actif = false
  WHERE pub.module_id = p_module_id
    AND pub.actif
    AND NOT EXISTS (
      SELECT 1 FROM _jp_sync_pubs s WHERE s.connaissance_id = pub.connaissance_id
    );
  GET DIAGNOSTICS n_off = ROW_COUNT;

  RETURN jsonb_build_object(
    'module_id', p_module_id,
    'upserted', n_up,
    'depubliees', n_off
  );
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_sync_pubs_depuis_blocs_molecule(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_sync_pubs_depuis_blocs_molecule(uuid) TO authenticated;
