-- =============================================================================
-- 080 : Carrousel associations — composants (+ entite_ids) dans fiches résolues
--
-- v2_fiche_resolue (077) avait déjà `composants` ; le bulk joueur
-- `v2_fiches_resolues` ne les exposait pas → UI carrousel aveugle.
-- Ajoute aussi `entite_ids` par composant pour colorer les chips publiés
-- (match entite_id) sans exposer le RCP non publié des monos.
-- =============================================================================

CREATE OR REPLACE FUNCTION jeupharma.v2__composants_fiche(p_matrice_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
  SELECT coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', c.composant_matrice_id,
          'dci', d.valeur,
          'ordre', c.ordre,
          'couleur', c.couleur,
          'entite_ids', coalesce((
            SELECT jsonb_agg(to_jsonb(eid))
            FROM (
              SELECT DISTINCT eid FROM (
                SELECT unnest(ARRAY[
                  m.dci_id,
                  m.secteur_therapeutique_id,
                  m.classe_therapeutique_id,
                  m.classe_pharmacologique_id,
                  m.detail_pharmacologie_id,
                  m.posologie_generale_id,
                  m.grossesse_allaitement_id
                ]) AS eid
                UNION ALL
                SELECT j.indication_id FROM jeupharma.matrice_indications j WHERE j.matrice_id = m.id
                UNION ALL
                SELECT j.contre_indication_id FROM jeupharma.matrice_contre_indications j WHERE j.matrice_id = m.id
                UNION ALL
                SELECT j.effet_indesirable_id FROM jeupharma.matrice_effets_indesirables j WHERE j.matrice_id = m.id
                UNION ALL
                SELECT j.precaution_emploi_id FROM jeupharma.matrice_precautions_emploi j WHERE j.matrice_id = m.id
                UNION ALL
                SELECT j.interaction_id FROM jeupharma.matrice_interactions j WHERE j.matrice_id = m.id
                UNION ALL
                SELECT j.surveillance_id FROM jeupharma.matrice_surveillances j WHERE j.matrice_id = m.id
              ) raw
              WHERE eid IS NOT NULL
            ) q
          ), '[]'::jsonb)
        )
        ORDER BY c.ordre, d.valeur
      )
      FROM jeupharma.matrice_composants c
      JOIN jeupharma.matrice_medicaments m ON m.id = c.composant_matrice_id
      JOIN jeupharma.dcis d ON d.id = m.dci_id
      WHERE c.matrice_id = p_matrice_id
        AND d.actif
        AND coalesce(m.statut, '') <> 'archive'
    ),
    '[]'::jsonb
  );
$$;

REVOKE ALL ON FUNCTION jeupharma.v2__composants_fiche(uuid) FROM PUBLIC;

-- Singulier
CREATE OR REPLACE FUNCTION jeupharma.v2_fiche_resolue(
  p_matrice_id uuid,
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
      'source', 'matrice',
      'composants', jeupharma.v2__composants_fiche(p_matrice_id)
    );
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_fiche_resolue(uuid, uuid, uuid[], int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_fiche_resolue(uuid, uuid, uuid[], int) TO authenticated;

-- Bulk (lecteur carrousel)
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
          'source', 'matrice',
          'composants', jeupharma.v2__composants_fiche(mid)
        )
    );
  END LOOP;

  RETURN out;
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_fiches_resolues(uuid[], uuid, uuid[], int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_fiches_resolues(uuid[], uuid, uuid[], int) TO authenticated;
