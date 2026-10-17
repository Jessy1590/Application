-- =============================================================================
-- 071 : Répertoire molécules (jeux) + critère fiche aléatoire (% maîtrisées)
--       + liens hybrides étendus (CPD, conseils, voies, secteurs, noms…)
-- Projet : kpjflntnotftpzffjbud
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Scope modules selon repertoire (lecon | chapitre | parcours)
-- ---------------------------------------------------------------------------
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
    RETURN NULL; -- NULL = tout le parcours (v2_connaissances_visibles)
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

  -- lecon (défaut) : modules du modèle
  RETURN p_module_ids;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Pool matrice_ids selon configuration repertoire
-- ---------------------------------------------------------------------------
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
    IF cfg ? 'matrice_ids'
       AND jsonb_typeof(cfg->'matrice_ids') = 'array'
       AND jsonb_array_length(cfg->'matrice_ids') > 0 THEN
      rep := 'selection';
    ELSE
      rep := 'lecon';
    END IF;
  END IF;

  IF rep = 'selection' THEN
    IF NOT (cfg ? 'matrice_ids')
       OR jsonb_typeof(cfg->'matrice_ids') <> 'array'
       OR jsonb_array_length(cfg->'matrice_ids') = 0 THEN
      RETURN '{}'::uuid[];
    END IF;
    fixed := ARRAY(SELECT jsonb_array_elements_text(cfg->'matrice_ids')::uuid);
    SELECT coalesce(array_agg(DISTINCT cv.matrice_id), '{}'::uuid[])
      INTO pool
    FROM jeupharma.v2_connaissances_visibles(p_user, p_parcours, NULL) cv
    WHERE cv.matrice_id = ANY (fixed);
    -- Repli : ids demandés si rien de visible (ex. admin / pubs hors scope)
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

-- ---------------------------------------------------------------------------
-- 3. % molécules maîtrisées (fiche aléatoire)
--    Maîtrise = ≥ nb_notes_exclusion notes avec score ≥ seuil_exclusion
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2__fiche_maitrise_pct(
  p_user uuid,
  p_modele uuid
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
DECLARE
  m jeupharma.modeles_jeu%ROWTYPE;
  cfg jsonb;
  pool uuid[];
  seuil numeric;
  nb_notes int;
  total int;
  mastered int;
BEGIN
  SELECT * INTO m FROM jeupharma.modeles_jeu WHERE id = p_modele AND actif;
  IF NOT FOUND OR m.type_jeu <> 'fiche_aleatoire' THEN
    RETURN NULL;
  END IF;

  cfg := coalesce(m.configuration_json, '{}'::jsonb);
  pool := jeupharma.v2__repertoire_matrice_ids(
    p_user, m.parcours_id, m.module_ids, cfg
  );
  total := coalesce(cardinality(pool), 0);
  IF total = 0 THEN
    RETURN NULL;
  END IF;

  seuil := coalesce((cfg->>'seuil_exclusion')::numeric, 8);
  nb_notes := GREATEST(1, coalesce((cfg->>'nb_notes_exclusion')::int, 3));

  SELECT count(*)::int INTO mastered
  FROM (
    SELECT s.matrice_id
    FROM jeupharma.scores_fiche_aleatoire s
    WHERE s.utilisateur_id = p_user
      AND s.matrice_id = ANY (pool)
      AND s.score_obtenu >= seuil
    GROUP BY s.matrice_id
    HAVING count(*) >= nb_notes
  ) x;

  RETURN round(100.0 * coalesce(mastered, 0) / total);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Critères jeux : fiche_aleatoire = % maîtrisées (pas meilleur score tentative)
-- ---------------------------------------------------------------------------
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
      IF mj.type_jeu = 'fiche_aleatoire' THEN
        best := jeupharma.v2__fiche_maitrise_pct(p_user, mj.id);
      ELSE
        best := jeupharma.v2__jeu_meilleur_pct(p_user, mj.id);
      END IF;
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
-- 5. Ordonnance : pool via repertoire
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
  mid uuid;
  fiche jsonb;
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
    IF cfg ? 'matrice_ids'
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

  FOREACH mid IN ARRAY picked LOOP
    fiche := jeupharma.v2_fiche_resolue(mid, m.parcours_id, coalesce(scope, m.module_ids));
    IF fiche IS NULL THEN
      CONTINUE;
    END IF;
    fiche := fiche || jsonb_build_object(
      'champs', (
        SELECT coalesce(jsonb_object_agg(k, fiche->'champs'->k), '{}'::jsonb)
        FROM unnest(champs) k
        WHERE fiche->'champs' ? k
      )
    );
    snap := snap || jsonb_build_array(fiche);
  END LOOP;

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

-- ---------------------------------------------------------------------------
-- 6. Liens hybrides : tables supplémentaires
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_liens_matrices_entites(
  p_matrice_ids uuid[] DEFAULT NULL,
  p_entite_table text DEFAULT NULL,
  p_entite_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  ids uuid[];
  eids uuid[];
  out jsonb := '{}'::jsonb;
  allowed text[] := ARRAY[
    'classes_pharmacologiques',
    'classes_therapeutiques',
    'indications',
    'contre_indications',
    'effets_indesirables',
    'precautions_emploi',
    'interactions',
    'surveillances',
    'voies_administration',
    'conditions_prescription_delivrance',
    'conseils_delivrance',
    'secteurs_therapeutiques',
    'noms_commerciaux',
    'details_pharmacologie',
    'posologies_generales',
    'grossesse_allaitement',
    'dcis'
  ];
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;

  SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::uuid[])
  INTO ids
  FROM unnest(coalesce(p_matrice_ids, ARRAY[]::uuid[])) AS x
  WHERE x IS NOT NULL;

  IF ids IS NOT NULL AND cardinality(ids) > 0 THEN
    SELECT coalesce(
      jsonb_object_agg(sub.matrice_id::text, sub.tables),
      '{}'::jsonb
    )
    INTO out
    FROM (
      SELECT g.matrice_id,
             jsonb_object_agg(g.entite, g.eids) AS tables
      FROM (
        SELECT l.matrice_id, l.entite,
               jsonb_agg(l.entite_id::text ORDER BY l.ordre) AS eids
        FROM (
          SELECT m.matrice_id, 'classes_pharmacologiques'::text AS entite,
                 m.classe_pharmacologique_id AS entite_id, m.ordre
          FROM jeupharma.matrice_classes_pharmacologiques m
          WHERE m.matrice_id = ANY (ids)
          UNION ALL
          SELECT m.matrice_id, 'classes_therapeutiques',
                 m.classe_therapeutique_id, m.ordre
          FROM jeupharma.matrice_classes_therapeutiques m
          WHERE m.matrice_id = ANY (ids)
          UNION ALL
          SELECT m.matrice_id, 'indications',
                 m.indication_id, m.ordre
          FROM jeupharma.matrice_indications m
          WHERE m.matrice_id = ANY (ids)
          UNION ALL
          SELECT m.matrice_id, 'contre_indications',
                 m.contre_indication_id, m.ordre
          FROM jeupharma.matrice_contre_indications m
          WHERE m.matrice_id = ANY (ids)
          UNION ALL
          SELECT m.matrice_id, 'effets_indesirables',
                 m.effet_indesirable_id, m.ordre
          FROM jeupharma.matrice_effets_indesirables m
          WHERE m.matrice_id = ANY (ids)
          UNION ALL
          SELECT m.matrice_id, 'precautions_emploi',
                 m.precaution_emploi_id, m.ordre
          FROM jeupharma.matrice_precautions_emploi m
          WHERE m.matrice_id = ANY (ids)
          UNION ALL
          SELECT m.matrice_id, 'interactions',
                 m.interaction_id, m.ordre
          FROM jeupharma.matrice_interactions m
          WHERE m.matrice_id = ANY (ids)
          UNION ALL
          SELECT m.matrice_id, 'surveillances',
                 m.surveillance_id, m.ordre
          FROM jeupharma.matrice_surveillances m
          WHERE m.matrice_id = ANY (ids)
          UNION ALL
          SELECT m.matrice_id, 'voies_administration',
                 m.voie_administration_id, m.ordre
          FROM jeupharma.matrice_voies_administration m
          WHERE m.matrice_id = ANY (ids)
          UNION ALL
          SELECT m.matrice_id, 'conditions_prescription_delivrance',
                 m.condition_prescription_delivrance_id, m.ordre
          FROM jeupharma.matrice_conditions_prescription_delivrance m
          WHERE m.matrice_id = ANY (ids)
          UNION ALL
          SELECT m.matrice_id, 'conseils_delivrance',
                 m.conseil_delivrance_id, m.ordre
          FROM jeupharma.matrice_conseils_delivrance m
          WHERE m.matrice_id = ANY (ids)
          UNION ALL
          SELECT m.matrice_id, 'secteurs_therapeutiques',
                 m.secteur_therapeutique_id, m.ordre
          FROM jeupharma.matrice_secteurs_therapeutiques m
          WHERE m.matrice_id = ANY (ids)
          UNION ALL
          SELECT m.matrice_id, 'noms_commerciaux',
                 m.nom_commercial_id, m.ordre
          FROM jeupharma.matrice_noms_commerciaux m
          WHERE m.matrice_id = ANY (ids)
          UNION ALL
          SELECT mm.id, 'details_pharmacologie',
                 mm.detail_pharmacologie_id, 0
          FROM jeupharma.matrice_medicaments mm
          WHERE mm.id = ANY (ids) AND mm.detail_pharmacologie_id IS NOT NULL
          UNION ALL
          SELECT mm.id, 'posologies_generales',
                 mm.posologie_generale_id, 0
          FROM jeupharma.matrice_medicaments mm
          WHERE mm.id = ANY (ids) AND mm.posologie_generale_id IS NOT NULL
          UNION ALL
          SELECT mm.id, 'grossesse_allaitement',
                 mm.grossesse_allaitement_id, 0
          FROM jeupharma.matrice_medicaments mm
          WHERE mm.id = ANY (ids) AND mm.grossesse_allaitement_id IS NOT NULL
          UNION ALL
          SELECT mm.id, 'dcis',
                 mm.dci_id, 0
          FROM jeupharma.matrice_medicaments mm
          WHERE mm.id = ANY (ids) AND mm.dci_id IS NOT NULL
        ) l
        WHERE l.entite_id IS NOT NULL
        GROUP BY l.matrice_id, l.entite
      ) g
      GROUP BY g.matrice_id
    ) sub;

    SELECT coalesce(
      jsonb_object_agg(mid::text, coalesce(out -> mid::text, '{}'::jsonb)),
      '{}'::jsonb
    )
    INTO out
    FROM unnest(ids) AS mid;

    RETURN out;
  END IF;

  IF p_entite_table IS NULL OR NOT (p_entite_table = ANY (allowed)) THEN
    RAISE EXCEPTION 'Table entité invalide';
  END IF;

  SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::uuid[])
  INTO eids
  FROM unnest(coalesce(p_entite_ids, ARRAY[]::uuid[])) AS x
  WHERE x IS NOT NULL;

  IF coalesce(cardinality(eids), 0) = 0 THEN
    RETURN '{}'::jsonb;
  END IF;

  IF p_entite_table = 'classes_pharmacologiques' THEN
    SELECT coalesce(jsonb_object_agg(sub.eid, sub.mids), '{}'::jsonb) INTO out
    FROM (
      SELECT m.classe_pharmacologique_id::text AS eid,
             jsonb_agg(m.matrice_id::text ORDER BY m.ordre) AS mids
      FROM jeupharma.matrice_classes_pharmacologiques m
      WHERE m.classe_pharmacologique_id = ANY (eids)
      GROUP BY m.classe_pharmacologique_id
    ) sub;
  ELSIF p_entite_table = 'classes_therapeutiques' THEN
    SELECT coalesce(jsonb_object_agg(sub.eid, sub.mids), '{}'::jsonb) INTO out
    FROM (
      SELECT m.classe_therapeutique_id::text AS eid,
             jsonb_agg(m.matrice_id::text ORDER BY m.ordre) AS mids
      FROM jeupharma.matrice_classes_therapeutiques m
      WHERE m.classe_therapeutique_id = ANY (eids)
      GROUP BY m.classe_therapeutique_id
    ) sub;
  ELSIF p_entite_table = 'indications' THEN
    SELECT coalesce(jsonb_object_agg(sub.eid, sub.mids), '{}'::jsonb) INTO out
    FROM (
      SELECT m.indication_id::text AS eid,
             jsonb_agg(m.matrice_id::text ORDER BY m.ordre) AS mids
      FROM jeupharma.matrice_indications m
      WHERE m.indication_id = ANY (eids)
      GROUP BY m.indication_id
    ) sub;
  ELSIF p_entite_table = 'contre_indications' THEN
    SELECT coalesce(jsonb_object_agg(sub.eid, sub.mids), '{}'::jsonb) INTO out
    FROM (
      SELECT m.contre_indication_id::text AS eid,
             jsonb_agg(m.matrice_id::text ORDER BY m.ordre) AS mids
      FROM jeupharma.matrice_contre_indications m
      WHERE m.contre_indication_id = ANY (eids)
      GROUP BY m.contre_indication_id
    ) sub;
  ELSIF p_entite_table = 'effets_indesirables' THEN
    SELECT coalesce(jsonb_object_agg(sub.eid, sub.mids), '{}'::jsonb) INTO out
    FROM (
      SELECT m.effet_indesirable_id::text AS eid,
             jsonb_agg(m.matrice_id::text ORDER BY m.ordre) AS mids
      FROM jeupharma.matrice_effets_indesirables m
      WHERE m.effet_indesirable_id = ANY (eids)
      GROUP BY m.effet_indesirable_id
    ) sub;
  ELSIF p_entite_table = 'precautions_emploi' THEN
    SELECT coalesce(jsonb_object_agg(sub.eid, sub.mids), '{}'::jsonb) INTO out
    FROM (
      SELECT m.precaution_emploi_id::text AS eid,
             jsonb_agg(m.matrice_id::text ORDER BY m.ordre) AS mids
      FROM jeupharma.matrice_precautions_emploi m
      WHERE m.precaution_emploi_id = ANY (eids)
      GROUP BY m.precaution_emploi_id
    ) sub;
  ELSIF p_entite_table = 'interactions' THEN
    SELECT coalesce(jsonb_object_agg(sub.eid, sub.mids), '{}'::jsonb) INTO out
    FROM (
      SELECT m.interaction_id::text AS eid,
             jsonb_agg(m.matrice_id::text ORDER BY m.ordre) AS mids
      FROM jeupharma.matrice_interactions m
      WHERE m.interaction_id = ANY (eids)
      GROUP BY m.interaction_id
    ) sub;
  ELSIF p_entite_table = 'surveillances' THEN
    SELECT coalesce(jsonb_object_agg(sub.eid, sub.mids), '{}'::jsonb) INTO out
    FROM (
      SELECT m.surveillance_id::text AS eid,
             jsonb_agg(m.matrice_id::text ORDER BY m.ordre) AS mids
      FROM jeupharma.matrice_surveillances m
      WHERE m.surveillance_id = ANY (eids)
      GROUP BY m.surveillance_id
    ) sub;
  ELSIF p_entite_table = 'voies_administration' THEN
    SELECT coalesce(jsonb_object_agg(sub.eid, sub.mids), '{}'::jsonb) INTO out
    FROM (
      SELECT m.voie_administration_id::text AS eid,
             jsonb_agg(m.matrice_id::text ORDER BY m.ordre) AS mids
      FROM jeupharma.matrice_voies_administration m
      WHERE m.voie_administration_id = ANY (eids)
      GROUP BY m.voie_administration_id
    ) sub;
  ELSIF p_entite_table = 'conditions_prescription_delivrance' THEN
    SELECT coalesce(jsonb_object_agg(sub.eid, sub.mids), '{}'::jsonb) INTO out
    FROM (
      SELECT m.condition_prescription_delivrance_id::text AS eid,
             jsonb_agg(m.matrice_id::text ORDER BY m.ordre) AS mids
      FROM jeupharma.matrice_conditions_prescription_delivrance m
      WHERE m.condition_prescription_delivrance_id = ANY (eids)
      GROUP BY m.condition_prescription_delivrance_id
    ) sub;
  ELSIF p_entite_table = 'conseils_delivrance' THEN
    SELECT coalesce(jsonb_object_agg(sub.eid, sub.mids), '{}'::jsonb) INTO out
    FROM (
      SELECT m.conseil_delivrance_id::text AS eid,
             jsonb_agg(m.matrice_id::text ORDER BY m.ordre) AS mids
      FROM jeupharma.matrice_conseils_delivrance m
      WHERE m.conseil_delivrance_id = ANY (eids)
      GROUP BY m.conseil_delivrance_id
    ) sub;
  ELSIF p_entite_table = 'secteurs_therapeutiques' THEN
    SELECT coalesce(jsonb_object_agg(sub.eid, sub.mids), '{}'::jsonb) INTO out
    FROM (
      SELECT m.secteur_therapeutique_id::text AS eid,
             jsonb_agg(m.matrice_id::text ORDER BY m.ordre) AS mids
      FROM jeupharma.matrice_secteurs_therapeutiques m
      WHERE m.secteur_therapeutique_id = ANY (eids)
      GROUP BY m.secteur_therapeutique_id
    ) sub;
  ELSIF p_entite_table = 'noms_commerciaux' THEN
    SELECT coalesce(jsonb_object_agg(sub.eid, sub.mids), '{}'::jsonb) INTO out
    FROM (
      SELECT m.nom_commercial_id::text AS eid,
             jsonb_agg(m.matrice_id::text ORDER BY m.ordre) AS mids
      FROM jeupharma.matrice_noms_commerciaux m
      WHERE m.nom_commercial_id = ANY (eids)
      GROUP BY m.nom_commercial_id
    ) sub;
  ELSIF p_entite_table = 'details_pharmacologie' THEN
    SELECT coalesce(jsonb_object_agg(sub.eid, sub.mids), '{}'::jsonb) INTO out
    FROM (
      SELECT mm.detail_pharmacologie_id::text AS eid,
             jsonb_agg(mm.id::text) AS mids
      FROM jeupharma.matrice_medicaments mm
      WHERE mm.detail_pharmacologie_id = ANY (eids)
      GROUP BY mm.detail_pharmacologie_id
    ) sub;
  ELSIF p_entite_table = 'posologies_generales' THEN
    SELECT coalesce(jsonb_object_agg(sub.eid, sub.mids), '{}'::jsonb) INTO out
    FROM (
      SELECT mm.posologie_generale_id::text AS eid,
             jsonb_agg(mm.id::text) AS mids
      FROM jeupharma.matrice_medicaments mm
      WHERE mm.posologie_generale_id = ANY (eids)
      GROUP BY mm.posologie_generale_id
    ) sub;
  ELSIF p_entite_table = 'grossesse_allaitement' THEN
    SELECT coalesce(jsonb_object_agg(sub.eid, sub.mids), '{}'::jsonb) INTO out
    FROM (
      SELECT mm.grossesse_allaitement_id::text AS eid,
             jsonb_agg(mm.id::text) AS mids
      FROM jeupharma.matrice_medicaments mm
      WHERE mm.grossesse_allaitement_id = ANY (eids)
      GROUP BY mm.grossesse_allaitement_id
    ) sub;
  ELSIF p_entite_table = 'dcis' THEN
    SELECT coalesce(jsonb_object_agg(sub.eid, sub.mids), '{}'::jsonb) INTO out
    FROM (
      SELECT mm.dci_id::text AS eid,
             jsonb_agg(mm.id::text) AS mids
      FROM jeupharma.matrice_medicaments mm
      WHERE mm.dci_id = ANY (eids)
      GROUP BY mm.dci_id
    ) sub;
  END IF;

  SELECT coalesce(
    jsonb_object_agg(eid::text, coalesce(out -> eid::text, '[]'::jsonb)),
    '{}'::jsonb
  )
  INTO out
  FROM unnest(eids) AS eid;

  RETURN out;
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2__repertoire_module_ids(uuid[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2__repertoire_matrice_ids(uuid, uuid, uuid[], jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2__fiche_maitrise_pct(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION jeupharma.v2__repertoire_module_ids(uuid[], text) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION jeupharma.v2__repertoire_matrice_ids(uuid, uuid, uuid[], jsonb) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION jeupharma.v2__fiche_maitrise_pct(uuid, uuid) FROM authenticated, anon;

GRANT EXECUTE ON FUNCTION jeupharma.v2_demarrer_ordonnance(text) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_liens_matrices_entites(uuid[], text, uuid[]) TO authenticated;

COMMENT ON FUNCTION jeupharma.v2__fiche_maitrise_pct(uuid, uuid) IS
  'Fiche aléatoire : % du répertoire avec N notes ≥ seuil (critère de déblocage).';
