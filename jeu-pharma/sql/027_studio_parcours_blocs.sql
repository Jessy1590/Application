-- =============================================================================
-- 027 : Studio parcours — blocs, pubs fines, accès demande/accepte, leçon joueur
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Modules : personnalisation visuelle
-- ---------------------------------------------------------------------------
ALTER TABLE jeupharma.modules_cours
  ADD COLUMN IF NOT EXISTS icone text,
  ADD COLUMN IF NOT EXISTS couleur_accent text,
  ADD COLUMN IF NOT EXISTS couverture_url text,
  ADD COLUMN IF NOT EXISTS statut text NOT NULL DEFAULT 'publie'
    CHECK (statut = ANY (ARRAY['brouillon'::text, 'publie'::text]));

-- ---------------------------------------------------------------------------
-- Blocs de leçon
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jeupharma.module_blocs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES jeupharma.modules_cours(id) ON DELETE CASCADE,
  ordre int NOT NULL DEFAULT 100,
  type_bloc text NOT NULL CHECK (type_bloc = ANY (ARRAY[
    'texte'::text, 'video'::text, 'molecule'::text, 'conseil'::text, 'jeu'::text
  ])),
  titre text,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS module_blocs_module_ordre_idx
  ON jeupharma.module_blocs (module_id, ordre);

ALTER TABLE jeupharma.module_blocs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS module_blocs_select ON jeupharma.module_blocs;
CREATE POLICY module_blocs_select ON jeupharma.module_blocs
  FOR SELECT TO authenticated
  USING (jeupharma.has_jeupharma_access() OR jeupharma.is_portail_admin());

DROP POLICY IF EXISTS module_blocs_admin ON jeupharma.module_blocs;
CREATE POLICY module_blocs_admin ON jeupharma.module_blocs
  FOR ALL TO authenticated
  USING (jeupharma.is_portail_admin())
  WITH CHECK (jeupharma.is_portail_admin());

GRANT SELECT ON jeupharma.module_blocs TO authenticated;
GRANT ALL ON jeupharma.module_blocs TO service_role;

-- ---------------------------------------------------------------------------
-- Inscriptions : demande / accepte / refuse
-- ---------------------------------------------------------------------------
ALTER TABLE jeupharma.inscriptions_parcours
  ADD COLUMN IF NOT EXISTS statut text,
  ADD COLUMN IF NOT EXISTS demande_at timestamptz,
  ADD COLUMN IF NOT EXISTS traite_at timestamptz,
  ADD COLUMN IF NOT EXISTS traite_par uuid REFERENCES portail.profiles(id) ON DELETE SET NULL;

UPDATE jeupharma.inscriptions_parcours
SET statut = CASE WHEN actif THEN 'accepte' ELSE 'demande' END,
    demande_at = coalesce(demande_at, debut_at, now())
WHERE statut IS NULL;

ALTER TABLE jeupharma.inscriptions_parcours
  ALTER COLUMN statut SET DEFAULT 'demande';

ALTER TABLE jeupharma.inscriptions_parcours
  ALTER COLUMN statut SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inscriptions_parcours_statut_check'
  ) THEN
    ALTER TABLE jeupharma.inscriptions_parcours
      ADD CONSTRAINT inscriptions_parcours_statut_check
      CHECK (statut = ANY (ARRAY['demande'::text, 'accepte'::text, 'refuse'::text]));
  END IF;
END $$;

-- Parcours actif = uniquement inscriptions acceptées
CREATE OR REPLACE FUNCTION jeupharma.v2_parcours_actif(p_user uuid DEFAULT auth.uid())
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
  SELECT COALESCE(
    (SELECT p.parcours_id
       FROM jeupharma.profil_apprentissage p
       JOIN jeupharma.inscriptions_parcours i
         ON i.user_id = p.user_id
        AND i.parcours_id = p.parcours_id
        AND i.statut = 'accepte'
        AND i.actif
      WHERE p.user_id = p_user AND p.parcours_id IS NOT NULL),
    (SELECT i.parcours_id
       FROM jeupharma.inscriptions_parcours i
       JOIN jeupharma.parcours_apprentissage pa ON pa.id = i.parcours_id AND pa.actif
      WHERE i.user_id = p_user AND i.actif AND i.statut = 'accepte'
      ORDER BY i.debut_at DESC
      LIMIT 1)
  );
$$;

-- ---------------------------------------------------------------------------
-- Accès parcours
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_demander_parcours(p_parcours_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  row jeupharma.inscriptions_parcours%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jeupharma.parcours_apprentissage WHERE id = p_parcours_id AND actif
  ) THEN
    RAISE EXCEPTION 'Parcours introuvable';
  END IF;

  INSERT INTO jeupharma.inscriptions_parcours (
    user_id, parcours_id, actif, statut, demande_at, debut_at
  ) VALUES (
    auth.uid(), p_parcours_id, false, 'demande', now(), now()
  )
  ON CONFLICT (user_id, parcours_id) DO UPDATE SET
    statut = CASE
      WHEN jeupharma.inscriptions_parcours.statut = 'accepte' THEN 'accepte'
      WHEN jeupharma.inscriptions_parcours.statut = 'refuse' THEN 'demande'
      ELSE 'demande'
    END,
    actif = CASE
      WHEN jeupharma.inscriptions_parcours.statut = 'accepte' THEN true
      ELSE false
    END,
    demande_at = CASE
      WHEN jeupharma.inscriptions_parcours.statut = 'accepte' THEN jeupharma.inscriptions_parcours.demande_at
      ELSE now()
    END
  RETURNING * INTO row;

  RETURN to_jsonb(row);
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_lister_mes_inscriptions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', i.id,
      'parcours_id', i.parcours_id,
      'statut', i.statut,
      'actif', i.actif,
      'demande_at', i.demande_at,
      'code', pa.code,
      'libelle', pa.libelle,
      'description', pa.description,
      'ordre', pa.ordre
    ) ORDER BY pa.ordre)
    FROM jeupharma.inscriptions_parcours i
    JOIN jeupharma.parcours_apprentissage pa ON pa.id = i.parcours_id
    WHERE i.user_id = auth.uid() AND pa.actif
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_lister_demandes_parcours()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', i.id,
      'user_id', i.user_id,
      'parcours_id', i.parcours_id,
      'statut', i.statut,
      'demande_at', i.demande_at,
      'libelle', pa.libelle,
      'code', pa.code,
      'display_name', coalesce(pr.display_name, pr.email, i.user_id::text)
    ) ORDER BY i.demande_at DESC NULLS LAST)
    FROM jeupharma.inscriptions_parcours i
    JOIN jeupharma.parcours_apprentissage pa ON pa.id = i.parcours_id
    LEFT JOIN portail.profiles pr ON pr.id = i.user_id
    WHERE i.statut = 'demande'
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_traiter_demande_parcours(p_id uuid, p_statut text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  row jeupharma.inscriptions_parcours%ROWTYPE;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF p_statut NOT IN ('accepte', 'refuse') THEN
    RAISE EXCEPTION 'Statut invalide';
  END IF;

  UPDATE jeupharma.inscriptions_parcours
  SET statut = p_statut,
      actif = (p_statut = 'accepte'),
      traite_at = now(),
      traite_par = auth.uid()
  WHERE id = p_id
  RETURNING * INTO row;

  IF NOT FOUND THEN RAISE EXCEPTION 'Demande introuvable'; END IF;

  IF p_statut = 'accepte' THEN
    INSERT INTO jeupharma.profil_apprentissage (user_id, parcours_id, updated_at)
    VALUES (row.user_id, row.parcours_id, now())
    ON CONFLICT (user_id) DO UPDATE SET
      parcours_id = EXCLUDED.parcours_id,
      updated_at = now();
  END IF;

  RETURN to_jsonb(row);
END;
$$;

-- ---------------------------------------------------------------------------
-- Modules CRUD
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_upsert_module(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  row jeupharma.modules_cours%ROWTYPE;
  v_id uuid;
  v_code text;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;

  v_id := nullif(p_payload->>'id', '')::uuid;
  v_code := lower(trim(both FROM regexp_replace(
    coalesce(p_payload->>'code', p_payload->>'titre'),
    '[^a-zA-Z0-9]+', '_', 'g'
  )));
  v_code := trim(both '_' FROM v_code);

  IF v_id IS NULL THEN
    INSERT INTO jeupharma.modules_cours (
      parcours_id, parent_id, code, titre, resume, objectifs, ordre,
      publie, est_groupe, prerequis_module_id, created_by, version_publication,
      icone, couleur_accent, couverture_url, statut
    ) VALUES (
      (p_payload->>'parcours_id')::uuid,
      nullif(p_payload->>'parent_id', '')::uuid,
      v_code,
      trim(p_payload->>'titre'),
      coalesce(p_payload->>'resume', ''),
      coalesce(p_payload->>'objectifs', ''),
      coalesce((p_payload->>'ordre')::int, 100),
      coalesce((p_payload->>'publie')::boolean, coalesce(p_payload->>'statut', 'publie') = 'publie'),
      coalesce((p_payload->>'est_groupe')::boolean, false),
      nullif(p_payload->>'prerequis_module_id', '')::uuid,
      auth.uid(),
      1,
      nullif(p_payload->>'icone', ''),
      nullif(p_payload->>'couleur_accent', ''),
      nullif(p_payload->>'couverture_url', ''),
      coalesce(nullif(p_payload->>'statut', ''), 'publie')
    )
    RETURNING * INTO row;
  ELSE
    UPDATE jeupharma.modules_cours SET
      parent_id = coalesce(nullif(p_payload->>'parent_id', '')::uuid, parent_id),
      titre = coalesce(nullif(trim(p_payload->>'titre'), ''), titre),
      resume = coalesce(p_payload->>'resume', resume),
      objectifs = coalesce(p_payload->>'objectifs', objectifs),
      ordre = coalesce((p_payload->>'ordre')::int, ordre),
      publie = coalesce((p_payload->>'publie')::boolean, publie),
      est_groupe = coalesce((p_payload->>'est_groupe')::boolean, est_groupe),
      prerequis_module_id = CASE
        WHEN p_payload ? 'prerequis_module_id' THEN nullif(p_payload->>'prerequis_module_id', '')::uuid
        ELSE prerequis_module_id
      END,
      icone = CASE WHEN p_payload ? 'icone' THEN nullif(p_payload->>'icone', '') ELSE icone END,
      couleur_accent = CASE WHEN p_payload ? 'couleur_accent' THEN nullif(p_payload->>'couleur_accent', '') ELSE couleur_accent END,
      couverture_url = CASE WHEN p_payload ? 'couverture_url' THEN nullif(p_payload->>'couverture_url', '') ELSE couverture_url END,
      statut = coalesce(nullif(p_payload->>'statut', ''), statut),
      updated_at = now()
    WHERE id = v_id
    RETURNING * INTO row;
    IF NOT FOUND THEN RAISE EXCEPTION 'Module introuvable'; END IF;
  END IF;

  RETURN to_jsonb(row);
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_reorder_modules(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  item jsonb;
  n int := 0;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  LOOP
    UPDATE jeupharma.modules_cours
    SET ordre = coalesce((item->>'ordre')::int, ordre),
        parent_id = CASE WHEN item ? 'parent_id' THEN nullif(item->>'parent_id', '')::uuid ELSE parent_id END,
        updated_at = now()
    WHERE id = (item->>'id')::uuid;
    n := n + 1;
  END LOOP;
  RETURN jsonb_build_object('updated', n);
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_supprimer_module(p_module_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  UPDATE jeupharma.modules_cours
  SET publie = false, statut = 'brouillon', updated_at = now()
  WHERE id = p_module_id;
  RETURN jsonb_build_object('id', p_module_id, 'statut', 'brouillon');
END;
$$;

-- ---------------------------------------------------------------------------
-- Blocs CRUD
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_lister_blocs(p_module_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL OR (NOT jeupharma.has_jeupharma_access() AND NOT jeupharma.is_portail_admin()) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(b) ORDER BY b.ordre, b.created_at)
    FROM jeupharma.module_blocs b
    WHERE b.module_id = p_module_id
      AND (b.visible OR jeupharma.is_portail_admin())
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_upsert_bloc(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  row jeupharma.module_blocs%ROWTYPE;
  v_id uuid;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  v_id := nullif(p_payload->>'id', '')::uuid;

  IF v_id IS NULL THEN
    INSERT INTO jeupharma.module_blocs (
      module_id, ordre, type_bloc, titre, payload_json, visible
    ) VALUES (
      (p_payload->>'module_id')::uuid,
      coalesce((p_payload->>'ordre')::int, 100),
      p_payload->>'type_bloc',
      nullif(p_payload->>'titre', ''),
      coalesce(p_payload->'payload_json', '{}'::jsonb),
      coalesce((p_payload->>'visible')::boolean, true)
    )
    RETURNING * INTO row;
  ELSE
    UPDATE jeupharma.module_blocs SET
      ordre = coalesce((p_payload->>'ordre')::int, ordre),
      titre = CASE WHEN p_payload ? 'titre' THEN nullif(p_payload->>'titre', '') ELSE titre END,
      payload_json = coalesce(p_payload->'payload_json', payload_json),
      visible = coalesce((p_payload->>'visible')::boolean, visible),
      updated_at = now()
    WHERE id = v_id
    RETURNING * INTO row;
    IF NOT FOUND THEN RAISE EXCEPTION 'Bloc introuvable'; END IF;
  END IF;
  RETURN to_jsonb(row);
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_reorder_blocs(p_module_id uuid, p_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  i int;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF p_ids IS NULL THEN RETURN jsonb_build_object('updated', 0); END IF;
  FOR i IN 1 .. coalesce(array_length(p_ids, 1), 0) LOOP
    UPDATE jeupharma.module_blocs
    SET ordre = i * 10, updated_at = now()
    WHERE id = p_ids[i] AND module_id = p_module_id;
  END LOOP;
  RETURN jsonb_build_object('updated', coalesce(array_length(p_ids, 1), 0));
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_supprimer_bloc(p_bloc_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  DELETE FROM jeupharma.module_blocs WHERE id = p_bloc_id;
  RETURN jsonb_build_object('id', p_bloc_id, 'deleted', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Publications fines
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_lister_connaissances_matrice(
  p_matrice_id uuid,
  p_module_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'connaissance_id', c.id,
      'champ_code', c.champ_code,
      'texte', c.texte,
      'entite_id', c.entite_id,
      'ordre', c.ordre,
      'publie', EXISTS (
        SELECT 1 FROM jeupharma.publications_connaissances pc
        WHERE pc.module_id = p_module_id
          AND pc.connaissance_id = c.id
          AND pc.actif
      )
    ) ORDER BY c.champ_code, c.ordre, c.texte)
    FROM jeupharma.connaissances c
    WHERE c.matrice_id = p_matrice_id AND c.statut = 'valide'
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_publier_connaissances(
  p_module_id uuid,
  p_connaissance_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  n int;
  mid uuid;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF p_module_id IS NULL OR p_connaissance_ids IS NULL OR cardinality(p_connaissance_ids) = 0 THEN
    RAISE EXCEPTION 'module et connaissances requis';
  END IF;

  -- Forcer identité (nom / dci) des matrices concernées
  INSERT INTO jeupharma.publications_connaissances (module_id, connaissance_id, ordre, publie_par, actif)
  SELECT DISTINCT p_module_id, c_id.id, c_id.ordre, auth.uid(), true
  FROM jeupharma.connaissances c_sel
  JOIN jeupharma.connaissances c_id
    ON c_id.matrice_id = c_sel.matrice_id
   AND c_id.champ_code IN ('nom_commercial', 'dci')
   AND c_id.statut = 'valide'
  WHERE c_sel.id = ANY (p_connaissance_ids)
  ON CONFLICT (module_id, connaissance_id) DO UPDATE SET actif = true, publie_par = auth.uid();

  INSERT INTO jeupharma.publications_connaissances (module_id, connaissance_id, ordre, publie_par, actif)
  SELECT p_module_id, c.id, c.ordre, auth.uid(), true
  FROM jeupharma.connaissances c
  WHERE c.id = ANY (p_connaissance_ids) AND c.statut = 'valide'
  ON CONFLICT (module_id, connaissance_id) DO UPDATE SET actif = true, publie_par = auth.uid();

  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE jeupharma.modules_cours
  SET publie = true, version_publication = version_publication + 1, updated_at = now()
  WHERE id = p_module_id;

  RETURN jsonb_build_object('module_id', p_module_id, 'upserted', n);
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_depublier_connaissances(
  p_module_id uuid,
  p_connaissance_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  n int;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  UPDATE jeupharma.publications_connaissances
  SET actif = false
  WHERE module_id = p_module_id
    AND connaissance_id = ANY (p_connaissance_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('module_id', p_module_id, 'depubliees', n);
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_chercher_matrices(
  p_q text DEFAULT NULL,
  p_secteur_norm text DEFAULT NULL,
  p_indication_norm text DEFAULT NULL,
  p_classe_ther_norm text DEFAULT NULL,
  p_classe_pharma_norm text DEFAULT NULL,
  p_limit int DEFAULT 40
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  lim int := GREATEST(1, LEAST(coalesce(p_limit, 40), 100));
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', x.id,
      'dci', x.dci,
      'noms', x.noms,
      'hospitalier', x.hospitalier,
      'complexe', x.complexe
    ))
    FROM (
      SELECT DISTINCT ON (m.id)
        m.id,
        coalesce(dci.valeur, '') AS dci,
        (
          SELECT string_agg(nc.valeur, ', ' ORDER BY mnc.ordre)
          FROM jeupharma.matrice_noms_commerciaux mnc
          JOIN jeupharma.noms_commerciaux nc ON nc.id = mnc.nom_commercial_id AND nc.actif
          WHERE mnc.matrice_id = m.id
        ) AS noms,
        m.hospitalier,
        m.complexe
      FROM jeupharma.matrice_medicaments m
      LEFT JOIN jeupharma.dcis dci ON dci.id = m.dci_id AND dci.actif
      WHERE m.statut IS DISTINCT FROM 'archive'
        AND (
          p_q IS NULL OR trim(p_q) = ''
          OR dci.valeur_norm ILIKE '%' || lower(trim(p_q)) || '%'
          OR EXISTS (
            SELECT 1 FROM jeupharma.matrice_noms_commerciaux mnc
            JOIN jeupharma.noms_commerciaux nc ON nc.id = mnc.nom_commercial_id
            WHERE mnc.matrice_id = m.id AND nc.valeur_norm ILIKE '%' || lower(trim(p_q)) || '%'
          )
        )
        AND (
          p_secteur_norm IS NULL OR trim(p_secteur_norm) = ''
          OR EXISTS (
            SELECT 1 FROM jeupharma.connaissances c
            JOIN jeupharma.secteurs_therapeutiques s ON s.id = c.entite_id
            WHERE c.matrice_id = m.id AND c.champ_code = 'secteur_therapeutique'
              AND c.statut = 'valide' AND s.valeur_norm = lower(trim(p_secteur_norm))
          )
        )
        AND (
          p_indication_norm IS NULL OR trim(p_indication_norm) = ''
          OR EXISTS (
            SELECT 1 FROM jeupharma.connaissances c
            JOIN jeupharma.indications ind ON ind.id = c.entite_id
            WHERE c.matrice_id = m.id AND c.champ_code = 'indications'
              AND c.statut = 'valide' AND ind.valeur_norm = lower(trim(p_indication_norm))
          )
        )
        AND (
          p_classe_ther_norm IS NULL OR trim(p_classe_ther_norm) = ''
          OR EXISTS (
            SELECT 1 FROM jeupharma.connaissances c
            JOIN jeupharma.classes_therapeutiques ct ON ct.id = c.entite_id
            WHERE c.matrice_id = m.id AND c.champ_code = 'classe_therapeutique'
              AND c.statut = 'valide' AND ct.valeur_norm = lower(trim(p_classe_ther_norm))
          )
        )
        AND (
          p_classe_pharma_norm IS NULL OR trim(p_classe_pharma_norm) = ''
          OR EXISTS (
            SELECT 1 FROM jeupharma.connaissances c
            JOIN jeupharma.classes_pharmacologiques cp ON cp.id = c.entite_id
            WHERE c.matrice_id = m.id AND c.champ_code = 'classe_pharmacologique'
              AND c.statut = 'valide' AND cp.valeur_norm = lower(trim(p_classe_pharma_norm))
          )
        )
      ORDER BY m.id
      LIMIT lim
    ) x
  ), '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- Leçon joueur
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_lecon_joueur(
  p_module_id uuid,
  p_preview boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  m jeupharma.modules_cours%ROWTYPE;
  uid uuid := auth.uid();
  ok boolean;
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT * INTO m FROM jeupharma.modules_cours WHERE id = p_module_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Leçon introuvable'; END IF;

  IF coalesce(p_preview, false) AND jeupharma.is_portail_admin() THEN
    ok := true;
  ELSE
    ok := EXISTS (
      SELECT 1 FROM jeupharma.v2_modules_debloques(uid, m.parcours_id) d
      WHERE d.module_id = p_module_id
    ) OR (
      m.publie AND m.prerequis_module_id IS NULL AND NOT m.est_groupe
      AND EXISTS (
        SELECT 1 FROM jeupharma.inscriptions_parcours i
        WHERE i.user_id = uid AND i.parcours_id = m.parcours_id
          AND i.statut = 'accepte' AND i.actif
      )
    );
  END IF;

  IF NOT ok THEN
    RAISE EXCEPTION 'Leçon verrouillée';
  END IF;

  RETURN jsonb_build_object(
    'module', to_jsonb(m),
    'blocs', coalesce((
      SELECT jsonb_agg(to_jsonb(b) ORDER BY b.ordre, b.created_at)
      FROM jeupharma.module_blocs b
      WHERE b.module_id = p_module_id AND b.visible
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_mon_espace()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN jsonb_build_object(
    'inscriptions', jeupharma.v2_lister_mes_inscriptions(),
    'scores', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id,
        'modele_id', t.modele_id,
        'titre', mj.titre,
        'type_jeu', mj.type_jeu,
        'code_unique', mj.code_unique,
        'score_obtenu', t.score_obtenu,
        'score_max', t.score_max,
        'termine_at', t.termine_at
      ) ORDER BY t.termine_at DESC NULLS LAST)
      FROM jeupharma.tentatives_jeu t
      JOIN jeupharma.modeles_jeu mj ON mj.id = t.modele_id
      WHERE t.utilisateur_id = uid AND t.termine_at IS NOT NULL
      LIMIT 30
    ), '[]'::jsonb),
    'progression', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'module_id', pm.module_id,
        'statut', pm.statut,
        'titre', mc.titre,
        'parcours_id', mc.parcours_id
      ))
      FROM jeupharma.progression_modules pm
      JOIN jeupharma.modules_cours mc ON mc.id = pm.module_id
      WHERE pm.user_id = uid
    ), '[]'::jsonb)
  );
END;
$$;

-- Grants
REVOKE ALL ON FUNCTION jeupharma.v2_demander_parcours(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_lister_mes_inscriptions() FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_lister_demandes_parcours() FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_traiter_demande_parcours(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_upsert_module(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_reorder_modules(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_supprimer_module(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_lister_blocs(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_upsert_bloc(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_reorder_blocs(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_supprimer_bloc(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_lister_connaissances_matrice(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_publier_connaissances(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_depublier_connaissances(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_chercher_matrices(text, text, text, text, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_lecon_joueur(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_mon_espace() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION jeupharma.v2_demander_parcours(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_lister_mes_inscriptions() TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_lister_demandes_parcours() TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_traiter_demande_parcours(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_upsert_module(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_reorder_modules(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_supprimer_module(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_lister_blocs(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_upsert_bloc(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_reorder_blocs(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_supprimer_bloc(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_lister_connaissances_matrice(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_publier_connaissances(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_depublier_connaissances(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_chercher_matrices(text, text, text, text, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_lecon_joueur(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_mon_espace() TO authenticated;
