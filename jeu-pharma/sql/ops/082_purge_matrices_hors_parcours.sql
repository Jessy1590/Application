-- =============================================================================
-- Ops 082 — Purge matrices archive + hors parcours
-- Projet : kpjflntnotftpzffjbud
--
-- Supprime physiquement (DELETE) :
--   1) Toute matrice statut = 'archive'
--   2) Toute matrice absente de tous les module_blocs.payload_json.matrice_ids
--      (racine + variantes[*].matrice_ids)
--
-- Conserve :
--   - Les monos composants d'une association ENCORE référencée dans un parcours
--     (même hors liste seule / même archive) — sinon l'asso casse (RESTRICT)
--   - Les entités partagées (indications, classes…) : aucune purge orpheline
--
-- Avant DELETE :
--   - Nettoie matrice_ids / valeurs (racine + variantes) des blocs JSON
--   - Coupe les liens matrice_composants impliquant les ids à supprimer
--     (évite RESTRICT sur composant_matrice_id)
--
-- CASCADE : jonctions matrice_*, connaissances (+ pubs / revisions / alias),
--           scores_fiche_aleatoire, ops_regen_log.
-- Idempotent.
-- =============================================================================

DO $ops$
DECLARE
  n_total_avant       bigint;
  n_archive_avant     bigint;
  n_hors_brut_avant   bigint;
  n_composants_gardes bigint;
  n_a_supprimer       bigint;
  n_blocs_nettoyes    int := 0;
  n_liens_composants  int := 0;
  n_deleted           int := 0;
  n_total_apres       bigint;
  n_archive_apres     bigint;
  n_hors_apres        bigint;
BEGIN
  -- -------------------------------------------------------------------------
  -- 1) Inventaire (temp)
  -- -------------------------------------------------------------------------
  CREATE TEMP TABLE _082_referenced ON COMMIT DROP AS
  SELECT DISTINCT (elem)::uuid AS matrice_id
  FROM jeupharma.module_blocs b
  CROSS JOIN LATERAL jsonb_array_elements_text(
    coalesce(b.payload_json->'matrice_ids', '[]'::jsonb)
  ) AS elem
  WHERE jsonb_typeof(b.payload_json->'matrice_ids') = 'array'
    AND elem ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  UNION
  SELECT DISTINCT (elem)::uuid AS matrice_id
  FROM jeupharma.module_blocs b
  CROSS JOIN LATERAL jsonb_each(
    coalesce(b.payload_json->'variantes', '{}'::jsonb)
  ) AS v(k, val)
  CROSS JOIN LATERAL jsonb_array_elements_text(
    coalesce(val->'matrice_ids', '[]'::jsonb)
  ) AS elem
  WHERE jsonb_typeof(coalesce(b.payload_json->'variantes', '{}'::jsonb)) = 'object'
    AND jsonb_typeof(val->'matrice_ids') = 'array'
    AND elem ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  CREATE TEMP TABLE _082_keep_composants ON COMMIT DROP AS
  SELECT DISTINCT mc.composant_matrice_id AS matrice_id
  FROM jeupharma.matrice_composants mc
  JOIN _082_referenced r ON r.matrice_id = mc.matrice_id;

  CREATE TEMP TABLE _082_to_delete ON COMMIT DROP AS
  SELECT m.id, m.statut
  FROM jeupharma.matrice_medicaments m
  WHERE (
      m.statut = 'archive'
      OR m.id NOT IN (SELECT matrice_id FROM _082_referenced)
    )
    AND m.id NOT IN (SELECT matrice_id FROM _082_keep_composants);

  SELECT count(*) INTO n_total_avant FROM jeupharma.matrice_medicaments;
  SELECT count(*) INTO n_archive_avant
  FROM jeupharma.matrice_medicaments WHERE statut = 'archive';
  SELECT count(*) INTO n_hors_brut_avant
  FROM jeupharma.matrice_medicaments m
  WHERE m.id NOT IN (SELECT matrice_id FROM _082_referenced)
    AND m.statut IS DISTINCT FROM 'archive';
  SELECT count(*) INTO n_composants_gardes
  FROM _082_keep_composants kc
  WHERE kc.matrice_id NOT IN (SELECT matrice_id FROM _082_referenced);
  SELECT count(*) INTO n_a_supprimer FROM _082_to_delete;

  RAISE NOTICE '082 inventaire: total=% archive=% hors_parcours_brut=% composants_gardes_hors_liste=% a_supprimer=%',
    n_total_avant, n_archive_avant, n_hors_brut_avant, n_composants_gardes, n_a_supprimer;

  IF n_a_supprimer = 0 THEN
    RAISE NOTICE '082: rien à supprimer — abort clean';
    RETURN;
  END IF;

  -- Garde-fou : aucun id à supprimer ne doit être composant d'une asso conservée
  IF EXISTS (
    SELECT 1
    FROM _082_to_delete td
    JOIN jeupharma.matrice_composants mc ON mc.composant_matrice_id = td.id
    WHERE mc.matrice_id NOT IN (SELECT id FROM _082_to_delete)
  ) THEN
    RAISE EXCEPTION '082: RESTRICT — un composant à supprimer est lié à une asso conservée';
  END IF;

  -- -------------------------------------------------------------------------
  -- 2) Nettoyage JSON blocs (matrice_ids + valeurs, racine + variantes)
  -- -------------------------------------------------------------------------
  WITH cleaned AS (
    SELECT
      b.id,
      (
        SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY ord), '[]'::jsonb)
        FROM (
          SELECT e AS x, ord
          FROM jsonb_array_elements_text(
            coalesce(b.payload_json->'matrice_ids', '[]'::jsonb)
          ) WITH ORDINALITY AS t(e, ord)
          WHERE NOT (
            e ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND e::uuid IN (SELECT id FROM _082_to_delete)
          )
        ) s
      ) AS new_matrice_ids,
      (
        SELECT coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
        FROM jsonb_each(coalesce(b.payload_json->'valeurs', '{}'::jsonb)) AS kv(k, v)
        WHERE NOT (
          k ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND k::uuid IN (SELECT id FROM _082_to_delete)
        )
      ) AS new_valeurs,
      CASE
        WHEN jsonb_typeof(coalesce(b.payload_json->'variantes', 'null'::jsonb)) <> 'object'
          THEN coalesce(b.payload_json->'variantes', 'null'::jsonb)
        ELSE (
          SELECT coalesce(jsonb_object_agg(vk, (
            CASE
              WHEN jsonb_typeof(vv) <> 'object' THEN vv
              ELSE (
                vv
                || jsonb_build_object(
                  'matrice_ids', (
                    SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY ord), '[]'::jsonb)
                    FROM (
                      SELECT e AS x, ord
                      FROM jsonb_array_elements_text(
                        coalesce(vv->'matrice_ids', '[]'::jsonb)
                      ) WITH ORDINALITY AS t(e, ord)
                      WHERE NOT (
                        e ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                        AND e::uuid IN (SELECT id FROM _082_to_delete)
                      )
                    ) s
                  ),
                  'valeurs', (
                    SELECT coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
                    FROM jsonb_each(coalesce(vv->'valeurs', '{}'::jsonb)) AS kv(k, v)
                    WHERE NOT (
                      k ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                      AND k::uuid IN (SELECT id FROM _082_to_delete)
                    )
                  )
                )
              )
            END
          )), '{}'::jsonb)
          FROM jsonb_each(b.payload_json->'variantes') AS var(vk, vv)
        )
      END AS new_variantes
    FROM jeupharma.module_blocs b
    WHERE
      EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(coalesce(b.payload_json->'matrice_ids', '[]'::jsonb)) e
        WHERE e ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND e::uuid IN (SELECT id FROM _082_to_delete)
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_object_keys(coalesce(b.payload_json->'valeurs', '{}'::jsonb)) k
        WHERE k ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND k::uuid IN (SELECT id FROM _082_to_delete)
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_each(coalesce(b.payload_json->'variantes', '{}'::jsonb)) AS v(vk, vv)
        CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(vv->'matrice_ids', '[]'::jsonb)) e
        WHERE e ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND e::uuid IN (SELECT id FROM _082_to_delete)
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_each(coalesce(b.payload_json->'variantes', '{}'::jsonb)) AS v(vk, vv)
        CROSS JOIN LATERAL jsonb_object_keys(coalesce(vv->'valeurs', '{}'::jsonb)) k
        WHERE k ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND k::uuid IN (SELECT id FROM _082_to_delete)
      )
  )
  UPDATE jeupharma.module_blocs b
  SET
    payload_json = (
      coalesce(b.payload_json, '{}'::jsonb)
      || jsonb_build_object(
        'matrice_ids', c.new_matrice_ids,
        'valeurs', c.new_valeurs
      )
      || CASE
           WHEN c.new_variantes IS NULL OR c.new_variantes = 'null'::jsonb
             THEN '{}'::jsonb
           ELSE jsonb_build_object('variantes', c.new_variantes)
         END
    ),
    updated_at = now()
  FROM cleaned c
  WHERE b.id = c.id;

  GET DIAGNOSTICS n_blocs_nettoyes = ROW_COUNT;

  -- -------------------------------------------------------------------------
  -- 3) Couper liens composants impliquant les ids à supprimer
  -- -------------------------------------------------------------------------
  DELETE FROM jeupharma.matrice_composants mc
  WHERE mc.matrice_id IN (SELECT id FROM _082_to_delete)
     OR mc.composant_matrice_id IN (SELECT id FROM _082_to_delete);

  GET DIAGNOSTICS n_liens_composants = ROW_COUNT;

  -- -------------------------------------------------------------------------
  -- 4) DELETE physiques matrices
  -- -------------------------------------------------------------------------
  DELETE FROM jeupharma.matrice_medicaments m
  WHERE m.id IN (SELECT id FROM _082_to_delete);

  GET DIAGNOSTICS n_deleted = ROW_COUNT;

  -- -------------------------------------------------------------------------
  -- 5) Contrôles post
  -- -------------------------------------------------------------------------
  SELECT count(*) INTO n_total_apres FROM jeupharma.matrice_medicaments;
  SELECT count(*) INTO n_archive_apres
  FROM jeupharma.matrice_medicaments WHERE statut = 'archive';

  SELECT count(*) INTO n_hors_apres
  FROM jeupharma.matrice_medicaments m
  WHERE m.id NOT IN (
      SELECT DISTINCT (elem)::uuid
      FROM jeupharma.module_blocs b
      CROSS JOIN LATERAL jsonb_array_elements_text(
        coalesce(b.payload_json->'matrice_ids', '[]'::jsonb)
      ) AS elem
      WHERE jsonb_typeof(b.payload_json->'matrice_ids') = 'array'
        AND elem ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      UNION
      SELECT DISTINCT (elem)::uuid
      FROM jeupharma.module_blocs b
      CROSS JOIN LATERAL jsonb_each(
        coalesce(b.payload_json->'variantes', '{}'::jsonb)
      ) AS v(k, val)
      CROSS JOIN LATERAL jsonb_array_elements_text(
        coalesce(val->'matrice_ids', '[]'::jsonb)
      ) AS elem
      WHERE jsonb_typeof(coalesce(b.payload_json->'variantes', '{}'::jsonb)) = 'object'
        AND jsonb_typeof(val->'matrice_ids') = 'array'
        AND elem ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
    AND m.id NOT IN (
      SELECT DISTINCT mc.composant_matrice_id
      FROM jeupharma.matrice_composants mc
      WHERE mc.matrice_id IN (
        SELECT DISTINCT (elem)::uuid
        FROM jeupharma.module_blocs b
        CROSS JOIN LATERAL jsonb_array_elements_text(
          coalesce(b.payload_json->'matrice_ids', '[]'::jsonb)
        ) AS elem
        WHERE jsonb_typeof(b.payload_json->'matrice_ids') = 'array'
          AND elem ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        UNION
        SELECT DISTINCT (elem)::uuid
        FROM jeupharma.module_blocs b
        CROSS JOIN LATERAL jsonb_each(
          coalesce(b.payload_json->'variantes', '{}'::jsonb)
        ) AS v(k, val)
        CROSS JOIN LATERAL jsonb_array_elements_text(
          coalesce(val->'matrice_ids', '[]'::jsonb)
        ) AS elem
        WHERE jsonb_typeof(coalesce(b.payload_json->'variantes', '{}'::jsonb)) = 'object'
          AND jsonb_typeof(val->'matrice_ids') = 'array'
          AND elem ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      )
    );

  IF n_archive_apres <> 0 THEN
    RAISE EXCEPTION '082: archive restantes après purge (%)', n_archive_apres;
  END IF;

  IF n_deleted <> n_a_supprimer THEN
    RAISE EXCEPTION '082: deleted=% attendu=%', n_deleted, n_a_supprimer;
  END IF;

  RAISE NOTICE '082 done: blocs_nettoyes=% liens_composants=% deleted=% total %→% archive %→% hors_restant=%',
    n_blocs_nettoyes, n_liens_composants, n_deleted,
    n_total_avant, n_total_apres, n_archive_avant, n_archive_apres, n_hors_apres;
END;
$ops$;
