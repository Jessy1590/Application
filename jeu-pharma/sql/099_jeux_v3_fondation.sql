-- =============================================================================
-- 099 : Jeux V3 — fondation (à côté de modeles_jeu)
-- Tables jeux / pool / tentatives + RLS + RPC création / archive-on-edit / statut
-- =============================================================================

CREATE TABLE IF NOT EXISTS jeupharma.jeux (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_unique text NOT NULL UNIQUE,
  famille_code text NOT NULL,
  revision int NOT NULL DEFAULT 1,
  type_jeu text NOT NULL CHECK (type_jeu = ANY (ARRAY[
    'quiz'::text, 'trous'::text, 'ordonnance'::text, 'fiche_aleatoire'::text,
    'classement'::text, 'appariement'::text
  ])),
  titre text NOT NULL,
  parcours_id uuid REFERENCES jeupharma.parcours_apprentissage(id) ON DELETE SET NULL,
  module_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  statut text NOT NULL DEFAULT 'actif' CHECK (statut = ANY (ARRAY[
    'actif'::text, 'pause'::text, 'archive'::text
  ])),
  archive_de_jeu_id uuid REFERENCES jeupharma.jeux(id) ON DELETE SET NULL,
  created_by uuid REFERENCES portail.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jeux_code_live_format CHECK (
    (statut <> 'archive' AND code_unique ~ '^JP-[A-Z0-9]{5}$')
    OR (statut = 'archive' AND code_unique ~ '^JP-[A-Z0-9]{5}-A[0-9]+$')
  ),
  CONSTRAINT jeux_famille_format CHECK (famille_code ~ '^JP-[A-Z0-9]{5}$')
);

CREATE INDEX IF NOT EXISTS jeux_type_statut_idx ON jeupharma.jeux (type_jeu, statut);
CREATE INDEX IF NOT EXISTS jeux_parcours_idx ON jeupharma.jeux (parcours_id);
CREATE INDEX IF NOT EXISTS jeux_famille_idx ON jeupharma.jeux (famille_code, revision DESC);

CREATE TABLE IF NOT EXISTS jeupharma.jeux_pool (
  jeu_id uuid PRIMARY KEY REFERENCES jeupharma.jeux(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode = ANY (ARRAY[
    'lecons'::text, 'blocs'::text, 'molecules'::text
  ])),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jeupharma.jeux_pool_modules (
  jeu_id uuid NOT NULL REFERENCES jeupharma.jeux(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES jeupharma.modules_cours(id) ON DELETE CASCADE,
  PRIMARY KEY (jeu_id, module_id)
);

CREATE TABLE IF NOT EXISTS jeupharma.jeux_pool_blocs (
  jeu_id uuid NOT NULL REFERENCES jeupharma.jeux(id) ON DELETE CASCADE,
  bloc_id uuid NOT NULL REFERENCES jeupharma.module_blocs(id) ON DELETE CASCADE,
  PRIMARY KEY (jeu_id, bloc_id)
);

CREATE TABLE IF NOT EXISTS jeupharma.jeux_pool_molecules (
  jeu_id uuid NOT NULL REFERENCES jeupharma.jeux(id) ON DELETE CASCADE,
  matrice_id uuid NOT NULL REFERENCES jeupharma.matrice_medicaments(id) ON DELETE CASCADE,
  PRIMARY KEY (jeu_id, matrice_id)
);

CREATE TABLE IF NOT EXISTS jeupharma.jeux_tentatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jeu_id uuid NOT NULL REFERENCES jeupharma.jeux(id) ON DELETE CASCADE,
  utilisateur_id uuid NOT NULL REFERENCES portail.profiles(id) ON DELETE CASCADE,
  contexte text NOT NULL DEFAULT 'classique' CHECK (contexte = ANY (ARRAY[
    'classique'::text, 'examen'::text
  ])),
  passage_id uuid,
  snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  reponses_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  details_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  score_obtenu numeric,
  score_max numeric,
  notation text NOT NULL DEFAULT 'serveur' CHECK (notation = ANY (ARRAY[
    'serveur'::text, 'declaree'::text
  ])),
  relecture text NOT NULL DEFAULT 'aucune' CHECK (relecture = ANY (ARRAY[
    'aucune'::text, 'en_attente'::text, 'faite'::text
  ])),
  score_provisoire numeric,
  score_officiel numeric,
  revele_at timestamptz,
  termine_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jeux_tentatives_user_idx
  ON jeupharma.jeux_tentatives (utilisateur_id, created_at DESC);
CREATE INDEX IF NOT EXISTS jeux_tentatives_jeu_idx
  ON jeupharma.jeux_tentatives (jeu_id, created_at DESC);
CREATE INDEX IF NOT EXISTS jeux_tentatives_relecture_idx
  ON jeupharma.jeux_tentatives (relecture)
  WHERE relecture = 'en_attente';

DROP TRIGGER IF EXISTS trg_jeux_set_updated_at ON jeupharma.jeux;
CREATE TRIGGER trg_jeux_set_updated_at
  BEFORE UPDATE ON jeupharma.jeux
  FOR EACH ROW EXECUTE FUNCTION jeupharma.set_updated_at();

ALTER TABLE jeupharma.jeux ENABLE ROW LEVEL SECURITY;
ALTER TABLE jeupharma.jeux_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE jeupharma.jeux_pool_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE jeupharma.jeux_pool_blocs ENABLE ROW LEVEL SECURITY;
ALTER TABLE jeupharma.jeux_pool_molecules ENABLE ROW LEVEL SECURITY;
ALTER TABLE jeupharma.jeux_tentatives ENABLE ROW LEVEL SECURITY;

-- Accès lecture : actif (ou admin tout) ; lab = admin only via parcours
DROP POLICY IF EXISTS jeux_admin ON jeupharma.jeux;
CREATE POLICY jeux_admin ON jeupharma.jeux
  FOR ALL TO authenticated
  USING (jeupharma.is_portail_admin())
  WITH CHECK (jeupharma.is_portail_admin());

DROP POLICY IF EXISTS jeux_select ON jeupharma.jeux;
CREATE POLICY jeux_select ON jeupharma.jeux
  FOR SELECT TO authenticated
  USING (
    jeupharma.has_jeupharma_access()
    AND statut = 'actif'
    AND (
      parcours_id IS NULL
      OR EXISTS (
        SELECT 1 FROM jeupharma.parcours_apprentissage pa
        WHERE pa.id = parcours_id
          AND pa.actif
          AND (NOT pa.est_laboratoire OR jeupharma.is_portail_admin())
      )
    )
  );

DROP POLICY IF EXISTS jeux_pool_admin ON jeupharma.jeux_pool;
CREATE POLICY jeux_pool_admin ON jeupharma.jeux_pool
  FOR ALL TO authenticated
  USING (jeupharma.is_portail_admin())
  WITH CHECK (jeupharma.is_portail_admin());

DROP POLICY IF EXISTS jeux_pool_select ON jeupharma.jeux_pool;
CREATE POLICY jeux_pool_select ON jeupharma.jeux_pool
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM jeupharma.jeux j
      WHERE j.id = jeu_id AND j.statut = 'actif'
        AND jeupharma.has_jeupharma_access()
    )
  );

DROP POLICY IF EXISTS jeux_pool_modules_admin ON jeupharma.jeux_pool_modules;
CREATE POLICY jeux_pool_modules_admin ON jeupharma.jeux_pool_modules
  FOR ALL TO authenticated
  USING (jeupharma.is_portail_admin())
  WITH CHECK (jeupharma.is_portail_admin());
DROP POLICY IF EXISTS jeux_pool_modules_select ON jeupharma.jeux_pool_modules;
CREATE POLICY jeux_pool_modules_select ON jeupharma.jeux_pool_modules
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM jeupharma.jeux j WHERE j.id = jeu_id AND j.statut = 'actif' AND jeupharma.has_jeupharma_access()));

DROP POLICY IF EXISTS jeux_pool_blocs_admin ON jeupharma.jeux_pool_blocs;
CREATE POLICY jeux_pool_blocs_admin ON jeupharma.jeux_pool_blocs
  FOR ALL TO authenticated
  USING (jeupharma.is_portail_admin())
  WITH CHECK (jeupharma.is_portail_admin());
DROP POLICY IF EXISTS jeux_pool_blocs_select ON jeupharma.jeux_pool_blocs;
CREATE POLICY jeux_pool_blocs_select ON jeupharma.jeux_pool_blocs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM jeupharma.jeux j WHERE j.id = jeu_id AND j.statut = 'actif' AND jeupharma.has_jeupharma_access()));

DROP POLICY IF EXISTS jeux_pool_molecules_admin ON jeupharma.jeux_pool_molecules;
CREATE POLICY jeux_pool_molecules_admin ON jeupharma.jeux_pool_molecules
  FOR ALL TO authenticated
  USING (jeupharma.is_portail_admin())
  WITH CHECK (jeupharma.is_portail_admin());
DROP POLICY IF EXISTS jeux_pool_molecules_select ON jeupharma.jeux_pool_molecules;
CREATE POLICY jeux_pool_molecules_select ON jeupharma.jeux_pool_molecules
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM jeupharma.jeux j WHERE j.id = jeu_id AND j.statut = 'actif' AND jeupharma.has_jeupharma_access()));

DROP POLICY IF EXISTS jeux_tentatives_admin ON jeupharma.jeux_tentatives;
CREATE POLICY jeux_tentatives_admin ON jeupharma.jeux_tentatives
  FOR ALL TO authenticated
  USING (jeupharma.is_portail_admin())
  WITH CHECK (jeupharma.is_portail_admin());

DROP POLICY IF EXISTS jeux_tentatives_own ON jeupharma.jeux_tentatives;
CREATE POLICY jeux_tentatives_own ON jeupharma.jeux_tentatives
  FOR SELECT TO authenticated
  USING (utilisateur_id = auth.uid() AND jeupharma.has_jeupharma_access());

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION jeupharma.jeu_gen_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  out text := 'JP-';
  i int;
BEGIN
  FOR i IN 1..5 LOOP
    out := out || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  END LOOP;
  RETURN out;
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.jeu__assert_lab_or_admin(p_parcours uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  lab boolean;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF p_parcours IS NULL THEN RETURN; END IF;
  SELECT est_laboratoire INTO lab FROM jeupharma.parcours_apprentissage WHERE id = p_parcours;
  -- Pendant le bac à sable : création V3 uniquement sur lab
  IF lab IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Jeux V3 réservés au parcours laboratoire pour l''instant';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.jeu__set_pool(
  p_jeu uuid,
  p_pool jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  mode text;
BEGIN
  IF p_pool IS NULL OR p_pool = '{}'::jsonb THEN
    DELETE FROM jeupharma.jeux_pool WHERE jeu_id = p_jeu;
    DELETE FROM jeupharma.jeux_pool_modules WHERE jeu_id = p_jeu;
    DELETE FROM jeupharma.jeux_pool_blocs WHERE jeu_id = p_jeu;
    DELETE FROM jeupharma.jeux_pool_molecules WHERE jeu_id = p_jeu;
    RETURN;
  END IF;
  mode := coalesce(p_pool->>'mode', 'lecons');
  INSERT INTO jeupharma.jeux_pool (jeu_id, mode)
  VALUES (p_jeu, mode)
  ON CONFLICT (jeu_id) DO UPDATE SET mode = EXCLUDED.mode;

  DELETE FROM jeupharma.jeux_pool_modules WHERE jeu_id = p_jeu;
  DELETE FROM jeupharma.jeux_pool_blocs WHERE jeu_id = p_jeu;
  DELETE FROM jeupharma.jeux_pool_molecules WHERE jeu_id = p_jeu;

  IF mode = 'lecons' AND jsonb_typeof(p_pool->'module_ids') = 'array' THEN
    INSERT INTO jeupharma.jeux_pool_modules (jeu_id, module_id)
    SELECT p_jeu, x::uuid
    FROM jsonb_array_elements_text(p_pool->'module_ids') x
    ON CONFLICT DO NOTHING;
  ELSIF mode = 'blocs' AND jsonb_typeof(p_pool->'bloc_ids') = 'array' THEN
    INSERT INTO jeupharma.jeux_pool_blocs (jeu_id, bloc_id)
    SELECT p_jeu, x::uuid
    FROM jsonb_array_elements_text(p_pool->'bloc_ids') x
    ON CONFLICT DO NOTHING;
  ELSIF mode = 'molecules' AND jsonb_typeof(p_pool->'matrice_ids') = 'array' THEN
    INSERT INTO jeupharma.jeux_pool_molecules (jeu_id, matrice_id)
    SELECT p_jeu, x::uuid
    FROM jsonb_array_elements_text(p_pool->'matrice_ids') x
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC : créer un jeu V3
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.jeu_creer(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  code text;
  row jeupharma.jeux%ROWTYPE;
  attempt int;
  pid uuid;
  mids uuid[];
BEGIN
  pid := NULLIF(p_payload->>'parcours_id', '')::uuid;
  PERFORM jeupharma.jeu__assert_lab_or_admin(pid);

  mids := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(p_payload->'module_ids')::uuid),
    '{}'::uuid[]
  );

  FOR attempt IN 1..8 LOOP
    code := jeupharma.jeu_gen_code();
    BEGIN
      INSERT INTO jeupharma.jeux (
        code_unique, famille_code, revision, type_jeu, titre,
        parcours_id, module_ids, statut, created_by
      ) VALUES (
        code, code, 1,
        p_payload->>'type_jeu',
        trim(p_payload->>'titre'),
        pid, mids, 'actif', auth.uid()
      )
      RETURNING * INTO row;

      PERFORM jeupharma.jeu__set_pool(row.id, p_payload->'pool');
      RETURN to_jsonb(row);
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;
  RAISE EXCEPTION 'Impossible de générer un code unique';
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC : maj + archive-on-edit si tentatives
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.jeu_maj(p_jeu_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  live jeupharma.jeux%ROWTYPE;
  arch jeupharma.jeux%ROWTYPE;
  has_t boolean;
  new_rev int;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;

  SELECT * INTO live FROM jeupharma.jeux WHERE id = p_jeu_id AND statut <> 'archive';
  IF NOT FOUND THEN RAISE EXCEPTION 'Jeu introuvable'; END IF;
  PERFORM jeupharma.jeu__assert_lab_or_admin(live.parcours_id);

  SELECT EXISTS (
    SELECT 1 FROM jeupharma.jeux_tentatives WHERE jeu_id = live.id
  ) INTO has_t;

  IF has_t THEN
    INSERT INTO jeupharma.jeux (
      code_unique, famille_code, revision, type_jeu, titre,
      parcours_id, module_ids, statut, archive_de_jeu_id, created_by
    ) VALUES (
      live.famille_code || '-A' || live.revision,
      live.famille_code,
      live.revision,
      live.type_jeu,
      live.titre,
      live.parcours_id,
      live.module_ids,
      'archive',
      live.id,
      live.created_by
    )
    RETURNING * INTO arch;

    -- Copie pool vers archive
    INSERT INTO jeupharma.jeux_pool (jeu_id, mode)
    SELECT arch.id, mode FROM jeupharma.jeux_pool WHERE jeu_id = live.id
    ON CONFLICT DO NOTHING;
    INSERT INTO jeupharma.jeux_pool_modules (jeu_id, module_id)
    SELECT arch.id, module_id FROM jeupharma.jeux_pool_modules WHERE jeu_id = live.id;
    INSERT INTO jeupharma.jeux_pool_blocs (jeu_id, bloc_id)
    SELECT arch.id, bloc_id FROM jeupharma.jeux_pool_blocs WHERE jeu_id = live.id;
    INSERT INTO jeupharma.jeux_pool_molecules (jeu_id, matrice_id)
    SELECT arch.id, matrice_id FROM jeupharma.jeux_pool_molecules WHERE jeu_id = live.id;

    UPDATE jeupharma.jeux_tentatives SET jeu_id = arch.id WHERE jeu_id = live.id;
    new_rev := live.revision + 1;
  ELSE
    new_rev := live.revision;
  END IF;

  UPDATE jeupharma.jeux SET
    titre = coalesce(nullif(trim(p_payload->>'titre'), ''), titre),
    module_ids = CASE
      WHEN p_payload ? 'module_ids' THEN
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'module_ids')::uuid), '{}'::uuid[])
      ELSE module_ids
    END,
    revision = new_rev,
    updated_at = now()
  WHERE id = live.id
  RETURNING * INTO live;

  IF p_payload ? 'pool' THEN
    PERFORM jeupharma.jeu__set_pool(live.id, p_payload->'pool');
  END IF;

  RETURN to_jsonb(live);
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.jeu_set_statut(p_jeu_id uuid, p_statut text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  row jeupharma.jeux%ROWTYPE;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF p_statut NOT IN ('actif', 'pause', 'archive') THEN
    RAISE EXCEPTION 'Statut invalide';
  END IF;
  UPDATE jeupharma.jeux
  SET statut = p_statut, updated_at = now()
  WHERE id = p_jeu_id AND statut <> 'archive'
  RETURNING * INTO row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jeu introuvable'; END IF;
  RETURN jsonb_build_object('id', row.id, 'code_unique', row.code_unique, 'statut', row.statut);
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.jeu_charger(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  j jeupharma.jeux%ROWTYPE;
  pool jsonb := '{}'::jsonb;
  lab boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT * INTO j FROM jeupharma.jeux
  WHERE code_unique = upper(trim(p_code));
  IF NOT FOUND THEN RAISE EXCEPTION 'Jeu introuvable'; END IF;

  IF j.statut = 'pause' AND NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Ce jeu est en pause';
  END IF;
  IF j.statut = 'archive' AND NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Jeu archivé';
  END IF;
  IF j.statut <> 'actif' AND NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Jeu indisponible';
  END IF;

  IF j.parcours_id IS NOT NULL THEN
    SELECT est_laboratoire INTO lab FROM jeupharma.parcours_apprentissage WHERE id = j.parcours_id;
    IF lab AND NOT jeupharma.is_portail_admin() THEN
      RAISE EXCEPTION 'Réservé admin';
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'mode', p.mode,
    'module_ids', coalesce((
      SELECT jsonb_agg(module_id::text) FROM jeupharma.jeux_pool_modules m WHERE m.jeu_id = j.id
    ), '[]'::jsonb),
    'bloc_ids', coalesce((
      SELECT jsonb_agg(bloc_id::text) FROM jeupharma.jeux_pool_blocs b WHERE b.jeu_id = j.id
    ), '[]'::jsonb),
    'matrice_ids', coalesce((
      SELECT jsonb_agg(matrice_id::text) FROM jeupharma.jeux_pool_molecules m WHERE m.jeu_id = j.id
    ), '[]'::jsonb)
  ) INTO pool
  FROM jeupharma.jeux_pool p WHERE p.jeu_id = j.id;

  RETURN jsonb_build_object(
    'id', j.id,
    'code_unique', j.code_unique,
    'famille_code', j.famille_code,
    'revision', j.revision,
    'type_jeu', j.type_jeu,
    'titre', j.titre,
    'parcours_id', j.parcours_id,
    'module_ids', to_jsonb(j.module_ids),
    'statut', j.statut,
    'pool', coalesce(pool, '{}'::jsonb),
    'est_laboratoire', coalesce(lab, false)
  );
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.jeu_creer(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.jeu_maj(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.jeu_set_statut(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.jeu_charger(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.jeu_creer(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.jeu_maj(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.jeu_set_statut(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.jeu_charger(text) TO authenticated;
