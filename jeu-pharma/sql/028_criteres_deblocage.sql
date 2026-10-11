-- =============================================================================
-- 028 : Critères de validation / déblocage (parcours, chapitres, leçons)
--
-- Modèle :
--  * Chaque élément (leçon, chapitre, parcours) porte `criteres_json` = COMMENT il est validé :
--      { "lecture": bool,                    -- leçon : lue jusqu'en bas (défaut true)
--        "jeux": [{ "modele_id", "score_min_pct" }],   -- jeux à réussir (meilleur score >= min)
--        "logique": "et" | "ou",             -- combine lecture + jeux (défaut "et")
--        "progression_min_pct": 0..100 }     -- parcours : % de leçons à valider (défaut 100)
--  * Le verrou = pointeur vers l'élément précédent :
--      modules_cours.prerequis_module_id (leçon ou chapitre, existant)
--      parcours_apprentissage.prerequis_parcours_id (nouveau)
--  * Un élément est débloqué quand son prérequis est VALIDÉ (calcul en direct : lecture
--    enregistrée + scores réels de tentatives_jeu). `progression_modules.statut` n'est qu'un miroir.
--  * Un chapitre est validé quand toutes ses leçons publiées le sont.
-- Les helpers `v2__*` / `v2_module_*` / `v2_parcours_*` prennent p_user : AUCUN grant aux clients
-- (appelés seulement par les RPC security definer ci-dessous).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Colonnes
-- ---------------------------------------------------------------------------
ALTER TABLE jeupharma.modules_cours
  ADD COLUMN IF NOT EXISTS criteres_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS contenu_maj_at timestamptz;

ALTER TABLE jeupharma.parcours_apprentissage
  ADD COLUMN IF NOT EXISTS prerequis_parcours_id uuid REFERENCES jeupharma.parcours_apprentissage(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS criteres_json jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'parcours_prerequis_not_self') THEN
    ALTER TABLE jeupharma.parcours_apprentissage
      ADD CONSTRAINT parcours_prerequis_not_self CHECK (prerequis_parcours_id IS DISTINCT FROM id);
  END IF;
END $$;

ALTER TABLE jeupharma.progression_modules
  ADD COLUMN IF NOT EXISTS lecture_pct int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lu_at timestamptz;

-- Date de dernière mise à jour du contenu : repli sur updated_at tant qu'aucune publication
UPDATE jeupharma.modules_cours SET contenu_maj_at = updated_at WHERE contenu_maj_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Nettoyage des critères (écriture admin)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2__clean_criteres(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  out jsonb := '{}'::jsonb;
  arr jsonb := '[]'::jsonb;
  e jsonb;
  pct numeric;
  mid uuid;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RETURN '{}'::jsonb;
  END IF;
  IF jsonb_typeof(p->'lecture') = 'boolean' THEN
    out := out || jsonb_build_object('lecture', p->'lecture');
  END IF;
  IF p->>'logique' IN ('et', 'ou') THEN
    out := out || jsonb_build_object('logique', p->>'logique');
  END IF;
  IF (p->>'progression_min_pct') ~ '^[0-9]+(\.[0-9]+)?$' THEN
    out := out || jsonb_build_object(
      'progression_min_pct',
      least(100, greatest(0, round((p->>'progression_min_pct')::numeric)))
    );
  END IF;
  IF jsonb_typeof(p->'jeux') = 'array' THEN
    FOR e IN SELECT * FROM jsonb_array_elements(p->'jeux') LOOP
      BEGIN
        mid := (e->>'modele_id')::uuid;
      EXCEPTION WHEN others THEN
        CONTINUE;
      END;
      IF mid IS NULL THEN CONTINUE; END IF;
      pct := CASE
        WHEN (e->>'score_min_pct') ~ '^[0-9]+(\.[0-9]+)?$'
          THEN least(100, greatest(0, round((e->>'score_min_pct')::numeric)))
        ELSE 0
      END;
      arr := arr || jsonb_build_array(jsonb_build_object('modele_id', mid, 'score_min_pct', pct));
    END LOOP;
    out := out || jsonb_build_object('jeux', arr);
  END IF;
  RETURN out;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Scores de jeux
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2__jeu_meilleur_pct(p_user uuid, p_modele uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
  SELECT max(
    CASE WHEN t.score_max IS NOT NULL AND t.score_max > 0
         THEN 100.0 * coalesce(t.score_obtenu, 0) / t.score_max
         ELSE 100 END
  )
  FROM jeupharma.tentatives_jeu t
  WHERE t.utilisateur_id = p_user
    AND t.modele_id = p_modele
    AND t.termine_at IS NOT NULL;
$$;

-- Statut des jeux d'un jeu de critères : { liste:[…], n, ok, somme, max_part }
CREATE OR REPLACE FUNCTION jeupharma.v2__criteres_jeux(p_user uuid, p_crit jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
DECLARE
  e jsonb;
  mj jeupharma.modeles_jeu%ROWTYPE;
  best numeric;
  mn numeric;
  part numeric;
  is_ok boolean;
  liste jsonb := '[]'::jsonb;
  n int := 0;
  k int := 0;
  somme numeric := 0;
  max_part numeric := 0;
BEGIN
  IF jsonb_typeof(p_crit->'jeux') = 'array' THEN
    FOR e IN SELECT * FROM jsonb_array_elements(p_crit->'jeux') LOOP
      SELECT * INTO mj FROM jeupharma.modeles_jeu WHERE id = (e->>'modele_id')::uuid AND actif;
      IF NOT FOUND THEN CONTINUE; END IF;
      mn := coalesce((e->>'score_min_pct')::numeric, 0);
      best := jeupharma.v2__jeu_meilleur_pct(p_user, mj.id);
      is_ok := best IS NOT NULL AND best >= mn;
      part := CASE
        WHEN best IS NULL THEN 0
        WHEN mn <= 0 THEN 1
        ELSE least(1, best / mn)
      END;
      n := n + 1;
      IF is_ok THEN k := k + 1; END IF;
      somme := somme + part;
      max_part := greatest(max_part, part);
      liste := liste || jsonb_build_array(jsonb_build_object(
        'modele_id', mj.id,
        'titre', mj.titre,
        'code_unique', mj.code_unique,
        'type_jeu', mj.type_jeu,
        'score_min_pct', mn,
        'meilleur_pct', CASE WHEN best IS NULL THEN NULL ELSE round(best) END,
        'fait', best IS NOT NULL,
        'ok', is_ok
      ));
    END LOOP;
  END IF;
  RETURN jsonb_build_object('liste', liste, 'n', n, 'ok', k, 'somme', somme, 'max_part', max_part);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Détail / validité d'un module (leçon ou chapitre)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_module_detail(p_user uuid, p_module uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  m jeupharma.modules_cours%ROWTYPE;
  pm jeupharma.progression_modules%ROWTYPE;
  crit jsonb;
  logique text;
  jx jsonb;
  n_j int;
  k_j int;
  somme numeric;
  max_part numeric;
  lecture_req boolean;
  n int;
  k int;
  part_lect numeric;
  valide boolean;
  pct numeric;
  nb int := 0;
  nbv int := 0;
  sum_pct numeric := 0;
  leaf record;
  dl jsonb;
  jeux_ok boolean;
BEGIN
  SELECT * INTO m FROM jeupharma.modules_cours WHERE id = p_module;
  IF NOT FOUND THEN RETURN NULL; END IF;

  crit := coalesce(m.criteres_json, '{}'::jsonb);
  logique := CASE WHEN crit->>'logique' = 'ou' THEN 'ou' ELSE 'et' END;
  jx := jeupharma.v2__criteres_jeux(p_user, crit);
  n_j := (jx->>'n')::int;
  k_j := (jx->>'ok')::int;
  somme := (jx->>'somme')::numeric;
  max_part := (jx->>'max_part')::numeric;

  IF m.est_groupe THEN
    FOR leaf IN
      WITH RECURSIVE sub AS (
        SELECT c.id, c.est_groupe, c.publie FROM jeupharma.modules_cours c WHERE c.parent_id = p_module
        UNION
        SELECT c.id, c.est_groupe, c.publie
        FROM jeupharma.modules_cours c JOIN sub ON c.parent_id = sub.id
      )
      SELECT sub.id FROM sub WHERE sub.publie AND NOT sub.est_groupe
    LOOP
      dl := jeupharma.v2_module_detail(p_user, leaf.id);
      nb := nb + 1;
      sum_pct := sum_pct + coalesce((dl->>'pct')::numeric, 0);
      IF (dl->>'valide')::boolean THEN nbv := nbv + 1; END IF;
    END LOOP;
    jeux_ok := n_j = 0 OR (CASE WHEN logique = 'ou' THEN k_j >= 1 ELSE k_j = n_j END);
    valide := (nbv = nb) AND jeux_ok;
    pct := CASE
      WHEN valide THEN 100
      WHEN nb = 0 THEN 0
      ELSE round(sum_pct / nb)
    END;
    RETURN jsonb_build_object(
      'est_groupe', true,
      'valide', valide,
      'pct', pct,
      'nb_lecons', nb,
      'nb_valides', nbv,
      'jeux', jx->'liste',
      'logique', logique
    );
  END IF;

  SELECT * INTO pm FROM jeupharma.progression_modules WHERE user_id = p_user AND module_id = p_module;

  lecture_req := CASE
    WHEN jsonb_typeof(crit->'lecture') = 'boolean' THEN (crit->>'lecture')::boolean
    ELSE true
  END;
  n := (CASE WHEN lecture_req THEN 1 ELSE 0 END) + n_j;
  k := (CASE WHEN lecture_req AND pm.lu_at IS NOT NULL THEN 1 ELSE 0 END) + k_j;
  valide := n = 0 OR (CASE WHEN logique = 'ou' THEN k >= 1 ELSE k = n END);
  part_lect := CASE WHEN pm.lu_at IS NOT NULL THEN 1 ELSE coalesce(pm.lecture_pct, 0) / 100.0 END;

  IF valide THEN
    pct := 100;
  ELSIF logique = 'ou' THEN
    pct := round(100 * greatest(CASE WHEN lecture_req THEN part_lect ELSE 0 END, max_part));
  ELSE
    pct := round(100 * ((CASE WHEN lecture_req THEN part_lect ELSE 0 END) + somme) / n);
  END IF;

  RETURN jsonb_build_object(
    'est_groupe', false,
    'lecture_requise', lecture_req,
    'lu', pm.lu_at IS NOT NULL,
    'lecture_pct', coalesce(pm.lecture_pct, 0),
    'jeux', jx->'liste',
    'logique', logique,
    'valide', valide,
    'pct', pct
  );
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_module_valide(p_user uuid, p_module uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
  SELECT coalesce((jeupharma.v2_module_detail(p_user, p_module)->>'valide')::boolean, true);
$$;

-- ---------------------------------------------------------------------------
-- 5. Parcours : statistiques, verrou
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2__parcours_stats(p_user uuid, p_parcours uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  pa jeupharma.parcours_apprentissage%ROWTYPE;
  crit jsonb;
  logique text;
  min_pct numeric;
  jx jsonb;
  n_j int;
  k_j int;
  nb int := 0;
  nbv int := 0;
  sum_pct numeric := 0;
  leaf record;
  dl jsonb;
  maj timestamptz;
  pct numeric;
  prog_ok boolean;
  jeux_ok boolean;
BEGIN
  SELECT * INTO pa FROM jeupharma.parcours_apprentissage WHERE id = p_parcours;
  IF NOT FOUND THEN RETURN NULL; END IF;

  crit := coalesce(pa.criteres_json, '{}'::jsonb);
  logique := CASE WHEN crit->>'logique' = 'ou' THEN 'ou' ELSE 'et' END;
  min_pct := coalesce((crit->>'progression_min_pct')::numeric, 100);
  jx := jeupharma.v2__criteres_jeux(p_user, crit);
  n_j := (jx->>'n')::int;
  k_j := (jx->>'ok')::int;
  maj := pa.updated_at;

  FOR leaf IN
    SELECT c.id, coalesce(c.contenu_maj_at, c.updated_at) AS maj
    FROM jeupharma.modules_cours c
    WHERE c.parcours_id = p_parcours AND c.publie AND NOT c.est_groupe
  LOOP
    dl := jeupharma.v2_module_detail(p_user, leaf.id);
    nb := nb + 1;
    sum_pct := sum_pct + coalesce((dl->>'pct')::numeric, 0);
    IF (dl->>'valide')::boolean THEN nbv := nbv + 1; END IF;
    maj := greatest(maj, leaf.maj);
  END LOOP;

  pct := CASE WHEN nb = 0 THEN 0 ELSE round(sum_pct / nb) END;
  prog_ok := nb = 0 OR (CASE WHEN min_pct >= 100 THEN nbv = nb ELSE pct >= min_pct END);
  jeux_ok := n_j = 0 OR (CASE WHEN logique = 'ou' THEN k_j >= 1 ELSE k_j = n_j END);

  RETURN jsonb_build_object(
    'pct', pct,
    'nb_lecons', nb,
    'nb_valides', nbv,
    'valide', prog_ok AND jeux_ok,
    'progression_min_pct', min_pct,
    'jeux', jx->'liste',
    'maj_at', maj
  );
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_parcours_detail(p_user uuid, p_parcours uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  pa jeupharma.parcours_apprentissage%ROWTYPE;
  pre jeupharma.parcours_apprentissage%ROWTYPE;
  st jsonb;
  pst jsonb;
  locked boolean := false;
  bp jsonb := NULL;
BEGIN
  SELECT * INTO pa FROM jeupharma.parcours_apprentissage WHERE id = p_parcours;
  IF NOT FOUND THEN RETURN NULL; END IF;
  st := jeupharma.v2__parcours_stats(p_user, p_parcours);

  IF pa.prerequis_parcours_id IS NOT NULL THEN
    SELECT * INTO pre FROM jeupharma.parcours_apprentissage
    WHERE id = pa.prerequis_parcours_id AND actif;
    IF FOUND THEN
      pst := jeupharma.v2__parcours_stats(p_user, pre.id);
      IF NOT (pst->>'valide')::boolean THEN
        locked := true;
        bp := jsonb_build_object(
          'type', 'parcours',
          'parcours_id', pre.id,
          'titre', pre.libelle,
          'pct', pst->'pct',
          'min_pct', pst->'progression_min_pct',
          'jeux', pst->'jeux'
        );
      END IF;
    END IF;
  END IF;

  RETURN st || jsonb_build_object('verrouille', locked, 'bloque_par', bp);
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_parcours_verrouille(p_user uuid, p_parcours uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
  SELECT coalesce((jeupharma.v2_parcours_detail(p_user, p_parcours)->>'verrouille')::boolean, false);
$$;

-- ---------------------------------------------------------------------------
-- 6. Accès à un module : null = accessible, sinon l'élément qui bloque
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_module_bloque_par(p_user uuid, p_module uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  v_parcours uuid;
  pd jsonb;
  r record;
BEGIN
  SELECT parcours_id INTO v_parcours FROM jeupharma.modules_cours WHERE id = p_module;
  IF NOT FOUND THEN RETURN NULL; END IF;

  pd := jeupharma.v2_parcours_detail(p_user, v_parcours);
  IF coalesce((pd->>'verrouille')::boolean, false) THEN
    RETURN pd->'bloque_par';
  END IF;

  -- Le module lui-même, puis ses chapitres parents : chaque prérequis publié doit être validé
  FOR r IN
    SELECT pre.id AS pre_id, pre.titre AS pre_titre
    FROM jeupharma.v2_module_ancetres(p_module) a
    JOIN jeupharma.modules_cours c ON c.id = a.module_id
    JOIN jeupharma.modules_cours pre ON pre.id = c.prerequis_module_id AND pre.publie
    ORDER BY a.profondeur
  LOOP
    IF NOT jeupharma.v2_module_valide(p_user, r.pre_id) THEN
      RETURN jsonb_build_object(
        'type', 'module',
        'module_id', r.pre_id,
        'titre', r.pre_titre,
        'detail', jeupharma.v2_module_detail(p_user, r.pre_id)
      );
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

-- Feuilles débloquées (même signature que 023/024 : consommée par le résolveur de contenu)
CREATE OR REPLACE FUNCTION jeupharma.v2_modules_debloques(
  p_user uuid DEFAULT auth.uid(),
  p_parcours uuid DEFAULT NULL
)
RETURNS TABLE (module_id uuid, ordre int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
  SELECT m.id, m.ordre
  FROM jeupharma.modules_cours m
  WHERE m.parcours_id = COALESCE(p_parcours, jeupharma.v2_parcours_actif(p_user))
    AND m.publie
    AND NOT m.est_groupe
    AND jeupharma.v2_module_bloque_par(p_user, m.id) IS NULL;
$$;

-- ---------------------------------------------------------------------------
-- 7. Miroir progression_modules (statut termine / debloque)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2__sync_progression(p_user uuid, p_parcours uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  leaf record;
BEGIN
  FOR leaf IN
    SELECT c.id FROM jeupharma.modules_cours c
    WHERE c.parcours_id = p_parcours AND c.publie AND NOT c.est_groupe
  LOOP
    IF jeupharma.v2_module_valide(p_user, leaf.id) THEN
      INSERT INTO jeupharma.progression_modules (user_id, module_id, statut, debloque_at, termine_at, updated_at)
      VALUES (p_user, leaf.id, 'termine', now(), now(), now())
      ON CONFLICT (user_id, module_id) DO UPDATE
        SET statut = 'termine',
            termine_at = coalesce(jeupharma.progression_modules.termine_at, now()),
            updated_at = now()
        WHERE jeupharma.progression_modules.statut <> 'termine';
    ELSE
      UPDATE jeupharma.progression_modules
      SET statut = 'debloque', termine_at = NULL, updated_at = now()
      WHERE user_id = p_user AND module_id = leaf.id AND statut = 'termine';
    END IF;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Enregistrement de la lecture (joueur)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_enregistrer_lecture(p_module_id uuid, p_pct int DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  uid uuid := auth.uid();
  m jeupharma.modules_cours%ROWTYPE;
  v_pct int;
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  SELECT * INTO m FROM jeupharma.modules_cours WHERE id = p_module_id;
  IF NOT FOUND OR m.est_groupe OR NOT m.publie THEN
    RAISE EXCEPTION 'Leçon introuvable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jeupharma.inscriptions_parcours i
    WHERE i.user_id = uid AND i.parcours_id = m.parcours_id AND i.statut = 'accepte' AND i.actif
  ) THEN
    RAISE EXCEPTION 'Parcours non accepté';
  END IF;
  IF jeupharma.v2_module_bloque_par(uid, p_module_id) IS NOT NULL THEN
    RAISE EXCEPTION 'Leçon verrouillée';
  END IF;

  v_pct := least(100, greatest(0, coalesce(p_pct, 0)));

  INSERT INTO jeupharma.progression_modules (
    user_id, module_id, statut, debloque_at, lecture_pct, lu_at, updated_at
  ) VALUES (
    uid, p_module_id, 'debloque', now(), v_pct,
    CASE WHEN v_pct >= 95 THEN now() END, now()
  )
  ON CONFLICT (user_id, module_id) DO UPDATE
    SET lecture_pct = greatest(jeupharma.progression_modules.lecture_pct, EXCLUDED.lecture_pct),
        lu_at = coalesce(jeupharma.progression_modules.lu_at, EXCLUDED.lu_at),
        debloque_at = coalesce(jeupharma.progression_modules.debloque_at, now()),
        updated_at = now();

  PERFORM jeupharma.v2__sync_progression(uid, m.parcours_id);
  RETURN jsonb_build_object('detail', jeupharma.v2_module_detail(uid, p_module_id));
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Progression d'un parcours (arbre + critères + verrous)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_progression_parcours(p_parcours uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  uid uuid := auth.uid();
  v_parcours uuid;
  pa jeupharma.parcours_apprentissage%ROWTYPE;
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  v_parcours := COALESCE(p_parcours, jeupharma.v2_parcours_actif(uid));
  IF v_parcours IS NULL THEN
    RETURN jsonb_build_object('parcours_id', null, 'modules', '[]'::jsonb);
  END IF;
  SELECT * INTO pa FROM jeupharma.parcours_apprentissage WHERE id = v_parcours;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('parcours_id', null, 'modules', '[]'::jsonb);
  END IF;

  -- Parcours non accepté : on ne détaille pas (sauf admin)
  IF NOT jeupharma.is_portail_admin() AND NOT EXISTS (
    SELECT 1 FROM jeupharma.inscriptions_parcours i
    WHERE i.user_id = uid AND i.parcours_id = v_parcours AND i.statut = 'accepte' AND i.actif
  ) THEN
    RETURN jsonb_build_object('parcours_id', v_parcours, 'modules', '[]'::jsonb);
  END IF;

  PERFORM jeupharma.v2__sync_progression(uid, v_parcours);

  RETURN jsonb_build_object(
    'parcours_id', v_parcours,
    'parcours', jsonb_build_object(
      'id', pa.id, 'code', pa.code, 'libelle', pa.libelle,
      'description', pa.description, 'mode_contenu', pa.mode_contenu
    ) || coalesce(jeupharma.v2_parcours_detail(uid, v_parcours), '{}'::jsonb),
    'modules', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'code', m.code,
          'titre', m.titre,
          'resume', m.resume,
          'objectifs', m.objectifs,
          'ordre', m.ordre,
          'publie', m.publie,
          'est_groupe', m.est_groupe,
          'parent_id', m.parent_id,
          'maj_at', coalesce(m.contenu_maj_at, m.updated_at),
          'criteres', m.criteres_json,
          'detail', det.d,
          'valide', coalesce((det.d->>'valide')::boolean, false),
          'pct', coalesce((det.d->>'pct')::numeric, 0),
          'verrouille', bp.b IS NOT NULL,
          'bloque_par', bp.b,
          'statut', CASE
            WHEN m.est_groupe THEN 'groupe'
            WHEN bp.b IS NOT NULL THEN 'verrouille'
            WHEN coalesce((det.d->>'valide')::boolean, false) THEN 'termine'
            ELSE 'debloque'
          END
        )
        ORDER BY m.ordre
      )
      FROM jeupharma.modules_cours m
      CROSS JOIN LATERAL (SELECT jeupharma.v2_module_detail(uid, m.id) AS d) det
      CROSS JOIN LATERAL (SELECT jeupharma.v2_module_bloque_par(uid, m.id) AS b) bp
      WHERE m.parcours_id = v_parcours AND m.publie
    ), '[]'::jsonb)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Liste des parcours (joueur) : état d'inscription, verrou, mise à jour
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_parcours_liste()
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
  RETURN coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', pa.id,
        'code', pa.code,
        'libelle', pa.libelle,
        'description', pa.description,
        'ordre', pa.ordre,
        'statut', i.statut,
        'maj_at', det.d->'maj_at',
        'nb_lecons', det.d->'nb_lecons',
        'verrouille', coalesce((det.d->>'verrouille')::boolean, false),
        'bloque_par', det.d->'bloque_par',
        'pct', CASE WHEN i.statut = 'accepte' THEN det.d->'pct' END,
        'nb_valides', CASE WHEN i.statut = 'accepte' THEN det.d->'nb_valides' END
      ) ORDER BY pa.ordre
    )
    FROM jeupharma.parcours_apprentissage pa
    LEFT JOIN jeupharma.inscriptions_parcours i ON i.user_id = uid AND i.parcours_id = pa.id
    CROSS JOIN LATERAL (SELECT jeupharma.v2_parcours_detail(uid, pa.id) AS d) det
    WHERE pa.actif
  ), '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Leçon joueur : accès par critères + inscription acceptée
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
  bp jsonb;
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT * INTO m FROM jeupharma.modules_cours WHERE id = p_module_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Leçon introuvable'; END IF;

  IF coalesce(p_preview, false) AND jeupharma.is_portail_admin() THEN
    ok := true;
  ELSE
    ok := m.publie AND NOT m.est_groupe
      AND EXISTS (
        SELECT 1 FROM jeupharma.inscriptions_parcours i
        WHERE i.user_id = uid AND i.parcours_id = m.parcours_id
          AND i.statut = 'accepte' AND i.actif
      );
    IF ok THEN
      bp := jeupharma.v2_module_bloque_par(uid, p_module_id);
      ok := bp IS NULL;
    END IF;
  END IF;

  IF NOT ok THEN
    RAISE EXCEPTION 'Leçon verrouillée';
  END IF;

  RETURN jsonb_build_object(
    'module', to_jsonb(m) || jsonb_build_object('maj_at', coalesce(m.contenu_maj_at, m.updated_at)),
    'detail', jeupharma.v2_module_detail(uid, p_module_id),
    'blocs', coalesce((
      SELECT jsonb_agg(to_jsonb(b) ORDER BY b.ordre, b.created_at)
      FROM jeupharma.module_blocs b
      WHERE b.module_id = p_module_id AND b.visible
    ), '[]'::jsonb)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 12. Mon espace : inscriptions + progression + scores
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_mon_espace()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
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
    'inscriptions', coalesce((
      SELECT jsonb_agg(e || jsonb_build_object(
        'pct', CASE WHEN e->>'statut' = 'accepte' THEN det.d->'pct' END,
        'nb_lecons', det.d->'nb_lecons',
        'nb_valides', det.d->'nb_valides',
        'valide', det.d->'valide',
        'verrouille', det.d->'verrouille',
        'bloque_par', det.d->'bloque_par',
        'maj_at', det.d->'maj_at'
      ))
      FROM jsonb_array_elements(jeupharma.v2_lister_mes_inscriptions()) e
      CROSS JOIN LATERAL (
        SELECT jeupharma.v2_parcours_detail(uid, (e->>'parcours_id')::uuid) AS d
      ) det
    ), '[]'::jsonb),
    'parcours', coalesce((
      SELECT jsonb_agg(jeupharma.v2_progression_parcours(i.parcours_id) ORDER BY pa.ordre)
      FROM jeupharma.inscriptions_parcours i
      JOIN jeupharma.parcours_apprentissage pa ON pa.id = i.parcours_id AND pa.actif
      WHERE i.user_id = uid AND i.statut = 'accepte' AND i.actif
    ), '[]'::jsonb),
    'scores', coalesce((
      SELECT jsonb_agg(x.o ORDER BY x.ts DESC NULLS LAST)
      FROM (
        SELECT t.termine_at AS ts,
               jsonb_build_object(
                 'id', t.id,
                 'modele_id', t.modele_id,
                 'parcours_id', mj.parcours_id,
                 'titre', mj.titre,
                 'type_jeu', mj.type_jeu,
                 'code_unique', mj.code_unique,
                 'score_obtenu', t.score_obtenu,
                 'score_max', t.score_max,
                 'termine_at', t.termine_at
               ) AS o
        FROM jeupharma.tentatives_jeu t
        JOIN jeupharma.modeles_jeu mj ON mj.id = t.modele_id
        WHERE t.utilisateur_id = uid AND t.termine_at IS NOT NULL
        ORDER BY t.termine_at DESC
        LIMIT 200
      ) x
    ), '[]'::jsonb),
    'progression', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'module_id', pm.module_id,
        'statut', pm.statut,
        'titre', mc.titre,
        'parcours_id', mc.parcours_id,
        'lecture_pct', pm.lecture_pct
      ))
      FROM jeupharma.progression_modules pm
      JOIN jeupharma.modules_cours mc ON mc.id = pm.module_id
      WHERE pm.user_id = uid
    ), '[]'::jsonb)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 13. Admin : critères / prérequis (parcours) + upsert module étendu
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_maj_parcours_criteres(
  p_parcours_id uuid,
  p_prerequis_id uuid,
  p_criteres jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  row jeupharma.parcours_apprentissage%ROWTYPE;
  cyc boolean;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF p_prerequis_id IS NOT NULL THEN
    IF p_prerequis_id = p_parcours_id THEN
      RAISE EXCEPTION 'Un parcours ne peut pas dépendre de lui-même';
    END IF;
    WITH RECURSIVE up AS (
      SELECT p.id, p.prerequis_parcours_id FROM jeupharma.parcours_apprentissage p WHERE p.id = p_prerequis_id
      UNION
      SELECT p.id, p.prerequis_parcours_id
      FROM jeupharma.parcours_apprentissage p JOIN up ON p.id = up.prerequis_parcours_id
    )
    SELECT EXISTS (SELECT 1 FROM up WHERE up.id = p_parcours_id) INTO cyc;
    IF cyc THEN
      RAISE EXCEPTION 'Prérequis circulaire entre parcours';
    END IF;
  END IF;

  UPDATE jeupharma.parcours_apprentissage
  SET prerequis_parcours_id = p_prerequis_id,
      criteres_json = jeupharma.v2__clean_criteres(p_criteres),
      updated_at = now()
  WHERE id = p_parcours_id
  RETURNING * INTO row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parcours introuvable'; END IF;
  RETURN to_jsonb(row);
END;
$$;

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
  v_publie boolean;
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
    v_publie := coalesce((p_payload->>'publie')::boolean, coalesce(p_payload->>'statut', 'publie') = 'publie');
    INSERT INTO jeupharma.modules_cours (
      parcours_id, parent_id, code, titre, resume, objectifs, ordre,
      publie, est_groupe, prerequis_module_id, created_by, version_publication,
      icone, couleur_accent, couverture_url, statut, criteres_json, contenu_maj_at
    ) VALUES (
      (p_payload->>'parcours_id')::uuid,
      nullif(p_payload->>'parent_id', '')::uuid,
      v_code,
      trim(p_payload->>'titre'),
      coalesce(p_payload->>'resume', ''),
      coalesce(p_payload->>'objectifs', ''),
      coalesce((p_payload->>'ordre')::int, 100),
      v_publie,
      coalesce((p_payload->>'est_groupe')::boolean, false),
      nullif(p_payload->>'prerequis_module_id', '')::uuid,
      auth.uid(),
      1,
      nullif(p_payload->>'icone', ''),
      nullif(p_payload->>'couleur_accent', ''),
      nullif(p_payload->>'couverture_url', ''),
      coalesce(nullif(p_payload->>'statut', ''), 'publie'),
      jeupharma.v2__clean_criteres(p_payload->'criteres_json'),
      now()
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
      criteres_json = CASE
        WHEN p_payload ? 'criteres_json' THEN jeupharma.v2__clean_criteres(p_payload->'criteres_json')
        ELSE criteres_json
      END,
      -- La date « mis à jour » du contenu suit la publication (ou un changement de titre / résumé)
      contenu_maj_at = CASE
        WHEN coalesce((p_payload->>'publie')::boolean, false)
          OR p_payload->>'statut' = 'publie'
          OR p_payload ? 'titre' OR p_payload ? 'resume'
          THEN now()
        ELSE contenu_maj_at
      END,
      updated_at = now()
    WHERE id = v_id
    RETURNING * INTO row;
    IF NOT FOUND THEN RAISE EXCEPTION 'Module introuvable'; END IF;

    IF row.prerequis_module_id IS NOT NULL AND row.prerequis_module_id = row.id THEN
      RAISE EXCEPTION 'Un module ne peut pas être son propre prérequis';
    END IF;
  END IF;

  RETURN to_jsonb(row);
END;
$$;

-- ---------------------------------------------------------------------------
-- 14. Grants : seuls les RPC joueur / admin sont exposés
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION jeupharma.v2__clean_criteres(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2__jeu_meilleur_pct(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2__criteres_jeux(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_module_detail(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_module_valide(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2__parcours_stats(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_parcours_detail(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_parcours_verrouille(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_module_bloque_par(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2__sync_progression(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_enregistrer_lecture(uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_parcours_liste() FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_maj_parcours_criteres(uuid, uuid, jsonb) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION jeupharma.v2__clean_criteres(jsonb) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION jeupharma.v2__jeu_meilleur_pct(uuid, uuid) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION jeupharma.v2__criteres_jeux(uuid, jsonb) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION jeupharma.v2_module_detail(uuid, uuid) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION jeupharma.v2_module_valide(uuid, uuid) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION jeupharma.v2__parcours_stats(uuid, uuid) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION jeupharma.v2_parcours_detail(uuid, uuid) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION jeupharma.v2_parcours_verrouille(uuid, uuid) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION jeupharma.v2_module_bloque_par(uuid, uuid) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION jeupharma.v2__sync_progression(uuid, uuid) FROM authenticated, anon;

GRANT EXECUTE ON FUNCTION jeupharma.v2_enregistrer_lecture(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_parcours_liste() TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_maj_parcours_criteres(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_progression_parcours(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_lecon_joueur(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_mon_espace() TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_upsert_module(jsonb) TO authenticated;
