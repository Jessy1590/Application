-- =============================================================================
-- 059 : Aperçu admin ★N → v2_fiche_resolue / pubs / masque bloc molécule
-- Projet : kpjflntnotftpzffjbud
-- =============================================================================
-- Bug : v2_lecon_joueur résolvait matrice_ids avec p_preview_niveau, mais
-- v2_fiche_resolue filtrait pubs + valeurs payload via niveau d’inscription
-- (souvent ★1) → Eliquis vide, Duoplavin limité à la base.
-- Fix : p_niveau optionnel (admin uniquement) propagé aux 3 RPC.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- v2_connaissances_visibles(+ p_niveau)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS jeupharma.v2_connaissances_visibles(uuid, uuid, uuid[]);

CREATE OR REPLACE FUNCTION jeupharma.v2_connaissances_visibles(
  p_user uuid DEFAULT auth.uid(),
  p_parcours uuid DEFAULT NULL,
  p_module_ids uuid[] DEFAULT NULL,
  p_niveau int DEFAULT NULL
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
DECLARE
  is_admin boolean := jeupharma.is_portail_admin();
  force_niv int := CASE
    WHEN is_admin AND p_niveau IS NOT NULL THEN jeupharma.v2__clamp_niveau(p_niveau)
    ELSE NULL
  END;
BEGIN
  IF p_user IS NULL THEN
    RETURN;
  END IF;
  IF NOT jeupharma.has_jeupharma_access() AND NOT is_admin THEN
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
    WHERE is_admin
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
    SELECT DISTINCT s.module_id AS mid,
           COALESCE(force_niv, c.niveau_parcours) AS niveau_parcours
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

REVOKE ALL ON FUNCTION jeupharma.v2_connaissances_visibles(uuid, uuid, uuid[], int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_connaissances_visibles(uuid, uuid, uuid[], int) TO authenticated;

-- ---------------------------------------------------------------------------
-- v2__entite_ids_depuis_blocs_molecule(+ p_niveau)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS jeupharma.v2__entite_ids_depuis_blocs_molecule(uuid, uuid, uuid, uuid[]);

CREATE OR REPLACE FUNCTION jeupharma.v2__entite_ids_depuis_blocs_molecule(
  p_user uuid,
  p_matrice_id uuid,
  p_parcours uuid DEFAULT NULL,
  p_module_ids uuid[] DEFAULT NULL,
  p_niveau int DEFAULT NULL
)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  is_admin boolean := jeupharma.is_portail_admin();
  force_niv int := CASE
    WHEN is_admin AND p_niveau IS NOT NULL THEN jeupharma.v2__clamp_niveau(p_niveau)
    ELSE NULL
  END;
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
      SELECT DISTINCT s.module_id AS mid,
             COALESCE(force_niv, c.niveau_parcours) AS niveau_parcours
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

REVOKE ALL ON FUNCTION jeupharma.v2__entite_ids_depuis_blocs_molecule(uuid, uuid, uuid, uuid[], int) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- v2_fiche_resolue(+ p_niveau)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS jeupharma.v2_fiche_resolue(uuid, uuid, uuid[]);

CREATE OR REPLACE FUNCTION jeupharma.v2_fiche_resolue(
  p_matrice_id uuid,
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
  via_bloc boolean;
  via_pubs boolean;
  fiche jsonb;
  pub_ids uuid[];
  bloc_ids uuid[];
  champs jsonb;
  niv int := CASE
    WHEN jeupharma.is_portail_admin() AND p_niveau IS NOT NULL
      THEN jeupharma.v2__clamp_niveau(p_niveau)
    ELSE NULL
  END;
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  via_bloc := jeupharma.v2__matrice_liee_bloc(uid, p_matrice_id, p_parcours, p_module_ids);
  via_pubs := EXISTS (
    SELECT 1 FROM jeupharma.v2_connaissances_visibles(uid, p_parcours, p_module_ids, niv) cv
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
  FROM jeupharma.v2_connaissances_visibles(uid, p_parcours, p_module_ids, niv) cv
  WHERE cv.matrice_id = p_matrice_id
    AND cv.entite_id IS NOT NULL;

  bloc_ids := jeupharma.v2__entite_ids_depuis_blocs_molecule(
    uid, p_matrice_id, p_parcours, p_module_ids, niv
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

REVOKE ALL ON FUNCTION jeupharma.v2_fiche_resolue(uuid, uuid, uuid[], int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_fiche_resolue(uuid, uuid, uuid[], int) TO authenticated;
