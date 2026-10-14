-- =============================================================================
-- 040 : Parcours multi-niveaux ★1–★5
-- - inscriptions_parcours.niveau_parcours (1–5)
-- - niveau_min / niveau_max sur modules_cours, module_blocs, publications_connaissances
-- - RPC accepter / modifier niveau ; filtrage v2_* + variantes payload
-- - Catalogue joueur = pubs des leçons accessibles (plus de referentiel_valide)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Colonnes
-- ---------------------------------------------------------------------------
ALTER TABLE jeupharma.inscriptions_parcours
  ADD COLUMN IF NOT EXISTS niveau_parcours int NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inscriptions_niveau_parcours_chk'
  ) THEN
    ALTER TABLE jeupharma.inscriptions_parcours
      ADD CONSTRAINT inscriptions_niveau_parcours_chk
      CHECK (niveau_parcours BETWEEN 1 AND 5);
  END IF;
END $$;

ALTER TABLE jeupharma.modules_cours
  ADD COLUMN IF NOT EXISTS niveau_min int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS niveau_max int NOT NULL DEFAULT 5;

ALTER TABLE jeupharma.module_blocs
  ADD COLUMN IF NOT EXISTS niveau_min int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS niveau_max int NOT NULL DEFAULT 5;

ALTER TABLE jeupharma.publications_connaissances
  ADD COLUMN IF NOT EXISTS niveau_min int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS niveau_max int NOT NULL DEFAULT 5;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'modules_cours_niveau_plage_chk') THEN
    ALTER TABLE jeupharma.modules_cours
      ADD CONSTRAINT modules_cours_niveau_plage_chk
      CHECK (niveau_min BETWEEN 1 AND 5 AND niveau_max BETWEEN 1 AND 5 AND niveau_min <= niveau_max);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'module_blocs_niveau_plage_chk') THEN
    ALTER TABLE jeupharma.module_blocs
      ADD CONSTRAINT module_blocs_niveau_plage_chk
      CHECK (niveau_min BETWEEN 1 AND 5 AND niveau_max BETWEEN 1 AND 5 AND niveau_min <= niveau_max);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'publications_niveau_plage_chk') THEN
    ALTER TABLE jeupharma.publications_connaissances
      ADD CONSTRAINT publications_niveau_plage_chk
      CHECK (niveau_min BETWEEN 1 AND 5 AND niveau_max BETWEEN 1 AND 5 AND niveau_min <= niveau_max);
  END IF;
END $$;

COMMENT ON COLUMN jeupharma.inscriptions_parcours.niveau_parcours IS
  'Niveau d accès au parcours (étoiles 1–5), fixé par l admin à l accord.';
COMMENT ON COLUMN jeupharma.modules_cours.niveau_min IS
  'Étoile minimale inclusive pour voir ce module (chapitre ou leçon).';
COMMENT ON COLUMN jeupharma.modules_cours.niveau_max IS
  'Étoile maximale inclusive pour voir ce module.';

-- Backfill explicite
UPDATE jeupharma.inscriptions_parcours
SET niveau_parcours = 1
WHERE niveau_parcours IS DISTINCT FROM 1
  OR niveau_parcours IS NULL;

UPDATE jeupharma.modules_cours SET niveau_min = 1, niveau_max = 5
WHERE niveau_min IS DISTINCT FROM 1 OR niveau_max IS DISTINCT FROM 5;
UPDATE jeupharma.module_blocs SET niveau_min = 1, niveau_max = 5
WHERE niveau_min IS DISTINCT FROM 1 OR niveau_max IS DISTINCT FROM 5;
UPDATE jeupharma.publications_connaissances SET niveau_min = 1, niveau_max = 5
WHERE niveau_min IS DISTINCT FROM 1 OR niveau_max IS DISTINCT FROM 5;

-- Abandon du mode référentiel complet côté joueur
UPDATE jeupharma.parcours_apprentissage
SET mode_contenu = 'publications', updated_at = now()
WHERE mode_contenu = 'referentiel_valide';

ALTER TABLE jeupharma.parcours_apprentissage
  DROP CONSTRAINT IF EXISTS parcours_apprentissage_mode_contenu_check;
ALTER TABLE jeupharma.parcours_apprentissage
  ADD CONSTRAINT parcours_apprentissage_mode_contenu_check
  CHECK (mode_contenu = 'publications');

-- ---------------------------------------------------------------------------
-- 2. Helpers niveau
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2__clamp_niveau(p int)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT least(5, greatest(1, coalesce(p, 1)));
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2__dans_plage(p_n int, p_min int, p_max int)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_n IS NOT NULL
     AND p_n >= coalesce(p_min, 1)
     AND p_n <= coalesce(p_max, 5);
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2__niveau_inscrit(p_user uuid, p_parcours uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
  SELECT COALESCE(
    (
      SELECT i.niveau_parcours
      FROM jeupharma.inscriptions_parcours i
      WHERE i.user_id = p_user
        AND i.parcours_id = p_parcours
        AND i.statut = 'accepte'
        AND i.actif
      LIMIT 1
    ),
    0
  );
$$;

-- Module + tous ses ancêtres dans la plage du joueur
CREATE OR REPLACE FUNCTION jeupharma.v2__module_dans_niveau(p_module uuid, p_niveau int)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
  SELECT p_niveau IS NOT NULL AND p_niveau > 0 AND NOT EXISTS (
    SELECT 1
    FROM jeupharma.v2_module_ancetres(p_module) a
    JOIN jeupharma.modules_cours c ON c.id = a.module_id
    WHERE NOT jeupharma.v2__dans_plage(p_niveau, c.niveau_min, c.niveau_max)
  );
$$;

-- Fusion variantes["N"] dans payload (retire variantes + _brouillon pour le joueur)
CREATE OR REPLACE FUNCTION jeupharma.v2__payload_resolu(p_payload jsonb, p_niveau int)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  base jsonb;
  v jsonb;
BEGIN
  base := coalesce(p_payload, '{}'::jsonb) - 'variantes' - '_brouillon';
  IF p_niveau IS NULL OR p_niveau < 1 THEN
    RETURN base;
  END IF;
  v := coalesce(p_payload, '{}'::jsonb)->'variantes'->(p_niveau::text);
  IF v IS NULL OR jsonb_typeof(v) <> 'object' THEN
    RETURN base;
  END IF;
  RETURN base || v;
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2__clean_plage(p_min int, p_max int)
RETURNS int[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  a int := jeupharma.v2__clamp_niveau(p_min);
  b int := jeupharma.v2__clamp_niveau(p_max);
BEGIN
  IF a > b THEN
    RETURN ARRAY[b, a];
  END IF;
  RETURN ARRAY[a, b];
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Accès : lister / traiter / maj niveau
-- ---------------------------------------------------------------------------
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
      'niveau_parcours', i.niveau_parcours,
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
      'niveau_parcours', i.niveau_parcours,
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

DROP FUNCTION IF EXISTS jeupharma.v2_traiter_demande_parcours(uuid, text);

CREATE OR REPLACE FUNCTION jeupharma.v2_traiter_demande_parcours(
  p_id uuid,
  p_statut text,
  p_niveau_parcours int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  row jeupharma.inscriptions_parcours%ROWTYPE;
  v_niv int;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF p_statut NOT IN ('accepte', 'refuse') THEN
    RAISE EXCEPTION 'Statut invalide';
  END IF;

  IF p_statut = 'accepte' THEN
    IF p_niveau_parcours IS NULL THEN
      RAISE EXCEPTION 'Niveau parcours requis (1–5)';
    END IF;
    v_niv := jeupharma.v2__clamp_niveau(p_niveau_parcours);
  END IF;

  UPDATE jeupharma.inscriptions_parcours
  SET statut = p_statut,
      actif = (p_statut = 'accepte'),
      niveau_parcours = CASE
        WHEN p_statut = 'accepte' THEN v_niv
        ELSE niveau_parcours
      END,
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

CREATE OR REPLACE FUNCTION jeupharma.v2_maj_niveau_parcours(
  p_inscription_id uuid,
  p_niveau int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  row jeupharma.inscriptions_parcours%ROWTYPE;
  v_niv int := jeupharma.v2__clamp_niveau(p_niveau);
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF p_niveau IS NULL OR p_niveau < 1 OR p_niveau > 5 THEN
    RAISE EXCEPTION 'Niveau invalide (1–5)';
  END IF;

  UPDATE jeupharma.inscriptions_parcours
  SET niveau_parcours = v_niv,
      traite_at = now(),
      traite_par = auth.uid()
  WHERE id = p_inscription_id
    AND statut = 'accepte'
  RETURNING * INTO row;

  IF NOT FOUND THEN RAISE EXCEPTION 'Inscription acceptée introuvable'; END IF;
  RETURN to_jsonb(row);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Déblocage : ignorer prérequis hors plage ★
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
  v_niv int;
  pd jsonb;
  r record;
BEGIN
  SELECT parcours_id INTO v_parcours FROM jeupharma.modules_cours WHERE id = p_module;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_niv := jeupharma.v2__niveau_inscrit(p_user, v_parcours);
  IF v_niv < 1 THEN
    RETURN jsonb_build_object('type', 'inscription', 'titre', 'Parcours non accepté');
  END IF;
  IF NOT jeupharma.v2__module_dans_niveau(p_module, v_niv) THEN
    RETURN jsonb_build_object('type', 'niveau', 'titre', 'Hors niveau d’accès', 'niveau', v_niv);
  END IF;

  pd := jeupharma.v2_parcours_detail(p_user, v_parcours);
  IF coalesce((pd->>'verrouille')::boolean, false) THEN
    RETURN pd->'bloque_par';
  END IF;

  FOR r IN
    SELECT pre.id AS pre_id, pre.titre AS pre_titre
    FROM jeupharma.v2_module_ancetres(p_module) a
    JOIN jeupharma.modules_cours c ON c.id = a.module_id
    JOIN jeupharma.modules_cours pre ON pre.id = c.prerequis_module_id AND pre.publie
    ORDER BY a.profondeur
  LOOP
    -- Prérequis hors plage ★ du joueur : ignoré
    IF NOT jeupharma.v2__module_dans_niveau(r.pre_id, v_niv) THEN
      CONTINUE;
    END IF;
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
    AND jeupharma.v2__module_dans_niveau(
      m.id,
      jeupharma.v2__niveau_inscrit(p_user, m.parcours_id)
    )
    AND jeupharma.v2_module_bloque_par(p_user, m.id) IS NULL;
$$;

-- Stats / détail module : ne compter que les leçons dans la plage ★
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
  v_niv int;
BEGIN
  SELECT * INTO m FROM jeupharma.modules_cours WHERE id = p_module;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_niv := jeupharma.v2__niveau_inscrit(p_user, m.parcours_id);

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
      IF v_niv > 0 AND NOT jeupharma.v2__module_dans_niveau(leaf.id, v_niv) THEN
        CONTINUE;
      END IF;
      dl := jeupharma.v2_module_detail(p_user, leaf.id);
      nb := nb + 1;
      sum_pct := sum_pct + coalesce((dl->>'pct')::numeric, 0);
      IF (dl->>'valide')::boolean THEN nbv := nbv + 1; END IF;
    END LOOP;
    jeux_ok := n_j = 0 OR (CASE WHEN logique = 'ou' THEN k_j >= 1 ELSE k_j = n_j END);
    valide := (nb = 0 OR nbv = nb) AND jeux_ok;
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
    pct := round(100 * ((CASE WHEN lecture_req THEN part_lect ELSE 0 END) + somme) / NULLIF(n, 0));
  END IF;

  RETURN jsonb_build_object(
    'est_groupe', false,
    'lecture_requise', lecture_req,
    'lu', pm.lu_at IS NOT NULL,
    'lecture_pct', coalesce(pm.lecture_pct, 0),
    'jeux', jx->'liste',
    'logique', logique,
    'valide', valide,
    'pct', coalesce(pct, 0)
  );
END;
$$;

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
  v_niv int;
BEGIN
  SELECT * INTO pa FROM jeupharma.parcours_apprentissage WHERE id = p_parcours;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_niv := jeupharma.v2__niveau_inscrit(p_user, p_parcours);
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
    IF v_niv > 0 AND NOT jeupharma.v2__module_dans_niveau(leaf.id, v_niv) THEN
      CONTINUE;
    END IF;
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
    'maj_at', maj,
    'niveau_parcours', NULLIF(v_niv, 0)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Connaissances visibles / catalogue (union parcours acceptés si p_parcours NULL)
-- ---------------------------------------------------------------------------
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
    SELECT d.module_id, ps.niveau_parcours
    FROM parcours_scope ps
    CROSS JOIN LATERAL jeupharma.v2_modules_debloques(p_user, ps.parcours_id) d
    WHERE p_module_ids IS NULL OR d.module_id = ANY (p_module_ids)
  ),
  scope AS (
    SELECT DISTINCT s.module_id, u.niveau_parcours
    FROM unlocked u
    CROSS JOIN LATERAL jeupharma.v2_module_ancetres(u.module_id) s
  )
  SELECT c.id, c.matrice_id, c.champ_code, c.entite_id,
         COALESCE(pub.libelle_pedagogique, c.texte) AS texte,
         c.texte_norm, pub.ordre, pub.module_id, pub.libelle_pedagogique
  FROM jeupharma.publications_connaissances pub
  JOIN scope sc ON sc.module_id = pub.module_id
  JOIN jeupharma.connaissances c ON c.id = pub.connaissance_id AND c.statut = 'valide'
  JOIN jeupharma.matrice_medicaments m ON m.id = c.matrice_id AND m.statut = 'publie'
  WHERE pub.actif
    AND jeupharma.v2__dans_plage(sc.niveau_parcours, pub.niveau_min, pub.niveau_max)
  ORDER BY c.matrice_id, c.champ_code, pub.ordre;
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_lister_medicaments(
  p_parcours uuid DEFAULT NULL,
  p_module_ids uuid[] DEFAULT NULL
)
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

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.dci, x.noms)
    FROM (
      SELECT
        m.id,
        d.valeur AS dci,
        COALESCE((
          SELECT string_agg(n.valeur, ', ' ORDER BY mn.ordre, n.valeur)
          FROM jeupharma.matrice_noms_commerciaux mn
          JOIN jeupharma.noms_commerciaux n ON n.id = mn.nom_commercial_id AND n.actif
          WHERE mn.matrice_id = m.id
        ), '') AS noms,
        count(DISTINCT cv.connaissance_id) AS nb_connaissances
      FROM jeupharma.matrice_medicaments m
      JOIN jeupharma.dcis d ON d.id = m.dci_id
      JOIN (
        SELECT DISTINCT matrice_id, connaissance_id
        FROM jeupharma.v2_connaissances_visibles(uid, p_parcours, p_module_ids)
      ) cv ON cv.matrice_id = m.id
      WHERE m.statut = 'publie'
      GROUP BY m.id, d.valeur
    ) x
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_fiche_resolue(
  p_matrice_id uuid,
  p_parcours uuid DEFAULT NULL,
  p_module_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  uid uuid := auth.uid();
  base jsonb;
  champs jsonb;
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT jsonb_build_object(
    'id', m.id,
    'dci', d.valeur,
    'noms_commerciaux', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', n.id, 'valeur', n.valeur) ORDER BY mn.ordre)
      FROM jeupharma.matrice_noms_commerciaux mn
      JOIN jeupharma.noms_commerciaux n ON n.id = mn.nom_commercial_id AND n.actif
      WHERE mn.matrice_id = m.id
    ), '[]'::jsonb)
  )
  INTO base
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.dcis d ON d.id = m.dci_id
  WHERE m.id = p_matrice_id AND m.statut = 'publie';

  IF base IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM jeupharma.v2_connaissances_visibles(uid, p_parcours, p_module_ids) cv
    WHERE cv.matrice_id = p_matrice_id
  ) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_object_agg(champ_code, items)
  INTO champs
  FROM (
    SELECT cv.champ_code,
           jsonb_agg(
             jsonb_build_object(
               'connaissance_id', cv.connaissance_id,
               'entite_id', cv.entite_id,
               'valeur', cv.texte,
               'ordre', cv.ordre,
               'module_id', cv.module_id
             )
             ORDER BY cv.ordre, cv.texte
           ) AS items
    FROM jeupharma.v2_connaissances_visibles(uid, p_parcours, p_module_ids) cv
    WHERE cv.matrice_id = p_matrice_id
    GROUP BY cv.champ_code
  ) t;

  RETURN base || jsonb_build_object('champs', COALESCE(champs, '{}'::jsonb));
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Progression : modules hors plage absents
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
  v_niv int;
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

  IF NOT jeupharma.is_portail_admin() AND NOT EXISTS (
    SELECT 1 FROM jeupharma.inscriptions_parcours i
    WHERE i.user_id = uid AND i.parcours_id = v_parcours AND i.statut = 'accepte' AND i.actif
  ) THEN
    RETURN jsonb_build_object('parcours_id', v_parcours, 'modules', '[]'::jsonb);
  END IF;

  v_niv := jeupharma.v2__niveau_inscrit(uid, v_parcours);
  PERFORM jeupharma.v2__sync_progression(uid, v_parcours);

  RETURN jsonb_build_object(
    'parcours_id', v_parcours,
    'niveau_parcours', NULLIF(v_niv, 0),
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
          'niveau_min', m.niveau_min,
          'niveau_max', m.niveau_max,
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
      WHERE m.parcours_id = v_parcours
        AND m.publie
        AND (
          jeupharma.is_portail_admin()
          OR v_niv < 1
          OR jeupharma.v2__module_dans_niveau(m.id, v_niv)
        )
    ), '[]'::jsonb)
  );
END;
$$;

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
        'niveau_parcours', CASE WHEN i.statut = 'accepte' THEN i.niveau_parcours END,
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
-- 7. Leçon joueur : plage ★ + variantes + aperçu admin
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS jeupharma.v2_lecon_joueur(uuid, boolean);

CREATE OR REPLACE FUNCTION jeupharma.v2_lecon_joueur(
  p_module_id uuid,
  p_preview boolean DEFAULT false,
  p_preview_niveau int DEFAULT NULL
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
  v_niv int;
  is_preview boolean := coalesce(p_preview, false) AND jeupharma.is_portail_admin();
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT * INTO m FROM jeupharma.modules_cours WHERE id = p_module_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Leçon introuvable'; END IF;

  IF is_preview THEN
    ok := true;
    v_niv := CASE
      WHEN p_preview_niveau IS NOT NULL THEN jeupharma.v2__clamp_niveau(p_preview_niveau)
      ELSE 5
    END;
  ELSE
    v_niv := jeupharma.v2__niveau_inscrit(uid, m.parcours_id);
    ok := m.publie AND NOT m.est_groupe
      AND v_niv >= 1
      AND jeupharma.v2__module_dans_niveau(p_module_id, v_niv);
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
    'detail', CASE WHEN is_preview THEN NULL ELSE jeupharma.v2_module_detail(uid, p_module_id) END,
    'niveau_parcours', v_niv,
    'preview', is_preview,
    'blocs', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'module_id', b.module_id,
          'ordre', b.ordre,
          'type_bloc', b.type_bloc,
          'titre', b.titre,
          'visible', b.visible,
          'niveau_min', b.niveau_min,
          'niveau_max', b.niveau_max,
          'payload_json', jeupharma.v2__payload_resolu(b.payload_json, v_niv),
          'created_at', b.created_at,
          'updated_at', b.updated_at
        )
        ORDER BY b.ordre, b.created_at
      )
      FROM jeupharma.module_blocs b
      WHERE b.module_id = p_module_id
        AND b.visible
        AND jeupharma.v2__dans_plage(v_niv, b.niveau_min, b.niveau_max)
    ), '[]'::jsonb)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Upsert module / bloc / pubs : niveau_min/max
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
  v_publie boolean;
  plage int[];
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;

  v_id := nullif(p_payload->>'id', '')::uuid;
  v_code := lower(trim(both FROM regexp_replace(
    coalesce(p_payload->>'code', p_payload->>'titre'),
    '[^a-zA-Z0-9]+', '_', 'g'
  )));
  v_code := trim(both '_' from v_code);
  plage := jeupharma.v2__clean_plage(
    coalesce((p_payload->>'niveau_min')::int, 1),
    coalesce((p_payload->>'niveau_max')::int, 5)
  );

  IF v_id IS NULL THEN
    v_publie := coalesce((p_payload->>'publie')::boolean, coalesce(p_payload->>'statut', 'publie') = 'publie');
    INSERT INTO jeupharma.modules_cours (
      parcours_id, parent_id, code, titre, resume, objectifs, ordre,
      publie, est_groupe, prerequis_module_id, created_by, version_publication,
      icone, couleur_accent, couverture_url, statut, criteres_json, contenu_maj_at,
      niveau_min, niveau_max
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
      now(),
      plage[1], plage[2]
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
      niveau_min = CASE
        WHEN p_payload ? 'niveau_min' OR p_payload ? 'niveau_max' THEN
          (jeupharma.v2__clean_plage(
            coalesce((p_payload->>'niveau_min')::int, niveau_min),
            coalesce((p_payload->>'niveau_max')::int, niveau_max)
          ))[1]
        ELSE niveau_min
      END,
      niveau_max = CASE
        WHEN p_payload ? 'niveau_min' OR p_payload ? 'niveau_max' THEN
          (jeupharma.v2__clean_plage(
            coalesce((p_payload->>'niveau_min')::int, niveau_min),
            coalesce((p_payload->>'niveau_max')::int, niveau_max)
          ))[2]
        ELSE niveau_max
      END,
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

CREATE OR REPLACE FUNCTION jeupharma.v2_upsert_bloc(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  row jeupharma.module_blocs%ROWTYPE;
  v_id uuid;
  plage int[];
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  v_id := nullif(p_payload->>'id', '')::uuid;
  plage := jeupharma.v2__clean_plage(
    coalesce((p_payload->>'niveau_min')::int, 1),
    coalesce((p_payload->>'niveau_max')::int, 5)
  );

  IF v_id IS NULL THEN
    INSERT INTO jeupharma.module_blocs (
      module_id, ordre, type_bloc, titre, payload_json, visible, niveau_min, niveau_max
    ) VALUES (
      (p_payload->>'module_id')::uuid,
      coalesce((p_payload->>'ordre')::int, 100),
      p_payload->>'type_bloc',
      nullif(p_payload->>'titre', ''),
      coalesce(p_payload->'payload_json', '{}'::jsonb),
      coalesce((p_payload->>'visible')::boolean, true),
      plage[1], plage[2]
    )
    RETURNING * INTO row;
  ELSE
    UPDATE jeupharma.module_blocs SET
      ordre = coalesce((p_payload->>'ordre')::int, ordre),
      titre = CASE WHEN p_payload ? 'titre' THEN nullif(p_payload->>'titre', '') ELSE titre END,
      payload_json = coalesce(p_payload->'payload_json', payload_json),
      visible = coalesce((p_payload->>'visible')::boolean, visible),
      niveau_min = CASE
        WHEN p_payload ? 'niveau_min' OR p_payload ? 'niveau_max' THEN
          (jeupharma.v2__clean_plage(
            coalesce((p_payload->>'niveau_min')::int, niveau_min),
            coalesce((p_payload->>'niveau_max')::int, niveau_max)
          ))[1]
        ELSE niveau_min
      END,
      niveau_max = CASE
        WHEN p_payload ? 'niveau_min' OR p_payload ? 'niveau_max' THEN
          (jeupharma.v2__clean_plage(
            coalesce((p_payload->>'niveau_min')::int, niveau_min),
            coalesce((p_payload->>'niveau_max')::int, niveau_max)
          ))[2]
        ELSE niveau_max
      END,
      updated_at = now()
    WHERE id = v_id
    RETURNING * INTO row;
    IF NOT FOUND THEN RAISE EXCEPTION 'Bloc introuvable'; END IF;
  END IF;
  RETURN to_jsonb(row);
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_set_pub_niveaux(
  p_publication_id uuid,
  p_niveau_min int,
  p_niveau_max int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  row jeupharma.publications_connaissances%ROWTYPE;
  plage int[];
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  plage := jeupharma.v2__clean_plage(p_niveau_min, p_niveau_max);
  UPDATE jeupharma.publications_connaissances
  SET niveau_min = plage[1], niveau_max = plage[2]
  WHERE id = p_publication_id
  RETURNING * INTO row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Publication introuvable'; END IF;
  RETURN to_jsonb(row);
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_set_module_pubs_niveaux(
  p_module_id uuid,
  p_niveau_min int,
  p_niveau_max int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  n int;
  plage int[];
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  plage := jeupharma.v2__clean_plage(p_niveau_min, p_niveau_max);
  UPDATE jeupharma.publications_connaissances
  SET niveau_min = plage[1], niveau_max = plage[2]
  WHERE module_id = p_module_id AND actif;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('module_id', p_module_id, 'updated', n, 'niveau_min', plage[1], 'niveau_max', plage[2]);
END;
$$;

-- Créer parcours sans niveau_lie (colonne encore présente jusqu’à 041)
CREATE OR REPLACE FUNCTION jeupharma.v2_creer_parcours(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  row jeupharma.parcours_apprentissage%ROWTYPE;
  v_code text;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  v_code := lower(trim(both FROM regexp_replace(
    coalesce(p_payload->>'code', p_payload->>'libelle'),
    '[^a-zA-Z0-9]+', '_', 'g'
  )));
  v_code := trim(both '_' from v_code);
  IF v_code = '' THEN RAISE EXCEPTION 'code invalide'; END IF;

  INSERT INTO jeupharma.parcours_apprentissage (
    code, libelle, description, mode_contenu, ordre, actif, created_by
  ) VALUES (
    v_code,
    trim(p_payload->>'libelle'),
    coalesce(p_payload->>'description', ''),
    'publications',
    coalesce((p_payload->>'ordre')::int, 50),
    coalesce((p_payload->>'actif')::boolean, true),
    auth.uid()
  )
  RETURNING * INTO row;

  RETURN to_jsonb(row);
END;
$$;

-- Chercher matrices admin : sans hospitalier/complexe dans la réponse (colonnes encore en base)
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
      'noms', x.noms
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
        ) AS noms
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
-- 9. Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION jeupharma.v2__clamp_niveau(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2__dans_plage(int, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2__niveau_inscrit(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2__module_dans_niveau(uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2__payload_resolu(jsonb, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2__clean_plage(int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_maj_niveau_parcours(uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_traiter_demande_parcours(uuid, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_lecon_joueur(uuid, boolean, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_set_pub_niveaux(uuid, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_set_module_pubs_niveaux(uuid, int, int) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION jeupharma.v2__clamp_niveau(int) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION jeupharma.v2__dans_plage(int, int, int) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION jeupharma.v2__niveau_inscrit(uuid, uuid) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION jeupharma.v2__module_dans_niveau(uuid, int) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION jeupharma.v2__payload_resolu(jsonb, int) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION jeupharma.v2__clean_plage(int, int) FROM authenticated, anon;

GRANT EXECUTE ON FUNCTION jeupharma.v2_lister_mes_inscriptions() TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_lister_demandes_parcours() TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_traiter_demande_parcours(uuid, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_maj_niveau_parcours(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_lecon_joueur(uuid, boolean, int) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_connaissances_visibles(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_lister_medicaments(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_fiche_resolue(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_progression_parcours(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_parcours_liste() TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_upsert_module(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_upsert_bloc(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_set_pub_niveaux(uuid, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_set_module_pubs_niveaux(uuid, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_creer_parcours(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_chercher_matrices(text, text, text, text, text, int) TO authenticated;
