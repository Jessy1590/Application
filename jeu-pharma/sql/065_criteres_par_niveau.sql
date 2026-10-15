-- =============================================================================
-- 065 : Critères / déblocage par niveau ★ (1–5)
--
-- Modèle `criteres_json` :
--   Legacy (tous les ★) :
--     { "lecture": bool, "jeux": [...], "logique": "et"|"ou",
--       "progression_min_pct"?: 0..100 }
--   Par niveau (compatible legacy) :
--     { "lecture", "jeux", "logique", …          -- base / fallback
--       "niveaux": {
--         "1": { "lecture", "jeux", "logique", "prerequis_module_id"?: uuid|null },
--         …
--       }
--     }
--   - Sans entrée `niveaux["N"]` → hérite de la base (champs plats + colonne
--     `prerequis_module_id`).
--   - Avec `prerequis_module_id` dans `niveaux["N"]` (y compris null) → override
--     du prérequis pour ce ★ uniquement.
--   - Colonne `modules_cours.prerequis_module_id` = prérequis de la base.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Helpers : plat / résolution par ★ / prérequis effectif
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2__critere_plat(p jsonb)
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

CREATE OR REPLACE FUNCTION jeupharma.v2__criteres_pour_niveau(p jsonb, p_niv int)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  base jsonb;
  ov jsonb;
  k text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RETURN '{}'::jsonb;
  END IF;
  base := jeupharma.v2__critere_plat(p);
  IF p_niv IS NULL OR p_niv < 1 OR p_niv > 5 THEN
    RETURN base;
  END IF;
  k := p_niv::text;
  IF jsonb_typeof(p->'niveaux') = 'object'
     AND jsonb_typeof(p->'niveaux'->k) = 'object' THEN
    ov := jeupharma.v2__critere_plat(p->'niveaux'->k);
    -- Override gagne sur la base champ par champ
    RETURN base || ov;
  END IF;
  RETURN base;
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2__prerequis_module_pour_niveau(
  p_module uuid,
  p_niv int
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
DECLARE
  m jeupharma.modules_cours%ROWTYPE;
  crit jsonb;
  k text;
  ov jsonb;
BEGIN
  SELECT * INTO m FROM jeupharma.modules_cours WHERE id = p_module;
  IF NOT FOUND THEN RETURN NULL; END IF;
  crit := coalesce(m.criteres_json, '{}'::jsonb);
  IF p_niv IS NOT NULL AND p_niv BETWEEN 1 AND 5 THEN
    k := p_niv::text;
    IF jsonb_typeof(crit->'niveaux') = 'object'
       AND jsonb_typeof(crit->'niveaux'->k) = 'object' THEN
      ov := crit->'niveaux'->k;
      IF ov ? 'prerequis_module_id' THEN
        RETURN nullif(ov->>'prerequis_module_id', '')::uuid;
      END IF;
    END IF;
  END IF;
  IF crit ? 'prerequis_module_id' THEN
    RETURN nullif(crit->>'prerequis_module_id', '')::uuid;
  END IF;
  RETURN m.prerequis_module_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Nettoyage écriture admin (base + niveaux)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2__clean_criteres(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  out jsonb;
  nivs jsonb := '{}'::jsonb;
  k text;
  raw jsonb;
  cleaned jsonb;
  pre uuid;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RETURN '{}'::jsonb;
  END IF;

  out := jeupharma.v2__critere_plat(p);

  -- Prérequis optionnel au niveau base (rare ; colonne reste la source principale)
  IF p ? 'prerequis_module_id' THEN
    BEGIN
      pre := nullif(p->>'prerequis_module_id', '')::uuid;
      out := out || jsonb_build_object('prerequis_module_id', to_jsonb(pre));
    EXCEPTION WHEN others THEN
      out := out || '{"prerequis_module_id": null}'::jsonb;
    END;
  END IF;

  IF jsonb_typeof(p->'niveaux') = 'object' THEN
    FOR k IN SELECT * FROM jsonb_object_keys(p->'niveaux') LOOP
      IF k !~ '^[1-5]$' THEN CONTINUE; END IF;
      raw := p->'niveaux'->k;
      IF jsonb_typeof(raw) <> 'object' THEN CONTINUE; END IF;
      cleaned := jeupharma.v2__critere_plat(raw);
      IF raw ? 'prerequis_module_id' THEN
        BEGIN
          pre := nullif(raw->>'prerequis_module_id', '')::uuid;
          cleaned := cleaned || jsonb_build_object('prerequis_module_id', to_jsonb(pre));
        EXCEPTION WHEN others THEN
          cleaned := cleaned || '{"prerequis_module_id": null}'::jsonb;
        END;
      END IF;
      -- Ne garder que les overrides non vides
      IF cleaned <> '{}'::jsonb THEN
        nivs := nivs || jsonb_build_object(k, cleaned);
      END IF;
    END LOOP;
    IF nivs <> '{}'::jsonb THEN
      out := out || jsonb_build_object('niveaux', nivs);
    END IF;
  END IF;

  RETURN out;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Détail / validité module : critères du ★ du joueur
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
  v_niv int;
BEGIN
  SELECT * INTO m FROM jeupharma.modules_cours WHERE id = p_module;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_niv := jeupharma.v2__niveau_inscrit(p_user, m.parcours_id);
  crit := jeupharma.v2__criteres_pour_niveau(coalesce(m.criteres_json, '{}'::jsonb), v_niv);
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
      'logique', logique,
      'niveau_parcours', NULLIF(v_niv, 0)
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
    'pct', coalesce(pct, 0),
    'niveau_parcours', NULLIF(v_niv, 0)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Déblocage : prérequis effectif par ★
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
  pre_id uuid;
  pre_titre text;
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
    SELECT a.module_id AS mid, a.profondeur
    FROM jeupharma.v2_module_ancetres(p_module) a
    ORDER BY a.profondeur
  LOOP
    pre_id := jeupharma.v2__prerequis_module_pour_niveau(r.mid, v_niv);
    IF pre_id IS NULL THEN CONTINUE; END IF;

    SELECT titre INTO pre_titre
    FROM jeupharma.modules_cours
    WHERE id = pre_id AND publie;
    IF NOT FOUND THEN CONTINUE; END IF;

    -- Prérequis hors plage ★ du joueur : ignoré
    IF NOT jeupharma.v2__module_dans_niveau(pre_id, v_niv) THEN
      CONTINUE;
    END IF;
    IF NOT jeupharma.v2_module_valide(p_user, pre_id) THEN
      RETURN jsonb_build_object(
        'type', 'module',
        'module_id', pre_id,
        'titre', pre_titre,
        'detail', jeupharma.v2_module_detail(p_user, pre_id),
        'niveau_parcours', v_niv
      );
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Lookup jeu dans critères (base + niveaux) — aligne 063
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2__criteres_contient_jeu(p_crit jsonb, p_modele uuid)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_crit IS NULL OR p_modele IS NULL THEN false
    WHEN EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(p_crit->'jeux', '[]'::jsonb)) e
      WHERE (e->>'modele_id')::uuid = p_modele
    ) THEN true
    WHEN jsonb_typeof(p_crit->'niveaux') = 'object' AND EXISTS (
      SELECT 1
      FROM jsonb_each(p_crit->'niveaux') nv
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(nv.value->'jeux', '[]'::jsonb)) e
      WHERE (e->>'modele_id')::uuid = p_modele
    ) THEN true
    ELSE false
  END;
$$;

-- Patch 063 : recherche jeux aussi dans criteres_json.niveaux
CREATE OR REPLACE FUNCTION jeupharma.v2_critere_jeu(
  p_modele_id uuid,
  p_module_id uuid DEFAULT NULL,
  p_parcours uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  uid uuid := auth.uid();
  m jeupharma.modules_cours%ROWTYPE;
  det jsonb;
  jeu jsonb;
  hit jeupharma.modules_cours%ROWTYPE;
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF p_modele_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_module_id IS NOT NULL THEN
    SELECT * INTO m FROM jeupharma.modules_cours WHERE id = p_module_id;
    IF FOUND
       AND (
         jeupharma.is_portail_admin()
         OR EXISTS (
           SELECT 1
           FROM jeupharma.inscriptions_parcours i
           WHERE i.user_id = uid
             AND i.parcours_id = m.parcours_id
             AND i.statut = 'accepte'
             AND i.actif
         )
       )
    THEN
      det := jeupharma.v2_module_detail(uid, m.id);
      SELECT e INTO jeu
      FROM jsonb_array_elements(coalesce(det->'jeux', '[]'::jsonb)) e
      WHERE (e->>'modele_id')::uuid = p_modele_id
      LIMIT 1;
      IF jeu IS NOT NULL THEN
        RETURN jsonb_build_object(
          'ok', coalesce((jeu->>'ok')::boolean, false),
          'score_min_pct', jeu->'score_min_pct',
          'meilleur_pct', jeu->'meilleur_pct',
          'module_id', m.id,
          'titre', m.titre,
          'valide', coalesce((det->>'valide')::boolean, false),
          'est_groupe', m.est_groupe,
          'parcours_id', m.parcours_id
        );
      END IF;
    END IF;
  END IF;

  FOR hit IN
    SELECT mc.*
    FROM jeupharma.modules_cours mc
    WHERE (p_parcours IS NULL OR mc.parcours_id = p_parcours)
      AND (
        jeupharma.is_portail_admin()
        OR EXISTS (
          SELECT 1
          FROM jeupharma.inscriptions_parcours i
          WHERE i.user_id = uid
            AND i.parcours_id = mc.parcours_id
            AND i.statut = 'accepte'
            AND i.actif
        )
      )
      AND jeupharma.v2__criteres_contient_jeu(mc.criteres_json, p_modele_id)
    ORDER BY
      CASE WHEN NOT coalesce(mc.est_groupe, false) THEN 0 ELSE 1 END,
      mc.ordre NULLS LAST,
      mc.created_at
    LIMIT 8
  LOOP
    det := jeupharma.v2_module_detail(uid, hit.id);
    SELECT e INTO jeu
    FROM jsonb_array_elements(coalesce(det->'jeux', '[]'::jsonb)) e
    WHERE (e->>'modele_id')::uuid = p_modele_id
    LIMIT 1;
    IF jeu IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', coalesce((jeu->>'ok')::boolean, false),
        'score_min_pct', jeu->'score_min_pct',
        'meilleur_pct', jeu->'meilleur_pct',
        'module_id', hit.id,
        'titre', hit.titre,
        'valide', coalesce((det->>'valide')::boolean, false),
        'est_groupe', hit.est_groupe,
        'parcours_id', hit.parcours_id
      );
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2__critere_plat(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2__criteres_pour_niveau(jsonb, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2__prerequis_module_pour_niveau(uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2__criteres_contient_jeu(jsonb, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION jeupharma.v2__critere_plat(jsonb) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION jeupharma.v2__criteres_pour_niveau(jsonb, int) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION jeupharma.v2__prerequis_module_pour_niveau(uuid, int) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION jeupharma.v2__criteres_contient_jeu(jsonb, uuid) FROM authenticated, anon;

GRANT EXECUTE ON FUNCTION jeupharma.v2_module_detail(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_module_bloque_par(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_critere_jeu(uuid, uuid, uuid) TO authenticated;
