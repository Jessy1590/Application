-- 104 : Jeux V3 — socle (★ pool sélection, lister/supprimer)
-- Fin restriction labo sur création/maj. Idempotent.

-- ---------------------------------------------------------------------------
-- jeux : plages ★1–5
-- ---------------------------------------------------------------------------
ALTER TABLE jeupharma.jeux
  ADD COLUMN IF NOT EXISTS niveau_min smallint NOT NULL DEFAULT 1;
ALTER TABLE jeupharma.jeux
  ADD COLUMN IF NOT EXISTS niveau_max smallint NOT NULL DEFAULT 5;

ALTER TABLE jeupharma.jeux DROP CONSTRAINT IF EXISTS jeux_niveaux_check;
ALTER TABLE jeupharma.jeux ADD CONSTRAINT jeux_niveaux_check CHECK (
  niveau_min >= 1 AND niveau_max <= 5 AND niveau_min <= niveau_max
);

-- ---------------------------------------------------------------------------
-- jeux_pool : mode « selection » + filtres
-- ---------------------------------------------------------------------------
ALTER TABLE jeupharma.jeux_pool
  ADD COLUMN IF NOT EXISTS filtres_json jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE jeupharma.jeux_pool DROP CONSTRAINT IF EXISTS jeux_pool_mode_check;
ALTER TABLE jeupharma.jeux_pool ADD CONSTRAINT jeux_pool_mode_check CHECK (
  mode = ANY (ARRAY[
    'lecons'::text, 'blocs'::text, 'molecules'::text, 'selection'::text
  ])
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.jeu__assert_lab_or_admin(p_parcours uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
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
  filtres jsonb;
BEGIN
  IF p_pool IS NULL OR p_pool = '{}'::jsonb THEN
    DELETE FROM jeupharma.jeux_pool WHERE jeu_id = p_jeu;
    DELETE FROM jeupharma.jeux_pool_modules WHERE jeu_id = p_jeu;
    DELETE FROM jeupharma.jeux_pool_blocs WHERE jeu_id = p_jeu;
    DELETE FROM jeupharma.jeux_pool_molecules WHERE jeu_id = p_jeu;
    RETURN;
  END IF;

  mode := coalesce(nullif(p_pool->>'mode', ''), 'selection');
  filtres := coalesce(p_pool->'filtres', '{}'::jsonb);

  INSERT INTO jeupharma.jeux_pool (jeu_id, mode, filtres_json)
  VALUES (p_jeu, mode, filtres)
  ON CONFLICT (jeu_id) DO UPDATE SET
    mode = EXCLUDED.mode,
    filtres_json = EXCLUDED.filtres_json;

  DELETE FROM jeupharma.jeux_pool_modules WHERE jeu_id = p_jeu;
  DELETE FROM jeupharma.jeux_pool_blocs WHERE jeu_id = p_jeu;
  DELETE FROM jeupharma.jeux_pool_molecules WHERE jeu_id = p_jeu;

  IF jsonb_typeof(p_pool->'module_ids') = 'array' THEN
    INSERT INTO jeupharma.jeux_pool_modules (jeu_id, module_id)
    SELECT p_jeu, x::uuid
    FROM jsonb_array_elements_text(p_pool->'module_ids') x
    WHERE nullif(x, '') IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;

  IF jsonb_typeof(p_pool->'bloc_ids') = 'array' THEN
    INSERT INTO jeupharma.jeux_pool_blocs (jeu_id, bloc_id)
    SELECT p_jeu, x::uuid
    FROM jsonb_array_elements_text(p_pool->'bloc_ids') x
    WHERE nullif(x, '') IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;

  IF jsonb_typeof(p_pool->'matrice_ids') = 'array' THEN
    INSERT INTO jeupharma.jeux_pool_molecules (jeu_id, matrice_id)
    SELECT p_jeu, x::uuid
    FROM jsonb_array_elements_text(p_pool->'matrice_ids') x
    WHERE nullif(x, '') IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC : créer
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
  nmin smallint;
  nmax smallint;
BEGIN
  mids := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(p_payload->'module_ids')::uuid),
    '{}'::uuid[]
  );

  pid := NULLIF(p_payload->>'parcours_id', '')::uuid;
  IF pid IS NULL AND coalesce(array_length(mids, 1), 0) > 0 THEN
    SELECT mc.parcours_id INTO pid
    FROM jeupharma.modules_cours mc
    WHERE mc.id = mids[1];
  END IF;

  PERFORM jeupharma.jeu__assert_lab_or_admin(pid);

  nmin := coalesce((p_payload->>'niveau_min')::smallint, 1::smallint);
  nmax := coalesce((p_payload->>'niveau_max')::smallint, 5::smallint);

  FOR attempt IN 1..8 LOOP
    code := jeupharma.jeu_gen_code();
    BEGIN
      INSERT INTO jeupharma.jeux (
        code_unique, famille_code, revision, type_jeu, titre,
        parcours_id, module_ids, statut, created_by,
        niveau_min, niveau_max
      ) VALUES (
        code, code, 1,
        p_payload->>'type_jeu',
        trim(p_payload->>'titre'),
        pid, mids, 'actif', auth.uid(),
        nmin, nmax
      )
      RETURNING * INTO row;

      PERFORM jeupharma.jeu__set_pool(row.id, p_payload->'pool');
      PERFORM jeupharma.jeu__apply_type_cfg(row.type_jeu, row.id, p_payload);
      RETURN to_jsonb(row);
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;
  RAISE EXCEPTION 'Impossible de générer un code unique';
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC : maj (103 + niveaux / pool filtres / parcours)
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
  new_mids uuid[];
  new_pid uuid;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;

  SELECT * INTO live FROM jeupharma.jeux WHERE id = p_jeu_id AND statut <> 'archive';
  IF NOT FOUND THEN RAISE EXCEPTION 'Jeu introuvable'; END IF;
  PERFORM jeupharma.jeu__assert_lab_or_admin(live.parcours_id);

  SELECT EXISTS (SELECT 1 FROM jeupharma.jeux_tentatives WHERE jeu_id = live.id) INTO has_t;

  IF has_t THEN
    INSERT INTO jeupharma.jeux (
      code_unique, famille_code, revision, type_jeu, titre,
      parcours_id, module_ids, statut, archive_de_jeu_id, created_by,
      niveau_min, niveau_max
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
      live.created_by,
      live.niveau_min,
      live.niveau_max
    )
    RETURNING * INTO arch;

    INSERT INTO jeupharma.jeux_pool (jeu_id, mode, filtres_json)
    SELECT arch.id, p.mode, p.filtres_json
    FROM jeupharma.jeux_pool p
    WHERE p.jeu_id = live.id
    ON CONFLICT (jeu_id) DO NOTHING;

    INSERT INTO jeupharma.jeux_pool_modules (jeu_id, module_id)
    SELECT arch.id, m.module_id
    FROM jeupharma.jeux_pool_modules m
    WHERE m.jeu_id = live.id;

    INSERT INTO jeupharma.jeux_pool_blocs (jeu_id, bloc_id)
    SELECT arch.id, b.bloc_id
    FROM jeupharma.jeux_pool_blocs b
    WHERE b.jeu_id = live.id;

    INSERT INTO jeupharma.jeux_pool_molecules (jeu_id, matrice_id)
    SELECT arch.id, mol.matrice_id
    FROM jeupharma.jeux_pool_molecules mol
    WHERE mol.jeu_id = live.id;

    IF live.type_jeu = 'quiz' THEN
      PERFORM jeupharma.jeu__clone_quiz(live.id, arch.id);
    END IF;

    IF live.type_jeu = 'trous' THEN
      INSERT INTO jeupharma.jeux_trous (
        jeu_id, composition, nb_lignes, lignes_mode, taux_trous, grille_json,
        created_at, updated_at
      )
      SELECT
        arch.id, t.composition, t.nb_lignes, t.lignes_mode, t.taux_trous, t.grille_json,
        now(), now()
      FROM jeupharma.jeux_trous t
      WHERE t.jeu_id = live.id
      ON CONFLICT (jeu_id) DO NOTHING;

      INSERT INTO jeupharma.jeux_trous_colonnes (jeu_id, champ_code, role, ordre)
      SELECT arch.id, c.champ_code, c.role, c.ordre
      FROM jeupharma.jeux_trous_colonnes c
      WHERE c.jeu_id = live.id;
    ELSIF live.type_jeu = 'fiche_aleatoire' THEN
      INSERT INTO jeupharma.jeux_fiche (
        jeu_id, composition, nb_fiches, fiches_mode, seuil_exclusion, nb_notes_exclusion,
        created_at, updated_at
      )
      SELECT
        arch.id, f.composition, f.nb_fiches, f.fiches_mode, f.seuil_exclusion, f.nb_notes_exclusion,
        now(), now()
      FROM jeupharma.jeux_fiche f
      WHERE f.jeu_id = live.id
      ON CONFLICT (jeu_id) DO NOTHING;

      INSERT INTO jeupharma.jeux_fiche_champs (jeu_id, champ_code, role)
      SELECT arch.id, c.champ_code, c.role
      FROM jeupharma.jeux_fiche_champs c
      WHERE c.jeu_id = live.id;

      INSERT INTO jeupharma.jeux_fiche_emplacements (jeu_id, ordre, mode, matrice_id)
      SELECT arch.id, e.ordre, e.mode, e.matrice_id
      FROM jeupharma.jeux_fiche_emplacements e
      WHERE e.jeu_id = live.id;
    ELSIF live.type_jeu = 'ordonnance' THEN
      INSERT INTO jeupharma.jeux_ordonnance (jeu_id, associations_possibles, created_at, updated_at)
      SELECT arch.id, o.associations_possibles, now(), now()
      FROM jeupharma.jeux_ordonnance o
      WHERE o.jeu_id = live.id
      ON CONFLICT (jeu_id) DO NOTHING;

      INSERT INTO jeupharma.jeux_ordonnance_champs (jeu_id, champ_code)
      SELECT arch.id, c.champ_code
      FROM jeupharma.jeux_ordonnance_champs c
      WHERE c.jeu_id = live.id;

      INSERT INTO jeupharma.jeux_ordonnance_besoins (
        jeu_id, ordre, mode, matrice_id, association_id, filtre_json
      )
      SELECT arch.id, b.ordre, b.mode, b.matrice_id, b.association_id, b.filtre_json
      FROM jeupharma.jeux_ordonnance_besoins b
      WHERE b.jeu_id = live.id;
    ELSIF live.type_jeu = 'classement' THEN
      INSERT INTO jeupharma.jeux_classement (
        jeu_id, consigne, items_json, zones_json, created_at, updated_at
      )
      SELECT arch.id, c.consigne, c.items_json, c.zones_json, now(), now()
      FROM jeupharma.jeux_classement c
      WHERE c.jeu_id = live.id
      ON CONFLICT (jeu_id) DO NOTHING;
    ELSIF live.type_jeu = 'appariement' THEN
      INSERT INTO jeupharma.jeux_appariement (
        jeu_id, consigne, gauche_json, droite_json, paires_json, created_at, updated_at
      )
      SELECT arch.id, a.consigne, a.gauche_json, a.droite_json, a.paires_json, now(), now()
      FROM jeupharma.jeux_appariement a
      WHERE a.jeu_id = live.id
      ON CONFLICT (jeu_id) DO NOTHING;
    END IF;

    UPDATE jeupharma.jeux_tentatives SET jeu_id = arch.id WHERE jeu_id = live.id;
    new_rev := live.revision + 1;
  ELSE
    new_rev := live.revision;
  END IF;

  new_mids := CASE
    WHEN p_payload ? 'module_ids' THEN
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'module_ids')::uuid), '{}'::uuid[])
    ELSE live.module_ids
  END;

  IF p_payload ? 'parcours_id' THEN
    new_pid := NULLIF(p_payload->>'parcours_id', '')::uuid;
  ELSIF p_payload ? 'module_ids' AND coalesce(array_length(new_mids, 1), 0) > 0 THEN
    SELECT mc.parcours_id INTO new_pid
    FROM jeupharma.modules_cours mc
    WHERE mc.id = new_mids[1];
  ELSE
    new_pid := live.parcours_id;
  END IF;

  UPDATE jeupharma.jeux SET
    titre = coalesce(nullif(trim(p_payload->>'titre'), ''), titre),
    module_ids = new_mids,
    parcours_id = new_pid,
    niveau_min = CASE
      WHEN p_payload ? 'niveau_min' THEN (p_payload->>'niveau_min')::smallint
      ELSE niveau_min
    END,
    niveau_max = CASE
      WHEN p_payload ? 'niveau_max' THEN (p_payload->>'niveau_max')::smallint
      ELSE niveau_max
    END,
    revision = new_rev,
    updated_at = now()
  WHERE id = live.id
  RETURNING * INTO live;

  IF p_payload ? 'pool' THEN
    PERFORM jeupharma.jeu__set_pool(live.id, p_payload->'pool');
  END IF;
  PERFORM jeupharma.jeu__apply_type_cfg(live.type_jeu, live.id, p_payload);
  RETURN to_jsonb(live);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC : charger (099 + niveaux / filtres pool)
-- ---------------------------------------------------------------------------
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
      SELECT jsonb_agg(m.module_id::text)
      FROM jeupharma.jeux_pool_modules m
      WHERE m.jeu_id = j.id
    ), '[]'::jsonb),
    'bloc_ids', coalesce((
      SELECT jsonb_agg(b.bloc_id::text)
      FROM jeupharma.jeux_pool_blocs b
      WHERE b.jeu_id = j.id
    ), '[]'::jsonb),
    'matrice_ids', coalesce((
      SELECT jsonb_agg(mol.matrice_id::text)
      FROM jeupharma.jeux_pool_molecules mol
      WHERE mol.jeu_id = j.id
    ), '[]'::jsonb),
    'filtres', coalesce(p.filtres_json, '{}'::jsonb)
  ) INTO pool
  FROM jeupharma.jeux_pool p
  WHERE p.jeu_id = j.id;

  RETURN jsonb_build_object(
    'id', j.id,
    'code_unique', j.code_unique,
    'famille_code', j.famille_code,
    'revision', j.revision,
    'type_jeu', j.type_jeu,
    'titre', j.titre,
    'parcours_id', j.parcours_id,
    'module_ids', to_jsonb(j.module_ids),
    'niveau_min', j.niveau_min,
    'niveau_max', j.niveau_max,
    'statut', j.statut,
    'pool', coalesce(pool, '{}'::jsonb),
    'est_laboratoire', coalesce(lab, false)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC admin : lister / supprimer
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.jeu_lister(p_statut text DEFAULT NULL)
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
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', x.id,
        'code_unique', x.code_unique,
        'famille_code', x.famille_code,
        'revision', x.revision,
        'type_jeu', x.type_jeu,
        'titre', x.titre,
        'statut', x.statut,
        'niveau_min', x.niveau_min,
        'niveau_max', x.niveau_max,
        'module_ids', to_jsonb(x.module_ids),
        'archive_de_jeu_id', x.archive_de_jeu_id,
        'nb_tentatives', x.nb_tentatives,
        'updated_at', x.updated_at
      )
      ORDER BY x.famille_code, x.revision DESC
    )
    FROM (
      SELECT
        j.id,
        j.code_unique,
        j.famille_code,
        j.revision,
        j.type_jeu,
        j.titre,
        j.statut,
        j.niveau_min,
        j.niveau_max,
        j.module_ids,
        j.archive_de_jeu_id,
        j.updated_at,
        (SELECT count(*)::int FROM jeupharma.jeux_tentatives t WHERE t.jeu_id = j.id) AS nb_tentatives
      FROM jeupharma.jeux j
      WHERE p_statut IS NULL OR j.statut = p_statut
    ) x
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.jeu_supprimer(p_jeu_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  j jeupharma.jeux%ROWTYPE;
  nb int;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;

  SELECT * INTO j FROM jeupharma.jeux WHERE id = p_jeu_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jeu introuvable'; END IF;

  IF j.statut = 'archive' THEN
    RAISE EXCEPTION 'Jeu déjà joué : archiver';
  END IF;

  SELECT count(*)::int INTO nb FROM jeupharma.jeux_tentatives WHERE jeu_id = j.id;
  IF nb > 0 THEN
    RAISE EXCEPTION 'Jeu déjà joué : archiver';
  END IF;

  DELETE FROM jeupharma.jeux WHERE id = j.id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Droits RPC publiques + helpers internes
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION jeupharma.jeu_creer(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION jeupharma.jeu_maj(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION jeupharma.jeu_charger(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION jeupharma.jeu_lister(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION jeupharma.jeu_supprimer(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION jeupharma.jeu_creer(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.jeu_maj(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.jeu_charger(text) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.jeu_lister(text) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.jeu_supprimer(uuid) TO authenticated;

REVOKE ALL ON FUNCTION jeupharma.jeu__assert_lab_or_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION jeupharma.jeu__set_pool(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION jeupharma.jeu__apply_type_cfg(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION jeupharma.jeu__clone_quiz(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION jeupharma.jeu__set_quiz(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION jeupharma.jeu__set_trous(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION jeupharma.jeu__set_fiche(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION jeupharma.jeu__set_ordonnance(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION jeupharma.jeu__set_classement(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION jeupharma.jeu__set_appariement(uuid, jsonb) FROM PUBLIC, anon, authenticated;
