-- =============================================================================
-- 077 — Associations : jonction matrice_composants + RPC + backfill initial
-- Projet remote : kpjflntnotftpzffjbud
-- Phase 1 Cardio DEUST — schéma + base UI/RPC (pas de liaisons leçons / RCP / jeux).
--
-- Tagging champs source 'asso'|'composant' : reporté (contrat joueur inchangé) ;
-- v2_fiche_resolue ajoute seulement le tableau `composants`.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS jeupharma.matrice_composants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matrice_id uuid NOT NULL REFERENCES jeupharma.matrice_medicaments(id) ON DELETE CASCADE,
  composant_matrice_id uuid NOT NULL REFERENCES jeupharma.matrice_medicaments(id) ON DELETE RESTRICT,
  ordre int NOT NULL DEFAULT 0,
  couleur text NULL,
  CONSTRAINT matrice_composants_unique UNIQUE (matrice_id, composant_matrice_id),
  CONSTRAINT matrice_composants_no_self CHECK (matrice_id <> composant_matrice_id)
);

CREATE INDEX IF NOT EXISTS matrice_composants_matrice_idx
  ON jeupharma.matrice_composants (matrice_id);

CREATE INDEX IF NOT EXISTS matrice_composants_composant_idx
  ON jeupharma.matrice_composants (composant_matrice_id);

COMMENT ON TABLE jeupharma.matrice_composants IS
  'Liaison fiche association → fiches mono composants (ordre pédagogique ; couleur optionnelle).';

-- ---------------------------------------------------------------------------
-- 2. RLS (modèle matrice_classes_* / matrice_indications)
-- ---------------------------------------------------------------------------

ALTER TABLE jeupharma.matrice_composants ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON jeupharma.matrice_composants TO authenticated;
GRANT ALL ON jeupharma.matrice_composants TO service_role;

DROP POLICY IF EXISTS matrice_composants_select ON jeupharma.matrice_composants;
CREATE POLICY matrice_composants_select
  ON jeupharma.matrice_composants
  FOR SELECT TO authenticated
  USING (jeupharma.has_jeupharma_access());

DROP POLICY IF EXISTS matrice_composants_admin ON jeupharma.matrice_composants;
CREATE POLICY matrice_composants_admin
  ON jeupharma.matrice_composants
  FOR ALL TO authenticated
  USING (jeupharma.is_portail_admin())
  WITH CHECK (jeupharma.is_portail_admin());

-- ---------------------------------------------------------------------------
-- 3. Helper : liste composants (jsonb)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION jeupharma.v2_matrice_composants(p_matrice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF p_matrice_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Admin : tout. Joueur : seulement si la fiche association est publiée
  -- (même barrière que matrice_select hors admin).
  IF NOT jeupharma.is_portail_admin() THEN
    IF NOT EXISTS (
      SELECT 1 FROM jeupharma.matrice_medicaments m
      WHERE m.id = p_matrice_id AND m.statut = 'publie'
    ) THEN
      RETURN '[]'::jsonb;
    END IF;
  END IF;

  RETURN coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', c.composant_matrice_id,
          'dci', d.valeur,
          'ordre', c.ordre,
          'couleur', c.couleur
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
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_matrice_composants(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_matrice_composants(uuid) TO authenticated;

COMMENT ON FUNCTION jeupharma.v2_matrice_composants(uuid) IS
  'Composants d’une fiche association : [{id,dci,ordre,couleur}].';

-- ---------------------------------------------------------------------------
-- 4. Étendre v2_fiche_resolue : ajouter `composants` (sans tagging champs)
-- ---------------------------------------------------------------------------

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
  composants jsonb;
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

  -- Accès fiche déjà validé : lire composants sans re-check admin/publie.
  composants := coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', c.composant_matrice_id,
          'dci', d.valeur,
          'ordre', c.ordre,
          'couleur', c.couleur
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

  RETURN (fiche - 'champs')
    || jsonb_build_object(
      'champs', champs,
      'source', 'matrice',
      'composants', composants
    );
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_fiche_resolue(uuid, uuid, uuid[], int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_fiche_resolue(uuid, uuid, uuid[], int) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Backfill : DCI contenant ' + ' → matcher monos par valeur_norm
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
  part text;
  part_norm text;
  ord int;
  mono_id uuid;
  n_ins int := 0;
  n_skip int := 0;
  n_row int;
BEGIN
  FOR r IN
    SELECT m.id AS matrice_id, d.valeur AS dci
    FROM jeupharma.matrice_medicaments m
    JOIN jeupharma.dcis d ON d.id = m.dci_id
    WHERE d.actif
      AND position(' + ' in d.valeur) > 0
      AND coalesce(m.statut, '') <> 'archive'
    ORDER BY d.valeur
  LOOP
    ord := 0;
    FOREACH part IN ARRAY string_to_array(r.dci, ' + ')
    LOOP
      part := trim(both FROM part);
      IF part = '' THEN
        CONTINUE;
      END IF;
      part_norm := jeupharma.normaliser_valeur(part);

      SELECT m2.id INTO mono_id
      FROM jeupharma.matrice_medicaments m2
      JOIN jeupharma.dcis d2 ON d2.id = m2.dci_id
      WHERE d2.actif
        AND d2.valeur_norm = part_norm
        AND position(' + ' in d2.valeur) = 0
        AND coalesce(m2.statut, '') <> 'archive'
      ORDER BY CASE m2.statut WHEN 'publie' THEN 0 WHEN 'brouillon' THEN 1 ELSE 2 END, m2.id
      LIMIT 1;

      IF mono_id IS NULL THEN
        n_skip := n_skip + 1;
        RAISE NOTICE '077 backfill skip: asso=% part=% (mono manquant)', r.dci, part;
      ELSIF mono_id = r.matrice_id THEN
        n_skip := n_skip + 1;
        RAISE NOTICE '077 backfill skip self: asso=%', r.dci;
      ELSE
        INSERT INTO jeupharma.matrice_composants (matrice_id, composant_matrice_id, ordre)
        VALUES (r.matrice_id, mono_id, ord)
        ON CONFLICT (matrice_id, composant_matrice_id) DO NOTHING;
        GET DIAGNOSTICS n_row = ROW_COUNT;
        n_ins := n_ins + n_row;
      END IF;
      ord := ord + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE '077 backfill: % liens insérés, % skips (mono manquant)', n_ins, n_skip;
END;
$$;
