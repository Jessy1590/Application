-- =============================================================================
-- 021 : Seed parcours pilote + backfill connaissances depuis V1 + RPC jeux V2
-- Dépend de 019 + 020. Idempotent.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Source migration V1
-- ---------------------------------------------------------------------------

INSERT INTO jeupharma.sources_contenu (code, libelle, type_source, description)
VALUES (
  'migration_v1_matrice',
  'Migration catalogue V1',
  'migration_v1',
  'Import des liaisons matrice_* actives vers connaissances V2 (sans invention clinique).'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO jeupharma.versions_source (source_id, version_label, statut, notes, published_at)
SELECT s.id, 'v1-baseline', 'valide', 'Backfill initial depuis matrice publiée', now()
FROM jeupharma.sources_contenu s
WHERE s.code = 'migration_v1_matrice'
ON CONFLICT (source_id, version_label) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Parcours seed
-- ---------------------------------------------------------------------------

INSERT INTO jeupharma.parcours_apprentissage (code, libelle, description, niveau_lie, mode_contenu, ordre)
VALUES
  ('deust_apprenti', 'DEUST / Apprenti', 'Parcours progressif limité aux modules de cours publiés.', 'apprenti', 'publications', 10),
  ('pharmacien', 'Pharmacien', 'Corpus référentiel validé (objectif RCP progressif).', 'pharmacien', 'referentiel_valide', 20),
  ('etu_3a', 'Étudiant pharma 3A', 'Parcours étudiant — modules publiés uniquement.', 'etu_3a', 'publications', 30)
ON CONFLICT (code) DO NOTHING;

-- Modules pilotes Sang / CV / HTA sur parcours apprenti
INSERT INTO jeupharma.modules_cours (parcours_id, code, titre, resume, objectifs, ordre, publie, version_publication)
SELECT p.id, m.code, m.titre, m.resume, m.objectifs, m.ordre, true, 1
FROM jeupharma.parcours_apprentissage p
CROSS JOIN (VALUES
  ('sang', 'Sang', 'Module sang — connaissances issues du catalogue cours.', 'Connaître les molécules et champs du module sang.', 10),
  ('cv', 'Cardiovasculaire', 'Module appareil cardiovasculaire.', 'Connaître les molécules et champs du module CV.', 20),
  ('hta', 'HTA', 'Module hypertension artérielle.', 'Connaître les molécules et champs du module HTA.', 30)
) AS m(code, titre, resume, objectifs, ordre)
WHERE p.code = 'deust_apprenti'
ON CONFLICT (parcours_id, code) DO NOTHING;

-- Prérequis chaînés
UPDATE jeupharma.modules_cours m
SET prerequis_module_id = prev.id
FROM jeupharma.modules_cours prev
JOIN jeupharma.parcours_apprentissage p ON p.id = prev.parcours_id AND p.code = 'deust_apprenti'
WHERE m.parcours_id = p.id
  AND m.code = 'cv' AND prev.code = 'sang'
  AND m.prerequis_module_id IS NULL;

UPDATE jeupharma.modules_cours m
SET prerequis_module_id = prev.id
FROM jeupharma.modules_cours prev
JOIN jeupharma.parcours_apprentissage p ON p.id = prev.parcours_id AND p.code = 'deust_apprenti'
WHERE m.parcours_id = p.id
  AND m.code = 'hta' AND prev.code = 'cv'
  AND m.prerequis_module_id IS NULL;

-- Modules miroir pour etu_3a (mêmes codes)
INSERT INTO jeupharma.modules_cours (parcours_id, code, titre, resume, objectifs, ordre, publie, version_publication)
SELECT p.id, m.code, m.titre, m.resume, m.objectifs, m.ordre, true, 1
FROM jeupharma.parcours_apprentissage p
CROSS JOIN (VALUES
  ('sang', 'Sang', 'Module sang.', 'Objectifs sang.', 10),
  ('cv', 'Cardiovasculaire', 'Module CV.', 'Objectifs CV.', 20),
  ('hta', 'HTA', 'Module HTA.', 'Objectifs HTA.', 30)
) AS m(code, titre, resume, objectifs, ordre)
WHERE p.code = 'etu_3a'
ON CONFLICT (parcours_id, code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Backfill connaissances depuis jonctions V1 (fiches publie)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION jeupharma.v2_backfill_connaissances_from_v1()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  src uuid;
  ver uuid;
  n_ins int := 0;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;

  SELECT id INTO src FROM jeupharma.sources_contenu WHERE code = 'migration_v1_matrice';
  SELECT id INTO ver FROM jeupharma.versions_source WHERE source_id = src AND version_label = 'v1-baseline';

  -- Helper macro via inserts par champ

  -- DCI (singulier)
  INSERT INTO jeupharma.connaissances (
    matrice_id, champ_code, entite_id, texte, texte_norm, statut,
    source_id, version_source_id, ordre
  )
  SELECT m.id, 'dci', d.id, d.valeur, d.valeur_norm, 'valide', src, ver, 0
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.dcis d ON d.id = m.dci_id AND d.actif
  WHERE m.statut = 'publie'
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;
  GET DIAGNOSTICS n_ins = ROW_COUNT;

  -- Noms commerciaux
  INSERT INTO jeupharma.connaissances (
    matrice_id, champ_code, entite_id, texte, texte_norm, statut,
    source_id, version_source_id, ordre
  )
  SELECT m.id, 'nom_commercial', n.id, n.valeur, n.valeur_norm, 'valide', src, ver, mn.ordre
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.matrice_noms_commerciaux mn ON mn.matrice_id = m.id
  JOIN jeupharma.noms_commerciaux n ON n.id = mn.nom_commercial_id AND n.actif
  WHERE m.statut = 'publie'
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;

  -- Secteurs
  INSERT INTO jeupharma.connaissances (
    matrice_id, champ_code, entite_id, texte, texte_norm, statut,
    source_id, version_source_id, ordre
  )
  SELECT m.id, 'secteur_therapeutique', e.id, e.valeur, e.valeur_norm, 'valide', src, ver, j.ordre
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.matrice_secteurs_therapeutiques j ON j.matrice_id = m.id
  JOIN jeupharma.secteurs_therapeutiques e ON e.id = j.secteur_therapeutique_id AND e.actif
  WHERE m.statut = 'publie'
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;

  -- Classes théra
  INSERT INTO jeupharma.connaissances (
    matrice_id, champ_code, entite_id, texte, texte_norm, statut,
    source_id, version_source_id, ordre
  )
  SELECT m.id, 'classe_therapeutique', e.id, e.valeur, e.valeur_norm, 'valide', src, ver, j.ordre
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.matrice_classes_therapeutiques j ON j.matrice_id = m.id
  JOIN jeupharma.classes_therapeutiques e ON e.id = j.classe_therapeutique_id AND e.actif
  WHERE m.statut = 'publie'
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;

  -- Classes pharma
  INSERT INTO jeupharma.connaissances (
    matrice_id, champ_code, entite_id, texte, texte_norm, statut,
    source_id, version_source_id, ordre
  )
  SELECT m.id, 'classe_pharmacologique', e.id, e.valeur, e.valeur_norm, 'valide', src, ver, j.ordre
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.matrice_classes_pharmacologiques j ON j.matrice_id = m.id
  JOIN jeupharma.classes_pharmacologiques e ON e.id = j.classe_pharmacologique_id AND e.actif
  WHERE m.statut = 'publie'
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;

  -- Détail pharmacologie
  INSERT INTO jeupharma.connaissances (
    matrice_id, champ_code, entite_id, texte, texte_norm, statut,
    source_id, version_source_id, ordre
  )
  SELECT m.id, 'detail_pharmacologie', e.id, e.valeur, e.valeur_norm, 'valide', src, ver, 0
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.details_pharmacologie e ON e.id = m.detail_pharmacologie_id AND e.actif
  WHERE m.statut = 'publie' AND m.detail_pharmacologie_id IS NOT NULL
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;

  -- Multi: indications, CI, EI, précautions, interactions, surveillances
  INSERT INTO jeupharma.connaissances (
    matrice_id, champ_code, entite_id, texte, texte_norm, statut,
    source_id, version_source_id, ordre
  )
  SELECT m.id, 'indications', e.id, e.valeur, e.valeur_norm, 'valide', src, ver, j.ordre
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.matrice_indications j ON j.matrice_id = m.id
  JOIN jeupharma.indications e ON e.id = j.indication_id AND e.actif
  WHERE m.statut = 'publie'
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;

  INSERT INTO jeupharma.connaissances (
    matrice_id, champ_code, entite_id, texte, texte_norm, statut,
    source_id, version_source_id, ordre
  )
  SELECT m.id, 'contre_indications', e.id, e.valeur, e.valeur_norm, 'valide', src, ver, j.ordre
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.matrice_contre_indications j ON j.matrice_id = m.id
  JOIN jeupharma.contre_indications e ON e.id = j.contre_indication_id AND e.actif
  WHERE m.statut = 'publie'
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;

  INSERT INTO jeupharma.connaissances (
    matrice_id, champ_code, entite_id, texte, texte_norm, statut,
    source_id, version_source_id, ordre
  )
  SELECT m.id, 'effets_indesirables', e.id, e.valeur, e.valeur_norm, 'valide', src, ver, j.ordre
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.matrice_effets_indesirables j ON j.matrice_id = m.id
  JOIN jeupharma.effets_indesirables e ON e.id = j.effet_indesirable_id AND e.actif
  WHERE m.statut = 'publie'
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;

  INSERT INTO jeupharma.connaissances (
    matrice_id, champ_code, entite_id, texte, texte_norm, statut,
    source_id, version_source_id, ordre
  )
  SELECT m.id, 'precautions_emploi', e.id, e.valeur, e.valeur_norm, 'valide', src, ver, j.ordre
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.matrice_precautions_emploi j ON j.matrice_id = m.id
  JOIN jeupharma.precautions_emploi e ON e.id = j.precaution_emploi_id AND e.actif
  WHERE m.statut = 'publie'
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;

  INSERT INTO jeupharma.connaissances (
    matrice_id, champ_code, entite_id, texte, texte_norm, statut,
    source_id, version_source_id, ordre
  )
  SELECT m.id, 'interactions', e.id, e.valeur, e.valeur_norm, 'valide', src, ver, j.ordre
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.matrice_interactions j ON j.matrice_id = m.id
  JOIN jeupharma.interactions e ON e.id = j.interaction_id AND e.actif
  WHERE m.statut = 'publie'
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;

  INSERT INTO jeupharma.connaissances (
    matrice_id, champ_code, entite_id, texte, texte_norm, statut,
    source_id, version_source_id, ordre
  )
  SELECT m.id, 'surveillances', e.id, e.valeur, e.valeur_norm, 'valide', src, ver, j.ordre
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.matrice_surveillances j ON j.matrice_id = m.id
  JOIN jeupharma.surveillances e ON e.id = j.surveillance_id AND e.actif
  WHERE m.statut = 'publie'
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;

  RETURN jsonb_build_object(
    'source_id', src,
    'version_source_id', ver,
    'total_connaissances', (SELECT count(*) FROM jeupharma.connaissances WHERE source_id = src)
  );
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_backfill_connaissances_from_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_backfill_connaissances_from_v1() TO authenticated;

-- Publier dans un module toutes les connaissances des fiches ayant un secteur donné
CREATE OR REPLACE FUNCTION jeupharma.v2_publier_module_par_secteur(
  p_module_id uuid,
  p_secteur_valeur_norm text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  n int;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;

  INSERT INTO jeupharma.publications_connaissances (module_id, connaissance_id, ordre, publie_par)
  SELECT p_module_id, c.id, c.ordre, auth.uid()
  FROM jeupharma.connaissances c
  JOIN jeupharma.matrice_secteurs_therapeutiques ms ON ms.matrice_id = c.matrice_id
  JOIN jeupharma.secteurs_therapeutiques s ON s.id = ms.secteur_therapeutique_id
  WHERE c.statut = 'valide'
    AND s.valeur_norm = p_secteur_valeur_norm
  ON CONFLICT (module_id, connaissance_id) DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE jeupharma.modules_cours
  SET publie = true, version_publication = version_publication + 1, updated_at = now()
  WHERE id = p_module_id;

  RETURN jsonb_build_object('module_id', p_module_id, 'inserted', n);
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_publier_module_par_secteur(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_publier_module_par_secteur(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC jeux V2
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION jeupharma.v2_gen_code_jeu()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  out text := 'JP-';
  i int;
BEGIN
  FOR i IN 1..5 LOOP
    out := out || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  END LOOP;
  RETURN out;
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_creer_modele_jeu(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  code text;
  row jeupharma.modeles_jeu%ROWTYPE;
  attempt int;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;

  FOR attempt IN 1..8 LOOP
    code := jeupharma.v2_gen_code_jeu();
    BEGIN
      INSERT INTO jeupharma.modeles_jeu (
        code_unique, type_jeu, titre, parcours_id, module_ids, mode,
        configuration_json, snapshot_json, en_pause, actif, created_by
      ) VALUES (
        code,
        p_payload->>'type_jeu',
        trim(p_payload->>'titre'),
        NULLIF(p_payload->>'parcours_id', '')::uuid,
        COALESCE(
          ARRAY(SELECT jsonb_array_elements_text(p_payload->'module_ids')::uuid),
          '{}'::uuid[]
        ),
        COALESCE(p_payload->>'mode', 'entrainement'),
        COALESCE(p_payload->'configuration_json', '{}'::jsonb),
        p_payload->'snapshot_json',
        COALESCE((p_payload->>'en_pause')::boolean, false),
        true,
        auth.uid()
      )
      RETURNING * INTO row;
      RETURN to_jsonb(row);
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;
  RAISE EXCEPTION 'Impossible de générer un code unique';
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_set_pause_jeu(p_modele_id uuid, p_pause boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  row jeupharma.modeles_jeu%ROWTYPE;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  UPDATE jeupharma.modeles_jeu
  SET en_pause = COALESCE(p_pause, true), updated_at = now()
  WHERE id = p_modele_id
  RETURNING * INTO row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Modèle introuvable'; END IF;
  RETURN jsonb_build_object('id', row.id, 'code_unique', row.code_unique, 'en_pause', row.en_pause);
END;
$$;

-- Démarrer une tentative d'ordonnance (tirage dynamique + fixes)
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
    ARRAY(SELECT jsonb_array_elements_text(cfg->'champs')),
    ARRAY['indications', 'contre_indications', 'effets_indesirables']::text[]
  );

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
          SELECT DISTINCT cv.matrice_id AS id
          FROM jeupharma.v2_connaissances_visibles(auth.uid(), m.parcours_id, m.module_ids) cv
          WHERE cv.champ_code = 'classe_therapeutique'
            AND cv.entite_id = class_id
            AND NOT (cv.matrice_id = ANY (picked))
          ORDER BY random()
          LIMIT need
        ) x;
      ELSE
        SELECT coalesce(array_agg(x.id), '{}') INTO candidates
        FROM (
          SELECT DISTINCT cv.matrice_id AS id
          FROM jeupharma.v2_connaissances_visibles(auth.uid(), m.parcours_id, m.module_ids) cv
          WHERE cv.champ_code = 'classe_pharmacologique'
            AND cv.entite_id = class_id
            AND NOT (cv.matrice_id = ANY (picked))
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
    -- Ne garder que les champs demandés
    fiche := fiche || jsonb_build_object(
      'champs', (
        SELECT coalesce(jsonb_object_agg(k, fiche->'champs'->k), '{}'::jsonb)
        FROM unnest(champs) k
        WHERE fiche->'champs' ? k
      )
    );
    snap := snap || jsonb_build_array(fiche);
  END LOOP;

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

  -- Côté joueur : masquer les champs jusqu'à révélation
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

CREATE OR REPLACE FUNCTION jeupharma.v2_reveler_ordonnance(p_tentative_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  t jeupharma.tentatives_jeu%ROWTYPE;
BEGIN
  SELECT * INTO t FROM jeupharma.tentatives_jeu
  WHERE id = p_tentative_id AND utilisateur_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Tentative introuvable'; END IF;

  UPDATE jeupharma.tentatives_jeu
  SET revele_at = coalesce(revele_at, now())
  WHERE id = t.id;

  RETURN jsonb_build_object(
    'tentative_id', t.id,
    'molecules', t.snapshot_json->'molecules',
    'champs', t.snapshot_json->'champs'
  );
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_noter_ordonnance(
  p_tentative_id uuid,
  p_score_obtenu numeric,
  p_score_max numeric,
  p_details jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  t jeupharma.tentatives_jeu%ROWTYPE;
BEGIN
  SELECT * INTO t FROM jeupharma.tentatives_jeu
  WHERE id = p_tentative_id AND utilisateur_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Tentative introuvable'; END IF;
  IF t.revele_at IS NULL THEN
    RAISE EXCEPTION 'Révélez d’abord les réponses';
  END IF;
  IF p_score_obtenu IS NULL OR p_score_max IS NULL OR p_score_max <= 0 THEN
    RAISE EXCEPTION 'Score invalide';
  END IF;
  IF p_score_obtenu < 0 OR p_score_obtenu > p_score_max THEN
    RAISE EXCEPTION 'Score hors bornes';
  END IF;

  UPDATE jeupharma.tentatives_jeu
  SET score_obtenu = p_score_obtenu,
      score_max = p_score_max,
      details_json = coalesce(p_details, '[]'::jsonb),
      termine_at = now()
  WHERE id = t.id
  RETURNING * INTO t;

  RETURN jsonb_build_object(
    'tentative_id', t.id,
    'score_obtenu', t.score_obtenu,
    'score_max', t.score_max
  );
END;
$$;

-- Nouveau tirage quiz personnel (V2) à partir d'un modèle quiz
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
  questions jsonb := '[]'::jsonb;
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
    ARRAY(SELECT jsonb_array_elements_text(cfg->'champs_interroges')),
    ARRAY['classe_pharmacologique']::text[]
  );
  pool := coalesce(
    ARRAY(SELECT jsonb_array_elements_text(cfg->'matrice_ids')::uuid),
    ARRAY(
      SELECT DISTINCT cv.matrice_id
      FROM jeupharma.v2_connaissances_visibles(auth.uid(), m.parcours_id, m.module_ids) cv
    )
  );

  -- Snapshot minimal : le client V2 peut enrichir ; on fige pool + params
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

REVOKE ALL ON FUNCTION jeupharma.v2_creer_modele_jeu(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_set_pause_jeu(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_demarrer_ordonnance(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_reveler_ordonnance(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_noter_ordonnance(uuid, numeric, numeric, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_nouveau_tirage_quiz(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION jeupharma.v2_creer_modele_jeu(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_set_pause_jeu(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_demarrer_ordonnance(text) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_reveler_ordonnance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_noter_ordonnance(uuid, numeric, numeric, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_nouveau_tirage_quiz(uuid) TO authenticated;
