-- =============================================================================
-- 026 : Fix pool quiz (coalesce tableau vide) + ordonnance DISTINCT/ORDER BY
-- + repli matrice_ids pour ordonnance / quiz intro
-- =============================================================================

CREATE OR REPLACE FUNCTION jeupharma.v2_nouveau_tirage_quiz(p_modele_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  m jeupharma.modeles_jeu%ROWTYPE;
  cfg jsonb;
  nb int;
  champs text[];
  pool uuid[];
  tid uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT * INTO m FROM jeupharma.modeles_jeu
  WHERE id = p_modele_id AND type_jeu = 'quiz' AND actif;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz introuvable'; END IF;
  IF m.en_pause THEN RAISE EXCEPTION 'Quiz en pause'; END IF;
  IF m.mode = 'evaluation' THEN
    RAISE EXCEPTION 'Nouveau tirage réservé à l’entraînement';
  END IF;

  cfg := coalesce(m.configuration_json, '{}'::jsonb);
  nb := GREATEST(1, COALESCE((cfg->>'nb_questions')::int, 10));
  champs := coalesce(
    NULLIF(ARRAY(SELECT jsonb_array_elements_text(cfg->'champs_interroges')), '{}'::text[]),
    ARRAY['classe_pharmacologique']::text[]
  );

  IF cfg ? 'matrice_ids'
     AND jsonb_typeof(cfg->'matrice_ids') = 'array'
     AND jsonb_array_length(cfg->'matrice_ids') > 0 THEN
    pool := ARRAY(SELECT jsonb_array_elements_text(cfg->'matrice_ids')::uuid);
  ELSE
    SELECT coalesce(array_agg(DISTINCT cv.matrice_id), '{}'::uuid[])
      INTO pool
    FROM jeupharma.v2_connaissances_visibles(auth.uid(), m.parcours_id, m.module_ids) cv;
  END IF;

  IF coalesce(cardinality(pool), 0) = 0 THEN
    RAISE EXCEPTION 'Aucune molécule disponible pour ce quiz (parcours / modules / publications)';
  END IF;

  INSERT INTO jeupharma.tentatives_jeu (
    modele_id, utilisateur_id, mode, snapshot_json
  ) VALUES (
    m.id, auth.uid(), 'entrainement',
    jsonb_build_object(
      'type', 'quiz_tirage',
      'nb_questions', nb,
      'champs_interroges', to_jsonb(champs),
      'matrice_ids', to_jsonb(pool),
      'nb_propositions', COALESCE((cfg->>'nb_propositions')::int, 3),
      'meta', jsonb_build_object('parcours_id', m.parcours_id, 'parent_modele', m.code_unique)
    )
  )
  RETURNING id INTO tid;

  RETURN jsonb_build_object(
    'tentative_id', tid,
    'modele_id', m.id,
    'code_unique', m.code_unique,
    'titre', m.titre,
    'snapshot', (SELECT snapshot_json FROM jeupharma.tentatives_jeu WHERE id = tid)
  );
END;
$$;

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
    ARRAY['indications', 'contre_indications', 'effets_indesirables']::text[]
  );

  IF jsonb_array_length(regles) = 0 THEN
    IF cfg ? 'matrice_ids'
       AND jsonb_typeof(cfg->'matrice_ids') = 'array'
       AND jsonb_array_length(cfg->'matrice_ids') > 0 THEN
      SELECT coalesce(array_agg(x.id), '{}') INTO picked
      FROM (
        SELECT id FROM (
          SELECT DISTINCT (jsonb_array_elements_text(cfg->'matrice_ids'))::uuid AS id
        ) d
        ORDER BY random()
        LIMIT 3
      ) x;
    ELSE
      SELECT coalesce(array_agg(x.id), '{}') INTO picked
      FROM (
        SELECT id FROM (
          SELECT DISTINCT cv.matrice_id AS id
          FROM jeupharma.v2_connaissances_visibles(auth.uid(), m.parcours_id, m.module_ids) cv
        ) d
        ORDER BY random()
        LIMIT 3
      ) x;
    END IF;
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
            FROM jeupharma.v2_connaissances_visibles(auth.uid(), m.parcours_id, m.module_ids) cv
            WHERE cv.champ_code = 'classe_therapeutique'
              AND cv.entite_id = class_id
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
            FROM jeupharma.v2_connaissances_visibles(auth.uid(), m.parcours_id, m.module_ids) cv
            WHERE cv.champ_code = 'classe_pharmacologique'
              AND cv.entite_id = class_id
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
            SELECT DISTINCT cv.matrice_id AS id
            FROM jeupharma.v2_connaissances_visibles(auth.uid(), m.parcours_id, m.module_ids) cv
            WHERE NOT (cv.matrice_id = ANY (picked))
          ) d
          ORDER BY random()
          LIMIT need
        ) x;
      END IF;
      IF coalesce(array_length(candidates, 1), 0) < need
         AND cfg ? 'matrice_ids'
         AND jsonb_typeof(cfg->'matrice_ids') = 'array'
         AND jsonb_array_length(cfg->'matrice_ids') > 0 THEN
        SELECT coalesce(array_agg(x.id), '{}') INTO candidates
        FROM (
          SELECT id FROM (
            SELECT DISTINCT (jsonb_array_elements_text(cfg->'matrice_ids'))::uuid AS id
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
    fiche := jeupharma.v2_fiche_resolue(mid, m.parcours_id, m.module_ids);
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
