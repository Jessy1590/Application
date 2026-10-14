-- =============================================================================
-- 043 : v2_maj_parcours_criteres accepte aussi libelle + description
-- =============================================================================

CREATE OR REPLACE FUNCTION jeupharma.v2_maj_parcours_criteres(
  p_parcours_id uuid,
  p_prerequis_id uuid,
  p_criteres jsonb,
  p_libelle text DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  row jeupharma.parcours_apprentissage%ROWTYPE;
  cyc boolean;
  v_libelle text;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;

  v_libelle := nullif(trim(both FROM coalesce(p_libelle, '')), '');
  IF p_libelle IS NOT NULL AND v_libelle IS NULL THEN
    RAISE EXCEPTION 'Le nom du parcours est obligatoire';
  END IF;

  IF p_prerequis_id IS NOT NULL THEN
    IF p_prerequis_id = p_parcours_id THEN
      RAISE EXCEPTION 'Un parcours ne peut pas dépendre de lui-même';
    END IF;
    WITH RECURSIVE up AS (
      SELECT p.id, p.prerequis_parcours_id FROM jeupharma.parcours_apprentissage p WHERE p.id = p_prerequis_id
      UNION
      SELECT p.id, p.prerequis_parcours_id
      FROM jeupharma.parcours_apprentissage p JOIN up ON p.id = up.prerequis_parcours_id
    )
    SELECT EXISTS (SELECT 1 FROM up WHERE up.id = p_parcours_id) INTO cyc;
    IF cyc THEN
      RAISE EXCEPTION 'Prérequis circulaire entre parcours';
    END IF;
  END IF;

  UPDATE jeupharma.parcours_apprentissage
  SET prerequis_parcours_id = p_prerequis_id,
      criteres_json = jeupharma.v2__clean_criteres(p_criteres),
      libelle = coalesce(v_libelle, libelle),
      description = CASE
        WHEN p_description IS NULL THEN description
        ELSE trim(both FROM p_description)
      END,
      updated_at = now()
  WHERE id = p_parcours_id
  RETURNING * INTO row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parcours introuvable'; END IF;
  RETURN to_jsonb(row);
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_maj_parcours_criteres(uuid, uuid, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_maj_parcours_criteres(uuid, uuid, jsonb, text, text) TO authenticated;
-- Compat appels à 3 arguments (signature précédente encore référencée côté PostgREST)
GRANT EXECUTE ON FUNCTION jeupharma.v2_maj_parcours_criteres(uuid, uuid, jsonb) TO authenticated;
