-- =============================================================================
-- 047 — Vocabulaire canonique partagé (synonymes / abréviations)
-- Objectif : une notion clinique = UN UUID d’entité réutilisé par toutes les fiches.
-- Ex. HTA / Hypertension / Hypertension artérielle → « Hypertension artérielle ».
-- Appliquer via MCP / supabase db query. Ne touche pas portail ni bdm.
-- =============================================================================

CREATE TABLE IF NOT EXISTS jeupharma.vocabulaire_alias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  alias_norm text NOT NULL,
  valeur_canonique text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vocabulaire_alias_table_chk CHECK (table_name = ANY (ARRAY[
    'indications', 'contre_indications', 'effets_indesirables', 'precautions_emploi',
    'interactions', 'surveillances', 'secteurs_therapeutiques', 'classes_therapeutiques',
    'classes_pharmacologiques', 'details_pharmacologie', 'voies_administration',
    'posologies_generales', 'grossesse_allaitement',
    'conditions_prescription_delivrance', 'conseils_delivrance', 'dcis', 'noms_commerciaux'
  ]))
);

CREATE UNIQUE INDEX IF NOT EXISTS vocabulaire_alias_table_alias_uidx
  ON jeupharma.vocabulaire_alias (table_name, alias_norm);

COMMENT ON TABLE jeupharma.vocabulaire_alias IS
  'Alias pédagogiques → libellé canonique (avant findOrCreate). Ex. hta → Hypertension artérielle.';

ALTER TABLE jeupharma.vocabulaire_alias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vocabulaire_alias_select ON jeupharma.vocabulaire_alias;
CREATE POLICY vocabulaire_alias_select ON jeupharma.vocabulaire_alias
  FOR SELECT TO authenticated
  USING (jeupharma.has_jeupharma_access());

DROP POLICY IF EXISTS vocabulaire_alias_admin ON jeupharma.vocabulaire_alias;
CREATE POLICY vocabulaire_alias_admin ON jeupharma.vocabulaire_alias
  FOR ALL TO authenticated
  USING (portail.is_admin())
  WITH CHECK (portail.is_admin());

GRANT SELECT ON jeupharma.vocabulaire_alias TO authenticated, anon;
GRANT ALL ON jeupharma.vocabulaire_alias TO service_role;

-- Seed alias (idempotent)
INSERT INTO jeupharma.vocabulaire_alias (table_name, alias_norm, valeur_canonique) VALUES
  -- indications
  ('indications', 'hta', 'Hypertension artérielle'),
  ('indications', 'hypertension', 'Hypertension artérielle'),
  ('indications', 'hypertension essentielle', 'Hypertension artérielle'),
  ('indications', 'hypertension arterielle', 'Hypertension artérielle'),
  ('indications', 'hypertension arterielle essentielle', 'Hypertension artérielle'),
  ('indications', 'traitement de l hypertension', 'Hypertension artérielle'),
  ('indications', 'traitement de l hypertension arterielle', 'Hypertension artérielle'),
  ('indications', 'traitement de l hypertension arterielle essentielle', 'Hypertension artérielle'),
  ('indications', 'ic', 'Insuffisance cardiaque'),
  ('indications', 'insuffisance cardiaque congestive', 'Insuffisance cardiaque'),
  ('indications', 'fa', 'Fibrillation auriculaire'),
  ('indications', 'fibrillation atriale', 'Fibrillation auriculaire'),
  ('indications', 'tvp', 'Thrombose veineuse profonde'),
  ('indications', 'ep', 'Embolie pulmonaire'),
  ('indications', 'sca', 'Syndrome coronarien aigu'),
  ('indications', 'idm', 'Infarctus du myocarde'),
  ('indications', 'angine de poitrine', 'Angor'),
  -- secteurs
  ('secteurs_therapeutiques', 'cardio', 'Cardiovasculaire'),
  ('secteurs_therapeutiques', 'systeme cardiovasculaire', 'Cardiovasculaire'),
  ('secteurs_therapeutiques', 'sang et organes hematopoietiques', 'Hématologie'),
  -- classes thérapeutiques
  ('classes_therapeutiques', 'anticoagulants', 'Anticoagulant'),
  ('classes_therapeutiques', 'anticoagulation', 'Anticoagulant'),
  ('classes_therapeutiques', 'antiagregeants', 'Antiagrégant plaquettaire'),
  ('classes_therapeutiques', 'antiagregant', 'Antiagrégant plaquettaire'),
  ('classes_therapeutiques', 'antiagregeants plaquettaires', 'Antiagrégant plaquettaire'),
  ('classes_therapeutiques', 'betabloquants', 'Bêtabloquant'),
  ('classes_therapeutiques', 'beta bloquant', 'Bêtabloquant'),
  ('classes_therapeutiques', 'beta-bloquant', 'Bêtabloquant'),
  ('classes_therapeutiques', 'beta-bloquants', 'Bêtabloquant'),
  ('classes_therapeutiques', 'diuretiques', 'Diurétique'),
  ('classes_therapeutiques', 'antihypertenseurs', 'Antihypertenseur'),
  ('classes_therapeutiques', 'hypolipemiants', 'Hypolipémiant'),
  ('classes_therapeutiques', 'statines', 'Statine'),
  ('classes_therapeutiques', 'antiarythmiques', 'Antiarythmique'),
  ('classes_therapeutiques', 'thrombolytiques', 'Thrombolytique'),
  -- classes pharmacologiques
  ('classes_pharmacologiques', 'iec', 'Inhibiteur de l’enzyme de conversion'),
  ('classes_pharmacologiques', 'inhibiteurs de l enzyme de conversion', 'Inhibiteur de l’enzyme de conversion'),
  ('classes_pharmacologiques', 'ara2', 'Antagoniste des récepteurs de l’angiotensine II'),
  ('classes_pharmacologiques', 'sartan', 'Antagoniste des récepteurs de l’angiotensine II'),
  ('classes_pharmacologiques', 'sartans', 'Antagoniste des récepteurs de l’angiotensine II'),
  ('classes_pharmacologiques', 'avk', 'Antivitamine K'),
  ('classes_pharmacologiques', 'antivitamines k', 'Antivitamine K'),
  ('classes_pharmacologiques', 'aod', 'Anticoagulant oral direct'),
  ('classes_pharmacologiques', 'doac', 'Anticoagulant oral direct'),
  ('classes_pharmacologiques', 'hbpm', 'Héparine de bas poids moléculaire'),
  ('classes_pharmacologiques', 'inhibiteurs du facteur xa', 'Inhibiteur du facteur Xa'),
  ('classes_pharmacologiques', 'inhibiteurs directs du facteur xa', 'Inhibiteur du facteur Xa'),
  ('classes_pharmacologiques', 'inhibiteurs calciques', 'Inhibiteur calcique'),
  ('classes_pharmacologiques', 'antagonistes calciques', 'Inhibiteur calcique'),
  ('classes_pharmacologiques', 'diuretiques thiazidiques', 'Diurétique thiazidique'),
  ('classes_pharmacologiques', 'diuretiques de l anse', 'Diurétique de l’anse')
ON CONFLICT (table_name, alias_norm) DO UPDATE
  SET valeur_canonique = EXCLUDED.valeur_canonique;

-- ---------------------------------------------------------------------------
-- Résolution : alias → libellé canonique → entité active (sans créer)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.ops_resoudre_alias(
  p_table text,
  p_valeur text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
DECLARE
  v_norm text;
  v_canon text;
BEGIN
  v_norm := jeupharma.normaliser_valeur(trim(both FROM coalesce(p_valeur, '')));
  IF v_norm = '' THEN RETURN NULL; END IF;
  SELECT a.valeur_canonique INTO v_canon
  FROM jeupharma.vocabulaire_alias a
  WHERE a.table_name = p_table AND a.alias_norm = v_norm
  LIMIT 1;
  IF v_canon IS NOT NULL THEN RETURN v_canon; END IF;
  -- Pluriel simple → alias singulier
  IF right(v_norm, 1) = 's' AND length(v_norm) > 4 THEN
    SELECT a.valeur_canonique INTO v_canon
    FROM jeupharma.vocabulaire_alias a
    WHERE a.table_name = p_table AND a.alias_norm = left(v_norm, length(v_norm) - 1)
    LIMIT 1;
    IF v_canon IS NOT NULL THEN RETURN v_canon; END IF;
  END IF;
  RETURN trim(both FROM p_valeur);
END;
$$;

-- Find-or-create avec résolution d’alias (ops / migration ; SECURITY DEFINER)
CREATE OR REPLACE FUNCTION jeupharma.ops_entite_find_or_create(
  p_table text,
  p_valeur text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
DECLARE
  allowed text[] := ARRAY[
    'noms_commerciaux', 'dcis', 'secteurs_therapeutiques', 'classes_therapeutiques',
    'classes_pharmacologiques', 'details_pharmacologie', 'indications',
    'contre_indications', 'effets_indesirables', 'precautions_emploi',
    'posologies_generales', 'interactions', 'surveillances',
    'grossesse_allaitement', 'voies_administration',
    'conditions_prescription_delivrance', 'conseils_delivrance'
  ];
  v_label text;
  v_norm text;
  v_id uuid;
BEGIN
  IF NOT (p_table = ANY (allowed)) THEN
    RAISE EXCEPTION 'table non autorisée: %', p_table;
  END IF;
  v_label := jeupharma.ops_resoudre_alias(p_table, p_valeur);
  IF v_label IS NULL OR trim(v_label) = '' THEN
    RETURN NULL;
  END IF;
  v_norm := jeupharma.normaliser_valeur(v_label);

  EXECUTE format(
    'SELECT id FROM jeupharma.%I WHERE valeur_norm = $1 AND actif LIMIT 1',
    p_table
  ) INTO v_id USING v_norm;

  IF v_id IS NULL THEN
    -- Aussi chercher l’alias_norm lui-même (entité déjà créée sous l’ancien libellé)
    EXECUTE format(
      'SELECT id FROM jeupharma.%I WHERE valeur_norm = $1 AND actif LIMIT 1',
      p_table
    ) INTO v_id USING jeupharma.normaliser_valeur(p_valeur);
  END IF;

  IF v_id IS NULL THEN
    EXECUTE format(
      'INSERT INTO jeupharma.%I (valeur) VALUES ($1) RETURNING id',
      p_table
    ) INTO v_id USING v_label;
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.ops_entite_find_or_create(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.ops_entite_find_or_create(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION jeupharma.ops_resoudre_alias(text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Relinker d’abord (dépendance), puis fusion vers canonique.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.ops_relinker_entite(
  p_table text,
  p_id_keep uuid,
  p_id_drop uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
BEGIN
  IF p_id_keep IS NULL OR p_id_drop IS NULL OR p_id_keep = p_id_drop THEN
    RETURN;
  END IF;

  IF p_table = 'indications' THEN
    UPDATE jeupharma.matrice_indications SET indication_id = p_id_keep
      WHERE indication_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_indications x
          WHERE x.matrice_id = matrice_indications.matrice_id AND x.indication_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_indications WHERE indication_id = p_id_drop;
  ELSIF p_table = 'contre_indications' THEN
    UPDATE jeupharma.matrice_contre_indications SET contre_indication_id = p_id_keep
      WHERE contre_indication_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_contre_indications x
          WHERE x.matrice_id = matrice_contre_indications.matrice_id AND x.contre_indication_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_contre_indications WHERE contre_indication_id = p_id_drop;
  ELSIF p_table = 'effets_indesirables' THEN
    UPDATE jeupharma.matrice_effets_indesirables SET effet_indesirable_id = p_id_keep
      WHERE effet_indesirable_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_effets_indesirables x
          WHERE x.matrice_id = matrice_effets_indesirables.matrice_id AND x.effet_indesirable_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_effets_indesirables WHERE effet_indesirable_id = p_id_drop;
  ELSIF p_table = 'precautions_emploi' THEN
    UPDATE jeupharma.matrice_precautions_emploi SET precaution_emploi_id = p_id_keep
      WHERE precaution_emploi_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_precautions_emploi x
          WHERE x.matrice_id = matrice_precautions_emploi.matrice_id AND x.precaution_emploi_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_precautions_emploi WHERE precaution_emploi_id = p_id_drop;
  ELSIF p_table = 'interactions' THEN
    UPDATE jeupharma.matrice_interactions SET interaction_id = p_id_keep
      WHERE interaction_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_interactions x
          WHERE x.matrice_id = matrice_interactions.matrice_id AND x.interaction_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_interactions WHERE interaction_id = p_id_drop;
  ELSIF p_table = 'surveillances' THEN
    UPDATE jeupharma.matrice_surveillances SET surveillance_id = p_id_keep
      WHERE surveillance_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_surveillances x
          WHERE x.matrice_id = matrice_surveillances.matrice_id AND x.surveillance_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_surveillances WHERE surveillance_id = p_id_drop;
  ELSIF p_table = 'secteurs_therapeutiques' THEN
    UPDATE jeupharma.matrice_medicaments SET secteur_therapeutique_id = p_id_keep
      WHERE secteur_therapeutique_id = p_id_drop;
    UPDATE jeupharma.matrice_secteurs_therapeutiques SET secteur_therapeutique_id = p_id_keep
      WHERE secteur_therapeutique_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_secteurs_therapeutiques x
          WHERE x.matrice_id = matrice_secteurs_therapeutiques.matrice_id
            AND x.secteur_therapeutique_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_secteurs_therapeutiques WHERE secteur_therapeutique_id = p_id_drop;
  ELSIF p_table = 'classes_therapeutiques' THEN
    UPDATE jeupharma.matrice_medicaments SET classe_therapeutique_id = p_id_keep
      WHERE classe_therapeutique_id = p_id_drop;
    UPDATE jeupharma.matrice_classes_therapeutiques SET classe_therapeutique_id = p_id_keep
      WHERE classe_therapeutique_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_classes_therapeutiques x
          WHERE x.matrice_id = matrice_classes_therapeutiques.matrice_id
            AND x.classe_therapeutique_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_classes_therapeutiques WHERE classe_therapeutique_id = p_id_drop;
  ELSIF p_table = 'classes_pharmacologiques' THEN
    UPDATE jeupharma.matrice_medicaments SET classe_pharmacologique_id = p_id_keep
      WHERE classe_pharmacologique_id = p_id_drop;
    UPDATE jeupharma.matrice_classes_pharmacologiques SET classe_pharmacologique_id = p_id_keep
      WHERE classe_pharmacologique_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_classes_pharmacologiques x
          WHERE x.matrice_id = matrice_classes_pharmacologiques.matrice_id
            AND x.classe_pharmacologique_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_classes_pharmacologiques WHERE classe_pharmacologique_id = p_id_drop;
  ELSIF p_table = 'voies_administration' THEN
    UPDATE jeupharma.matrice_voies_administration SET voie_administration_id = p_id_keep
      WHERE voie_administration_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_voies_administration x
          WHERE x.matrice_id = matrice_voies_administration.matrice_id
            AND x.voie_administration_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_voies_administration WHERE voie_administration_id = p_id_drop;
  ELSIF p_table = 'details_pharmacologie' THEN
    UPDATE jeupharma.matrice_medicaments SET detail_pharmacologie_id = p_id_keep
      WHERE detail_pharmacologie_id = p_id_drop;
  ELSIF p_table = 'posologies_generales' THEN
    UPDATE jeupharma.matrice_medicaments SET posologie_generale_id = p_id_keep
      WHERE posologie_generale_id = p_id_drop;
  ELSIF p_table = 'grossesse_allaitement' THEN
    UPDATE jeupharma.matrice_medicaments SET grossesse_allaitement_id = p_id_keep
      WHERE grossesse_allaitement_id = p_id_drop;
  ELSIF p_table = 'noms_commerciaux' THEN
    UPDATE jeupharma.matrice_noms_commerciaux SET nom_commercial_id = p_id_keep
      WHERE nom_commercial_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_noms_commerciaux x
          WHERE x.matrice_id = matrice_noms_commerciaux.matrice_id
            AND x.nom_commercial_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_noms_commerciaux WHERE nom_commercial_id = p_id_drop;
  ELSIF p_table = 'conditions_prescription_delivrance' THEN
    UPDATE jeupharma.matrice_conditions_prescription_delivrance
      SET condition_prescription_delivrance_id = p_id_keep
      WHERE condition_prescription_delivrance_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_conditions_prescription_delivrance x
          WHERE x.matrice_id = matrice_conditions_prescription_delivrance.matrice_id
            AND x.condition_prescription_delivrance_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_conditions_prescription_delivrance
      WHERE condition_prescription_delivrance_id = p_id_drop;
  ELSIF p_table = 'conseils_delivrance' THEN
    UPDATE jeupharma.matrice_conseils_delivrance SET conseil_delivrance_id = p_id_keep
      WHERE conseil_delivrance_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_conseils_delivrance x
          WHERE x.matrice_id = matrice_conseils_delivrance.matrice_id
            AND x.conseil_delivrance_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_conseils_delivrance WHERE conseil_delivrance_id = p_id_drop;
  END IF;

  -- Connaissances / pubs : non touchées ici (nettoyage parcours séparé).
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.ops_fusionner_vers_canonique(
  p_table text,
  p_valeur_canonique text,
  p_alias_norms text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
DECLARE
  v_keep uuid;
  v_drop uuid;
  v_norm text;
  v_alias text;
  n_merged int := 0;
  n_soft int := 0;
BEGIN
  v_keep := jeupharma.ops_entite_find_or_create(p_table, p_valeur_canonique);
  IF v_keep IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'canonique invalide');
  END IF;

  EXECUTE format(
    'UPDATE jeupharma.%I SET valeur = $1, updated_at = now() WHERE id = $2 AND valeur IS DISTINCT FROM $1',
    p_table
  ) USING p_valeur_canonique, v_keep;

  FOREACH v_alias IN ARRAY coalesce(p_alias_norms, ARRAY[]::text[]) LOOP
    v_norm := jeupharma.normaliser_valeur(v_alias);
    FOR v_drop IN EXECUTE format(
      'SELECT id FROM jeupharma.%I WHERE actif AND id <> $1 AND valeur_norm = $2',
      p_table
    ) USING v_keep, v_norm LOOP
      PERFORM jeupharma.ops_relinker_entite(p_table, v_keep, v_drop);
      EXECUTE format(
        'UPDATE jeupharma.%I SET actif = false, updated_at = now() WHERE id = $1',
        p_table
      ) USING v_drop;
      n_merged := n_merged + 1;
      n_soft := n_soft + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'keep_id', v_keep,
    'merged', n_merged,
    'soft_deactivated', n_soft,
    'canonique', p_valeur_canonique
  );
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.ops_relinker_entite(text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.ops_fusionner_vers_canonique(text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.ops_relinker_entite(text, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION jeupharma.ops_fusionner_vers_canonique(text, text, text[]) TO service_role;
