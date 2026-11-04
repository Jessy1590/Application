-- =============================================================================
-- 100 : Jeux V3 — Quiz (styles manuel / auto / mixte)
-- =============================================================================

CREATE TABLE IF NOT EXISTS jeupharma.jeux_quiz (
  jeu_id uuid PRIMARY KEY REFERENCES jeupharma.jeux(id) ON DELETE CASCADE,
  style text NOT NULL DEFAULT 'manuel' CHECK (style = ANY (ARRAY[
    'manuel'::text, 'auto'::text, 'mixte'::text
  ])),
  nb_questions int NOT NULL DEFAULT 10 CHECK (nb_questions BETWEEN 1 AND 50),
  nb_manuelles int NOT NULL DEFAULT 5 CHECK (nb_manuelles BETWEEN 0 AND 50),
  nb_auto int NOT NULL DEFAULT 5 CHECK (nb_auto BETWEEN 0 AND 50),
  nb_propositions int NOT NULL DEFAULT 3 CHECK (nb_propositions BETWEEN 2 AND 6),
  sens_auto text NOT NULL DEFAULT 'mol_vers_valeur' CHECK (sens_auto = ANY (ARRAY[
    'mol_vers_valeur'::text, 'valeur_vers_mol'::text, 'les_deux'::text
  ])),
  difficulte int NOT NULL DEFAULT 1 CHECK (difficulte BETWEEN 1 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jeupharma.jeux_quiz_champs (
  jeu_id uuid NOT NULL REFERENCES jeupharma.jeux(id) ON DELETE CASCADE,
  champ_code text NOT NULL,
  PRIMARY KEY (jeu_id, champ_code)
);

CREATE TABLE IF NOT EXISTS jeupharma.jeux_quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jeu_id uuid NOT NULL REFERENCES jeupharma.jeux(id) ON DELETE CASCADE,
  ordre int NOT NULL DEFAULT 0,
  enonce text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jeux_quiz_questions_jeu_idx
  ON jeupharma.jeux_quiz_questions (jeu_id, ordre);

CREATE TABLE IF NOT EXISTS jeupharma.jeux_quiz_propositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES jeupharma.jeux_quiz_questions(id) ON DELETE CASCADE,
  ordre int NOT NULL DEFAULT 0,
  texte text NOT NULL,
  est_correcte boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS jeux_quiz_prop_q_idx
  ON jeupharma.jeux_quiz_propositions (question_id, ordre);

DROP TRIGGER IF EXISTS trg_jeux_quiz_set_updated_at ON jeupharma.jeux_quiz;
CREATE TRIGGER trg_jeux_quiz_set_updated_at
  BEFORE UPDATE ON jeupharma.jeux_quiz
  FOR EACH ROW EXECUTE FUNCTION jeupharma.set_updated_at();

ALTER TABLE jeupharma.jeux_quiz ENABLE ROW LEVEL SECURITY;
ALTER TABLE jeupharma.jeux_quiz_champs ENABLE ROW LEVEL SECURITY;
ALTER TABLE jeupharma.jeux_quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE jeupharma.jeux_quiz_propositions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY jeux_quiz_admin ON jeupharma.jeux_quiz FOR ALL TO authenticated
    USING (jeupharma.is_portail_admin()) WITH CHECK (jeupharma.is_portail_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY jeux_quiz_select ON jeupharma.jeux_quiz FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM jeupharma.jeux j WHERE j.id = jeu_id AND j.statut = 'actif' AND jeupharma.has_jeupharma_access()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY jeux_quiz_champs_admin ON jeupharma.jeux_quiz_champs FOR ALL TO authenticated
    USING (jeupharma.is_portail_admin()) WITH CHECK (jeupharma.is_portail_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY jeux_quiz_champs_select ON jeupharma.jeux_quiz_champs FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM jeupharma.jeux j WHERE j.id = jeu_id AND j.statut = 'actif' AND jeupharma.has_jeupharma_access()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY jeux_quiz_q_admin ON jeupharma.jeux_quiz_questions FOR ALL TO authenticated
    USING (jeupharma.is_portail_admin()) WITH CHECK (jeupharma.is_portail_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY jeux_quiz_q_select ON jeupharma.jeux_quiz_questions FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM jeupharma.jeux j WHERE j.id = jeu_id AND j.statut = 'actif' AND jeupharma.has_jeupharma_access()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY jeux_quiz_p_admin ON jeupharma.jeux_quiz_propositions FOR ALL TO authenticated
    USING (jeupharma.is_portail_admin()) WITH CHECK (jeupharma.is_portail_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY jeux_quiz_p_select ON jeupharma.jeux_quiz_propositions FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM jeupharma.jeux_quiz_questions q
      JOIN jeupharma.jeux j ON j.id = q.jeu_id
      WHERE q.id = question_id AND j.statut = 'actif' AND jeupharma.has_jeupharma_access()
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Copie params quiz vers archive (appelée depuis jeu_maj étendu)
CREATE OR REPLACE FUNCTION jeupharma.jeu__clone_quiz(p_from uuid, p_to uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
DECLARE
  qmap jsonb := '{}'::jsonb;
  r record;
  new_qid uuid;
BEGIN
  INSERT INTO jeupharma.jeux_quiz (
    jeu_id, style, nb_questions, nb_manuelles, nb_auto, nb_propositions, sens_auto, difficulte
  )
  SELECT p_to, style, nb_questions, nb_manuelles, nb_auto, nb_propositions, sens_auto, difficulte
  FROM jeupharma.jeux_quiz WHERE jeu_id = p_from
  ON CONFLICT (jeu_id) DO NOTHING;

  INSERT INTO jeupharma.jeux_quiz_champs (jeu_id, champ_code)
  SELECT p_to, champ_code FROM jeupharma.jeux_quiz_champs WHERE jeu_id = p_from
  ON CONFLICT DO NOTHING;

  FOR r IN
    SELECT * FROM jeupharma.jeux_quiz_questions WHERE jeu_id = p_from ORDER BY ordre
  LOOP
    INSERT INTO jeupharma.jeux_quiz_questions (jeu_id, ordre, enonce)
    VALUES (p_to, r.ordre, r.enonce)
    RETURNING id INTO new_qid;
    qmap := qmap || jsonb_build_object(r.id::text, new_qid::text);
    INSERT INTO jeupharma.jeux_quiz_propositions (question_id, ordre, texte, est_correcte)
    SELECT new_qid, ordre, texte, est_correcte
    FROM jeupharma.jeux_quiz_propositions WHERE question_id = r.id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.jeu__set_quiz(p_jeu uuid, p_quiz jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  q jsonb;
  prop jsonb;
  qid uuid;
  i int := 0;
  j int;
BEGIN
  IF p_quiz IS NULL THEN RETURN; END IF;

  INSERT INTO jeupharma.jeux_quiz (
    jeu_id, style, nb_questions, nb_manuelles, nb_auto, nb_propositions, sens_auto, difficulte
  ) VALUES (
    p_jeu,
    coalesce(p_quiz->>'style', 'manuel'),
    coalesce((p_quiz->>'nb_questions')::int, 10),
    coalesce((p_quiz->>'nb_manuelles')::int, 5),
    coalesce((p_quiz->>'nb_auto')::int, 5),
    coalesce((p_quiz->>'nb_propositions')::int, 3),
    coalesce(p_quiz->>'sens_auto', 'mol_vers_valeur'),
    coalesce((p_quiz->>'difficulte')::int, 1)
  )
  ON CONFLICT (jeu_id) DO UPDATE SET
    style = EXCLUDED.style,
    nb_questions = EXCLUDED.nb_questions,
    nb_manuelles = EXCLUDED.nb_manuelles,
    nb_auto = EXCLUDED.nb_auto,
    nb_propositions = EXCLUDED.nb_propositions,
    sens_auto = EXCLUDED.sens_auto,
    difficulte = EXCLUDED.difficulte,
    updated_at = now();

  DELETE FROM jeupharma.jeux_quiz_champs WHERE jeu_id = p_jeu;
  IF jsonb_typeof(p_quiz->'champs') = 'array' THEN
    INSERT INTO jeupharma.jeux_quiz_champs (jeu_id, champ_code)
    SELECT p_jeu, x
    FROM jsonb_array_elements_text(p_quiz->'champs') x
    ON CONFLICT DO NOTHING;
  END IF;

  DELETE FROM jeupharma.jeux_quiz_questions WHERE jeu_id = p_jeu;
  IF jsonb_typeof(p_quiz->'questions') = 'array' THEN
    FOR q IN SELECT * FROM jsonb_array_elements(p_quiz->'questions')
    LOOP
      i := i + 1;
      INSERT INTO jeupharma.jeux_quiz_questions (jeu_id, ordre, enonce)
      VALUES (p_jeu, i, coalesce(q->>'enonce', q->>'question', ''))
      RETURNING id INTO qid;
      j := 0;
      IF jsonb_typeof(q->'propositions') = 'array' THEN
        FOR prop IN SELECT * FROM jsonb_array_elements(q->'propositions')
        LOOP
          j := j + 1;
          INSERT INTO jeupharma.jeux_quiz_propositions (question_id, ordre, texte, est_correcte)
          VALUES (
            qid, j,
            coalesce(prop->>'texte', prop#>>'{}', ''),
            coalesce((prop->>'est_correcte')::boolean, prop->>'texte' = (q->>'correct'), false)
          );
        END LOOP;
      END IF;
    END LOOP;
  END IF;
END;
$$;

-- Étendre jeu_creer / jeu_maj pour quiz
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
        code, code, 1, p_payload->>'type_jeu', trim(p_payload->>'titre'),
        pid, mids, 'actif', auth.uid()
      ) RETURNING * INTO row;
      PERFORM jeupharma.jeu__set_pool(row.id, p_payload->'pool');
      IF row.type_jeu = 'quiz' THEN
        PERFORM jeupharma.jeu__set_quiz(row.id, p_payload->'quiz');
      END IF;
      RETURN to_jsonb(row);
    EXCEPTION WHEN unique_violation THEN CONTINUE;
    END;
  END LOOP;
  RAISE EXCEPTION 'Impossible de générer un code unique';
END;
$$;

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

  SELECT EXISTS (SELECT 1 FROM jeupharma.jeux_tentatives WHERE jeu_id = live.id) INTO has_t;

  IF has_t THEN
    INSERT INTO jeupharma.jeux (
      code_unique, famille_code, revision, type_jeu, titre,
      parcours_id, module_ids, statut, archive_de_jeu_id, created_by
    ) VALUES (
      live.famille_code || '-A' || live.revision, live.famille_code, live.revision,
      live.type_jeu, live.titre, live.parcours_id, live.module_ids, 'archive', live.id, live.created_by
    ) RETURNING * INTO arch;

    INSERT INTO jeupharma.jeux_pool (jeu_id, mode)
    SELECT arch.id, mode FROM jeupharma.jeux_pool WHERE jeu_id = live.id ON CONFLICT DO NOTHING;
    INSERT INTO jeupharma.jeux_pool_modules SELECT arch.id, module_id FROM jeupharma.jeux_pool_modules WHERE jeu_id = live.id;
    INSERT INTO jeupharma.jeux_pool_blocs SELECT arch.id, bloc_id FROM jeupharma.jeux_pool_blocs WHERE jeu_id = live.id;
    INSERT INTO jeupharma.jeux_pool_molecules SELECT arch.id, matrice_id FROM jeupharma.jeux_pool_molecules WHERE jeu_id = live.id;
    IF live.type_jeu = 'quiz' THEN
      PERFORM jeupharma.jeu__clone_quiz(live.id, arch.id);
    END IF;
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
      ELSE module_ids END,
    revision = new_rev, updated_at = now()
  WHERE id = live.id RETURNING * INTO live;

  IF p_payload ? 'pool' THEN PERFORM jeupharma.jeu__set_pool(live.id, p_payload->'pool'); END IF;
  IF live.type_jeu = 'quiz' AND p_payload ? 'quiz' THEN
    PERFORM jeupharma.jeu__set_quiz(live.id, p_payload->'quiz');
  END IF;
  RETURN to_jsonb(live);
END;
$$;

-- Charger config quiz complète (admin / play prep)
CREATE OR REPLACE FUNCTION jeupharma.jeu_quiz_config(p_jeu_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  q jeupharma.jeux_quiz%ROWTYPE;
  out jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  SELECT * INTO q FROM jeupharma.jeux_quiz WHERE jeu_id = p_jeu_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  out := jsonb_build_object(
    'style', q.style,
    'nb_questions', q.nb_questions,
    'nb_manuelles', q.nb_manuelles,
    'nb_auto', q.nb_auto,
    'nb_propositions', q.nb_propositions,
    'sens_auto', q.sens_auto,
    'difficulte', q.difficulte,
    'champs', coalesce((
      SELECT jsonb_agg(champ_code ORDER BY champ_code)
      FROM jeupharma.jeux_quiz_champs WHERE jeu_id = p_jeu_id
    ), '[]'::jsonb),
    'questions', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', qq.id,
          'ordre', qq.ordre,
          'enonce', qq.enonce,
          'propositions', (
            SELECT coalesce(jsonb_agg(
              jsonb_build_object(
                'id', p.id, 'ordre', p.ordre, 'texte', p.texte, 'est_correcte', p.est_correcte
              ) ORDER BY p.ordre), '[]'::jsonb)
            FROM jeupharma.jeux_quiz_propositions p WHERE p.question_id = qq.id
          )
        ) ORDER BY qq.ordre
      )
      FROM jeupharma.jeux_quiz_questions qq WHERE qq.jeu_id = p_jeu_id
    ), '[]'::jsonb)
  );
  RETURN out;
END;
$$;

-- Démarrer tentative quiz : client envoie le snapshot tiré (questions avec correctes)
-- Le serveur stocke le snapshot complet ; le client reçoit une version sans flags si examen
CREATE OR REPLACE FUNCTION jeupharma.jeu_demarrer_quiz(
  p_jeu_id uuid,
  p_snapshot jsonb,
  p_contexte text DEFAULT 'classique',
  p_passage_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  j jeupharma.jeux%ROWTYPE;
  tid uuid;
  pub jsonb;
  ctx text;
BEGIN
  IF auth.uid() IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  ctx := coalesce(nullif(p_contexte, ''), 'classique');
  IF ctx NOT IN ('classique', 'examen') THEN RAISE EXCEPTION 'Contexte invalide'; END IF;

  SELECT * INTO j FROM jeupharma.jeux WHERE id = p_jeu_id;
  IF NOT FOUND OR j.type_jeu <> 'quiz' THEN RAISE EXCEPTION 'Quiz introuvable'; END IF;
  IF j.statut <> 'actif' THEN RAISE EXCEPTION 'Jeu indisponible'; END IF;

  -- Lab = admin only
  IF EXISTS (
    SELECT 1 FROM jeupharma.parcours_apprentissage pa
    WHERE pa.id = j.parcours_id AND pa.est_laboratoire
  ) AND NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin';
  END IF;

  INSERT INTO jeupharma.jeux_tentatives (
    jeu_id, utilisateur_id, contexte, passage_id, snapshot_json, notation
  ) VALUES (
    j.id, auth.uid(), ctx, p_passage_id, coalesce(p_snapshot, '{}'::jsonb), 'serveur'
  ) RETURNING id INTO tid;

  -- Version client : masquer est_correcte en examen
  IF ctx = 'examen' THEN
    pub := jsonb_set(
      coalesce(p_snapshot, '{}'::jsonb),
      '{questions}',
      coalesce((
        SELECT jsonb_agg(
          (q - 'correct' - 'correcte')
          || jsonb_build_object(
            'propositions', (
              SELECT coalesce(jsonb_agg(p - 'est_correcte' - 'correct'), '[]'::jsonb)
              FROM jsonb_array_elements(coalesce(q->'propositions', '[]'::jsonb)) p
            )
          )
        )
        FROM jsonb_array_elements(coalesce(p_snapshot->'questions', '[]'::jsonb)) q
      ), '[]'::jsonb)
    );
  ELSE
    pub := coalesce(p_snapshot, '{}'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'tentative_id', tid,
    'jeu_id', j.id,
    'code_unique', j.code_unique,
    'contexte', ctx,
    'snapshot', pub
  );
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.jeu_soumettre_quiz(
  p_tentative_id uuid,
  p_reponses jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  t jeupharma.jeux_tentatives%ROWTYPE;
  q jsonb;
  rid text;
  ans text;
  correct text;
  ok boolean;
  obtenu numeric := 0;
  maxs numeric := 0;
  details jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT * INTO t FROM jeupharma.jeux_tentatives
  WHERE id = p_tentative_id AND utilisateur_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Tentative introuvable'; END IF;
  IF t.termine_at IS NOT NULL THEN RAISE EXCEPTION 'Tentative déjà terminée'; END IF;

  FOR q IN SELECT * FROM jsonb_array_elements(coalesce(t.snapshot_json->'questions', '[]'::jsonb))
  LOOP
    maxs := maxs + 1;
    rid := coalesce(q->>'id', q->>'qid', '');
    ans := coalesce(p_reponses->>rid, '');
    correct := coalesce(
      q->>'correct',
      (SELECT p->>'texte' FROM jsonb_array_elements(coalesce(q->'propositions', '[]'::jsonb)) p
       WHERE (p->>'est_correcte')::boolean IS TRUE LIMIT 1),
      ''
    );
    ok := (ans <> '' AND lower(trim(ans)) = lower(trim(correct)));
    IF ok THEN obtenu := obtenu + 1; END IF;
    details := details || jsonb_build_array(jsonb_build_object(
      'id', rid,
      'ok', ok,
      'reponse', ans,
      'correct', correct
    ));
  END LOOP;

  UPDATE jeupharma.jeux_tentatives SET
    reponses_json = coalesce(p_reponses, '{}'::jsonb),
    details_json = details,
    score_obtenu = obtenu,
    score_max = maxs,
    termine_at = now()
  WHERE id = t.id;

  RETURN jsonb_build_object(
    'tentative_id', t.id,
    'score_obtenu', obtenu,
    'score_max', maxs,
    'details', details,
    'contexte', t.contexte
  );
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.jeu_quiz_config(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.jeu_demarrer_quiz(uuid, jsonb, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.jeu_soumettre_quiz(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.jeu_quiz_config(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.jeu_demarrer_quiz(uuid, jsonb, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.jeu_soumettre_quiz(uuid, jsonb) TO authenticated;
