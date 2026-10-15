-- =============================================================================
-- 064 : RPC admin `v2_publier_parcours(p_parcours_id)`
--
-- Une passe SQL : promeut les brouillons blocs (`_brouillon` → publié + visible),
-- sync pubs molécule par leçon, passe chaque leçon en `publie` / `statut = 'publie'`.
-- Remplace la cascade N+1 client (leçon × bloc) de `publishParcours()`.
-- =============================================================================

CREATE OR REPLACE FUNCTION jeupharma.v2_publier_parcours(p_parcours_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  n_blocs int := 0;
  n_lecons int := 0;
  mod_id uuid;
  sync_res jsonb;
  sync_list jsonb := '[]'::jsonb;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF p_parcours_id IS NULL THEN
    RAISE EXCEPTION 'parcours requis';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jeupharma.parcours_apprentissage p
    WHERE p.id = p_parcours_id AND p.actif
  ) THEN
    RAISE EXCEPTION 'Parcours introuvable';
  END IF;

  -- Promouvoir brouillons : titre + payload effectif, retirer `_brouillon`, visible
  UPDATE jeupharma.module_blocs b
  SET
    titre = CASE
      WHEN b.payload_json ? '_brouillon'
        AND (b.payload_json -> '_brouillon') ? 'titre'
      THEN nullif(b.payload_json #>> '{_brouillon,titre}', '')
      ELSE b.titre
    END,
    payload_json = CASE
      WHEN b.payload_json ? '_brouillon' THEN
        (b.payload_json - '_brouillon')
          || coalesce(b.payload_json -> '_brouillon' -> 'payload', '{}'::jsonb)
      ELSE b.payload_json - '_brouillon'
    END,
    visible = true,
    updated_at = now()
  FROM jeupharma.modules_cours m
  WHERE m.parcours_id = p_parcours_id
    AND coalesce(m.est_groupe, false) = false
    AND b.module_id = m.id
    AND (
      b.payload_json ? '_brouillon'
      OR b.visible IS DISTINCT FROM true
    );
  GET DIAGNOSTICS n_blocs = ROW_COUNT;

  -- Sync pubs + statut publié pour chaque leçon
  FOR mod_id IN
    SELECT m.id
    FROM jeupharma.modules_cours m
    WHERE m.parcours_id = p_parcours_id
      AND coalesce(m.est_groupe, false) = false
    ORDER BY m.ordre NULLS LAST, m.titre
  LOOP
    sync_res := jeupharma.v2_sync_pubs_depuis_blocs_molecule(mod_id);
    sync_list := sync_list || jsonb_build_array(sync_res);

    UPDATE jeupharma.modules_cours
    SET publie = true,
        statut = 'publie',
        updated_at = now()
    WHERE id = mod_id;

    n_lecons := n_lecons + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'parcours_id', p_parcours_id,
    'blocs_promus', n_blocs,
    'lecons', n_lecons,
    'sync', sync_list
  );
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_publier_parcours(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_publier_parcours(uuid) TO authenticated;
