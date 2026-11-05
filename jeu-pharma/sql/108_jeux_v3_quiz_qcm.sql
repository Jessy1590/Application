-- =============================================================================
-- 108 : Jeux V3 — Quiz QCU/QCM (type par question, auto_qcm, scoring ensembles)
-- Tables V3 lab uniquement : jeupharma.jeux_quiz / jeux_quiz_questions /
-- jeux_quiz_propositions / jeux_tentatives. Ne touche pas modeles_jeu.
-- Compat : question sans type = QCU. QCU = égalité d’une chaîne (inchangé).
-- QCM = comparaison d’ensembles. Mode Détaillé via p_reponses.mode = 'detaille'
-- → 1 (ensembles égaux) / 0,5 (intersection) / 0.
-- =============================================================================

ALTER TABLE jeupharma.jeux_quiz
  ADD COLUMN IF NOT EXISTS auto_qcm boolean NOT NULL DEFAULT false;

ALTER TABLE jeupharma.jeux_quiz_questions
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'qcu';

ALTER TABLE jeupharma.jeux_quiz_questions
  DROP CONSTRAINT IF EXISTS jeux_quiz_questions_type_check;
ALTER TABLE jeupharma.jeux_quiz_questions
  ADD CONSTRAINT jeux_quiz_questions_type_check
  CHECK (type = ANY (ARRAY['qcu'::text, 'qcm'::text]));

UPDATE jeupharma.jeux_quiz_questions qq
SET type = 'qcm'
WHERE coalesce(qq.type, 'qcu') = 'qcu'
  AND (
    SELECT count(*)::int
    FROM jeupharma.jeux_quiz_propositions p
    WHERE p.question_id = qq.id AND p.est_correcte
  ) > 1;

-- ---------------------------------------------------------------------------
-- Helpers internes (scoring) — pas d’EXECUTE authenticated
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.jeu__quiz_norm(p_txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
  SELECT lower(btrim(coalesce(p_txt, '')));
$$;

CREATE OR REPLACE FUNCTION jeupharma.jeu__quiz_set_from_json(p jsonb)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
DECLARE
  out text[] := '{}'::text[];
  x text;
  e jsonb;
BEGIN
  IF p IS NULL OR p = 'null'::jsonb THEN
    RETURN out;
  END IF;
  IF jsonb_typeof(p) = 'array' THEN
    FOR e IN SELECT * FROM jsonb_array_elements(p)
    LOOP
      IF jsonb_typeof(e) = 'string' THEN
        x := jeupharma.jeu__quiz_norm(e #>> '{}');
      ELSE
        x := jeupharma.jeu__quiz_norm(e->>'texte');
      END IF;
      IF x <> '' AND NOT (x = ANY (out)) THEN
        out := out || x;
      END IF;
    END LOOP;
    RETURN out;
  END IF;
  IF jsonb_typeof(p) = 'string' THEN
    x := p #>> '{}';
    IF position(' | ' IN x) > 0 THEN
      FOREACH x IN ARRAY string_to_array(x, ' | ')
      LOOP
        x := jeupharma.jeu__quiz_norm(x);
        IF x <> '' AND NOT (x = ANY (out)) THEN
          out := out || x;
        END IF;
      END LOOP;
      RETURN out;
    END IF;
    x := jeupharma.jeu__quiz_norm(x);
    IF x <> '' THEN RETURN ARRAY[x]; END IF;
    RETURN out;
  END IF;
  RETURN out;
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.jeu__quiz_score_question(
  p_q jsonb,
  p_ans jsonb,
  p_mode text
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
DECLARE
  qtype text;
  mode text;
  corrects text[];
  picked text[];
  ans_txt text;
  corr_txt text;
BEGIN
  mode := CASE WHEN lower(coalesce(p_mode, '')) = 'detaille' THEN 'detaille' ELSE 'rapide' END;
  qtype := lower(coalesce(nullif(btrim(p_q->>'type'), ''), ''));

  corrects := jeupharma.jeu__quiz_set_from_json(
    coalesce(
      (SELECT jsonb_agg(p->>'texte')
       FROM jsonb_array_elements(coalesce(p_q->'propositions', '[]'::jsonb)) p
       WHERE coalesce((p->>'est_correcte')::boolean, false)
         AND nullif(btrim(p->>'texte'), '') IS NOT NULL),
      '[]'::jsonb
    )
  );
  IF coalesce(array_length(corrects, 1), 0) = 0 THEN
    corrects := jeupharma.jeu__quiz_set_from_json(p_q->'corrects');
  END IF;
  IF coalesce(array_length(corrects, 1), 0) = 0 AND nullif(p_q->>'correct', '') IS NOT NULL THEN
    corrects := jeupharma.jeu__quiz_set_from_json(to_jsonb(p_q->>'correct'));
  END IF;

  IF qtype NOT IN ('qcu', 'qcm') THEN
    qtype := CASE WHEN coalesce(array_length(corrects, 1), 0) > 1 THEN 'qcm' ELSE 'qcu' END;
  END IF;

  IF qtype = 'qcu' THEN
    IF jsonb_typeof(p_ans) = 'array' THEN
      ans_txt := p_ans->>0;
    ELSIF jsonb_typeof(p_ans) = 'string' THEN
      ans_txt := p_ans #>> '{}';
    ELSE
      ans_txt := '';
    END IF;
    corr_txt := coalesce(
      (SELECT p->>'texte'
       FROM jsonb_array_elements(coalesce(p_q->'propositions', '[]'::jsonb)) p
       WHERE coalesce((p->>'est_correcte')::boolean, false)
       LIMIT 1),
      p_q->>'correct',
      ''
    );
    IF jeupharma.jeu__quiz_norm(ans_txt) <> ''
       AND jeupharma.jeu__quiz_norm(ans_txt) = jeupharma.jeu__quiz_norm(corr_txt) THEN
      RETURN 1;
    END IF;
    RETURN 0;
  END IF;

  picked := jeupharma.jeu__quiz_set_from_json(p_ans);
  IF coalesce(array_length(picked, 1), 0) > 0
     AND coalesce(array_length(corrects, 1), 0) > 0
     AND picked <@ corrects AND corrects <@ picked THEN
    RETURN 1;
  END IF;
  IF mode = 'detaille' AND EXISTS (
    SELECT 1 FROM unnest(picked) a WHERE a = ANY (corrects)
  ) THEN
    RETURN 0.5;
  END IF;
  RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.jeu__quiz_norm(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION jeupharma.jeu__quiz_set_from_json(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION jeupharma.jeu__quiz_score_question(jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Clone / set / config
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.jeu__clone_quiz(p_from uuid, p_to uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
DECLARE
  r record;
  new_qid uuid;
BEGIN
  INSERT INTO jeupharma.jeux_quiz (
    jeu_id, style, nb_questions, nb_manuelles, nb_auto, nb_propositions,
    sens_auto, difficulte, auto_qcm
  )
  SELECT p_to, style, nb_questions, nb_manuelles, nb_auto, nb_propositions,
         sens_auto, difficulte, auto_qcm
  FROM jeupharma.jeux_quiz WHERE jeu_id = p_from
  ON CONFLICT (jeu_id) DO NOTHING;

  INSERT INTO jeupharma.jeux_quiz_champs (jeu_id, champ_code)
  SELECT p_to, champ_code FROM jeupharma.jeux_quiz_champs WHERE jeu_id = p_from
  ON CONFLICT DO NOTHING;

  FOR r IN
    SELECT * FROM jeupharma.jeux_quiz_questions WHERE jeu_id = p_from ORDER BY ordre
  LOOP
    INSERT INTO jeupharma.jeux_quiz_questions (jeu_id, ordre, enonce, type)
    VALUES (p_to, r.ordre, r.enonce, CASE WHEN r.type = 'qcm' THEN 'qcm' ELSE 'qcu' END)
    RETURNING id INTO new_qid;
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
  qtype text;
  n_ok int;
BEGIN
  IF p_quiz IS NULL THEN RETURN; END IF;

  INSERT INTO jeupharma.jeux_quiz (
    jeu_id, style, nb_questions, nb_manuelles, nb_auto, nb_propositions,
    sens_auto, difficulte, auto_qcm
  ) VALUES (
    p_jeu,
    coalesce(p_quiz->>'style', 'manuel'),
    coalesce((p_quiz->>'nb_questions')::int, 10),
    coalesce((p_quiz->>'nb_manuelles')::int, 5),
    coalesce((p_quiz->>'nb_auto')::int, 5),
    coalesce((p_quiz->>'nb_propositions')::int, 3),
    coalesce(p_quiz->>'sens_auto', 'mol_vers_valeur'),
    coalesce((p_quiz->>'difficulte')::int, 1),
    coalesce((p_quiz->>'auto_qcm')::boolean, false)
  )
  ON CONFLICT (jeu_id) DO UPDATE SET
    style = EXCLUDED.style,
    nb_questions = EXCLUDED.nb_questions,
    nb_manuelles = EXCLUDED.nb_manuelles,
    nb_auto = EXCLUDED.nb_auto,
    nb_propositions = EXCLUDED.nb_propositions,
    sens_auto = EXCLUDED.sens_auto,
    difficulte = EXCLUDED.difficulte,
    auto_qcm = EXCLUDED.auto_qcm,
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
      qtype := lower(coalesce(nullif(btrim(q->>'type'), ''), ''));
      IF qtype NOT IN ('qcu', 'qcm') THEN
        SELECT count(*)::int INTO n_ok
        FROM jsonb_array_elements(coalesce(q->'propositions', '[]'::jsonb)) p
        WHERE coalesce((p->>'est_correcte')::boolean, false);
        qtype := CASE WHEN n_ok > 1 THEN 'qcm' ELSE 'qcu' END;
      END IF;
      INSERT INTO jeupharma.jeux_quiz_questions (jeu_id, ordre, enonce, type)
      VALUES (p_jeu, i, coalesce(q->>'enonce', q->>'question', ''), qtype)
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
    'auto_qcm', q.auto_qcm,
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
          'type', qq.type,
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

-- ---------------------------------------------------------------------------
-- Play : masquer les flags en examen ; scoring ensembles
-- ---------------------------------------------------------------------------
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

  IF ctx = 'examen' THEN
    pub := jsonb_set(
      coalesce(p_snapshot, '{}'::jsonb),
      '{questions}',
      coalesce((
        SELECT jsonb_agg(
          (q - 'correct' - 'correcte' - 'corrects')
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
  map jsonb;
  rid text;
  ans jsonb;
  mode text;
  score numeric;
  obtenu numeric := 0;
  maxs numeric := 0;
  details jsonb := '[]'::jsonb;
  corrects jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT * INTO t FROM jeupharma.jeux_tentatives
  WHERE id = p_tentative_id AND utilisateur_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Tentative introuvable'; END IF;
  IF t.termine_at IS NOT NULL THEN RAISE EXCEPTION 'Tentative déjà terminée'; END IF;

  mode := CASE
    WHEN lower(coalesce(p_reponses->>'mode', '')) = 'detaille' THEN 'detaille'
    ELSE 'rapide'
  END;
  IF jsonb_typeof(p_reponses->'reponses') = 'object' THEN
    map := p_reponses->'reponses';
  ELSE
    map := coalesce(p_reponses, '{}'::jsonb);
  END IF;

  FOR q IN SELECT * FROM jsonb_array_elements(coalesce(t.snapshot_json->'questions', '[]'::jsonb))
  LOOP
    maxs := maxs + 1;
    rid := coalesce(q->>'id', q->>'qid', '');
    ans := CASE WHEN rid <> '' AND map ? rid THEN map->rid ELSE 'null'::jsonb END;
    score := jeupharma.jeu__quiz_score_question(q, ans, mode);
    obtenu := obtenu + score;
    corrects := coalesce(
      (SELECT jsonb_agg(p->>'texte')
       FROM jsonb_array_elements(coalesce(q->'propositions', '[]'::jsonb)) p
       WHERE coalesce((p->>'est_correcte')::boolean, false)),
      q->'corrects',
      to_jsonb(q->>'correct')
    );
    details := details || jsonb_build_array(jsonb_build_object(
      'id', rid,
      'ok', score = 1,
      'score', score,
      'reponse', ans,
      'correct', corrects
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
    'mode', mode,
    'details', details,
    'contexte', t.contexte
  );
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.jeu__clone_quiz(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION jeupharma.jeu__set_quiz(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION jeupharma.jeu_quiz_config(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION jeupharma.jeu_demarrer_quiz(uuid, jsonb, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION jeupharma.jeu_soumettre_quiz(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION jeupharma.jeu_quiz_config(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.jeu_demarrer_quiz(uuid, jsonb, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.jeu_soumettre_quiz(uuid, jsonb) TO authenticated;
