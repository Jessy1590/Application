-- Jeu Pharma — 005 : fiches hospitalières (niveau pédagogique pharmacien uniquement)
-- Projet remote : kpjflntnotftpzffjbud
--
-- Modèle : booléen matrice_medicaments.hospitalier DEFAULT false.
-- Si true → la fiche n’est visible / générable que pour le niveau pédagogique `pharmacien`
-- (pas portail.profiles.role). Aucun seed : l’admin coche hospitalier fiche par fiche.
-- Ne pas réappliquer sans vérifier l’état remote.

-- ---------------------------------------------------------------------------
-- 1. Colonne
-- ---------------------------------------------------------------------------

ALTER TABLE jeupharma.matrice_medicaments
  ADD COLUMN IF NOT EXISTS hospitalier boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN jeupharma.matrice_medicaments.hospitalier IS
  'Médicament hospitalier : visible / générable uniquement au niveau pédagogique pharmacien. Marquage admin manuel (pas de seed).';

CREATE INDEX IF NOT EXISTS matrice_medicaments_hospitalier_idx
  ON jeupharma.matrice_medicaments (hospitalier)
  WHERE hospitalier = true;

-- ---------------------------------------------------------------------------
-- 2. Vue v_medicaments_complet (+ hospitalier)
-- ---------------------------------------------------------------------------

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
  s.valeur AS secteur_therapeutique,
  s.niveaux_connus AS secteur_niveaux,
  m.classe_therapeutique_id,
  ct.valeur AS classe_therapeutique,
  ct.niveaux_connus AS classe_therapeutique_niveaux,
  m.classe_pharmacologique_id,
  cp.valeur AS classe_pharmacologique,
  cp.niveaux_connus AS classe_pharmacologique_niveaux,
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
  m.hospitalier
FROM jeupharma.matrice_medicaments m
LEFT JOIN jeupharma.dcis d ON d.id = m.dci_id
LEFT JOIN jeupharma.secteurs_therapeutiques s ON s.id = m.secteur_therapeutique_id
LEFT JOIN jeupharma.classes_therapeutiques ct ON ct.id = m.classe_therapeutique_id
LEFT JOIN jeupharma.classes_pharmacologiques cp ON cp.id = m.classe_pharmacologique_id
LEFT JOIN jeupharma.details_pharmacologie dp ON dp.id = m.detail_pharmacologie_id
LEFT JOIN jeupharma.posologies_generales pg ON pg.id = m.posologie_generale_id
LEFT JOIN jeupharma.grossesse_allaitement ga ON ga.id = m.grossesse_allaitement_id;

COMMENT ON VIEW jeupharma.v_medicaments_complet IS
  'Fiches DCI + agrégats multi. hospitalier = réservé niveau pédagogique pharmacien. Filtrer statut=publie côté joueur.';

GRANT SELECT ON jeupharma.v_medicaments_complet TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Génération quiz : exclure hospitalier si niveau_cible <> pharmacien
-- ---------------------------------------------------------------------------

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
    AND (
      q.niveau_cible = 'pharmacien'
      OR m.hospitalier IS NOT TRUE
    );

  IF coalesce(cardinality(pool), 0) = 0 THEN
    RAISE EXCEPTION 'Pas assez de médicaments publiés dans ce secteur pour % QCM', nb_q;
  END IF;

  i := 0;
  attempts := 0;
  WHILE i < nb_q AND attempts < nb_q * 20 LOOP
    attempts := attempts + 1;
    mid := pool[1 + floor(random() * cardinality(pool))::int];
    champ := champs[1 + floor(random() * cardinality(champs))::int];

    SELECT * INTO bonne FROM jeupharma._valeur_champ_matrice(mid, champ, q.niveau_cible) LIMIT 1;
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
      champ, bonne.entite_id, q.secteur_therapeutique_id, q.niveau_cible, nb_prop - 1
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

REVOKE ALL ON FUNCTION jeupharma.generer_et_geler_quiz(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.generer_et_geler_quiz(uuid) TO authenticated;
