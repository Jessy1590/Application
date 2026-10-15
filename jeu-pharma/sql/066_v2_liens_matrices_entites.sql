-- =============================================================================
-- 066 : Phase 5 perf — RPC admin `v2_liens_matrices_entites`
-- Projet : kpjflntnotftpzffjbud
-- =============================================================================
-- Remplace les 8 selects jonction du wizard jeux (classement / appariement)
-- par un seul aller-retour.
--
-- Modes :
--   A) p_matrice_ids[]  → { matriceId: { entiteTable: [entityId, …] } }
--   B) p_entite_table + p_entite_ids[] → { entityId: [matriceId, …] }
-- =============================================================================

CREATE OR REPLACE FUNCTION jeupharma.v2_liens_matrices_entites(
  p_matrice_ids uuid[] DEFAULT NULL,
  p_entite_table text DEFAULT NULL,
  p_entite_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  ids uuid[];
  eids uuid[];
  out jsonb := '{}'::jsonb;
  allowed text[] := ARRAY[
    'classes_pharmacologiques',
    'classes_therapeutiques',
    'indications',
    'contre_indications',
    'effets_indesirables',
    'precautions_emploi',
    'interactions',
    'surveillances'
  ];
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;

  -- Mode A : matrices → entités (toutes tables de liaison)
  SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::uuid[])
  INTO ids
  FROM unnest(coalesce(p_matrice_ids, ARRAY[]::uuid[])) AS x
  WHERE x IS NOT NULL;

  IF ids IS NOT NULL AND cardinality(ids) > 0 THEN
    SELECT coalesce(
      jsonb_object_agg(sub.matrice_id::text, sub.tables),
      '{}'::jsonb
    )
    INTO out
    FROM (
      SELECT g.matrice_id,
             jsonb_object_agg(g.entite, g.eids) AS tables
      FROM (
        SELECT l.matrice_id, l.entite,
               jsonb_agg(l.entite_id::text ORDER BY l.ordre) AS eids
        FROM (
          SELECT m.matrice_id, 'classes_pharmacologiques'::text AS entite,
                 m.classe_pharmacologique_id AS entite_id, m.ordre
          FROM jeupharma.matrice_classes_pharmacologiques m
          WHERE m.matrice_id = ANY (ids)
          UNION ALL
          SELECT m.matrice_id, 'classes_therapeutiques',
                 m.classe_therapeutique_id, m.ordre
          FROM jeupharma.matrice_classes_therapeutiques m
          WHERE m.matrice_id = ANY (ids)
          UNION ALL
          SELECT m.matrice_id, 'indications',
                 m.indication_id, m.ordre
          FROM jeupharma.matrice_indications m
          WHERE m.matrice_id = ANY (ids)
          UNION ALL
          SELECT m.matrice_id, 'contre_indications',
                 m.contre_indication_id, m.ordre
          FROM jeupharma.matrice_contre_indications m
          WHERE m.matrice_id = ANY (ids)
          UNION ALL
          SELECT m.matrice_id, 'effets_indesirables',
                 m.effet_indesirable_id, m.ordre
          FROM jeupharma.matrice_effets_indesirables m
          WHERE m.matrice_id = ANY (ids)
          UNION ALL
          SELECT m.matrice_id, 'precautions_emploi',
                 m.precaution_emploi_id, m.ordre
          FROM jeupharma.matrice_precautions_emploi m
          WHERE m.matrice_id = ANY (ids)
          UNION ALL
          SELECT m.matrice_id, 'interactions',
                 m.interaction_id, m.ordre
          FROM jeupharma.matrice_interactions m
          WHERE m.matrice_id = ANY (ids)
          UNION ALL
          SELECT m.matrice_id, 'surveillances',
                 m.surveillance_id, m.ordre
          FROM jeupharma.matrice_surveillances m
          WHERE m.matrice_id = ANY (ids)
        ) l
        WHERE l.entite_id IS NOT NULL
        GROUP BY l.matrice_id, l.entite
      ) g
      GROUP BY g.matrice_id
    ) sub;

    -- Garantir une clé (objet vide) pour chaque matrice demandée
    SELECT coalesce(
      jsonb_object_agg(mid::text, coalesce(out -> mid::text, '{}'::jsonb)),
      '{}'::jsonb
    )
    INTO out
    FROM unnest(ids) AS mid;

    RETURN out;
  END IF;

  -- Mode B : entité(s) → matrices
  IF p_entite_table IS NULL OR NOT (p_entite_table = ANY (allowed)) THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::uuid[])
  INTO eids
  FROM unnest(coalesce(p_entite_ids, ARRAY[]::uuid[])) AS x
  WHERE x IS NOT NULL;

  IF eids IS NULL OR cardinality(eids) = 0 THEN
    RETURN '{}'::jsonb;
  END IF;

  IF p_entite_table = 'classes_pharmacologiques' THEN
    SELECT coalesce(jsonb_object_agg(sub.eid, sub.mids), '{}'::jsonb)
    INTO out
    FROM (
      SELECT e.eid::text AS eid,
             coalesce(
               (SELECT jsonb_agg(m.matrice_id::text ORDER BY m.ordre)
                FROM jeupharma.matrice_classes_pharmacologiques m
                WHERE m.classe_pharmacologique_id = e.eid),
               '[]'::jsonb
             ) AS mids
      FROM unnest(eids) AS e(eid)
    ) sub;
  ELSIF p_entite_table = 'classes_therapeutiques' THEN
    SELECT coalesce(jsonb_object_agg(sub.eid, sub.mids), '{}'::jsonb)
    INTO out
    FROM (
      SELECT e.eid::text AS eid,
             coalesce(
               (SELECT jsonb_agg(m.matrice_id::text ORDER BY m.ordre)
                FROM jeupharma.matrice_classes_therapeutiques m
                WHERE m.classe_therapeutique_id = e.eid),
               '[]'::jsonb
             ) AS mids
      FROM unnest(eids) AS e(eid)
    ) sub;
  ELSIF p_entite_table = 'indications' THEN
    SELECT coalesce(jsonb_object_agg(sub.eid, sub.mids), '{}'::jsonb)
    INTO out
    FROM (
      SELECT e.eid::text AS eid,
             coalesce(
               (SELECT jsonb_agg(m.matrice_id::text ORDER BY m.ordre)
                FROM jeupharma.matrice_indications m
                WHERE m.indication_id = e.eid),
               '[]'::jsonb
             ) AS mids
      FROM unnest(eids) AS e(eid)
    ) sub;
  ELSIF p_entite_table = 'contre_indications' THEN
    SELECT coalesce(jsonb_object_agg(sub.eid, sub.mids), '{}'::jsonb)
    INTO out
    FROM (
      SELECT e.eid::text AS eid,
             coalesce(
               (SELECT jsonb_agg(m.matrice_id::text ORDER BY m.ordre)
                FROM jeupharma.matrice_contre_indications m
                WHERE m.contre_indication_id = e.eid),
               '[]'::jsonb
             ) AS mids
      FROM unnest(eids) AS e(eid)
    ) sub;
  ELSIF p_entite_table = 'effets_indesirables' THEN
    SELECT coalesce(jsonb_object_agg(sub.eid, sub.mids), '{}'::jsonb)
    INTO out
    FROM (
      SELECT e.eid::text AS eid,
             coalesce(
               (SELECT jsonb_agg(m.matrice_id::text ORDER BY m.ordre)
                FROM jeupharma.matrice_effets_indesirables m
                WHERE m.effet_indesirable_id = e.eid),
               '[]'::jsonb
             ) AS mids
      FROM unnest(eids) AS e(eid)
    ) sub;
  ELSIF p_entite_table = 'precautions_emploi' THEN
    SELECT coalesce(jsonb_object_agg(sub.eid, sub.mids), '{}'::jsonb)
    INTO out
    FROM (
      SELECT e.eid::text AS eid,
             coalesce(
               (SELECT jsonb_agg(m.matrice_id::text ORDER BY m.ordre)
                FROM jeupharma.matrice_precautions_emploi m
                WHERE m.precaution_emploi_id = e.eid),
               '[]'::jsonb
             ) AS mids
      FROM unnest(eids) AS e(eid)
    ) sub;
  ELSIF p_entite_table = 'interactions' THEN
    SELECT coalesce(jsonb_object_agg(sub.eid, sub.mids), '{}'::jsonb)
    INTO out
    FROM (
      SELECT e.eid::text AS eid,
             coalesce(
               (SELECT jsonb_agg(m.matrice_id::text ORDER BY m.ordre)
                FROM jeupharma.matrice_interactions m
                WHERE m.interaction_id = e.eid),
               '[]'::jsonb
             ) AS mids
      FROM unnest(eids) AS e(eid)
    ) sub;
  ELSIF p_entite_table = 'surveillances' THEN
    SELECT coalesce(jsonb_object_agg(sub.eid, sub.mids), '{}'::jsonb)
    INTO out
    FROM (
      SELECT e.eid::text AS eid,
             coalesce(
               (SELECT jsonb_agg(m.matrice_id::text ORDER BY m.ordre)
                FROM jeupharma.matrice_surveillances m
                WHERE m.surveillance_id = e.eid),
               '[]'::jsonb
             ) AS mids
      FROM unnest(eids) AS e(eid)
    ) sub;
  END IF;

  RETURN coalesce(out, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_liens_matrices_entites(uuid[], text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_liens_matrices_entites(uuid[], text, uuid[]) TO authenticated;
