-- 054 : corrige l’ambiguïté PL/pgSQL `module_id` dans v2_connaissances_visibles
-- (RETURNS TABLE(... module_id uuid ...) entre en conflit avec les colonnes CTE non qualifiées).
-- Symptôme runtime : "column reference \"module_id\" is ambiguous"
-- → casse v2_fiche_resolue, catalogue joueur, pubs visibles.

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
    SELECT u.mid, u.niveau_parcours FROM unlocked u
    UNION
    SELECT a.mid, a.niveau_parcours FROM admin_requested a
  ),
  scope AS (
    SELECT DISTINCT s.module_id AS mid, c.niveau_parcours
    FROM combined c
    CROSS JOIN LATERAL jeupharma.v2_module_ancetres(c.mid) s
  )
  SELECT c.id,
         c.matrice_id,
         c.champ_code,
         c.entite_id,
         COALESCE(pub.libelle_pedagogique, c.texte) AS texte,
         c.texte_norm,
         pub.ordre,
         pub.module_id,
         pub.libelle_pedagogique
  FROM jeupharma.publications_connaissances pub
  JOIN scope sc ON sc.mid = pub.module_id
  JOIN jeupharma.connaissances c ON c.id = pub.connaissance_id AND c.statut = 'valide'
  JOIN jeupharma.matrice_medicaments m ON m.id = c.matrice_id AND m.statut = 'publie'
  WHERE pub.actif
    AND jeupharma.v2__dans_plage(sc.niveau_parcours, pub.niveau_min, pub.niveau_max)
  ORDER BY c.matrice_id, c.champ_code, pub.ordre;
END;
$$;

GRANT EXECUTE ON FUNCTION jeupharma.v2_connaissances_visibles(uuid, uuid, uuid[]) TO authenticated;

-- Même piège potentiel dans v2__matrice_liee_bloc (CTE module_id) — alias mid
CREATE OR REPLACE FUNCTION jeupharma.v2__matrice_liee_bloc(
  p_user uuid,
  p_matrice_id uuid,
  p_parcours uuid DEFAULT NULL,
  p_module_ids uuid[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  is_admin boolean := jeupharma.is_portail_admin();
BEGIN
  IF p_user IS NULL OR p_matrice_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
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
      SELECT d.module_id AS mid
      FROM parcours_scope ps
      CROSS JOIN LATERAL jeupharma.v2_modules_debloques(p_user, ps.parcours_id) d
      WHERE p_module_ids IS NULL OR d.module_id = ANY (p_module_ids)
    ),
    admin_requested AS (
      SELECT m.id AS mid
      FROM jeupharma.modules_cours m
      WHERE is_admin
        AND p_module_ids IS NOT NULL
        AND cardinality(p_module_ids) > 0
        AND m.id = ANY (p_module_ids)
        AND (p_parcours IS NULL OR m.parcours_id = p_parcours)
    ),
    scope AS (
      SELECT DISTINCT s.module_id AS mid
      FROM (
        SELECT mid FROM unlocked
        UNION
        SELECT mid FROM admin_requested
      ) u
      CROSS JOIN LATERAL jeupharma.v2_module_ancetres(u.mid) s
    )
    SELECT 1
    FROM jeupharma.module_blocs b
    JOIN scope sc ON sc.mid = b.module_id
    WHERE b.type_bloc = 'molecule'
      AND (is_admin OR b.visible)
      AND p_matrice_id = ANY (
        jeupharma.v2__matrice_ids_from_payload(b.payload_json, is_admin)
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2__matrice_liee_bloc(uuid, uuid, uuid, uuid[]) FROM PUBLIC;

-- Brouillon admin avec matrice_ids=[] écrasait les IDs publiés via `||` → via_bloc toujours false.
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
  ids uuid[] := ARRAY[]::uuid[];
  elem text;
  src jsonb;
BEGIN
  base := coalesce(p_payload, '{}'::jsonb) - '_brouillon';
  draft := CASE
    WHEN p_include_brouillon THEN coalesce(p_payload->'_brouillon'->'payload', '{}'::jsonb)
    ELSE '{}'::jsonb
  END;

  -- Union publiée + brouillon (un [] brouillon ne doit pas masquer la version publiée)
  FOREACH src IN ARRAY ARRAY[base, draft]
  LOOP
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
  END LOOP;

  RETURN ids;
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2__matrice_ids_from_payload(jsonb, boolean) FROM PUBLIC;
