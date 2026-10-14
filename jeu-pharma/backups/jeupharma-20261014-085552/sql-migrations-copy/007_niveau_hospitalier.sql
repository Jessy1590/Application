-- Jeu Pharma — 007 : niveau pédagogique `hospitalier` (remplace la case bool UI)
-- Projet remote : kpjflntnotftpzffjbud
--
-- Modèle :
--   - Lookup `jeupharma.niveaux` + code `hospitalier`
--   - Fiches hospitalières : `niveaux_connus = ['hospitalier']` sur DCI + noms commerciaux
--   - Bool `matrice_medicaments.hospitalier` conservé (vue / RPC / filtre) — dérivé du niveau
--     sur la DCI au save client ; migré depuis les bool legacy ici
--   - Visible / générable uniquement si `niveau_cible` / filtre = `hospitalier`
--     (plus le hack « pharmacien voit les hospitaliers »)
-- Ne pas réappliquer sans vérifier l’état remote.

-- ---------------------------------------------------------------------------
-- 1. Seed niveau
-- ---------------------------------------------------------------------------

INSERT INTO jeupharma.niveaux (code, libelle, ordre) VALUES
  ('hospitalier', 'Hospitalier', 7)
ON CONFLICT (code) DO UPDATE
  SET libelle = EXCLUDED.libelle,
      ordre = EXCLUDED.ordre;

-- ---------------------------------------------------------------------------
-- 2. Migration données : bool hospitalier → niveaux_connus DCI + noms
-- ---------------------------------------------------------------------------

UPDATE jeupharma.dcis d
SET
  niveaux_connus = ARRAY['hospitalier']::text[],
  updated_at = now()
FROM jeupharma.matrice_medicaments m
WHERE m.dci_id = d.id
  AND m.hospitalier IS TRUE;

UPDATE jeupharma.noms_commerciaux nc
SET
  niveaux_connus = ARRAY['hospitalier']::text[],
  updated_at = now()
FROM jeupharma.matrice_noms_commerciaux mnc
JOIN jeupharma.matrice_medicaments m ON m.id = mnc.matrice_id
WHERE mnc.nom_commercial_id = nc.id
  AND m.hospitalier IS TRUE;

COMMENT ON COLUMN jeupharma.matrice_medicaments.hospitalier IS
  'Médicament hospitalier : visible / générable uniquement au niveau pédagogique hospitalier. '
  'Dérivé du niveau hospitalier (exclusif) sur la DCI / noms ; legacy bool synchronisé au save.';

COMMENT ON VIEW jeupharma.v_medicaments_complet IS
  'Fiches DCI + agrégats multi. hospitalier = réservé niveau pédagogique hospitalier. Filtrer statut=publie côté joueur.';

-- ---------------------------------------------------------------------------
-- 3. Génération quiz : hospitalier uniquement si niveau_cible = hospitalier
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
      (q.niveau_cible = 'hospitalier' AND m.hospitalier IS TRUE)
      OR (q.niveau_cible <> 'hospitalier' AND m.hospitalier IS NOT TRUE)
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
