-- =============================================================================
-- 056 : Bloc molécule = source unique + sync pubs + acquis catalogue + déplacer
-- Projet : kpjflntnotftpzffjbud
-- =============================================================================
-- - Payload molecule : base + variantes ★ additives (matrice_ids + valeurs)
-- - v2__payload_resolu : union matrice_ids / merge valeurs (pas remplacement)
-- - Sync publications_connaissances depuis l’union des blocs molecule
-- - Catalogue (p_module_ids NULL) = leçons validées ; leçon/jeux = débloqués
-- - v2_deplacer_bloc + migration pubs → blocs si besoin
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Résolution payload : texte = remplacement ; molecule = union additive
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2__payload_resolu(p_payload jsonb, p_niveau int)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  base jsonb;
  v jsonb;
  k text;
  merged jsonb;
  val text;
  arr_base jsonb;
  arr_add jsonb;
  mid text;
  ids_base jsonb;
  ids_add jsonb;
  vals_base jsonb;
  vals_add jsonb;
  merged_vals jsonb;
  cid text;
  arr jsonb;
BEGIN
  base := coalesce(p_payload, '{}'::jsonb) - 'variantes' - '_brouillon';
  IF p_niveau IS NULL OR p_niveau < 1 THEN
    RETURN base;
  END IF;
  v := coalesce(p_payload, '{}'::jsonb)->'variantes'->(p_niveau::text);
  IF v IS NULL OR jsonb_typeof(v) <> 'object' THEN
    RETURN base;
  END IF;

  merged := base;
  FOR k IN SELECT jsonb_object_keys(v)
  LOOP
    IF k = 'matrice_ids' AND jsonb_typeof(v->k) = 'array' THEN
      arr_base := coalesce(merged->'matrice_ids', '[]'::jsonb);
      IF jsonb_typeof(arr_base) <> 'array' THEN
        arr_base := '[]'::jsonb;
      END IF;
      arr_add := v->k;
      merged := jsonb_set(
        merged,
        ARRAY['matrice_ids'],
        (
          SELECT coalesce(jsonb_agg(to_jsonb(x.elem) ORDER BY x.ord), '[]'::jsonb)
          FROM (
            SELECT elem, min(ord) AS ord
            FROM (
              SELECT jsonb_array_elements_text(arr_base) AS elem, 1 AS ord
              UNION ALL
              SELECT jsonb_array_elements_text(arr_add), 2
            ) u
            WHERE elem IS NOT NULL AND elem <> ''
            GROUP BY elem
          ) x
        ),
        true
      );
      -- Compat scalaire
      IF jsonb_typeof(merged->'matrice_ids') = 'array'
         AND jsonb_array_length(merged->'matrice_ids') > 0 THEN
        merged := jsonb_set(merged, ARRAY['matrice_id'], merged->'matrice_ids'->0, true);
      END IF;

    ELSIF k = 'valeurs' AND jsonb_typeof(v->k) = 'object' THEN
      vals_base := coalesce(merged->'valeurs', '{}'::jsonb);
      IF jsonb_typeof(vals_base) <> 'object' THEN
        vals_base := '{}'::jsonb;
      END IF;
      vals_add := v->k;
      merged_vals := vals_base;
      FOR mid IN SELECT jsonb_object_keys(vals_add)
      LOOP
        ids_base := coalesce(vals_base->mid, '[]'::jsonb);
        ids_add := coalesce(vals_add->mid, '[]'::jsonb);
        IF jsonb_typeof(ids_base) <> 'array' THEN ids_base := '[]'::jsonb; END IF;
        IF jsonb_typeof(ids_add) <> 'array' THEN ids_add := '[]'::jsonb; END IF;
        arr := (
          SELECT coalesce(jsonb_agg(to_jsonb(x.elem)), '[]'::jsonb)
          FROM (
            SELECT DISTINCT elem
            FROM (
              SELECT jsonb_array_elements_text(ids_base) AS elem
              UNION ALL
              SELECT jsonb_array_elements_text(ids_add)
            ) u
            WHERE elem IS NOT NULL AND elem <> ''
          ) x
        );
        merged_vals := jsonb_set(merged_vals, ARRAY[mid], arr, true);
      END LOOP;
      merged := jsonb_set(merged, ARRAY['valeurs'], merged_vals, true);

    ELSIF jsonb_typeof(v->k) = 'string' THEN
      val := v->>k;
      IF NOT jeupharma.v2__texte_html_vide(val) THEN
        merged := jsonb_set(merged, ARRAY[k], to_jsonb(val), true);
      END IF;
    ELSIF v->k IS NOT NULL AND jsonb_typeof(v->k) <> 'null' THEN
      merged := jsonb_set(merged, ARRAY[k], v->k, true);
    END IF;
  END LOOP;
  RETURN merged;
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2__payload_resolu(jsonb, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION jeupharma.v2__payload_resolu(jsonb, int) FROM authenticated, anon;

-- ---------------------------------------------------------------------------
-- Extraire matrice_ids (base ∪ toutes variantes ∪ brouillon) — via_bloc
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2__matrice_ids_from_payload(
  p_payload jsonb,
  p_include_brouillon boolean DEFAULT false
)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
DECLARE
  base jsonb;
  draft jsonb;
  src jsonb;
  ids uuid[] := ARRAY[]::uuid[];
  elem text;
  vkey text;
  layer jsonb;
BEGIN
  base := coalesce(p_payload, '{}'::jsonb) - '_brouillon';
  draft := CASE
    WHEN p_include_brouillon THEN coalesce(p_payload->'_brouillon'->'payload', '{}'::jsonb)
    ELSE '{}'::jsonb
  END;

  FOREACH src IN ARRAY ARRAY[base, draft]
  LOOP
    -- Couche racine
    IF jsonb_typeof(src->'matrice_ids') = 'array' THEN
      FOR elem IN SELECT jsonb_array_elements_text(src->'matrice_ids')
      LOOP
        IF elem IS NOT NULL AND elem <> '' THEN
          BEGIN
            IF NOT (elem::uuid = ANY (ids)) THEN
              ids := array_append(ids, elem::uuid);
            END IF;
          EXCEPTION WHEN invalid_text_representation THEN
            NULL;
          END;
        END IF;
      END LOOP;
    ELSIF nullif(src->>'matrice_id', '') IS NOT NULL THEN
      BEGIN
        IF NOT ((src->>'matrice_id')::uuid = ANY (ids)) THEN
          ids := array_append(ids, (src->>'matrice_id')::uuid);
        END IF;
      EXCEPTION WHEN invalid_text_representation THEN
        NULL;
      END;
    END IF;

    -- Variantes ★ additives
    IF jsonb_typeof(src->'variantes') = 'object' THEN
      FOR vkey IN SELECT jsonb_object_keys(src->'variantes')
      LOOP
        layer := src->'variantes'->vkey;
        IF jsonb_typeof(layer->'matrice_ids') = 'array' THEN
          FOR elem IN SELECT jsonb_array_elements_text(layer->'matrice_ids')
          LOOP
            IF elem IS NOT NULL AND elem <> '' THEN
              BEGIN
                IF NOT (elem::uuid = ANY (ids)) THEN
                  ids := array_append(ids, elem::uuid);
                END IF;
              EXCEPTION WHEN invalid_text_representation THEN
                NULL;
              END;
            END IF;
          END LOOP;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RETURN ids;
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2__matrice_ids_from_payload(jsonb, boolean) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Collecte pubs désirées depuis un payload molecule publié (sans _brouillon)
-- Renvoie TABLE (connaissance_id, niveau_min)
-- ---------------------------------------------------------------------------
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
  val_arr jsonb;
BEGIN
  -- Couche base = niveau 1
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

  -- Variantes ★N
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

-- ---------------------------------------------------------------------------
-- Sync pubs du module depuis tous les blocs molecule (payload publié)
-- Retrait = dépublication si plus dans aucun bloc
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_sync_pubs_depuis_blocs_molecule(p_module_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  n_up int := 0;
  n_off int := 0;
  r RECORD;
BEGIN
  -- Migration SQL (auth.uid NULL) autorisée ; clients = admin portail uniquement
  IF auth.uid() IS NOT NULL AND NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF p_module_id IS NULL THEN
    RAISE EXCEPTION 'module requis';
  END IF;

  -- Agrégat : min(niveau_min) par connaissance
  CREATE TEMP TABLE IF NOT EXISTS _jp_sync_pubs (
    connaissance_id uuid PRIMARY KEY,
    niveau_min int NOT NULL
  ) ON COMMIT DROP;
  -- WHERE true : pg-safeupdate refuse DELETE sans clause (erreur PostgREST « DELETE requires a WHERE clause »)
  DELETE FROM _jp_sync_pubs WHERE true;

  INSERT INTO _jp_sync_pubs (connaissance_id, niveau_min)
  SELECT x.connaissance_id, min(x.niveau_min)
  FROM jeupharma.module_blocs b
  CROSS JOIN LATERAL jeupharma.v2__pubs_depuis_payload_molecule(b.payload_json) x
  WHERE b.module_id = p_module_id
    AND b.type_bloc = 'molecule'
  GROUP BY x.connaissance_id;

  -- Upsert désirées
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

  -- Dépublier le reste actif de ce module
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

-- ---------------------------------------------------------------------------
-- v2_connaissances_visibles : double scope
--   p_module_ids fourni → modules débloqués (leçon / jeux)
--   p_module_ids NULL   → uniquement leçons validées (catalogue acquis)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_connaissances_visibles(
  p_user uuid DEFAULT auth.uid(),
  p_parcours uuid DEFAULT NULL,
  p_module_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  connaissance_id uuid,
  matrice_id uuid,
  champ_code text,
  entite_id uuid,
  texte text,
  texte_norm text,
  ordre int,
  module_id uuid,
  libelle_pedagogique text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
BEGIN
  IF p_user IS NULL THEN
    RETURN;
  END IF;
  IF NOT jeupharma.has_jeupharma_access() AND NOT jeupharma.is_portail_admin() THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH parcours_scope AS (
    SELECT i.parcours_id, i.niveau_parcours
    FROM jeupharma.inscriptions_parcours i
    JOIN jeupharma.parcours_apprentissage pa ON pa.id = i.parcours_id AND pa.actif
    WHERE i.user_id = p_user
      AND i.statut = 'accepte'
      AND i.actif
      AND (p_parcours IS NULL OR i.parcours_id = p_parcours)
  ),
  unlocked AS (
    SELECT d.module_id AS mid, ps.niveau_parcours
    FROM parcours_scope ps
    CROSS JOIN LATERAL jeupharma.v2_modules_debloques(p_user, ps.parcours_id) d
    WHERE p_module_ids IS NULL OR d.module_id = ANY (p_module_ids)
  ),
  -- Catalogue acquis : uniquement leçons validées
  unlocked_scoped AS (
    SELECT u.mid, u.niveau_parcours
    FROM unlocked u
    WHERE p_module_ids IS NOT NULL
       OR jeupharma.v2_module_valide(p_user, u.mid)
  ),
  admin_requested AS (
    SELECT m.id AS mid,
           COALESCE(
             (
               SELECT i.niveau_parcours
               FROM jeupharma.inscriptions_parcours i
               WHERE i.user_id = p_user
                 AND i.parcours_id = m.parcours_id
                 AND i.statut = 'accepte'
                 AND i.actif
               LIMIT 1
             ),
             1
           ) AS niveau_parcours
    FROM jeupharma.modules_cours m
    WHERE jeupharma.is_portail_admin()
      AND p_module_ids IS NOT NULL
      AND cardinality(p_module_ids) > 0
      AND m.id = ANY (p_module_ids)
      AND (p_parcours IS NULL OR m.parcours_id = p_parcours)
  ),
  combined AS (
    SELECT u.mid, u.niveau_parcours FROM unlocked_scoped u
    UNION
    SELECT a.mid, a.niveau_parcours FROM admin_requested a
  ),
  scope AS (
    SELECT DISTINCT s.module_id AS mid, c.niveau_parcours
    FROM combined c
    CROSS JOIN LATERAL jeupharma.v2_module_ancetres(c.mid) s
  ),
  raw AS (
    SELECT
      c.id AS cid,
      c.matrice_id AS mid_mat,
      c.champ_code AS code,
      c.entite_id AS eid,
      jeupharma.v2__valeur_referentiel(c.matrice_id, c.champ_code, c.entite_id) AS val_ref,
      c.texte_norm AS tnorm,
      pub.ordre AS ord,
      pub.module_id AS mid_pub,
      pub.libelle_pedagogique AS lib_ped
    FROM jeupharma.publications_connaissances pub
    JOIN scope sc ON sc.mid = pub.module_id
    JOIN jeupharma.connaissances c ON c.id = pub.connaissance_id AND c.statut = 'valide'
    JOIN jeupharma.matrice_medicaments m ON m.id = c.matrice_id AND m.statut = 'publie'
    WHERE pub.actif
      AND c.entite_id IS NOT NULL
      AND jeupharma.v2__dans_plage(sc.niveau_parcours, pub.niveau_min, pub.niveau_max)
  )
  SELECT
    r.cid,
    r.mid_mat,
    r.code,
    r.eid,
    r.val_ref AS texte,
    r.tnorm,
    r.ord,
    r.mid_pub,
    r.lib_ped
  FROM raw r
  WHERE r.val_ref IS NOT NULL
  ORDER BY r.mid_mat, r.code, r.ord;
END;
$$;

GRANT EXECUTE ON FUNCTION jeupharma.v2_connaissances_visibles(uuid, uuid, uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- Masque entités depuis payload molecule résolu ★ (via_bloc)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2__entite_ids_depuis_blocs_molecule(
  p_user uuid,
  p_matrice_id uuid,
  p_parcours uuid DEFAULT NULL,
  p_module_ids uuid[] DEFAULT NULL
)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  is_admin boolean := jeupharma.is_portail_admin();
  out_ids uuid[] := ARRAY[]::uuid[];
  r RECORD;
  resolved jsonb;
  vals jsonb;
  cid text;
  eid uuid;
  niv int;
BEGIN
  IF p_user IS NULL OR p_matrice_id IS NULL THEN
    RETURN out_ids;
  END IF;

  FOR r IN
    WITH parcours_scope AS (
      SELECT i.parcours_id, i.niveau_parcours
      FROM jeupharma.inscriptions_parcours i
      JOIN jeupharma.parcours_apprentissage pa ON pa.id = i.parcours_id AND pa.actif
      WHERE i.user_id = p_user
        AND i.statut = 'accepte'
        AND i.actif
        AND (p_parcours IS NULL OR i.parcours_id = p_parcours)
    ),
    unlocked AS (
      SELECT d.module_id AS mid, ps.niveau_parcours
      FROM parcours_scope ps
      CROSS JOIN LATERAL jeupharma.v2_modules_debloques(p_user, ps.parcours_id) d
      WHERE p_module_ids IS NULL OR d.module_id = ANY (p_module_ids)
    ),
    admin_requested AS (
      SELECT m.id AS mid,
             COALESCE((
               SELECT i.niveau_parcours FROM jeupharma.inscriptions_parcours i
               WHERE i.user_id = p_user AND i.parcours_id = m.parcours_id
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
      SELECT DISTINCT s.module_id AS mid, c.niveau_parcours
      FROM (
        SELECT mid, niveau_parcours FROM unlocked
        UNION
        SELECT mid, niveau_parcours FROM admin_requested
      ) c
      CROSS JOIN LATERAL jeupharma.v2_module_ancetres(c.mid) s
    )
    SELECT b.payload_json, sc.niveau_parcours, b.visible
    FROM jeupharma.module_blocs b
    JOIN scope sc ON sc.mid = b.module_id
    WHERE b.type_bloc = 'molecule'
      AND (is_admin OR b.visible)
      AND p_matrice_id = ANY (
        jeupharma.v2__matrice_ids_from_payload(b.payload_json, is_admin)
      )
  LOOP
    niv := r.niveau_parcours;
    resolved := jeupharma.v2__payload_resolu(
      CASE
        WHEN is_admin AND r.payload_json ? '_brouillon' THEN
          (r.payload_json - '_brouillon')
            || coalesce(r.payload_json->'_brouillon'->'payload', '{}'::jsonb)
        ELSE r.payload_json - '_brouillon'
      END,
      niv
    );
    -- Vérifier que la matrice est dans le payload résolu ★
    IF NOT (
      p_matrice_id = ANY (jeupharma.v2__matrice_ids_from_payload(resolved, false))
    ) THEN
      CONTINUE;
    END IF;

    vals := resolved->'valeurs'->(p_matrice_id::text);
    IF jsonb_typeof(vals) = 'array' THEN
      FOR cid IN SELECT jsonb_array_elements_text(vals)
      LOOP
        BEGIN
          SELECT c.entite_id INTO eid
          FROM jeupharma.connaissances c
          WHERE c.id = cid::uuid AND c.statut = 'valide' AND c.entite_id IS NOT NULL;
          IF eid IS NOT NULL AND NOT (eid = ANY (out_ids)) THEN
            out_ids := array_append(out_ids, eid);
          END IF;
        EXCEPTION WHEN invalid_text_representation THEN
          NULL;
        END;
      END LOOP;
    END IF;
  END LOOP;

  RETURN out_ids;
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2__entite_ids_depuis_blocs_molecule(uuid, uuid, uuid, uuid[]) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- v2_fiche_resolue : masque pubs ∪ payload bloc résolu
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_fiche_resolue(
  p_matrice_id uuid,
  p_parcours uuid DEFAULT NULL,
  p_module_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  uid uuid := auth.uid();
  via_bloc boolean;
  via_pubs boolean;
  fiche jsonb;
  pub_ids uuid[];
  bloc_ids uuid[];
  champs jsonb;
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  via_bloc := jeupharma.v2__matrice_liee_bloc(uid, p_matrice_id, p_parcours, p_module_ids);
  via_pubs := EXISTS (
    SELECT 1 FROM jeupharma.v2_connaissances_visibles(uid, p_parcours, p_module_ids) cv
    WHERE cv.matrice_id = p_matrice_id
  );

  IF NOT via_bloc AND NOT via_pubs THEN
    RETURN NULL;
  END IF;

  fiche := jeupharma.v2__fiche_depuis_matrice(p_matrice_id);
  IF fiche IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(array_agg(DISTINCT cv.entite_id), ARRAY[]::uuid[])
  INTO pub_ids
  FROM jeupharma.v2_connaissances_visibles(uid, p_parcours, p_module_ids) cv
  WHERE cv.matrice_id = p_matrice_id
    AND cv.entite_id IS NOT NULL;

  bloc_ids := jeupharma.v2__entite_ids_depuis_blocs_molecule(
    uid, p_matrice_id, p_parcours, p_module_ids
  );

  pub_ids := (
    SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::uuid[])
    FROM unnest(pub_ids || bloc_ids) AS x
    WHERE x IS NOT NULL
  );

  champs := jeupharma.v2__filtrer_champs_publies(fiche->'champs', pub_ids);

  RETURN (fiche - 'champs')
    || jsonb_build_object(
      'champs', champs,
      'source', 'matrice'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION jeupharma.v2_fiche_resolue(uuid, uuid, uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- Déplacer un bloc vers une autre leçon (même parcours)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_deplacer_bloc(
  p_bloc_id uuid,
  p_module_cible_id uuid,
  p_avant_bloc_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  b jeupharma.module_blocs%ROWTYPE;
  src_module uuid;
  src_parcours uuid;
  dst_parcours uuid;
  ids uuid[];
  i int;
  new_ids uuid[] := ARRAY[]::uuid[];
  inserted boolean := false;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF p_bloc_id IS NULL OR p_module_cible_id IS NULL THEN
    RAISE EXCEPTION 'bloc et module cible requis';
  END IF;

  SELECT * INTO b FROM jeupharma.module_blocs WHERE id = p_bloc_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bloc introuvable'; END IF;
  src_module := b.module_id;

  IF src_module = p_module_cible_id AND p_avant_bloc_id IS NULL THEN
    RETURN to_jsonb(b);
  END IF;

  SELECT parcours_id INTO src_parcours FROM jeupharma.modules_cours WHERE id = src_module;
  SELECT parcours_id INTO dst_parcours FROM jeupharma.modules_cours WHERE id = p_module_cible_id;
  IF src_parcours IS NULL OR dst_parcours IS NULL OR src_parcours <> dst_parcours THEN
    RAISE EXCEPTION 'Leçon cible hors parcours';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jeupharma.modules_cours m
    WHERE m.id = p_module_cible_id AND m.est_groupe
  ) THEN
    RAISE EXCEPTION 'Cible doit être une leçon';
  END IF;

  UPDATE jeupharma.module_blocs
  SET module_id = p_module_cible_id, updated_at = now()
  WHERE id = p_bloc_id
  RETURNING * INTO b;

  -- Réordonner la cible
  SELECT array_agg(id ORDER BY ordre, created_at)
  INTO ids
  FROM jeupharma.module_blocs
  WHERE module_id = p_module_cible_id AND id <> p_bloc_id;

  ids := coalesce(ids, ARRAY[]::uuid[]);
  IF p_avant_bloc_id IS NOT NULL THEN
    FOR i IN 1 .. coalesce(array_length(ids, 1), 0) LOOP
      IF ids[i] = p_avant_bloc_id AND NOT inserted THEN
        new_ids := array_append(new_ids, p_bloc_id);
        inserted := true;
      END IF;
      new_ids := array_append(new_ids, ids[i]);
    END LOOP;
    IF NOT inserted THEN
      new_ids := array_append(new_ids, p_bloc_id);
    END IF;
  ELSE
    new_ids := ids || ARRAY[p_bloc_id];
  END IF;

  PERFORM jeupharma.v2_reorder_blocs(p_module_cible_id, new_ids);

  -- Re-sync pubs si molécule (source + cible)
  IF b.type_bloc = 'molecule' THEN
    PERFORM jeupharma.v2_sync_pubs_depuis_blocs_molecule(src_module);
    PERFORM jeupharma.v2_sync_pubs_depuis_blocs_molecule(p_module_cible_id);
  END IF;

  SELECT * INTO b FROM jeupharma.module_blocs WHERE id = p_bloc_id;
  RETURN to_jsonb(b);
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_deplacer_bloc(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_deplacer_bloc(uuid, uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Migration : pubs Programme → payload bloc molecule (si besoin)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  mod RECORD;
  bloc_id uuid;
  mat_ids jsonb;
  vals jsonb;
  existing int;
BEGIN
  FOR mod IN
    SELECT DISTINCT pub.module_id
    FROM jeupharma.publications_connaissances pub
    WHERE pub.actif
  LOOP
    SELECT count(*) INTO existing
    FROM jeupharma.module_blocs b
    WHERE b.module_id = mod.module_id
      AND b.type_bloc = 'molecule'
      AND (
        jsonb_typeof(b.payload_json->'matrice_ids') = 'array'
        AND jsonb_array_length(b.payload_json->'matrice_ids') > 0
        OR nullif(b.payload_json->>'matrice_id', '') IS NOT NULL
        OR (
          b.payload_json ? '_brouillon'
          AND jsonb_typeof(b.payload_json->'_brouillon'->'payload'->'matrice_ids') = 'array'
          AND jsonb_array_length(b.payload_json->'_brouillon'->'payload'->'matrice_ids') > 0
        )
      );

    IF existing > 0 THEN
      -- Enrichir valeurs manquantes sur le premier bloc molecule
      SELECT b.id INTO bloc_id
      FROM jeupharma.module_blocs b
      WHERE b.module_id = mod.module_id AND b.type_bloc = 'molecule'
      ORDER BY b.ordre, b.created_at
      LIMIT 1;

      SELECT coalesce(jsonb_object_agg(sub.matrice_id::text, sub.cids), '{}'::jsonb)
      INTO vals
      FROM (
        SELECT c.matrice_id,
               jsonb_agg(c.id ORDER BY c.ordre) AS cids
        FROM jeupharma.publications_connaissances pub
        JOIN jeupharma.connaissances c ON c.id = pub.connaissance_id AND c.statut = 'valide'
        WHERE pub.module_id = mod.module_id
          AND pub.actif
          AND c.champ_code NOT IN ('dci', 'nom_commercial')
        GROUP BY c.matrice_id
      ) sub;

      UPDATE jeupharma.module_blocs b
      SET payload_json = b.payload_json
            || jsonb_build_object(
              'valeurs',
              coalesce(b.payload_json->'valeurs', '{}'::jsonb) || coalesce(vals, '{}'::jsonb),
              'mode', 'fiche'
            ),
          updated_at = now()
      WHERE b.id = bloc_id
        AND (
          b.payload_json->'valeurs' IS NULL
          OR b.payload_json->'valeurs' = '{}'::jsonb
        );

      CONTINUE;
    END IF;

    -- Créer un bloc molecule depuis les pubs
    SELECT coalesce(
      (SELECT jsonb_agg(x.mid ORDER BY x.mid)
       FROM (
         SELECT DISTINCT c.matrice_id AS mid
         FROM jeupharma.publications_connaissances pub
         JOIN jeupharma.connaissances c ON c.id = pub.connaissance_id AND c.statut = 'valide'
         WHERE pub.module_id = mod.module_id AND pub.actif AND c.matrice_id IS NOT NULL
       ) x),
      '[]'::jsonb
    )
    INTO mat_ids;

    IF mat_ids IS NULL OR jsonb_array_length(mat_ids) = 0 THEN
      CONTINUE;
    END IF;

    SELECT coalesce(jsonb_object_agg(sub.matrice_id::text, sub.cids), '{}'::jsonb)
    INTO vals
    FROM (
      SELECT c.matrice_id,
             jsonb_agg(c.id ORDER BY c.ordre) AS cids
      FROM jeupharma.publications_connaissances pub
      JOIN jeupharma.connaissances c ON c.id = pub.connaissance_id AND c.statut = 'valide'
      WHERE pub.module_id = mod.module_id
        AND pub.actif
        AND c.champ_code NOT IN ('dci', 'nom_commercial')
      GROUP BY c.matrice_id
    ) sub;

    INSERT INTO jeupharma.module_blocs (
      module_id, ordre, type_bloc, titre, payload_json, visible
    )
    SELECT
      mod.module_id,
      coalesce((SELECT max(ordre) + 10 FROM jeupharma.module_blocs WHERE module_id = mod.module_id), 10),
      'molecule',
      'Molécules',
      jsonb_build_object(
        'matrice_ids', mat_ids,
        'matrice_id', mat_ids->0,
        'valeurs', coalesce(vals, '{}'::jsonb),
        'mode', 'fiche'
      ),
      true
    WHERE EXISTS (
      SELECT 1 FROM jeupharma.modules_cours m
      WHERE m.id = mod.module_id AND NOT m.est_groupe
    );
  END LOOP;
END;
$$;

-- Resync pubs pour tous les modules ayant un bloc molecule
DO $$
DECLARE
  mid uuid;
BEGIN
  FOR mid IN
    SELECT DISTINCT module_id
    FROM jeupharma.module_blocs
    WHERE type_bloc = 'molecule'
  LOOP
    PERFORM jeupharma.v2_sync_pubs_depuis_blocs_molecule(mid);
  END LOOP;
END;
$$;
