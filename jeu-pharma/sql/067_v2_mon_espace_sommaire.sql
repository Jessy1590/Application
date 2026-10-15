-- =============================================================================
-- 067 : Phase 5 perf — `v2_mon_espace` sommaire (sans N× v2_progression_parcours)
-- Projet : kpjflntnotftpzffjbud
-- =============================================================================
-- Avant : 1× v2_progression_parcours (arbre modules + détail + sync) par parcours
--         accepté → latence N × arbre complet.
-- Après : sync + v2_parcours_detail (stats) + jeux_seuils légers ; modules = []
--         (le client charge le détail via v2_progression_parcours à l’ouverture).
-- =============================================================================

CREATE OR REPLACE FUNCTION jeupharma.v2_mon_espace()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  uid uuid := auth.uid();
  r record;
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  -- Une sync par parcours accepté (comme v2_progression_parcours) avant les stats
  FOR r IN
    SELECT i.parcours_id
    FROM jeupharma.inscriptions_parcours i
    JOIN jeupharma.parcours_apprentissage pa ON pa.id = i.parcours_id AND pa.actif
    WHERE i.user_id = uid AND i.statut = 'accepte' AND i.actif
  LOOP
    PERFORM jeupharma.v2__sync_progression(uid, r.parcours_id);
  END LOOP;

  RETURN jsonb_build_object(
    'inscriptions', coalesce((
      SELECT jsonb_agg(e || jsonb_build_object(
        'pct', CASE WHEN e->>'statut' = 'accepte' THEN det.d->'pct' END,
        'nb_lecons', det.d->'nb_lecons',
        'nb_valides', det.d->'nb_valides',
        'valide', det.d->'valide',
        'verrouille', det.d->'verrouille',
        'bloque_par', det.d->'bloque_par',
        'maj_at', det.d->'maj_at'
      ))
      FROM jsonb_array_elements(jeupharma.v2_lister_mes_inscriptions()) e
      CROSS JOIN LATERAL (
        SELECT jeupharma.v2_parcours_detail(uid, (e->>'parcours_id')::uuid) AS d
      ) det
    ), '[]'::jsonb),
    'parcours', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'parcours_id', i.parcours_id,
          'niveau_parcours', i.niveau_parcours,
          'sommaire', true,
          'parcours', jsonb_build_object(
            'id', pa.id,
            'code', pa.code,
            'libelle', pa.libelle,
            'description', pa.description,
            'mode_contenu', pa.mode_contenu
          ) || coalesce(det.d, '{}'::jsonb),
          'modules', '[]'::jsonb,
          'jeux_seuils', seuils.j
        )
        ORDER BY pa.ordre
      )
      FROM jeupharma.inscriptions_parcours i
      JOIN jeupharma.parcours_apprentissage pa ON pa.id = i.parcours_id AND pa.actif
      CROSS JOIN LATERAL (
        SELECT jeupharma.v2_parcours_detail(uid, i.parcours_id) AS d
      ) det
      CROSS JOIN LATERAL (
        SELECT coalesce(
          (
            SELECT jsonb_object_agg(s.mid, s.pct)
            FROM (
              SELECT
                (e->>'modele_id')::text AS mid,
                max(
                  least(100, greatest(0, round((e->>'score_min_pct')::numeric)))
                ) AS pct
              FROM jeupharma.modules_cours m
              CROSS JOIN LATERAL jeupharma.v2__criteres_pour_niveau(
                coalesce(m.criteres_json, '{}'::jsonb),
                i.niveau_parcours
              ) crit
              CROSS JOIN LATERAL jsonb_array_elements(
                coalesce(crit->'jeux', '[]'::jsonb)
              ) e
              WHERE m.parcours_id = i.parcours_id
                AND m.publie
                AND NOT m.est_groupe
                AND (
                  i.niveau_parcours IS NULL
                  OR i.niveau_parcours < 1
                  OR jeupharma.v2__module_dans_niveau(m.id, i.niveau_parcours)
                )
                AND (e->>'modele_id') ~* '^[0-9a-f-]{36}$'
                AND (e->>'score_min_pct') ~ '^[0-9]+(\.[0-9]+)?$'
              GROUP BY 1
            ) s
          ),
          '{}'::jsonb
        ) AS j
      ) seuils
      WHERE i.user_id = uid AND i.statut = 'accepte' AND i.actif
    ), '[]'::jsonb),
    'scores', coalesce((
      SELECT jsonb_agg(x.o ORDER BY x.ts DESC NULLS LAST)
      FROM (
        SELECT t.termine_at AS ts,
               jsonb_build_object(
                 'id', t.id,
                 'modele_id', t.modele_id,
                 'parcours_id', mj.parcours_id,
                 'titre', mj.titre,
                 'type_jeu', mj.type_jeu,
                 'code_unique', mj.code_unique,
                 'score_obtenu', t.score_obtenu,
                 'score_max', t.score_max,
                 'termine_at', t.termine_at
               ) AS o
        FROM jeupharma.tentatives_jeu t
        JOIN jeupharma.modeles_jeu mj ON mj.id = t.modele_id
        WHERE t.utilisateur_id = uid AND t.termine_at IS NOT NULL
        ORDER BY t.termine_at DESC
        LIMIT 200
      ) x
    ), '[]'::jsonb),
    'progression', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'module_id', pm.module_id,
        'statut', pm.statut,
        'titre', mc.titre,
        'parcours_id', mc.parcours_id,
        'lecture_pct', pm.lecture_pct
      ))
      FROM jeupharma.progression_modules pm
      JOIN jeupharma.modules_cours mc ON mc.id = pm.module_id
      WHERE pm.user_id = uid
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_mon_espace() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_mon_espace() TO authenticated;
