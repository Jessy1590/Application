-- =============================================================================
-- 110 : Association — « en leçon » sur les valeurs des molécules séparées
--
-- Une association dans le bloc peut cocher des connaissances de ses
-- composants (clés de payload.valeurs) sans les mettre dans matrice_ids.
-- v2_fiches_resolues les résout pour l’affichage hérité.
-- v2__pubs_depuis_payload_molecule ne publie ces clés que si la molécule
-- est dans le bloc, ou composant d’une association qui y est.
-- =============================================================================

-- Vrai si la molécule est dans le bloc, ou composant d’une association du bloc.
CREATE OR REPLACE FUNCTION jeupharma.v2__matrice_portee_valeurs(
  p_mid uuid,
  p_mat_ids uuid[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
  SELECT p_mid IS NOT NULL
    AND (
      p_mid = ANY (coalesce(p_mat_ids, ARRAY[]::uuid[]))
      OR EXISTS (
        SELECT 1
        FROM jeupharma.matrice_composants c
        WHERE c.composant_matrice_id = p_mid
          AND c.matrice_id = ANY (coalesce(p_mat_ids, ARRAY[]::uuid[]))
          AND (
            SELECT count(*)
            FROM jeupharma.matrice_composants c2
            WHERE c2.matrice_id = c.matrice_id
          ) >= 2
      )
    );
$$;

REVOKE ALL ON FUNCTION jeupharma.v2__matrice_portee_valeurs(uuid, uuid[]) FROM PUBLIC;

CREATE OR REPLACE FUNCTION jeupharma.v2__pubs_depuis_payload_molecule(p_payload jsonb)
RETURNS TABLE (connaissance_id uuid, niveau_min int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
DECLARE
  src jsonb := coalesce(p_payload, '{}'::jsonb) - '_brouillon' - 'variantes';
  variantes jsonb := coalesce(p_payload, '{}'::jsonb)->'variantes';
  layer jsonb;
  n int;
  mid uuid;
  cid uuid;
  elem text;
  star_key text;
  cid_txt text;
  mat_ids uuid[];
  base_ids uuid[];
  scope_ids uuid[];
  val_arr jsonb;
BEGIN
  mat_ids := ARRAY[]::uuid[];
  IF jsonb_typeof(src->'matrice_ids') = 'array' THEN
    FOR elem IN SELECT jsonb_array_elements_text(src->'matrice_ids')
    LOOP
      BEGIN
        mid := elem::uuid;
        IF mid IS NOT NULL AND NOT (mid = ANY (mat_ids)) THEN
          mat_ids := array_append(mat_ids, mid);
        END IF;
      EXCEPTION WHEN invalid_text_representation THEN
        NULL;
      END;
    END LOOP;
  ELSIF nullif(src->>'matrice_id', '') IS NOT NULL THEN
    BEGIN
      mat_ids := ARRAY[(src->>'matrice_id')::uuid];
    EXCEPTION WHEN invalid_text_representation THEN
      mat_ids := ARRAY[]::uuid[];
    END;
  END IF;

  base_ids := mat_ids;

  FOREACH mid IN ARRAY mat_ids
  LOOP
    RETURN QUERY
    SELECT c.id, 1
    FROM jeupharma.connaissances c
    WHERE c.matrice_id = mid
      AND c.statut = 'valide'
      AND c.champ_code IN ('dci', 'nom_commercial');
  END LOOP;

  IF jsonb_typeof(src->'valeurs') = 'object' THEN
    FOR elem IN SELECT jsonb_object_keys(src->'valeurs')
    LOOP
      BEGIN
        mid := elem::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        CONTINUE;
      END;
      IF NOT jeupharma.v2__matrice_portee_valeurs(mid, base_ids) THEN
        CONTINUE;
      END IF;
      val_arr := src->'valeurs'->elem;
      IF jsonb_typeof(val_arr) = 'array' THEN
        FOR cid_txt IN SELECT jsonb_array_elements_text(val_arr)
        LOOP
          BEGIN
            cid := cid_txt::uuid;
            RETURN QUERY SELECT cid, 1;
          EXCEPTION WHEN invalid_text_representation THEN
            NULL;
          END;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  IF jsonb_typeof(variantes) = 'object' THEN
    FOR star_key IN SELECT jsonb_object_keys(variantes)
    LOOP
      BEGIN
        n := star_key::int;
      EXCEPTION WHEN invalid_text_representation THEN
        CONTINUE;
      END;
      IF n < 1 OR n > 5 THEN CONTINUE; END IF;
      layer := variantes->star_key;

      mat_ids := ARRAY[]::uuid[];
      IF jsonb_typeof(layer->'matrice_ids') = 'array' THEN
        FOR elem IN SELECT jsonb_array_elements_text(layer->'matrice_ids')
        LOOP
          BEGIN
            mid := elem::uuid;
            IF mid IS NOT NULL AND NOT (mid = ANY (mat_ids)) THEN
              mat_ids := array_append(mat_ids, mid);
            END IF;
          EXCEPTION WHEN invalid_text_representation THEN
            NULL;
          END;
        END LOOP;
      END IF;

      SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::uuid[])
      INTO scope_ids
      FROM unnest(coalesce(base_ids, ARRAY[]::uuid[]) || coalesce(mat_ids, ARRAY[]::uuid[])) AS x
      WHERE x IS NOT NULL;

      FOREACH mid IN ARRAY mat_ids
      LOOP
        RETURN QUERY
        SELECT c.id, n
        FROM jeupharma.connaissances c
        WHERE c.matrice_id = mid
          AND c.statut = 'valide'
          AND c.champ_code IN ('dci', 'nom_commercial');
      END LOOP;

      IF jsonb_typeof(layer->'valeurs') = 'object' THEN
        FOR elem IN SELECT jsonb_object_keys(layer->'valeurs')
        LOOP
          BEGIN
            mid := elem::uuid;
          EXCEPTION WHEN invalid_text_representation THEN
            CONTINUE;
          END;
          IF NOT jeupharma.v2__matrice_portee_valeurs(mid, scope_ids) THEN
            CONTINUE;
          END IF;
          val_arr := layer->'valeurs'->elem;
          IF jsonb_typeof(val_arr) = 'array' THEN
            FOR cid_txt IN SELECT jsonb_array_elements_text(val_arr)
            LOOP
              BEGIN
                RETURN QUERY SELECT cid_txt::uuid, n;
              EXCEPTION WHEN invalid_text_representation THEN
                NULL;
              END;
            END LOOP;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2__pubs_depuis_payload_molecule(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION jeupharma.v2_fiches_resolues(
  p_matrice_ids uuid[],
  p_parcours uuid DEFAULT NULL,
  p_module_ids uuid[] DEFAULT NULL,
  p_niveau integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  uid uuid := auth.uid();
  is_admin boolean := jeupharma.is_portail_admin();
  niv int := CASE
    WHEN is_admin AND p_niveau IS NOT NULL
      THEN jeupharma.v2__clamp_niveau(p_niveau)
    ELSE NULL
  END;
  ids uuid[];
  mat_id uuid;
  out jsonb := '{}'::jsonb;
  vis_map jsonb := '{}'::jsonb;
  linked uuid[] := ARRAY[]::uuid[];
  bloc_map jsonb := '{}'::jsonb;
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

  -- Pubs visibles : 1 appel (inchangé)
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

  -- Scope leçons accessibles (1×) + matrices liées via blocs molecule + entité_ids
  -- des payloads résolus ★ (équivalent batch de liee_bloc / entite_ids_depuis_blocs).
  WITH parcours_scope AS (
    SELECT i.parcours_id, i.niveau_parcours
    FROM jeupharma.inscriptions_parcours i
    JOIN jeupharma.parcours_apprentissage pa ON pa.id = i.parcours_id AND pa.actif
    WHERE i.user_id = uid
      AND i.statut = 'accepte'
      AND i.actif
      AND (p_parcours IS NULL OR i.parcours_id = p_parcours)
  ),
  unlocked AS (
    SELECT d.module_id AS mod_id, ps.niveau_parcours
    FROM parcours_scope ps
    CROSS JOIN LATERAL jeupharma.v2_modules_debloques(uid, ps.parcours_id) d
    WHERE p_module_ids IS NULL OR d.module_id = ANY (p_module_ids)
  ),
  admin_requested AS (
    SELECT m.id AS mod_id,
           COALESCE((
             SELECT i.niveau_parcours FROM jeupharma.inscriptions_parcours i
             WHERE i.user_id = uid AND i.parcours_id = m.parcours_id
               AND i.statut = 'accepte' AND i.actif LIMIT 1
           ), 1) AS niveau_parcours
    FROM jeupharma.modules_cours m
    WHERE is_admin
      AND p_module_ids IS NOT NULL
      AND cardinality(p_module_ids) > 0
      AND m.id = ANY (p_module_ids)
      AND (p_parcours IS NULL OR m.parcours_id = p_parcours)
  ),
  scope AS (
    SELECT DISTINCT s.module_id AS mod_id,
           COALESCE(niv, c.niveau_parcours) AS niveau_parcours
    FROM (
      SELECT mod_id, niveau_parcours FROM unlocked
      UNION
      SELECT mod_id, niveau_parcours FROM admin_requested
    ) c
    CROSS JOIN LATERAL jeupharma.v2_module_ancetres(c.mod_id) s
  ),
  blocs AS (
    SELECT b.id AS bloc_id,
           b.payload_json,
           sc.niveau_parcours
    FROM jeupharma.module_blocs b
    JOIN scope sc ON sc.mod_id = b.module_id
    WHERE b.type_bloc = 'molecule'
      AND (is_admin OR b.visible)
  ),
  linked_rows AS (
    SELECT DISTINCT mid_x AS matrice_id
    FROM blocs b
    CROSS JOIN LATERAL unnest(
      jeupharma.v2__matrice_ids_from_payload(b.payload_json, is_admin)
    ) AS mid_x
    WHERE mid_x = ANY (ids)
  ),
  resolved AS (
    SELECT
      jeupharma.v2__payload_resolu(
        CASE
          WHEN is_admin AND b.payload_json ? '_brouillon' THEN
            (b.payload_json - '_brouillon')
              || coalesce(b.payload_json->'_brouillon'->'payload', '{}'::jsonb)
          ELSE b.payload_json - '_brouillon'
        END,
        b.niveau_parcours
      ) AS pay
    FROM blocs b
  ),
  linked_all AS (
    SELECT matrice_id FROM linked_rows
    UNION
    SELECT DISTINCT k.mid
    FROM resolved r
    CROSS JOIN LATERAL (
      SELECT t.key::uuid AS mid
      FROM jsonb_object_keys(
        CASE
          WHEN jsonb_typeof(r.pay->'valeurs') = 'object' THEN r.pay->'valeurs'
          ELSE '{}'::jsonb
        END
      ) AS t(key)
      WHERE t.key ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    ) k
    WHERE k.mid = ANY (ids)
      AND jsonb_typeof(r.pay->'valeurs'->(k.mid::text)) = 'array'
      AND jsonb_array_length(r.pay->'valeurs'->(k.mid::text)) > 0
      AND jeupharma.v2__matrice_portee_valeurs(
        k.mid,
        jeupharma.v2__matrice_ids_from_payload(r.pay, false)
      )
  ),
  mat_vals AS (
    SELECT mid_x AS matrice_id,
           r.pay->'valeurs'->(mid_x::text) AS vals
    FROM resolved r
    CROSS JOIN LATERAL unnest(
      jeupharma.v2__matrice_ids_from_payload(r.pay, false)
    ) AS mid_x
    WHERE mid_x = ANY (ids)
    UNION ALL
    SELECT k.mid,
           r.pay->'valeurs'->(k.mid::text)
    FROM resolved r
    CROSS JOIN LATERAL (
      SELECT t.key::uuid AS mid
      FROM jsonb_object_keys(
        CASE
          WHEN jsonb_typeof(r.pay->'valeurs') = 'object' THEN r.pay->'valeurs'
          ELSE '{}'::jsonb
        END
      ) AS t(key)
      WHERE t.key ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    ) k
    WHERE k.mid = ANY (ids)
      AND NOT (k.mid = ANY (jeupharma.v2__matrice_ids_from_payload(r.pay, false)))
      AND jeupharma.v2__matrice_portee_valeurs(
        k.mid,
        jeupharma.v2__matrice_ids_from_payload(r.pay, false)
      )
  ),
  ent_rows AS (
    SELECT mv.matrice_id, c.entite_id
    FROM mat_vals mv
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(mv.vals) = 'array' THEN mv.vals ELSE '[]'::jsonb END
    ) AS cid
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN cid ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          THEN cid::uuid
        ELSE NULL
      END AS cid_uuid
    ) safe
    JOIN jeupharma.connaissances c
      ON c.id = safe.cid_uuid
     AND c.statut = 'valide'
     AND c.entite_id IS NOT NULL
    WHERE safe.cid_uuid IS NOT NULL
  ),
  ent_agg AS (
    SELECT matrice_id,
           coalesce(array_agg(DISTINCT entite_id), ARRAY[]::uuid[]) AS entite_ids
    FROM ent_rows
    GROUP BY matrice_id
  )
  SELECT
    coalesce((SELECT array_agg(matrice_id) FROM linked_all), ARRAY[]::uuid[]),
    coalesce(
      (SELECT jsonb_object_agg(ea.matrice_id::text, to_jsonb(ea.entite_ids)) FROM ent_agg ea),
      '{}'::jsonb
    )
  INTO linked, bloc_map;

  FOREACH mat_id IN ARRAY ids LOOP
    via_bloc := mat_id = ANY (linked);
    via_pubs := vis_map ? mat_id::text;
    IF NOT via_bloc AND NOT via_pubs THEN
      CONTINUE;
    END IF;

    fiche := jeupharma.v2__fiche_depuis_matrice(mat_id);
    IF fiche IS NULL THEN
      CONTINUE;
    END IF;

    SELECT coalesce(array_agg(DISTINCT (x)::uuid), ARRAY[]::uuid[])
    INTO pub_ids
    FROM jsonb_array_elements_text(coalesce(vis_map->mat_id::text, '[]'::jsonb)) AS x
    WHERE x IS NOT NULL AND x <> '';

    SELECT coalesce(array_agg(DISTINCT (x)::uuid), ARRAY[]::uuid[])
    INTO bloc_ids
    FROM jsonb_array_elements_text(coalesce(bloc_map->mat_id::text, '[]'::jsonb)) AS x
    WHERE x IS NOT NULL AND x <> '';

    pub_ids := (
      SELECT coalesce(array_agg(DISTINCT y), ARRAY[]::uuid[])
      FROM unnest(coalesce(pub_ids, ARRAY[]::uuid[]) || coalesce(bloc_ids, ARRAY[]::uuid[])) AS y
      WHERE y IS NOT NULL
    );

    champs := jeupharma.v2__filtrer_champs_publies(fiche->'champs', pub_ids);

    out := out || jsonb_build_object(
      mat_id::text,
      (fiche - 'champs')
        || jsonb_build_object(
          'champs', champs,
          'source', 'matrice',
          'composants', jeupharma.v2__composants_fiche(mat_id)
        )
    );
  END LOOP;

  RETURN out;
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_fiches_resolues(uuid[], uuid, uuid[], int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_fiches_resolues(uuid[], uuid, uuid[], int) TO authenticated;
