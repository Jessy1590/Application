-- 092 : une leçon hors plage ★ n’apparaît pas dans la progression joueur.
-- La leçon suivante est donc la prochaine feuille encore dans le niveau d’accès.
-- (Même pour un admin inscrit : son ★ fait foi. Sans inscription, v_niv < 1, liste complète.)

CREATE OR REPLACE FUNCTION jeupharma.v2_progression_parcours(p_parcours uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  uid uuid := auth.uid();
  v_parcours uuid;
  pa jeupharma.parcours_apprentissage%ROWTYPE;
  v_niv int;
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  v_parcours := COALESCE(p_parcours, jeupharma.v2_parcours_actif(uid));
  IF v_parcours IS NULL THEN
    RETURN jsonb_build_object('parcours_id', null, 'modules', '[]'::jsonb);
  END IF;
  SELECT * INTO pa FROM jeupharma.parcours_apprentissage WHERE id = v_parcours;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('parcours_id', null, 'modules', '[]'::jsonb);
  END IF;

  IF NOT jeupharma.is_portail_admin() AND NOT EXISTS (
    SELECT 1 FROM jeupharma.inscriptions_parcours i
    WHERE i.user_id = uid AND i.parcours_id = v_parcours AND i.statut = 'accepte' AND i.actif
  ) THEN
    RETURN jsonb_build_object('parcours_id', v_parcours, 'modules', '[]'::jsonb);
  END IF;

  v_niv := jeupharma.v2__niveau_inscrit(uid, v_parcours);
  PERFORM jeupharma.v2__sync_progression(uid, v_parcours);

  RETURN jsonb_build_object(
    'parcours_id', v_parcours,
    'niveau_parcours', NULLIF(v_niv, 0),
    'parcours', jsonb_build_object(
      'id', pa.id, 'code', pa.code, 'libelle', pa.libelle,
      'description', pa.description, 'mode_contenu', pa.mode_contenu
    ) || coalesce(jeupharma.v2_parcours_detail(uid, v_parcours), '{}'::jsonb),
    'modules', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'code', m.code,
          'titre', m.titre,
          'resume', m.resume,
          'objectifs', m.objectifs,
          'ordre', m.ordre,
          'publie', m.publie,
          'est_groupe', m.est_groupe,
          'parent_id', m.parent_id,
          'niveau_min', m.niveau_min,
          'niveau_max', m.niveau_max,
          'maj_at', coalesce(m.contenu_maj_at, m.updated_at),
          'criteres', m.criteres_json,
          'prerequis_module_id', m.prerequis_module_id,
          'prerequis_module_ids', to_jsonb(coalesce(m.prerequis_module_ids, ARRAY[]::uuid[])),
          'module_suivant_id', m.module_suivant_id,
          'module_suivant_precedent', m.module_suivant_precedent,
          'module_suivant_origine', m.module_suivant_origine,
          'module_suivant_libelle', m.module_suivant_libelle,
          'detail', det.d,
          'valide', coalesce((det.d->>'valide')::boolean, false),
          'pct', coalesce((det.d->>'pct')::numeric, 0),
          'verrouille', bp.b IS NOT NULL,
          'bloque_par', bp.b,
          'statut', CASE
            WHEN m.est_groupe THEN 'groupe'
            WHEN bp.b IS NOT NULL THEN 'verrouille'
            WHEN coalesce((det.d->>'valide')::boolean, false) THEN 'termine'
            ELSE 'debloque'
          END
        )
        ORDER BY m.ordre
      )
      FROM jeupharma.modules_cours m
      CROSS JOIN LATERAL (SELECT jeupharma.v2_module_detail(uid, m.id) AS d) det
      CROSS JOIN LATERAL (SELECT jeupharma.v2_module_bloque_par(uid, m.id) AS b) bp
      WHERE m.parcours_id = v_parcours
        AND m.publie
        AND (
          v_niv < 1
          OR jeupharma.v2__module_dans_niveau(m.id, v_niv)
        )
    ), '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION jeupharma.v2_progression_parcours(uuid) TO authenticated;
