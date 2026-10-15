-- =============================================================================
-- 063 : Phase 4 perf joueur — fiches bulk + critère jeu léger
-- Projet : kpjflntnotftpzffjbud
-- =============================================================================
-- 1. v2_fiches_resolues(p_matrice_ids[]) — 1× v2_connaissances_visibles + agrégation
-- 2. v2_critere_jeu(p_modele_id, …) — statut critère sans arbre progression complet
-- =============================================================================

-- ---------------------------------------------------------------------------
-- v2_fiches_resolues
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_fiches_resolues(
  p_matrice_ids uuid[],
  p_parcours uuid DEFAULT NULL,
  p_module_ids uuid[] DEFAULT NULL,
  p_niveau int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  uid uuid := auth.uid();
  niv int := CASE
    WHEN jeupharma.is_portail_admin() AND p_niveau IS NOT NULL
      THEN jeupharma.v2__clamp_niveau(p_niveau)
    ELSE NULL
  END;
  ids uuid[];
  mid uuid;
  out jsonb := '{}'::jsonb;
  vis_map jsonb := '{}'::jsonb;
  fiche jsonb;
  pub_ids uuid[];
  bloc_ids uuid[];
  champs jsonb;
  via_bloc boolean;
  via_pubs boolean;
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::uuid[])
  INTO ids
  FROM unnest(coalesce(p_matrice_ids, ARRAY[]::uuid[])) AS x
  WHERE x IS NOT NULL;

  IF ids IS NULL OR cardinality(ids) = 0 THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT coalesce(
    jsonb_object_agg(sub.matrice_id::text, to_jsonb(sub.entite_ids)),
    '{}'::jsonb
  )
  INTO vis_map
  FROM (
    SELECT cv.matrice_id,
           coalesce(
             array_agg(DISTINCT cv.entite_id) FILTER (WHERE cv.entite_id IS NOT NULL),
             ARRAY[]::uuid[]
           ) AS entite_ids
    FROM jeupharma.v2_connaissances_visibles(uid, p_parcours, p_module_ids, niv) cv
    WHERE cv.matrice_id = ANY (ids)
    GROUP BY cv.matrice_id
  ) sub;

  FOREACH mid IN ARRAY ids LOOP
    via_bloc := jeupharma.v2__matrice_liee_bloc(uid, mid, p_parcours, p_module_ids);
    via_pubs := vis_map ? mid::text;
    IF NOT via_bloc AND NOT via_pubs THEN
      CONTINUE;
    END IF;

    fiche := jeupharma.v2__fiche_depuis_matrice(mid);
    IF fiche IS NULL THEN
      CONTINUE;
    END IF;

    SELECT coalesce(array_agg(DISTINCT (x)::uuid), ARRAY[]::uuid[])
    INTO pub_ids
    FROM jsonb_array_elements_text(coalesce(vis_map->mid::text, '[]'::jsonb)) AS x
    WHERE x IS NOT NULL AND x <> '';

    bloc_ids := jeupharma.v2__entite_ids_depuis_blocs_molecule(
      uid, mid, p_parcours, p_module_ids, niv
    );

    pub_ids := (
      SELECT coalesce(array_agg(DISTINCT y), ARRAY[]::uuid[])
      FROM unnest(coalesce(pub_ids, ARRAY[]::uuid[]) || coalesce(bloc_ids, ARRAY[]::uuid[])) AS y
      WHERE y IS NOT NULL
    );

    champs := jeupharma.v2__filtrer_champs_publies(fiche->'champs', pub_ids);

    out := out || jsonb_build_object(
      mid::text,
      (fiche - 'champs')
        || jsonb_build_object(
          'champs', champs,
          'source', 'matrice'
        )
    );
  END LOOP;

  RETURN out;
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_fiches_resolues(uuid[], uuid, uuid[], int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_fiches_resolues(uuid[], uuid, uuid[], int) TO authenticated;

-- ---------------------------------------------------------------------------
-- v2_critere_jeu — un module + un jeu, sans v2_progression_parcours
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_critere_jeu(
  p_modele_id uuid,
  p_module_id uuid DEFAULT NULL,
  p_parcours uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  uid uuid := auth.uid();
  m jeupharma.modules_cours%ROWTYPE;
  det jsonb;
  jeu jsonb;
  hit jeupharma.modules_cours%ROWTYPE;
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF p_modele_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_module_id IS NOT NULL THEN
    SELECT * INTO m FROM jeupharma.modules_cours WHERE id = p_module_id;
    IF FOUND
       AND (
         jeupharma.is_portail_admin()
         OR EXISTS (
           SELECT 1
           FROM jeupharma.inscriptions_parcours i
           WHERE i.user_id = uid
             AND i.parcours_id = m.parcours_id
             AND i.statut = 'accepte'
             AND i.actif
         )
       )
    THEN
      det := jeupharma.v2_module_detail(uid, m.id);
      SELECT e INTO jeu
      FROM jsonb_array_elements(coalesce(det->'jeux', '[]'::jsonb)) e
      WHERE (e->>'modele_id')::uuid = p_modele_id
      LIMIT 1;
      IF jeu IS NOT NULL THEN
        RETURN jsonb_build_object(
          'ok', coalesce((jeu->>'ok')::boolean, false),
          'score_min_pct', jeu->'score_min_pct',
          'meilleur_pct', jeu->'meilleur_pct',
          'module_id', m.id,
          'titre', m.titre,
          'valide', coalesce((det->>'valide')::boolean, false),
          'est_groupe', m.est_groupe,
          'parcours_id', m.parcours_id
        );
      END IF;
    END IF;
  END IF;

  FOR hit IN
    SELECT mc.*
    FROM jeupharma.modules_cours mc
    WHERE (p_parcours IS NULL OR mc.parcours_id = p_parcours)
      AND (
        jeupharma.is_portail_admin()
        OR EXISTS (
          SELECT 1
          FROM jeupharma.inscriptions_parcours i
          WHERE i.user_id = uid
            AND i.parcours_id = mc.parcours_id
            AND i.statut = 'accepte'
            AND i.actif
        )
      )
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(coalesce(mc.criteres_json->'jeux', '[]'::jsonb)) e
        WHERE (e->>'modele_id')::uuid = p_modele_id
      )
    ORDER BY
      CASE WHEN NOT coalesce(mc.est_groupe, false) THEN 0 ELSE 1 END,
      mc.ordre NULLS LAST,
      mc.created_at
    LIMIT 8
  LOOP
    det := jeupharma.v2_module_detail(uid, hit.id);
    SELECT e INTO jeu
    FROM jsonb_array_elements(coalesce(det->'jeux', '[]'::jsonb)) e
    WHERE (e->>'modele_id')::uuid = p_modele_id
    LIMIT 1;
    IF jeu IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', coalesce((jeu->>'ok')::boolean, false),
        'score_min_pct', jeu->'score_min_pct',
        'meilleur_pct', jeu->'meilleur_pct',
        'module_id', hit.id,
        'titre', hit.titre,
        'valide', coalesce((det->>'valide')::boolean, false),
        'est_groupe', hit.est_groupe,
        'parcours_id', hit.parcours_id
      );
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_critere_jeu(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_critere_jeu(uuid, uuid, uuid) TO authenticated;
