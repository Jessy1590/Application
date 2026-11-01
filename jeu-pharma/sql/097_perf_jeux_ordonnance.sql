-- =============================================================================
-- 097 : Lancement des jeux — plus de timeout sur l’ordonnance BASIC
-- Projet : kpjflntnotftpzffjbud
--
-- Mesure (admin inscrit, JP-EXORD, 1 DCI, 3 leçons) avant correctif :
--   v2_modules_debloques          ~590 ms
--   v2_connaissances_visibles     ~3,3 s (370 lignes)
--   v2_fiche_resolue              ~7,5 s
-- PostgREST annule v2_demarrer_ordonnance (statement timeout) dans
-- v2_fiche_resolue, appelée une fois par DCI.
--
-- Causes :
--   1. v2_connaissances_visibles appelle v2__valeur_referentiel par publication.
--      Chaque appel relit v_medicaments_complet (15 agrégats JSON).
--   2. v2_module_bloque_par recalcule v2_parcours_detail (stats de tout le
--      parcours) pour chaque leçon, alors que le verrou ne dépend que d’un
--      éventuel parcours prérequis. Le DEUST n’en a pas.
--   3. v2_fiche_resolue lit les connaissances visibles deux fois, et
--      v2_demarrer_ordonnance répète ça pour chaque molécule.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Libellé référentiel à partir d’une fiche déjà chargée (pas de relecture vue)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2__valeur_fiche_json(
  p_champ text,
  p_entite uuid,
  p_fiche jsonb
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
  SELECT CASE p_champ
    WHEN 'dci' THEN
      CASE
        WHEN (p_fiche->>'dci_id')::uuid IS NOT DISTINCT FROM p_entite
          THEN nullif(p_fiche->>'dci', '')
      END
    WHEN 'detail_pharmacologie' THEN
      CASE
        WHEN (p_fiche->>'detail_pharmacologie_id')::uuid IS NOT DISTINCT FROM p_entite
          THEN nullif(p_fiche->>'detail_pharmacologie', '')
      END
    WHEN 'posologie_generale' THEN
      CASE
        WHEN (p_fiche->>'posologie_generale_id')::uuid IS NOT DISTINCT FROM p_entite
          THEN nullif(p_fiche->>'posologie_generale', '')
      END
    WHEN 'grossesse_allaitement' THEN
      CASE
        WHEN (p_fiche->>'grossesse_allaitement_id')::uuid IS NOT DISTINCT FROM p_entite
          THEN nullif(p_fiche->>'grossesse_allaitement', '')
      END
    ELSE (
      SELECT nullif(e->>'valeur', '')
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(p_fiche -> p_champ) = 'array' THEN p_fiche -> p_champ
          ELSE '[]'::jsonb
        END
      ) e
      WHERE e->>'id' = p_entite::text
      LIMIT 1
    )
  END
  WHERE p_champ IS NOT NULL
    AND p_entite IS NOT NULL
    AND p_fiche IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2__valeur_fiche_json(text, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION jeupharma.v2__valeur_fiche_json(text, uuid, jsonb) FROM authenticated, anon;

-- ---------------------------------------------------------------------------
-- Verrou « parcours prérequis » sans statistiques du parcours courant
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2__bloque_par_prerequis_parcours(
  p_user uuid,
  p_parcours uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  pre_id uuid;
  pre jeupharma.parcours_apprentissage%ROWTYPE;
  pst jsonb;
BEGIN
  SELECT prerequis_parcours_id INTO pre_id
  FROM jeupharma.parcours_apprentissage
  WHERE id = p_parcours;

  IF pre_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO pre
  FROM jeupharma.parcours_apprentissage
  WHERE id = pre_id AND actif;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  pst := jeupharma.v2__parcours_stats(p_user, pre.id);
  IF coalesce((pst->>'valide')::boolean, false) THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'type', 'parcours',
    'parcours_id', pre.id,
    'titre', pre.libelle,
    'pct', pst->'pct',
    'min_pct', pst->'progression_min_pct',
    'jeux', pst->'jeux'
  );
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2__bloque_par_prerequis_parcours(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION jeupharma.v2__bloque_par_prerequis_parcours(uuid, uuid) FROM authenticated, anon;

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
  bp jsonb;
  r record;
  pre_ids uuid[];
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

  bp := jeupharma.v2__bloque_par_prerequis_parcours(p_user, v_parcours);
  IF bp IS NOT NULL THEN
    RETURN bp;
  END IF;

  FOR r IN
    SELECT a.module_id AS mid, a.profondeur
    FROM jeupharma.v2_module_ancetres(p_module) a
    ORDER BY a.profondeur
  LOOP
    pre_ids := jeupharma.v2__prerequis_modules_pour_niveau(r.mid, v_niv);
    IF pre_ids IS NULL OR cardinality(pre_ids) = 0 THEN
      CONTINUE;
    END IF;

    FOREACH pre_id IN ARRAY pre_ids LOOP
      SELECT titre INTO pre_titre
      FROM jeupharma.modules_cours
      WHERE id = pre_id AND publie;
      IF NOT FOUND THEN CONTINUE; END IF;

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
  END LOOP;
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- Connaissances visibles : une lecture de fiche par molécule du scope
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_connaissances_visibles(
  p_user uuid DEFAULT auth.uid(),
  p_parcours uuid DEFAULT NULL,
  p_module_ids uuid[] DEFAULT NULL,
  p_niveau int DEFAULT NULL
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
DECLARE
  is_admin boolean := jeupharma.is_portail_admin();
  force_niv int := CASE
    WHEN is_admin AND p_niveau IS NOT NULL THEN jeupharma.v2__clamp_niveau(p_niveau)
    ELSE NULL
  END;
BEGIN
  IF p_user IS NULL THEN
    RETURN;
  END IF;
  IF NOT jeupharma.has_jeupharma_access() AND NOT is_admin THEN
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
    SELECT d.module_id AS mid, ps.niveau_parcours
    FROM parcours_scope ps
    CROSS JOIN LATERAL jeupharma.v2_modules_debloques(p_user, ps.parcours_id) d
    WHERE p_module_ids IS NULL OR d.module_id = ANY (p_module_ids)
  ),
  unlocked_scoped AS (
    SELECT u.mid, u.niveau_parcours
    FROM unlocked u
    WHERE p_module_ids IS NOT NULL
       OR jeupharma.v2_module_valide(p_user, u.mid)
  ),
  admin_requested AS (
    SELECT m.id AS mid,
           COALESCE(
             (
               SELECT i.niveau_parcours
               FROM jeupharma.inscriptions_parcours i
               WHERE i.user_id = p_user
                 AND i.parcours_id = m.parcours_id
                 AND i.statut = 'accepte'
                 AND i.actif
               LIMIT 1
             ),
             1
           ) AS niveau_parcours
    FROM jeupharma.modules_cours m
    WHERE is_admin
      AND p_module_ids IS NOT NULL
      AND cardinality(p_module_ids) > 0
      AND m.id = ANY (p_module_ids)
      AND (p_parcours IS NULL OR m.parcours_id = p_parcours)
  ),
  combined AS (
    SELECT u.mid, u.niveau_parcours FROM unlocked_scoped u
    UNION
    SELECT a.mid, a.niveau_parcours FROM admin_requested a
  ),
  scope AS (
    SELECT DISTINCT s.module_id AS mid,
           COALESCE(force_niv, c.niveau_parcours) AS niveau_parcours
    FROM combined c
    CROSS JOIN LATERAL jeupharma.v2_module_ancetres(c.mid) s
  ),
  raw AS MATERIALIZED (
    SELECT
      c.id AS cid,
      c.matrice_id AS mid_mat,
      c.champ_code AS code,
      c.entite_id AS eid,
      c.texte_norm AS tnorm,
      pub.ordre AS ord,
      pub.module_id AS mid_pub,
      pub.libelle_pedagogique AS lib_ped
    FROM jeupharma.publications_connaissances pub
    JOIN scope sc ON sc.mid = pub.module_id
    JOIN jeupharma.connaissances c ON c.id = pub.connaissance_id AND c.statut = 'valide'
    JOIN jeupharma.matrice_medicaments m ON m.id = c.matrice_id AND m.statut = 'publie'
    WHERE pub.actif
      AND c.entite_id IS NOT NULL
      AND jeupharma.v2__dans_plage(sc.niveau_parcours, pub.niveau_min, pub.niveau_max)
  ),
  vues AS MATERIALIZED (
    SELECT d.id, to_jsonb(v) AS fiche
    FROM (SELECT DISTINCT r.mid_mat AS id FROM raw r) d
    JOIN jeupharma.v_medicaments_complet v ON v.id = d.id
  )
  SELECT
    s.cid,
    s.mid_mat,
    s.code,
    s.eid,
    s.texte,
    s.tnorm,
    s.ord,
    s.mid_pub,
    s.lib_ped
  FROM (
    SELECT
      r.cid,
      r.mid_mat,
      r.code,
      r.eid,
      r.tnorm,
      r.ord,
      r.mid_pub,
      r.lib_ped,
      jeupharma.v2__valeur_fiche_json(r.code, r.eid, v.fiche) AS texte
    FROM raw r
    JOIN vues v ON v.id = r.mid_mat
  ) s
  WHERE s.texte IS NOT NULL
  ORDER BY s.mid_mat, s.code, s.ord;
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_connaissances_visibles(uuid, uuid, uuid[], int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_connaissances_visibles(uuid, uuid, uuid[], int) TO authenticated;

-- ---------------------------------------------------------------------------
-- Une seule lecture des connaissances visibles par fiche
-- ---------------------------------------------------------------------------
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

  SELECT
    count(*) > 0,
    coalesce(
      array_agg(DISTINCT cv.entite_id) FILTER (WHERE cv.entite_id IS NOT NULL),
      ARRAY[]::uuid[]
    )
  INTO via_pubs, pub_ids
  FROM jeupharma.v2_connaissances_visibles(uid, p_parcours, p_module_ids, niv) cv
  WHERE cv.matrice_id = p_matrice_id;

  IF NOT via_bloc AND NOT coalesce(via_pubs, false) THEN
    RETURN NULL;
  END IF;

  fiche := jeupharma.v2__fiche_depuis_matrice(p_matrice_id);
  IF fiche IS NULL THEN
    RETURN NULL;
  END IF;

  bloc_ids := jeupharma.v2__entite_ids_depuis_blocs_molecule(
    uid, p_matrice_id, p_parcours, p_module_ids, niv
  );

  pub_ids := (
    SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::uuid[])
    FROM unnest(coalesce(pub_ids, ARRAY[]::uuid[]) || coalesce(bloc_ids, ARRAY[]::uuid[])) AS x
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

-- ---------------------------------------------------------------------------
-- Ordonnance : résoudre les DCI tirées en un appel, pas une fiche par DCI
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_demarrer_ordonnance(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  m jeupharma.modeles_jeu%ROWTYPE;
  cfg jsonb;
  regles jsonb;
  champs text[];
  picked uuid[] := '{}';
  rule jsonb;
  need int;
  class_id uuid;
  class_kind text;
  matrice_fixe uuid;
  candidates uuid[];
  pick uuid;
  snap jsonb := '[]'::jsonb;
  fiches jsonb;
  tid uuid;
  pool uuid[];
  scope uuid[];
  rep text;
BEGIN
  IF auth.uid() IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT * INTO m FROM jeupharma.modeles_jeu
  WHERE code_unique = upper(trim(p_code))
    AND type_jeu = 'ordonnance' AND actif;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordonnance introuvable'; END IF;
  IF m.en_pause THEN RAISE EXCEPTION 'Cette ordonnance est en pause'; END IF;

  cfg := coalesce(m.configuration_json, '{}'::jsonb);
  regles := coalesce(cfg->'regles', '[]'::jsonb);
  champs := coalesce(
    NULLIF(ARRAY(SELECT jsonb_array_elements_text(cfg->'champs')), '{}'::text[]),
    NULLIF(ARRAY(SELECT jsonb_array_elements_text(cfg->'champs_interroges')), '{}'::text[]),
    ARRAY['indications', 'contre_indications', 'effets_indesirables']::text[]
  );

  pool := jeupharma.v2__repertoire_matrice_ids(auth.uid(), m.parcours_id, m.module_ids, cfg);
  rep := lower(trim(coalesce(cfg->>'repertoire', '')));
  IF rep = '' THEN
    IF jsonb_exists(cfg, 'matrice_ids')
       AND jsonb_typeof(cfg->'matrice_ids') = 'array'
       AND jsonb_array_length(cfg->'matrice_ids') > 0 THEN
      rep := 'selection';
    ELSE
      rep := 'lecon';
    END IF;
  END IF;
  scope := jeupharma.v2__repertoire_module_ids(m.module_ids, rep);

  IF jsonb_array_length(regles) = 0 THEN
    SELECT coalesce(array_agg(x.id), '{}') INTO picked
    FROM (
      SELECT id FROM (
        SELECT DISTINCT unnest(pool) AS id
      ) d
      ORDER BY random()
      LIMIT 3
    ) x;
  END IF;

  FOR rule IN SELECT * FROM jsonb_array_elements(regles)
  LOOP
    IF rule->>'type' = 'matrice' THEN
      matrice_fixe := (rule->>'matrice_id')::uuid;
      IF matrice_fixe IS NOT NULL AND NOT (matrice_fixe = ANY (picked)) THEN
        picked := array_append(picked, matrice_fixe);
      END IF;
    ELSIF rule->>'type' IN ('classe_therapeutique', 'classe_pharmacologique') THEN
      class_kind := rule->>'type';
      class_id := (rule->>'classe_id')::uuid;
      need := GREATEST(1, COALESCE((rule->>'nombre')::int, 1));
      IF class_kind = 'classe_therapeutique' THEN
        SELECT coalesce(array_agg(x.id), '{}') INTO candidates
        FROM (
          SELECT id FROM (
            SELECT DISTINCT cv.matrice_id AS id
            FROM jeupharma.v2_connaissances_visibles(auth.uid(), m.parcours_id, scope) cv
            WHERE cv.champ_code = 'classe_therapeutique'
              AND cv.entite_id = class_id
              AND cv.matrice_id = ANY (pool)
              AND NOT (cv.matrice_id = ANY (picked))
          ) d
          ORDER BY random()
          LIMIT need
        ) x;
      ELSE
        SELECT coalesce(array_agg(x.id), '{}') INTO candidates
        FROM (
          SELECT id FROM (
            SELECT DISTINCT cv.matrice_id AS id
            FROM jeupharma.v2_connaissances_visibles(auth.uid(), m.parcours_id, scope) cv
            WHERE cv.champ_code = 'classe_pharmacologique'
              AND cv.entite_id = class_id
              AND cv.matrice_id = ANY (pool)
              AND NOT (cv.matrice_id = ANY (picked))
          ) d
          ORDER BY random()
          LIMIT need
        ) x;
      END IF;
      IF coalesce(array_length(candidates, 1), 0) < need THEN
        SELECT coalesce(array_agg(x.id), '{}') INTO candidates
        FROM (
          SELECT id FROM (
            SELECT DISTINCT unnest(pool) AS id
          ) d
          WHERE NOT (d.id = ANY (picked))
          ORDER BY random()
          LIMIT need
        ) x;
      END IF;
      IF coalesce(array_length(candidates, 1), 0) < need THEN
        RAISE EXCEPTION 'Pool insuffisant pour la règle % (besoin %, dispo %)',
          class_kind, need, coalesce(array_length(candidates, 1), 0);
      END IF;
      FOREACH pick IN ARRAY candidates LOOP
        picked := array_append(picked, pick);
      END LOOP;
    END IF;
  END LOOP;

  IF coalesce(array_length(picked, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Aucune molécule sélectionnée';
  END IF;

  fiches := jeupharma.v2_fiches_resolues(
    picked,
    m.parcours_id,
    coalesce(scope, m.module_ids)
  );

  SELECT coalesce(jsonb_agg(slim ORDER BY ord), '[]'::jsonb)
  INTO snap
  FROM (
    SELECT
      u.ord,
      (
        (fiches -> u.mid::text)
        || jsonb_build_object(
          'champs', (
            SELECT coalesce(
              jsonb_object_agg(k, (fiches -> u.mid::text) -> 'champs' -> k),
              '{}'::jsonb
            )
            FROM unnest(champs) AS k
            WHERE jsonb_exists((fiches -> u.mid::text) -> 'champs', k)
          )
        )
      ) AS slim
    FROM unnest(picked) WITH ORDINALITY AS u(mid, ord)
    WHERE jsonb_exists(fiches, u.mid::text)
      AND jsonb_typeof(fiches -> u.mid::text) = 'object'
  ) s;

  IF jsonb_array_length(snap) = 0 THEN
    RAISE EXCEPTION 'Aucune fiche résolue pour cette ordonnance';
  END IF;

  INSERT INTO jeupharma.tentatives_jeu (
    modele_id, utilisateur_id, mode, snapshot_json
  ) VALUES (
    m.id, auth.uid(), m.mode,
    jsonb_build_object(
      'type', 'ordonnance',
      'champs', to_jsonb(champs),
      'molecules', snap,
      'meta', jsonb_build_object(
        'parcours_id', m.parcours_id,
        'module_ids', to_jsonb(m.module_ids),
        'repertoire', rep,
        'modele_code', m.code_unique
      )
    )
  )
  RETURNING id INTO tid;

  RETURN jsonb_build_object(
    'tentative_id', tid,
    'modele_id', m.id,
    'code_unique', m.code_unique,
    'titre', m.titre,
    'mode', m.mode,
    'champs', to_jsonb(champs),
    'molecules', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'id', mol->>'id',
          'dci', mol->>'dci',
          'noms_commerciaux', mol->'noms_commerciaux'
        )
      ), '[]'::jsonb)
      FROM jsonb_array_elements(snap) mol
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_demarrer_ordonnance(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_demarrer_ordonnance(text) TO authenticated;

-- Pool répertoire : présent dans 071, absent sur le projet au moment du correctif.
-- v2_demarrer_ordonnance s’appuie dessus. jsonb_exists à la place de l’opérateur ?.
CREATE OR REPLACE FUNCTION jeupharma.v2__repertoire_module_ids(
  p_module_ids uuid[],
  p_repertoire text
)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
DECLARE
  rep text := lower(trim(coalesce(p_repertoire, 'lecon')));
  out_ids uuid[];
BEGIN
  IF rep = 'parcours' THEN
    RETURN NULL;
  END IF;

  IF rep = 'chapitre' AND coalesce(cardinality(p_module_ids), 0) > 0 THEN
    WITH RECURSIVE anchors AS (
      SELECT DISTINCT coalesce(mc.parent_id, mc.id) AS chapitre_id
      FROM jeupharma.modules_cours mc
      WHERE mc.id = ANY (p_module_ids)
    ),
    sub AS (
      SELECT c.id, c.est_groupe
      FROM jeupharma.modules_cours c
      WHERE c.id IN (SELECT chapitre_id FROM anchors)
         OR c.parent_id IN (SELECT chapitre_id FROM anchors)
      UNION
      SELECT c.id, c.est_groupe
      FROM jeupharma.modules_cours c
      JOIN sub ON c.parent_id = sub.id
    )
    SELECT coalesce(array_agg(DISTINCT sub.id), p_module_ids)
      INTO out_ids
    FROM sub
    WHERE NOT coalesce(sub.est_groupe, false);
    RETURN out_ids;
  END IF;

  RETURN p_module_ids;
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2__repertoire_module_ids(uuid[], text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION jeupharma.v2__repertoire_module_ids(uuid[], text) FROM authenticated, anon;

CREATE OR REPLACE FUNCTION jeupharma.v2__repertoire_matrice_ids(
  p_user uuid,
  p_parcours uuid,
  p_module_ids uuid[],
  p_cfg jsonb
)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
DECLARE
  cfg jsonb := coalesce(p_cfg, '{}'::jsonb);
  rep text;
  fixed uuid[];
  scope uuid[];
  pool uuid[];
BEGIN
  rep := lower(trim(coalesce(cfg->>'repertoire', '')));
  IF rep = '' THEN
    IF jsonb_exists(cfg, 'matrice_ids')
       AND jsonb_typeof(cfg->'matrice_ids') = 'array'
       AND jsonb_array_length(cfg->'matrice_ids') > 0 THEN
      rep := 'selection';
    ELSE
      rep := 'lecon';
    END IF;
  END IF;

  IF rep = 'selection' THEN
    IF NOT jsonb_exists(cfg, 'matrice_ids')
       OR jsonb_typeof(cfg->'matrice_ids') <> 'array'
       OR jsonb_array_length(cfg->'matrice_ids') = 0 THEN
      RETURN '{}'::uuid[];
    END IF;
    fixed := ARRAY(SELECT jsonb_array_elements_text(cfg->'matrice_ids')::uuid);
    SELECT coalesce(array_agg(DISTINCT cv.matrice_id), '{}'::uuid[])
      INTO pool
    FROM jeupharma.v2_connaissances_visibles(p_user, p_parcours, NULL) cv
    WHERE cv.matrice_id = ANY (fixed);
    IF coalesce(cardinality(pool), 0) = 0 THEN
      RETURN fixed;
    END IF;
    RETURN pool;
  END IF;

  scope := jeupharma.v2__repertoire_module_ids(p_module_ids, rep);
  SELECT coalesce(array_agg(DISTINCT cv.matrice_id), '{}'::uuid[])
    INTO pool
  FROM jeupharma.v2_connaissances_visibles(p_user, p_parcours, scope) cv;
  RETURN pool;
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2__repertoire_matrice_ids(uuid, uuid, uuid[], jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION jeupharma.v2__repertoire_matrice_ids(uuid, uuid, uuid[], jsonb) FROM authenticated, anon;
