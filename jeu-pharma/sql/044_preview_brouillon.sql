-- =============================================================================
-- 044 : Aperçu admin = brouillons + blocs masqués ; filtre ★ seulement si demandé
-- =============================================================================

CREATE OR REPLACE FUNCTION jeupharma.v2__payload_avec_brouillon(p_payload jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_payload IS NULL THEN '{}'::jsonb
    WHEN p_payload->'_brouillon' IS NULL THEN p_payload - '_brouillon'
    ELSE (p_payload - '_brouillon') || coalesce(p_payload->'_brouillon'->'payload', '{}'::jsonb)
  END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_lecon_joueur(
  p_module_id uuid,
  p_preview boolean DEFAULT false,
  p_preview_niveau int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  m jeupharma.modules_cours%ROWTYPE;
  uid uuid := auth.uid();
  ok boolean;
  bp jsonb;
  v_niv int;
  is_preview boolean := coalesce(p_preview, false) AND jeupharma.is_portail_admin();
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT * INTO m FROM jeupharma.modules_cours WHERE id = p_module_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Leçon introuvable'; END IF;

  IF is_preview THEN
    ok := true;
    -- Sans ★ demandé : pas de filtre plage (NULL). Avec ★ : clamp 1–5.
    v_niv := CASE
      WHEN p_preview_niveau IS NOT NULL THEN jeupharma.v2__clamp_niveau(p_preview_niveau)
      ELSE NULL
    END;
  ELSE
    v_niv := jeupharma.v2__niveau_inscrit(uid, m.parcours_id);
    ok := m.publie AND NOT m.est_groupe
      AND v_niv >= 1
      AND jeupharma.v2__module_dans_niveau(p_module_id, v_niv);
    IF ok THEN
      bp := jeupharma.v2_module_bloque_par(uid, p_module_id);
      ok := bp IS NULL;
    END IF;
  END IF;

  IF NOT ok THEN
    RAISE EXCEPTION 'Leçon verrouillée';
  END IF;

  RETURN jsonb_build_object(
    'module', to_jsonb(m) || jsonb_build_object('maj_at', coalesce(m.contenu_maj_at, m.updated_at)),
    'detail', CASE WHEN is_preview THEN NULL ELSE jeupharma.v2_module_detail(uid, p_module_id) END,
    'niveau_parcours', v_niv,
    'preview', is_preview,
    'blocs', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'module_id', b.module_id,
          'ordre', b.ordre,
          'type_bloc', b.type_bloc,
          'titre', CASE
            WHEN is_preview AND (b.payload_json->'_brouillon' ? 'titre')
              THEN b.payload_json->'_brouillon'->>'titre'
            ELSE b.titre
          END,
          'visible', b.visible,
          'niveau_min', b.niveau_min,
          'niveau_max', b.niveau_max,
          'payload_json', CASE
            WHEN is_preview THEN
              jeupharma.v2__payload_resolu(
                jeupharma.v2__payload_avec_brouillon(b.payload_json),
                coalesce(v_niv, 0)
              )
            ELSE jeupharma.v2__payload_resolu(b.payload_json, v_niv)
          END,
          'created_at', b.created_at,
          'updated_at', b.updated_at
        )
        ORDER BY b.ordre, b.created_at
      )
      FROM jeupharma.module_blocs b
      WHERE b.module_id = p_module_id
        AND (
          CASE
            WHEN is_preview AND v_niv IS NULL THEN true
            WHEN is_preview THEN jeupharma.v2__dans_plage(v_niv, b.niveau_min, b.niveau_max)
            ELSE b.visible AND jeupharma.v2__dans_plage(v_niv, b.niveau_min, b.niveau_max)
          END
        )
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2__payload_avec_brouillon(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION jeupharma.v2__payload_avec_brouillon(jsonb) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION jeupharma.v2_lecon_joueur(uuid, boolean, int) TO authenticated;
