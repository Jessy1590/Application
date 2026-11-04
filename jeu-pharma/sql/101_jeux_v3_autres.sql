-- =============================================================================
-- 101 : Jeux V3 — trous, fiche, ordonnance, classement, appariement
-- =============================================================================

-- ——— Trous ———
CREATE TABLE IF NOT EXISTS jeupharma.jeux_trous (
  jeu_id uuid PRIMARY KEY REFERENCES jeupharma.jeux(id) ON DELETE CASCADE,
  composition text NOT NULL DEFAULT 'auto' CHECK (composition = ANY (ARRAY['auto'::text, 'grille'::text])),
  nb_lignes int NOT NULL DEFAULT 5 CHECK (nb_lignes BETWEEN 1 AND 50),
  lignes_mode text NOT NULL DEFAULT 'aleatoire' CHECK (lignes_mode = ANY (ARRAY['aleatoire'::text, 'groupe'::text])),
  taux_trous int NOT NULL DEFAULT 40 CHECK (taux_trous BETWEEN 0 AND 100),
  grille_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jeupharma.jeux_trous_colonnes (
  jeu_id uuid NOT NULL REFERENCES jeupharma.jeux(id) ON DELETE CASCADE,
  champ_code text NOT NULL,
  role text NOT NULL DEFAULT 'trouable' CHECK (role = ANY (ARRAY['visible'::text, 'trouable'::text])),
  ordre int NOT NULL DEFAULT 0,
  PRIMARY KEY (jeu_id, champ_code)
);

-- ——— Fiche aléatoire ———
CREATE TABLE IF NOT EXISTS jeupharma.jeux_fiche (
  jeu_id uuid PRIMARY KEY REFERENCES jeupharma.jeux(id) ON DELETE CASCADE,
  composition text NOT NULL DEFAULT 'auto' CHECK (composition = ANY (ARRAY['auto'::text, 'manuel'::text])),
  nb_fiches int NOT NULL DEFAULT 5 CHECK (nb_fiches BETWEEN 1 AND 30),
  fiches_mode text NOT NULL DEFAULT 'aleatoire' CHECK (fiches_mode = ANY (ARRAY['aleatoire'::text, 'groupe'::text])),
  seuil_exclusion numeric NOT NULL DEFAULT 8,
  nb_notes_exclusion int NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jeupharma.jeux_fiche_champs (
  jeu_id uuid NOT NULL REFERENCES jeupharma.jeux(id) ON DELETE CASCADE,
  champ_code text NOT NULL,
  role text NOT NULL DEFAULT 'restituer' CHECK (role = ANY (ARRAY['visible'::text, 'restituer'::text])),
  PRIMARY KEY (jeu_id, champ_code)
);

CREATE TABLE IF NOT EXISTS jeupharma.jeux_fiche_emplacements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jeu_id uuid NOT NULL REFERENCES jeupharma.jeux(id) ON DELETE CASCADE,
  ordre int NOT NULL DEFAULT 0,
  mode text NOT NULL DEFAULT 'aleatoire' CHECK (mode = ANY (ARRAY['aleatoire'::text, 'fixe'::text])),
  matrice_id uuid REFERENCES jeupharma.matrice_medicaments(id) ON DELETE SET NULL
);

-- ——— Ordonnance ———
CREATE TABLE IF NOT EXISTS jeupharma.jeux_ordonnance (
  jeu_id uuid PRIMARY KEY REFERENCES jeupharma.jeux(id) ON DELETE CASCADE,
  associations_possibles boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jeupharma.jeux_ordonnance_champs (
  jeu_id uuid NOT NULL REFERENCES jeupharma.jeux(id) ON DELETE CASCADE,
  champ_code text NOT NULL,
  PRIMARY KEY (jeu_id, champ_code)
);

CREATE TABLE IF NOT EXISTS jeupharma.jeux_ordonnance_besoins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jeu_id uuid NOT NULL REFERENCES jeupharma.jeux(id) ON DELETE CASCADE,
  ordre int NOT NULL DEFAULT 0,
  mode text NOT NULL DEFAULT 'aleatoire' CHECK (mode = ANY (ARRAY['aleatoire'::text, 'manuel'::text])),
  matrice_id uuid REFERENCES jeupharma.matrice_medicaments(id) ON DELETE SET NULL,
  filtre_json jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- ——— Classement ———
CREATE TABLE IF NOT EXISTS jeupharma.jeux_classement (
  jeu_id uuid PRIMARY KEY REFERENCES jeupharma.jeux(id) ON DELETE CASCADE,
  consigne text NOT NULL DEFAULT '',
  items_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  zones_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ——— Appariement ———
CREATE TABLE IF NOT EXISTS jeupharma.jeux_appariement (
  jeu_id uuid PRIMARY KEY REFERENCES jeupharma.jeux(id) ON DELETE CASCADE,
  consigne text NOT NULL DEFAULT '',
  gauche_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  droite_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  paires_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS helpers
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'jeux_trous','jeux_trous_colonnes','jeux_fiche','jeux_fiche_champs','jeux_fiche_emplacements',
    'jeux_ordonnance','jeux_ordonnance_champs','jeux_ordonnance_besoins',
    'jeux_classement','jeux_appariement'
  ] LOOP
    EXECUTE format('ALTER TABLE jeupharma.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS %I_admin ON jeupharma.%I; CREATE POLICY %I_admin ON jeupharma.%I FOR ALL TO authenticated USING (jeupharma.is_portail_admin()) WITH CHECK (jeupharma.is_portail_admin())',
      t, t, t, t
    );
  END LOOP;
END $$;

-- Setters type-specifiques
CREATE OR REPLACE FUNCTION jeupharma.jeu__set_trous(p_jeu uuid, p_cfg jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'jeupharma', 'pg_temp' AS $$
BEGIN
  IF p_cfg IS NULL THEN RETURN; END IF;
  INSERT INTO jeupharma.jeux_trous (jeu_id, composition, nb_lignes, lignes_mode, taux_trous, grille_json)
  VALUES (
    p_jeu,
    coalesce(p_cfg->>'composition', 'auto'),
    coalesce((p_cfg->>'nb_lignes')::int, 5),
    coalesce(p_cfg->>'lignes_mode', 'aleatoire'),
    coalesce((p_cfg->>'taux_trous')::int, 40),
    coalesce(p_cfg->'grille_json', '{}'::jsonb)
  )
  ON CONFLICT (jeu_id) DO UPDATE SET
    composition = EXCLUDED.composition, nb_lignes = EXCLUDED.nb_lignes,
    lignes_mode = EXCLUDED.lignes_mode, taux_trous = EXCLUDED.taux_trous,
    grille_json = EXCLUDED.grille_json, updated_at = now();
  DELETE FROM jeupharma.jeux_trous_colonnes WHERE jeu_id = p_jeu;
  IF jsonb_typeof(p_cfg->'colonnes') = 'array' THEN
    INSERT INTO jeupharma.jeux_trous_colonnes (jeu_id, champ_code, role, ordre)
    SELECT p_jeu, c->>'champ_code', coalesce(c->>'role', 'trouable'), coalesce((c->>'ordre')::int, ord)
    FROM jsonb_array_elements(p_cfg->'colonnes') WITH ORDINALITY AS t(c, ord)
    WHERE nullif(c->>'champ_code', '') IS NOT NULL;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION jeupharma.jeu__set_fiche(p_jeu uuid, p_cfg jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'jeupharma', 'pg_temp' AS $$
BEGIN
  IF p_cfg IS NULL THEN RETURN; END IF;
  INSERT INTO jeupharma.jeux_fiche (
    jeu_id, composition, nb_fiches, fiches_mode, seuil_exclusion, nb_notes_exclusion
  ) VALUES (
    p_jeu,
    coalesce(p_cfg->>'composition', 'auto'),
    coalesce((p_cfg->>'nb_fiches')::int, 5),
    coalesce(p_cfg->>'fiches_mode', 'aleatoire'),
    coalesce((p_cfg->>'seuil_exclusion')::numeric, 8),
    coalesce((p_cfg->>'nb_notes_exclusion')::int, 3)
  )
  ON CONFLICT (jeu_id) DO UPDATE SET
    composition = EXCLUDED.composition, nb_fiches = EXCLUDED.nb_fiches,
    fiches_mode = EXCLUDED.fiches_mode, seuil_exclusion = EXCLUDED.seuil_exclusion,
    nb_notes_exclusion = EXCLUDED.nb_notes_exclusion, updated_at = now();
  DELETE FROM jeupharma.jeux_fiche_champs WHERE jeu_id = p_jeu;
  IF jsonb_typeof(p_cfg->'champs') = 'array' THEN
    INSERT INTO jeupharma.jeux_fiche_champs (jeu_id, champ_code, role)
    SELECT p_jeu, c->>'champ_code', coalesce(c->>'role', 'restituer')
    FROM jsonb_array_elements(p_cfg->'champs') c
    WHERE nullif(c->>'champ_code', '') IS NOT NULL;
  END IF;
  DELETE FROM jeupharma.jeux_fiche_emplacements WHERE jeu_id = p_jeu;
  IF jsonb_typeof(p_cfg->'emplacements') = 'array' THEN
    INSERT INTO jeupharma.jeux_fiche_emplacements (jeu_id, ordre, mode, matrice_id)
    SELECT p_jeu, coalesce((e->>'ordre')::int, ord), coalesce(e->>'mode', 'aleatoire'),
           NULLIF(e->>'matrice_id', '')::uuid
    FROM jsonb_array_elements(p_cfg->'emplacements') WITH ORDINALITY AS t(e, ord);
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION jeupharma.jeu__set_ordonnance(p_jeu uuid, p_cfg jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'jeupharma', 'pg_temp' AS $$
BEGIN
  IF p_cfg IS NULL THEN RETURN; END IF;
  INSERT INTO jeupharma.jeux_ordonnance (jeu_id, associations_possibles)
  VALUES (p_jeu, coalesce((p_cfg->>'associations_possibles')::boolean, false))
  ON CONFLICT (jeu_id) DO UPDATE SET
    associations_possibles = EXCLUDED.associations_possibles, updated_at = now();
  DELETE FROM jeupharma.jeux_ordonnance_champs WHERE jeu_id = p_jeu;
  IF jsonb_typeof(p_cfg->'champs') = 'array' THEN
    INSERT INTO jeupharma.jeux_ordonnance_champs (jeu_id, champ_code)
    SELECT p_jeu, x FROM jsonb_array_elements_text(p_cfg->'champs') x;
  END IF;
  DELETE FROM jeupharma.jeux_ordonnance_besoins WHERE jeu_id = p_jeu;
  IF jsonb_typeof(p_cfg->'besoins') = 'array' THEN
    INSERT INTO jeupharma.jeux_ordonnance_besoins (jeu_id, ordre, mode, matrice_id, filtre_json)
    SELECT p_jeu, coalesce((b->>'ordre')::int, ord), coalesce(b->>'mode', 'aleatoire'),
           NULLIF(b->>'matrice_id', '')::uuid, coalesce(b->'filtre_json', '{}'::jsonb)
    FROM jsonb_array_elements(p_cfg->'besoins') WITH ORDINALITY AS t(b, ord);
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION jeupharma.jeu__set_classement(p_jeu uuid, p_cfg jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'jeupharma', 'pg_temp' AS $$
BEGIN
  IF p_cfg IS NULL THEN RETURN; END IF;
  INSERT INTO jeupharma.jeux_classement (jeu_id, consigne, items_json, zones_json)
  VALUES (
    p_jeu,
    coalesce(p_cfg->>'consigne', ''),
    coalesce(p_cfg->'items', '[]'::jsonb),
    coalesce(p_cfg->'zones', '[]'::jsonb)
  )
  ON CONFLICT (jeu_id) DO UPDATE SET
    consigne = EXCLUDED.consigne, items_json = EXCLUDED.items_json,
    zones_json = EXCLUDED.zones_json, updated_at = now();
END; $$;

CREATE OR REPLACE FUNCTION jeupharma.jeu__set_appariement(p_jeu uuid, p_cfg jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'jeupharma', 'pg_temp' AS $$
BEGIN
  IF p_cfg IS NULL THEN RETURN; END IF;
  INSERT INTO jeupharma.jeux_appariement (jeu_id, consigne, gauche_json, droite_json, paires_json)
  VALUES (
    p_jeu,
    coalesce(p_cfg->>'consigne', ''),
    coalesce(p_cfg->'gauche', '[]'::jsonb),
    coalesce(p_cfg->'droite', '[]'::jsonb),
    coalesce(p_cfg->'paires', '[]'::jsonb)
  )
  ON CONFLICT (jeu_id) DO UPDATE SET
    consigne = EXCLUDED.consigne, gauche_json = EXCLUDED.gauche_json,
    droite_json = EXCLUDED.droite_json, paires_json = EXCLUDED.paires_json,
    updated_at = now();
END; $$;

CREATE OR REPLACE FUNCTION jeupharma.jeu__apply_type_cfg(p_type text, p_jeu uuid, p_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'jeupharma', 'pg_temp' AS $$
BEGIN
  IF p_type = 'quiz' AND p_payload ? 'quiz' THEN
    PERFORM jeupharma.jeu__set_quiz(p_jeu, p_payload->'quiz');
  ELSIF p_type = 'trous' AND p_payload ? 'trous' THEN
    PERFORM jeupharma.jeu__set_trous(p_jeu, p_payload->'trous');
  ELSIF p_type = 'fiche_aleatoire' AND p_payload ? 'fiche' THEN
    PERFORM jeupharma.jeu__set_fiche(p_jeu, p_payload->'fiche');
  ELSIF p_type = 'ordonnance' AND p_payload ? 'ordonnance' THEN
    PERFORM jeupharma.jeu__set_ordonnance(p_jeu, p_payload->'ordonnance');
  ELSIF p_type = 'classement' AND p_payload ? 'classement' THEN
    PERFORM jeupharma.jeu__set_classement(p_jeu, p_payload->'classement');
  ELSIF p_type = 'appariement' AND p_payload ? 'appariement' THEN
    PERFORM jeupharma.jeu__set_appariement(p_jeu, p_payload->'appariement');
  END IF;
END; $$;

-- Recréer jeu_creer / jeu_maj avec tous les types
CREATE OR REPLACE FUNCTION jeupharma.jeu_creer(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'jeupharma', 'portail', 'pg_temp' AS $$
DECLARE
  code text; row jeupharma.jeux%ROWTYPE; attempt int; pid uuid; mids uuid[];
BEGIN
  pid := NULLIF(p_payload->>'parcours_id', '')::uuid;
  PERFORM jeupharma.jeu__assert_lab_or_admin(pid);
  mids := COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'module_ids')::uuid), '{}'::uuid[]);
  FOR attempt IN 1..8 LOOP
    code := jeupharma.jeu_gen_code();
    BEGIN
      INSERT INTO jeupharma.jeux (
        code_unique, famille_code, revision, type_jeu, titre, parcours_id, module_ids, statut, created_by
      ) VALUES (
        code, code, 1, p_payload->>'type_jeu', trim(p_payload->>'titre'), pid, mids, 'actif', auth.uid()
      ) RETURNING * INTO row;
      PERFORM jeupharma.jeu__set_pool(row.id, p_payload->'pool');
      PERFORM jeupharma.jeu__apply_type_cfg(row.type_jeu, row.id, p_payload);
      RETURN to_jsonb(row);
    EXCEPTION WHEN unique_violation THEN CONTINUE;
    END;
  END LOOP;
  RAISE EXCEPTION 'Impossible de générer un code unique';
END; $$;

CREATE OR REPLACE FUNCTION jeupharma.jeu_maj(p_jeu_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'jeupharma', 'portail', 'pg_temp' AS $$
DECLARE
  live jeupharma.jeux%ROWTYPE; arch jeupharma.jeux%ROWTYPE; has_t boolean; new_rev int;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN RAISE EXCEPTION 'Réservé admin portail'; END IF;
  SELECT * INTO live FROM jeupharma.jeux WHERE id = p_jeu_id AND statut <> 'archive';
  IF NOT FOUND THEN RAISE EXCEPTION 'Jeu introuvable'; END IF;
  PERFORM jeupharma.jeu__assert_lab_or_admin(live.parcours_id);
  SELECT EXISTS (SELECT 1 FROM jeupharma.jeux_tentatives WHERE jeu_id = live.id) INTO has_t;
  IF has_t THEN
    INSERT INTO jeupharma.jeux (
      code_unique, famille_code, revision, type_jeu, titre, parcours_id, module_ids, statut, archive_de_jeu_id, created_by
    ) VALUES (
      live.famille_code || '-A' || live.revision, live.famille_code, live.revision,
      live.type_jeu, live.titre, live.parcours_id, live.module_ids, 'archive', live.id, live.created_by
    ) RETURNING * INTO arch;
    INSERT INTO jeupharma.jeux_pool (jeu_id, mode)
    SELECT arch.id, mode FROM jeupharma.jeux_pool WHERE jeu_id = live.id ON CONFLICT DO NOTHING;
    INSERT INTO jeupharma.jeux_pool_modules SELECT arch.id, module_id FROM jeupharma.jeux_pool_modules WHERE jeu_id = live.id;
    INSERT INTO jeupharma.jeux_pool_blocs SELECT arch.id, bloc_id FROM jeupharma.jeux_pool_blocs WHERE jeu_id = live.id;
    INSERT INTO jeupharma.jeux_pool_molecules SELECT arch.id, matrice_id FROM jeupharma.jeux_pool_molecules WHERE jeu_id = live.id;
    IF live.type_jeu = 'quiz' THEN PERFORM jeupharma.jeu__clone_quiz(live.id, arch.id); END IF;
    -- Autres types : copie simple des tables config
    IF live.type_jeu = 'trous' THEN
      INSERT INTO jeupharma.jeux_trous SELECT arch.id, composition, nb_lignes, lignes_mode, taux_trous, grille_json, now(), now()
      FROM jeupharma.jeux_trous WHERE jeu_id = live.id ON CONFLICT DO NOTHING;
      INSERT INTO jeupharma.jeux_trous_colonnes SELECT arch.id, champ_code, role, ordre FROM jeupharma.jeux_trous_colonnes WHERE jeu_id = live.id;
    ELSIF live.type_jeu = 'fiche_aleatoire' THEN
      INSERT INTO jeupharma.jeux_fiche SELECT arch.id, composition, nb_fiches, fiches_mode, seuil_exclusion, nb_notes_exclusion, now(), now()
      FROM jeupharma.jeux_fiche WHERE jeu_id = live.id ON CONFLICT DO NOTHING;
      INSERT INTO jeupharma.jeux_fiche_champs SELECT arch.id, champ_code, role FROM jeupharma.jeux_fiche_champs WHERE jeu_id = live.id;
      INSERT INTO jeupharma.jeux_fiche_emplacements (jeu_id, ordre, mode, matrice_id)
      SELECT arch.id, ordre, mode, matrice_id FROM jeupharma.jeux_fiche_emplacements WHERE jeu_id = live.id;
    ELSIF live.type_jeu = 'ordonnance' THEN
      INSERT INTO jeupharma.jeux_ordonnance SELECT arch.id, associations_possibles, now(), now() FROM jeupharma.jeux_ordonnance WHERE jeu_id = live.id ON CONFLICT DO NOTHING;
      INSERT INTO jeupharma.jeux_ordonnance_champs SELECT arch.id, champ_code FROM jeupharma.jeux_ordonnance_champs WHERE jeu_id = live.id;
      INSERT INTO jeupharma.jeux_ordonnance_besoins (jeu_id, ordre, mode, matrice_id, filtre_json)
      SELECT arch.id, ordre, mode, matrice_id, filtre_json FROM jeupharma.jeux_ordonnance_besoins WHERE jeu_id = live.id;
    ELSIF live.type_jeu = 'classement' THEN
      INSERT INTO jeupharma.jeux_classement SELECT arch.id, consigne, items_json, zones_json, now(), now() FROM jeupharma.jeux_classement WHERE jeu_id = live.id ON CONFLICT DO NOTHING;
    ELSIF live.type_jeu = 'appariement' THEN
      INSERT INTO jeupharma.jeux_appariement SELECT arch.id, consigne, gauche_json, droite_json, paires_json, now(), now() FROM jeupharma.jeux_appariement WHERE jeu_id = live.id ON CONFLICT DO NOTHING;
    END IF;
    UPDATE jeupharma.jeux_tentatives SET jeu_id = arch.id WHERE jeu_id = live.id;
    new_rev := live.revision + 1;
  ELSE
    new_rev := live.revision;
  END IF;
  UPDATE jeupharma.jeux SET
    titre = coalesce(nullif(trim(p_payload->>'titre'), ''), titre),
    module_ids = CASE WHEN p_payload ? 'module_ids' THEN
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'module_ids')::uuid), '{}'::uuid[])
    ELSE module_ids END,
    revision = new_rev, updated_at = now()
  WHERE id = live.id RETURNING * INTO live;
  IF p_payload ? 'pool' THEN PERFORM jeupharma.jeu__set_pool(live.id, p_payload->'pool'); END IF;
  PERFORM jeupharma.jeu__apply_type_cfg(live.type_jeu, live.id, p_payload);
  RETURN to_jsonb(live);
END; $$;

-- Config loaders
CREATE OR REPLACE FUNCTION jeupharma.jeu_type_config(p_jeu_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'jeupharma', 'portail', 'pg_temp' AS $$
DECLARE
  j jeupharma.jeux%ROWTYPE;
  out jsonb := '{}'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT jeupharma.has_jeupharma_access() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT * INTO j FROM jeupharma.jeux WHERE id = p_jeu_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF j.type_jeu = 'quiz' THEN RETURN jeupharma.jeu_quiz_config(p_jeu_id); END IF;
  IF j.type_jeu = 'trous' THEN
    SELECT jsonb_build_object(
      'composition', t.composition, 'nb_lignes', t.nb_lignes, 'lignes_mode', t.lignes_mode,
      'taux_trous', t.taux_trous, 'grille_json', t.grille_json,
      'colonnes', coalesce((SELECT jsonb_agg(jsonb_build_object('champ_code', c.champ_code, 'role', c.role, 'ordre', c.ordre) ORDER BY c.ordre)
        FROM jeupharma.jeux_trous_colonnes c WHERE c.jeu_id = j.id), '[]'::jsonb)
    ) INTO out FROM jeupharma.jeux_trous t WHERE t.jeu_id = j.id;
  ELSIF j.type_jeu = 'fiche_aleatoire' THEN
    SELECT jsonb_build_object(
      'composition', f.composition, 'nb_fiches', f.nb_fiches, 'fiches_mode', f.fiches_mode,
      'seuil_exclusion', f.seuil_exclusion, 'nb_notes_exclusion', f.nb_notes_exclusion,
      'champs', coalesce((SELECT jsonb_agg(jsonb_build_object('champ_code', c.champ_code, 'role', c.role))
        FROM jeupharma.jeux_fiche_champs c WHERE c.jeu_id = j.id), '[]'::jsonb),
      'emplacements', coalesce((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'ordre', e.ordre, 'mode', e.mode, 'matrice_id', e.matrice_id) ORDER BY e.ordre)
        FROM jeupharma.jeux_fiche_emplacements e WHERE e.jeu_id = j.id), '[]'::jsonb)
    ) INTO out FROM jeupharma.jeux_fiche f WHERE f.jeu_id = j.id;
  ELSIF j.type_jeu = 'ordonnance' THEN
    SELECT jsonb_build_object(
      'associations_possibles', o.associations_possibles,
      'champs', coalesce((SELECT jsonb_agg(champ_code) FROM jeupharma.jeux_ordonnance_champs c WHERE c.jeu_id = j.id), '[]'::jsonb),
      'besoins', coalesce((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'ordre', b.ordre, 'mode', b.mode, 'matrice_id', b.matrice_id, 'filtre_json', b.filtre_json) ORDER BY b.ordre)
        FROM jeupharma.jeux_ordonnance_besoins b WHERE b.jeu_id = j.id), '[]'::jsonb)
    ) INTO out FROM jeupharma.jeux_ordonnance o WHERE o.jeu_id = j.id;
  ELSIF j.type_jeu = 'classement' THEN
    SELECT jsonb_build_object('consigne', c.consigne, 'items', c.items_json, 'zones', c.zones_json)
    INTO out FROM jeupharma.jeux_classement c WHERE c.jeu_id = j.id;
  ELSIF j.type_jeu = 'appariement' THEN
    SELECT jsonb_build_object('consigne', a.consigne, 'gauche', a.gauche_json, 'droite', a.droite_json, 'paires', a.paires_json)
    INTO out FROM jeupharma.jeux_appariement a WHERE a.jeu_id = j.id;
  END IF;
  RETURN out;
END; $$;

-- Classement / appariement : demarrer + soumettre serveur
CREATE OR REPLACE FUNCTION jeupharma.jeu_demarrer_classement(
  p_jeu_id uuid, p_contexte text DEFAULT 'classique', p_passage_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'jeupharma', 'portail', 'pg_temp' AS $$
DECLARE
  j jeupharma.jeux%ROWTYPE; c jeupharma.jeux_classement%ROWTYPE; tid uuid; snap jsonb; ctx text;
BEGIN
  IF auth.uid() IS NULL OR NOT jeupharma.has_jeupharma_access() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  ctx := coalesce(nullif(p_contexte, ''), 'classique');
  SELECT * INTO j FROM jeupharma.jeux WHERE id = p_jeu_id AND type_jeu = 'classement' AND statut = 'actif';
  IF NOT FOUND THEN RAISE EXCEPTION 'Jeu introuvable'; END IF;
  IF EXISTS (SELECT 1 FROM jeupharma.parcours_apprentissage pa WHERE pa.id = j.parcours_id AND pa.est_laboratoire)
     AND NOT jeupharma.is_portail_admin() THEN RAISE EXCEPTION 'Réservé admin'; END IF;
  SELECT * INTO c FROM jeupharma.jeux_classement WHERE jeu_id = j.id;
  snap := jsonb_build_object('consigne', c.consigne, 'items', c.items_json, 'zones', c.zones_json);
  INSERT INTO jeupharma.jeux_tentatives (jeu_id, utilisateur_id, contexte, passage_id, snapshot_json, notation)
  VALUES (j.id, auth.uid(), ctx, p_passage_id, snap, 'serveur') RETURNING id INTO tid;
  RETURN jsonb_build_object('tentative_id', tid, 'snapshot', snap, 'contexte', ctx);
END; $$;

CREATE OR REPLACE FUNCTION jeupharma.jeu_soumettre_classement(p_tentative_id uuid, p_placements jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'jeupharma', 'portail', 'pg_temp' AS $$
DECLARE
  t jeupharma.jeux_tentatives%ROWTYPE; z jsonb; item_id text; zone_id text; ok boolean;
  obtenu numeric := 0; maxs numeric := 0; details jsonb := '[]'::jsonb; key_map jsonb := '{}'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT * INTO t FROM jeupharma.jeux_tentatives WHERE id = p_tentative_id AND utilisateur_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Tentative introuvable'; END IF;
  IF t.termine_at IS NOT NULL THEN RAISE EXCEPTION 'Déjà terminée'; END IF;
  -- clé item→zone depuis snapshot
  FOR z IN SELECT * FROM jsonb_array_elements(coalesce(t.snapshot_json->'zones', '[]'::jsonb)) LOOP
    FOR item_id IN SELECT jsonb_array_elements_text(coalesce(z->'item_ids', '[]'::jsonb)) LOOP
      key_map := key_map || jsonb_build_object(item_id, z->>'id');
      maxs := maxs + 1;
    END LOOP;
  END LOOP;
  FOR item_id IN SELECT jsonb_object_keys(coalesce(p_placements, '{}'::jsonb)) LOOP
    zone_id := p_placements->>item_id;
    ok := (key_map->>item_id) IS NOT NULL AND (key_map->>item_id) = zone_id;
    IF ok THEN obtenu := obtenu + 1; END IF;
    details := details || jsonb_build_array(jsonb_build_object('item_id', item_id, 'zone_id', zone_id, 'ok', ok));
  END LOOP;
  UPDATE jeupharma.jeux_tentatives SET
    reponses_json = coalesce(p_placements, '{}'::jsonb), details_json = details,
    score_obtenu = obtenu, score_max = maxs, termine_at = now()
  WHERE id = t.id;
  RETURN jsonb_build_object('tentative_id', t.id, 'score_obtenu', obtenu, 'score_max', maxs, 'details', details);
END; $$;

CREATE OR REPLACE FUNCTION jeupharma.jeu_demarrer_appariement(
  p_jeu_id uuid, p_contexte text DEFAULT 'classique', p_passage_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'jeupharma', 'portail', 'pg_temp' AS $$
DECLARE
  j jeupharma.jeux%ROWTYPE; a jeupharma.jeux_appariement%ROWTYPE; tid uuid; snap jsonb; pub jsonb; ctx text;
BEGIN
  IF auth.uid() IS NULL OR NOT jeupharma.has_jeupharma_access() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  ctx := coalesce(nullif(p_contexte, ''), 'classique');
  SELECT * INTO j FROM jeupharma.jeux WHERE id = p_jeu_id AND type_jeu = 'appariement' AND statut = 'actif';
  IF NOT FOUND THEN RAISE EXCEPTION 'Jeu introuvable'; END IF;
  IF EXISTS (SELECT 1 FROM jeupharma.parcours_apprentissage pa WHERE pa.id = j.parcours_id AND pa.est_laboratoire)
     AND NOT jeupharma.is_portail_admin() THEN RAISE EXCEPTION 'Réservé admin'; END IF;
  SELECT * INTO a FROM jeupharma.jeux_appariement WHERE jeu_id = j.id;
  snap := jsonb_build_object('consigne', a.consigne, 'gauche', a.gauche_json, 'droite', a.droite_json, 'paires', a.paires_json);
  INSERT INTO jeupharma.jeux_tentatives (jeu_id, utilisateur_id, contexte, passage_id, snapshot_json, notation)
  VALUES (j.id, auth.uid(), ctx, p_passage_id, snap, 'serveur') RETURNING id INTO tid;
  IF ctx = 'examen' THEN
    pub := snap - 'paires';
  ELSE
    pub := snap;
  END IF;
  RETURN jsonb_build_object('tentative_id', tid, 'snapshot', pub, 'contexte', ctx);
END; $$;

CREATE OR REPLACE FUNCTION jeupharma.jeu_soumettre_appariement(p_tentative_id uuid, p_paires jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'jeupharma', 'portail', 'pg_temp' AS $$
DECLARE
  t jeupharma.jeux_tentatives%ROWTYPE; p jsonb; gid text; did text; ok boolean;
  obtenu numeric := 0; maxs numeric := 0; details jsonb := '[]'::jsonb; key_map jsonb := '{}'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT * INTO t FROM jeupharma.jeux_tentatives WHERE id = p_tentative_id AND utilisateur_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Tentative introuvable'; END IF;
  IF t.termine_at IS NOT NULL THEN RAISE EXCEPTION 'Déjà terminée'; END IF;
  FOR p IN SELECT * FROM jsonb_array_elements(coalesce(t.snapshot_json->'paires', '[]'::jsonb)) LOOP
    key_map := key_map || jsonb_build_object(p->>'gauche_id', p->>'droite_id');
    maxs := maxs + 1;
  END LOOP;
  FOR gid IN SELECT jsonb_object_keys(coalesce(p_paires, '{}'::jsonb)) LOOP
    did := p_paires->>gid;
    ok := (key_map->>gid) IS NOT NULL AND (key_map->>gid) = did;
    IF ok THEN obtenu := obtenu + 1; END IF;
    details := details || jsonb_build_array(jsonb_build_object('gauche_id', gid, 'droite_id', did, 'ok', ok));
  END LOOP;
  UPDATE jeupharma.jeux_tentatives SET
    reponses_json = coalesce(p_paires, '{}'::jsonb), details_json = details,
    score_obtenu = obtenu, score_max = maxs, termine_at = now()
  WHERE id = t.id;
  RETURN jsonb_build_object('tentative_id', t.id, 'score_obtenu', obtenu, 'score_max', maxs, 'details', details);
END; $$;

-- Notation déclarée (trous / fiche / ordonnance)
CREATE OR REPLACE FUNCTION jeupharma.jeu_soumettre_declare(
  p_tentative_id uuid,
  p_reponses jsonb,
  p_score_provisoire numeric,
  p_score_max numeric,
  p_details jsonb DEFAULT '[]'::jsonb,
  p_demander_relecture boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'jeupharma', 'portail', 'pg_temp' AS $$
DECLARE
  t jeupharma.jeux_tentatives%ROWTYPE;
  rel text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT * INTO t FROM jeupharma.jeux_tentatives WHERE id = p_tentative_id AND utilisateur_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Tentative introuvable'; END IF;
  IF t.termine_at IS NOT NULL THEN RAISE EXCEPTION 'Déjà terminée'; END IF;
  rel := CASE
    WHEN p_demander_relecture OR t.contexte = 'examen' THEN 'en_attente'
    ELSE 'aucune'
  END;
  UPDATE jeupharma.jeux_tentatives SET
    reponses_json = coalesce(p_reponses, '{}'::jsonb),
    details_json = coalesce(p_details, '[]'::jsonb),
    score_provisoire = p_score_provisoire,
    score_obtenu = p_score_provisoire,
    score_max = p_score_max,
    notation = 'declaree',
    relecture = rel,
    revele_at = coalesce(revele_at, now()),
    termine_at = now()
  WHERE id = t.id
  RETURNING * INTO t;
  RETURN jsonb_build_object(
    'tentative_id', t.id, 'score_obtenu', t.score_obtenu, 'score_max', t.score_max,
    'relecture', t.relecture, 'contexte', t.contexte
  );
END; $$;

CREATE OR REPLACE FUNCTION jeupharma.jeu_demarrer_declare(
  p_jeu_id uuid, p_snapshot jsonb,
  p_contexte text DEFAULT 'classique', p_passage_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'jeupharma', 'portail', 'pg_temp' AS $$
DECLARE
  j jeupharma.jeux%ROWTYPE; tid uuid; ctx text;
BEGIN
  IF auth.uid() IS NULL OR NOT jeupharma.has_jeupharma_access() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  ctx := coalesce(nullif(p_contexte, ''), 'classique');
  SELECT * INTO j FROM jeupharma.jeux WHERE id = p_jeu_id AND statut = 'actif';
  IF NOT FOUND THEN RAISE EXCEPTION 'Jeu introuvable'; END IF;
  IF j.type_jeu NOT IN ('trous', 'fiche_aleatoire', 'ordonnance') THEN
    RAISE EXCEPTION 'Type non déclaré';
  END IF;
  IF EXISTS (SELECT 1 FROM jeupharma.parcours_apprentissage pa WHERE pa.id = j.parcours_id AND pa.est_laboratoire)
     AND NOT jeupharma.is_portail_admin() THEN RAISE EXCEPTION 'Réservé admin'; END IF;
  INSERT INTO jeupharma.jeux_tentatives (jeu_id, utilisateur_id, contexte, passage_id, snapshot_json, notation)
  VALUES (j.id, auth.uid(), ctx, p_passage_id, coalesce(p_snapshot, '{}'::jsonb), 'declaree')
  RETURNING id INTO tid;
  RETURN jsonb_build_object('tentative_id', tid, 'snapshot', coalesce(p_snapshot, '{}'::jsonb), 'contexte', ctx);
END; $$;

REVOKE ALL ON FUNCTION jeupharma.jeu_type_config(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.jeu_demarrer_classement(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.jeu_soumettre_classement(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.jeu_demarrer_appariement(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.jeu_soumettre_appariement(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.jeu_demarrer_declare(uuid, jsonb, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.jeu_soumettre_declare(uuid, jsonb, numeric, numeric, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.jeu_type_config(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.jeu_demarrer_classement(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.jeu_soumettre_classement(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.jeu_demarrer_appariement(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.jeu_soumettre_appariement(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.jeu_demarrer_declare(uuid, jsonb, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.jeu_soumettre_declare(uuid, jsonb, numeric, numeric, jsonb, boolean) TO authenticated;
