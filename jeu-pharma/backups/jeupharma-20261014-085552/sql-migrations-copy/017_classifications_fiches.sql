-- 017 : classifications de fiche réservées au niveau d'apprentissage pharmacien.
-- `hospitalier` (legacy conservé) et `complexe` sont des propriétés de matrice,
-- indépendantes des rôles portail et des anciens niveaux portés par les entités.

ALTER TABLE jeupharma.matrice_medicaments
  ADD COLUMN IF NOT EXISTS complexe boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN jeupharma.matrice_medicaments.hospitalier IS
  'Fiche hospitalière : visible et jouable uniquement pour un profil d apprentissage pharmacien.';
COMMENT ON COLUMN jeupharma.matrice_medicaments.complexe IS
  'Fiche complexe : visible et jouable uniquement pour un profil d apprentissage pharmacien.';

CREATE OR REPLACE VIEW jeupharma.v_medicaments_complet AS
SELECT
  m.id,
  m.statut,
  m.created_at,
  m.updated_at,
  m.updated_by,
  m.dci_id,
  d.valeur AS dci,
  d.niveaux_connus AS dci_niveaux,
  m.secteur_therapeutique_id,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', s.id, 'valeur', s.valeur, 'ordre', ms.ordre, 'niveaux_connus', s.niveaux_connus
    ) ORDER BY ms.ordre, s.valeur)
    FROM jeupharma.matrice_secteurs_therapeutiques ms
    JOIN jeupharma.secteurs_therapeutiques s ON s.id = ms.secteur_therapeutique_id
    WHERE ms.matrice_id = m.id
  ), '[]'::jsonb) AS secteur_therapeutique,
  (
    SELECT s.niveaux_connus
    FROM jeupharma.matrice_secteurs_therapeutiques ms
    JOIN jeupharma.secteurs_therapeutiques s ON s.id = ms.secteur_therapeutique_id
    WHERE ms.matrice_id = m.id
    ORDER BY ms.ordre, s.valeur
    LIMIT 1
  ) AS secteur_niveaux,
  m.classe_therapeutique_id,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', ct.id, 'valeur', ct.valeur, 'ordre', mct.ordre, 'niveaux_connus', ct.niveaux_connus
    ) ORDER BY mct.ordre, ct.valeur)
    FROM jeupharma.matrice_classes_therapeutiques mct
    JOIN jeupharma.classes_therapeutiques ct ON ct.id = mct.classe_therapeutique_id
    WHERE mct.matrice_id = m.id
  ), '[]'::jsonb) AS classe_therapeutique,
  (
    SELECT ct.niveaux_connus
    FROM jeupharma.matrice_classes_therapeutiques mct
    JOIN jeupharma.classes_therapeutiques ct ON ct.id = mct.classe_therapeutique_id
    WHERE mct.matrice_id = m.id
    ORDER BY mct.ordre, ct.valeur
    LIMIT 1
  ) AS classe_therapeutique_niveaux,
  m.classe_pharmacologique_id,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', cp.id, 'valeur', cp.valeur, 'ordre', mcp.ordre, 'niveaux_connus', cp.niveaux_connus
    ) ORDER BY mcp.ordre, cp.valeur)
    FROM jeupharma.matrice_classes_pharmacologiques mcp
    JOIN jeupharma.classes_pharmacologiques cp ON cp.id = mcp.classe_pharmacologique_id
    WHERE mcp.matrice_id = m.id
  ), '[]'::jsonb) AS classe_pharmacologique,
  (
    SELECT cp.niveaux_connus
    FROM jeupharma.matrice_classes_pharmacologiques mcp
    JOIN jeupharma.classes_pharmacologiques cp ON cp.id = mcp.classe_pharmacologique_id
    WHERE mcp.matrice_id = m.id
    ORDER BY mcp.ordre, cp.valeur
    LIMIT 1
  ) AS classe_pharmacologique_niveaux,
  m.detail_pharmacologie_id,
  dp.valeur AS detail_pharmacologie,
  m.posologie_generale_id,
  pg.valeur AS posologie_generale,
  m.grossesse_allaitement_id,
  ga.valeur AS grossesse_allaitement,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', nc.id, 'valeur', nc.valeur, 'ordre', mnc.ordre)
      ORDER BY mnc.ordre, nc.valeur)
    FROM jeupharma.matrice_noms_commerciaux mnc
    JOIN jeupharma.noms_commerciaux nc ON nc.id = mnc.nom_commercial_id
    WHERE mnc.matrice_id = m.id
  ), '[]'::jsonb) AS noms_commerciaux,
  (
    SELECT nc.valeur
    FROM jeupharma.matrice_noms_commerciaux mnc
    JOIN jeupharma.noms_commerciaux nc ON nc.id = mnc.nom_commercial_id
    WHERE mnc.matrice_id = m.id
    ORDER BY mnc.ordre, nc.valeur
    LIMIT 1
  ) AS nom_commercial,
  (
    SELECT nc.niveaux_connus
    FROM jeupharma.matrice_noms_commerciaux mnc
    JOIN jeupharma.noms_commerciaux nc ON nc.id = mnc.nom_commercial_id
    WHERE mnc.matrice_id = m.id
    ORDER BY mnc.ordre, nc.valeur
    LIMIT 1
  ) AS nom_commercial_niveaux,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', i.id, 'valeur', i.valeur, 'ordre', mi.ordre)
      ORDER BY mi.ordre, i.valeur)
    FROM jeupharma.matrice_indications mi
    JOIN jeupharma.indications i ON i.id = mi.indication_id
    WHERE mi.matrice_id = m.id
  ), '[]'::jsonb) AS indications,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', ci.id, 'valeur', ci.valeur, 'ordre', mci.ordre)
      ORDER BY mci.ordre, ci.valeur)
    FROM jeupharma.matrice_contre_indications mci
    JOIN jeupharma.contre_indications ci ON ci.id = mci.contre_indication_id
    WHERE mci.matrice_id = m.id
  ), '[]'::jsonb) AS contre_indications,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', ei.id, 'valeur', ei.valeur, 'ordre', mei.ordre)
      ORDER BY mei.ordre, ei.valeur)
    FROM jeupharma.matrice_effets_indesirables mei
    JOIN jeupharma.effets_indesirables ei ON ei.id = mei.effet_indesirable_id
    WHERE mei.matrice_id = m.id
  ), '[]'::jsonb) AS effets_indesirables,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', pe.id, 'valeur', pe.valeur, 'ordre', mpe.ordre)
      ORDER BY mpe.ordre, pe.valeur)
    FROM jeupharma.matrice_precautions_emploi mpe
    JOIN jeupharma.precautions_emploi pe ON pe.id = mpe.precaution_emploi_id
    WHERE mpe.matrice_id = m.id
  ), '[]'::jsonb) AS precautions_emploi,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', ix.id, 'valeur', ix.valeur, 'ordre', mix.ordre)
      ORDER BY mix.ordre, ix.valeur)
    FROM jeupharma.matrice_interactions mix
    JOIN jeupharma.interactions ix ON ix.id = mix.interaction_id
    WHERE mix.matrice_id = m.id
  ), '[]'::jsonb) AS interactions,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', sv.id, 'valeur', sv.valeur, 'ordre', msv.ordre)
      ORDER BY msv.ordre, sv.valeur)
    FROM jeupharma.matrice_surveillances msv
    JOIN jeupharma.surveillances sv ON sv.id = msv.surveillance_id
    WHERE msv.matrice_id = m.id
  ), '[]'::jsonb) AS surveillances,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', va.id, 'valeur', va.valeur, 'ordre', mva.ordre)
      ORDER BY mva.ordre, va.valeur)
    FROM jeupharma.matrice_voies_administration mva
    JOIN jeupharma.voies_administration va ON va.id = mva.voie_administration_id
    WHERE mva.matrice_id = m.id
  ), '[]'::jsonb) AS voies_administration,
  m.hospitalier,
  m.fiche_validee,
  m.complexe
FROM jeupharma.matrice_medicaments m
LEFT JOIN jeupharma.dcis d ON d.id = m.dci_id
LEFT JOIN jeupharma.details_pharmacologie dp ON dp.id = m.detail_pharmacologie_id
LEFT JOIN jeupharma.posologies_generales pg ON pg.id = m.posologie_generale_id
LEFT JOIN jeupharma.grossesse_allaitement ga ON ga.id = m.grossesse_allaitement_id;

ALTER VIEW jeupharma.v_medicaments_complet SET (security_invoker = true);
GRANT SELECT ON jeupharma.v_medicaments_complet TO authenticated;
COMMENT ON VIEW jeupharma.v_medicaments_complet IS
  'Fiches DCI et agrégats. hospitalier/complexe réservés au profil apprentissage pharmacien.';

CREATE OR REPLACE FUNCTION jeupharma._matrice_disponible_niveau(
  p_matrice_id uuid,
  p_niveau text
) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
  SELECT p_niveau IS NULL OR EXISTS (
    SELECT 1
    FROM jeupharma.matrice_medicaments m
    WHERE m.id = p_matrice_id
      AND (
        p_niveau = 'pharmacien'
        OR (m.hospitalier IS NOT TRUE AND m.complexe IS NOT TRUE)
      )
      AND (
        NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_secteurs_therapeutiques j
          WHERE j.matrice_id = m.id
        )
        OR EXISTS (
          SELECT 1
          FROM jeupharma.matrice_secteurs_therapeutiques j
          JOIN jeupharma.niveau_secteurs_therapeutiques n
            ON n.secteur_therapeutique_id = j.secteur_therapeutique_id
           AND n.niveau_id = p_niveau
          WHERE j.matrice_id = m.id
        )
      )
      AND (
        NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_classes_therapeutiques j
          WHERE j.matrice_id = m.id
        )
        OR EXISTS (
          SELECT 1
          FROM jeupharma.matrice_classes_therapeutiques j
          JOIN jeupharma.niveau_classes_therapeutiques n
            ON n.classe_therapeutique_id = j.classe_therapeutique_id
           AND n.niveau_id = p_niveau
          WHERE j.matrice_id = m.id
        )
      )
      AND (
        NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_classes_pharmacologiques j
          WHERE j.matrice_id = m.id
        )
        OR EXISTS (
          SELECT 1
          FROM jeupharma.matrice_classes_pharmacologiques j
          JOIN jeupharma.niveau_classes_pharmacologiques n
            ON n.classe_pharmacologique_id = j.classe_pharmacologique_id
           AND n.niveau_id = p_niveau
          WHERE j.matrice_id = m.id
        )
      )
  );
$$;

-- Générateur legacy : même règle que les pools client.
CREATE OR REPLACE FUNCTION jeupharma.generer_et_geler_quiz(p_quizz_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  q jeupharma.quizz%ROWTYPE;
  cfg jsonb;
  champs text[];
  nb_q int;
  nb_prop int;
  questions jsonb := '[]'::jsonb;
  pool uuid[];
  mid uuid;
  champ text;
  bonne record;
  distracteurs jsonb;
  props jsonb;
  enonce text;
  dci_val text;
  nom_val text;
  i int;
  attempts int;
  has_eval boolean;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;

  SELECT * INTO q FROM jeupharma.quizz WHERE id = p_quizz_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz introuvable';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM jeupharma.quizz_reponses_utilisateur r
    WHERE r.quizz_id = p_quizz_id AND r.mode = 'evaluation'
  ) INTO has_eval;
  IF has_eval THEN
    RAISE EXCEPTION 'Snapshot verrouillé : des réponses évaluation existent déjà';
  END IF;

  cfg := coalesce(q.configuration_json, '{}'::jsonb);
  champs := coalesce(
    ARRAY(SELECT jsonb_array_elements_text(cfg->'champs_interroges')),
    ARRAY['classe_pharmacologique']::text[]
  );
  IF cardinality(champs) IS NULL OR cardinality(champs) = 0 THEN
    champs := ARRAY['classe_pharmacologique'];
  END IF;
  nb_q := coalesce((cfg->>'nb_questions')::int, 10);
  nb_prop := coalesce((cfg->>'nb_propositions')::int, 3);
  IF nb_q < 1 THEN nb_q := 10; END IF;
  IF nb_prop < 2 THEN nb_prop := 3; END IF;

  SELECT coalesce(array_agg(m.id), ARRAY[]::uuid[])
  INTO pool
  FROM jeupharma.matrice_medicaments m
  WHERE m.statut = 'publie'
    AND (q.secteur_therapeutique_id IS NULL OR m.secteur_therapeutique_id = q.secteur_therapeutique_id)
    AND jeupharma._matrice_disponible_niveau(m.id, q.niveau_cible);

  IF coalesce(cardinality(pool), 0) = 0 THEN
    RAISE EXCEPTION 'Pas assez de médicaments publiés dans ce secteur pour % QCM', nb_q;
  END IF;

  i := 0;
  attempts := 0;
  WHILE i < nb_q AND attempts < nb_q * 20 LOOP
    attempts := attempts + 1;
    mid := pool[1 + floor(random() * cardinality(pool))::int];
    champ := champs[1 + floor(random() * cardinality(champs))::int];

    SELECT * INTO bonne
    FROM jeupharma._valeur_champ_matrice(mid, champ, q.niveau_cible)
    LIMIT 1;
    IF bonne.entite_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT d.valeur INTO dci_val
    FROM jeupharma.matrice_medicaments m
    LEFT JOIN jeupharma.dcis d ON d.id = m.dci_id
    WHERE m.id = mid;

    SELECT string_agg(nc.valeur, ', ' ORDER BY mnc.ordre, nc.valeur)
    INTO nom_val
    FROM jeupharma.matrice_noms_commerciaux mnc
    JOIN jeupharma.noms_commerciaux nc ON nc.id = mnc.nom_commercial_id
    WHERE mnc.matrice_id = mid;

    IF champ = 'dci' THEN
      enonce := format('Quelle est la DCI de %s ?', coalesce(nom_val, 'ce médicament'));
    ELSIF champ = 'nom_commercial' THEN
      enonce := format('Quel est le nom commercial de %s ?', coalesce(dci_val, 'cette DCI'));
    ELSE
      enonce := format(
        'Quelle est la %s de %s (%s) ?',
        jeupharma._libelle_champ(champ),
        coalesce(dci_val, '…'),
        coalesce(nom_val, '…')
      );
    END IF;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', x.entite_id,
      'valeur', x.valeur,
      'correct', false
    )), '[]'::jsonb)
    INTO distracteurs
    FROM jeupharma._distracteurs_champ(
      champ,
      bonne.entite_id,
      q.secteur_therapeutique_id,
      q.niveau_cible,
      nb_prop - 1
    ) x;

    IF jsonb_array_length(distracteurs) < (nb_prop - 1) THEN
      CONTINUE;
    END IF;

    props := distracteurs || jsonb_build_array(jsonb_build_object(
      'id', bonne.entite_id,
      'valeur', bonne.valeur,
      'correct', true
    ));

    SELECT jsonb_agg(e.elem ORDER BY random())
    INTO props
    FROM jsonb_array_elements(props) AS e(elem);

    questions := questions || jsonb_build_array(jsonb_build_object(
      'ordre', i + 1,
      'enonce', enonce,
      'matrice_id', mid,
      'champ_code', champ,
      'bonne_reponse_id', bonne.entite_id,
      'propositions', props
    ));
    i := i + 1;
  END LOOP;

  IF i < nb_q THEN
    RAISE EXCEPTION
      'Pas assez de médicaments publiés dans ce secteur pour % QCM (généré: %)',
      nb_q, i;
  END IF;

  UPDATE jeupharma.quizz
  SET snapshot_questions = questions
  WHERE id = p_quizz_id;

  RETURN questions;
END;
$$;

-- La RLS est la source de vérité : pas de lecture directe d'une fiche ou d'un
-- snapshot pharmacien par un autre niveau d'apprentissage.
DROP POLICY IF EXISTS matrice_select ON jeupharma.matrice_medicaments;
CREATE POLICY matrice_select ON jeupharma.matrice_medicaments
FOR SELECT TO authenticated
USING (
  jeupharma.has_jeupharma_access()
  AND (
    jeupharma.is_portail_admin()
    OR (
      statut = 'publie'
      AND (
        (hospitalier IS NOT TRUE AND complexe IS NOT TRUE)
        OR EXISTS (
          SELECT 1
          FROM jeupharma.profil_apprentissage p
          WHERE p.user_id = auth.uid() AND p.niveau_id = 'pharmacien'
        )
      )
    )
  )
);

DROP POLICY IF EXISTS quizz_select ON jeupharma.quizz;
CREATE POLICY quizz_select ON jeupharma.quizz
FOR SELECT TO authenticated
USING (
  jeupharma.has_jeupharma_access()
  AND (
    jeupharma.is_portail_admin()
    OR (
      actif
      AND (
        niveau_cible NOT IN ('pharmacien', 'hospitalier')
        OR EXISTS (
          SELECT 1
          FROM jeupharma.profil_apprentissage p
          WHERE p.user_id = auth.uid() AND p.niveau_id = 'pharmacien'
        )
      )
    )
  )
);

DROP POLICY IF EXISTS parties_select ON jeupharma.parties_tableau_trous;
CREATE POLICY parties_select ON jeupharma.parties_tableau_trous
FOR SELECT TO authenticated
USING (
  jeupharma.has_jeupharma_access()
  AND (
    jeupharma.is_portail_admin()
    OR (
      actif
      AND (
        niveau_cible NOT IN ('pharmacien', 'hospitalier')
        OR EXISTS (
          SELECT 1
          FROM jeupharma.profil_apprentissage p
          WHERE p.user_id = auth.uid() AND p.niveau_id = 'pharmacien'
        )
      )
    )
  )
);

CREATE OR REPLACE FUNCTION jeupharma.ouvrir_quiz(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  q jeupharma.quizz%ROWTYPE;
  out_snap jsonb;
  stripped jsonb := '[]'::jsonb;
  elem jsonb;
  props jsonb;
BEGIN
  IF NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Acces refuse';
  END IF;
  SELECT * INTO q
  FROM jeupharma.quizz
  WHERE upper(code_unique) = upper(trim(p_code)) AND actif;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz introuvable ou inactif';
  END IF;
  IF q.niveau_cible IN ('pharmacien', 'hospitalier')
     AND NOT jeupharma.is_portail_admin()
     AND NOT EXISTS (
       SELECT 1 FROM jeupharma.profil_apprentissage p
       WHERE p.user_id = auth.uid() AND p.niveau_id = 'pharmacien'
     ) THEN
    RAISE EXCEPTION 'Quiz reserve au niveau pharmacien';
  END IF;
  IF q.snapshot_questions IS NULL OR jsonb_typeof(q.snapshot_questions) <> 'array' THEN
    RAISE EXCEPTION 'Quiz non genere (snapshot manquant)';
  END IF;
  IF q.mode = 'entrainement' THEN
    out_snap := q.snapshot_questions;
  ELSE
    FOR elem IN SELECT * FROM jsonb_array_elements(q.snapshot_questions) LOOP
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', p->>'id',
        'valeur', p->>'valeur'
      ) ORDER BY ordinality), '[]'::jsonb)
      INTO props
      FROM jsonb_array_elements(elem->'propositions')
        WITH ORDINALITY AS t(p, ordinality);
      stripped := stripped || jsonb_build_array(jsonb_build_object(
        'ordre', elem->'ordre',
        'enonce', elem->'enonce',
        'matrice_id', elem->'matrice_id',
        'champ_code', elem->'champ_code',
        'propositions', props
      ));
    END LOOP;
    out_snap := stripped;
  END IF;
  RETURN jsonb_build_object(
    'id', q.id,
    'code_unique', q.code_unique,
    'titre', q.titre,
    'mode', q.mode,
    'niveau_cible', q.niveau_cible,
    'secteur_therapeutique_id', q.secteur_therapeutique_id,
    'questions', out_snap
  );
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.soumettre_quiz(p_quizz_id uuid, p_reponses jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  q jeupharma.quizz%ROWTYPE;
  elem jsonb;
  bonne_id uuid;
  choix_id uuid;
  ok boolean;
  score int := 0;
  total int := 0;
  details jsonb := '[]'::jsonb;
  rid uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Acces refuse';
  END IF;
  SELECT * INTO q FROM jeupharma.quizz WHERE id = p_quizz_id AND actif;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz introuvable';
  END IF;
  IF q.niveau_cible IN ('pharmacien', 'hospitalier')
     AND NOT jeupharma.is_portail_admin()
     AND NOT EXISTS (
       SELECT 1 FROM jeupharma.profil_apprentissage p
       WHERE p.user_id = auth.uid() AND p.niveau_id = 'pharmacien'
     ) THEN
    RAISE EXCEPTION 'Quiz reserve au niveau pharmacien';
  END IF;
  IF q.snapshot_questions IS NULL THEN
    RAISE EXCEPTION 'Snapshot manquant';
  END IF;
  IF q.mode = 'evaluation' AND EXISTS (
    SELECT 1 FROM jeupharma.quizz_reponses_utilisateur r
    WHERE r.quizz_id = p_quizz_id
      AND r.utilisateur_id = auth.uid()
      AND r.mode = 'evaluation'
  ) THEN
    RAISE EXCEPTION 'Tentative evaluation deja enregistree';
  END IF;
  FOR elem IN SELECT * FROM jsonb_array_elements(q.snapshot_questions) LOOP
    total := total + 1;
    bonne_id := (elem->>'bonne_reponse_id')::uuid;
    choix_id := NULL;
    SELECT (r->>'proposition_id')::uuid INTO choix_id
    FROM jsonb_array_elements(coalesce(p_reponses, '[]'::jsonb)) r
    WHERE (r->>'ordre')::int = (elem->>'ordre')::int
       OR r->>'matrice_id' = elem->>'matrice_id'
    LIMIT 1;
    ok := (choix_id IS NOT NULL AND choix_id = bonne_id);
    IF ok THEN score := score + 1; END IF;
    details := details || jsonb_build_array(jsonb_build_object(
      'ordre', elem->'ordre',
      'matrice_id', elem->'matrice_id',
      'champ_code', elem->'champ_code',
      'proposition_id', choix_id,
      'bonne_reponse_id', bonne_id,
      'correct', ok
    ));
  END LOOP;
  INSERT INTO jeupharma.quizz_reponses_utilisateur (
    quizz_id, utilisateur_id, mode, score_obtenu, score_max, details_reponses
  ) VALUES (
    p_quizz_id, auth.uid(), q.mode, score, total, details
  ) RETURNING id INTO rid;
  RETURN jsonb_build_object(
    'reponse_id', rid,
    'mode', q.mode,
    'score_obtenu', score,
    'score_max', total,
    'details', details
  );
END;
$$;


