-- =============================================================================
-- 070 : Comparaison — ajouter une liaison matrice ↔ entité (find-or-create)
-- Projet : kpjflntnotftpzffjbud
-- =============================================================================

CREATE OR REPLACE FUNCTION jeupharma.v2_comparaison_ajouter_liaison(
  p_matrice_id uuid,
  p_champ_code text,
  p_entite_id uuid DEFAULT NULL,
  p_valeur text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  code text := lower(trim(coalesce(p_champ_code, '')));
  ent_table text;
  liaison text;
  liaison_fk text;
  singular_fk text;
  card text; -- '1' | 'N'
  eid uuid := p_entite_id;
  v_label text;
  v_norm text;
  max_ord int;
  already boolean := false;
  created boolean := false;
  dci_conflict uuid;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF p_matrice_id IS NULL OR code = '' THEN
    RAISE EXCEPTION 'matrice_id et champ_code requis';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jeupharma.matrice_medicaments m
    WHERE m.id = p_matrice_id AND m.statut IS DISTINCT FROM 'archive'
  ) THEN
    RAISE EXCEPTION 'fiche introuvable ou archivée';
  END IF;

  CASE code
    WHEN 'nom_commercial' THEN
      ent_table := 'noms_commerciaux'; liaison := 'matrice_noms_commerciaux';
      liaison_fk := 'nom_commercial_id'; singular_fk := NULL; card := 'N';
    WHEN 'dci' THEN
      ent_table := 'dcis'; liaison := NULL; liaison_fk := NULL;
      singular_fk := 'dci_id'; card := '1';
    WHEN 'secteur_therapeutique' THEN
      ent_table := 'secteurs_therapeutiques'; liaison := 'matrice_secteurs_therapeutiques';
      liaison_fk := 'secteur_therapeutique_id'; singular_fk := 'secteur_therapeutique_id'; card := 'N';
    WHEN 'classe_therapeutique' THEN
      ent_table := 'classes_therapeutiques'; liaison := 'matrice_classes_therapeutiques';
      liaison_fk := 'classe_therapeutique_id'; singular_fk := 'classe_therapeutique_id'; card := 'N';
    WHEN 'classe_pharmacologique' THEN
      ent_table := 'classes_pharmacologiques'; liaison := 'matrice_classes_pharmacologiques';
      liaison_fk := 'classe_pharmacologique_id'; singular_fk := 'classe_pharmacologique_id'; card := 'N';
    WHEN 'detail_pharmacologie' THEN
      ent_table := 'details_pharmacologie'; liaison := NULL; liaison_fk := NULL;
      singular_fk := 'detail_pharmacologie_id'; card := '1';
    WHEN 'posologie_generale' THEN
      ent_table := 'posologies_generales'; liaison := NULL; liaison_fk := NULL;
      singular_fk := 'posologie_generale_id'; card := '1';
    WHEN 'grossesse_allaitement' THEN
      ent_table := 'grossesse_allaitement'; liaison := NULL; liaison_fk := NULL;
      singular_fk := 'grossesse_allaitement_id'; card := '1';
    WHEN 'indications' THEN
      ent_table := 'indications'; liaison := 'matrice_indications';
      liaison_fk := 'indication_id'; singular_fk := NULL; card := 'N';
    WHEN 'contre_indications' THEN
      ent_table := 'contre_indications'; liaison := 'matrice_contre_indications';
      liaison_fk := 'contre_indication_id'; singular_fk := NULL; card := 'N';
    WHEN 'effets_indesirables' THEN
      ent_table := 'effets_indesirables'; liaison := 'matrice_effets_indesirables';
      liaison_fk := 'effet_indesirable_id'; singular_fk := NULL; card := 'N';
    WHEN 'precautions_emploi' THEN
      ent_table := 'precautions_emploi'; liaison := 'matrice_precautions_emploi';
      liaison_fk := 'precaution_emploi_id'; singular_fk := NULL; card := 'N';
    WHEN 'interactions' THEN
      ent_table := 'interactions'; liaison := 'matrice_interactions';
      liaison_fk := 'interaction_id'; singular_fk := NULL; card := 'N';
    WHEN 'surveillances' THEN
      ent_table := 'surveillances'; liaison := 'matrice_surveillances';
      liaison_fk := 'surveillance_id'; singular_fk := NULL; card := 'N';
    WHEN 'voies_administration' THEN
      ent_table := 'voies_administration'; liaison := 'matrice_voies_administration';
      liaison_fk := 'voie_administration_id'; singular_fk := NULL; card := 'N';
    WHEN 'conditions_prescription_delivrance' THEN
      ent_table := 'conditions_prescription_delivrance';
      liaison := 'matrice_conditions_prescription_delivrance';
      liaison_fk := 'condition_prescription_delivrance_id'; singular_fk := NULL; card := 'N';
    WHEN 'conseils_delivrance' THEN
      ent_table := 'conseils_delivrance'; liaison := 'matrice_conseils_delivrance';
      liaison_fk := 'conseil_delivrance_id'; singular_fk := NULL; card := 'N';
    ELSE
      RAISE EXCEPTION 'champ non autorisé: %', code;
  END CASE;

  -- Résoudre entité : id fourni, sinon find-or-create sur p_valeur
  IF eid IS NOT NULL THEN
    EXECUTE format(
      'SELECT EXISTS(SELECT 1 FROM jeupharma.%I WHERE id = $1 AND actif)',
      ent_table
    ) INTO already USING eid;
    IF NOT already THEN
      RAISE EXCEPTION 'entité introuvable ou inactive';
    END IF;
    EXECUTE format(
      'SELECT valeur FROM jeupharma.%I WHERE id = $1',
      ent_table
    ) INTO v_label USING eid;
  ELSE
    v_label := nullif(btrim(coalesce(p_valeur, '')), '');
    IF v_label IS NULL THEN
      RAISE EXCEPTION 'entité ou valeur requise';
    END IF;
    -- Alias pédagogiques (HTA → Hypertension artérielle) si dispo
    BEGIN
      v_label := coalesce(jeupharma.ops_resoudre_alias(ent_table, v_label), v_label);
    EXCEPTION WHEN undefined_function THEN
      NULL; -- ops_resoudre_alias absent : garder le libellé brut
    END;
    v_norm := jeupharma.normaliser_valeur(v_label);
    EXECUTE format(
      'SELECT id FROM jeupharma.%I WHERE actif AND valeur_norm = $1 LIMIT 1',
      ent_table
    ) INTO eid USING v_norm;
    IF eid IS NULL THEN
      EXECUTE format(
        'INSERT INTO jeupharma.%I (valeur) VALUES ($1) RETURNING id',
        ent_table
      ) INTO eid USING v_label;
      created := true;
    END IF;
    EXECUTE format(
      'SELECT valeur FROM jeupharma.%I WHERE id = $1',
      ent_table
    ) INTO v_label USING eid;
  END IF;

  IF card = '1' THEN
    IF code = 'dci' THEN
      SELECT m.id INTO dci_conflict
      FROM jeupharma.matrice_medicaments m
      WHERE m.dci_id = eid
        AND m.id <> p_matrice_id
        AND m.statut IS DISTINCT FROM 'archive'
      LIMIT 1;
      IF dci_conflict IS NOT NULL THEN
        RAISE EXCEPTION 'DCI déjà portée par une autre fiche active';
      END IF;
    END IF;

    EXECUTE format(
      'UPDATE jeupharma.matrice_medicaments
       SET %I = $1, fiche_validee = false, updated_at = now()
       WHERE id = $2',
      singular_fk
    ) USING eid, p_matrice_id;

    RETURN jsonb_build_object(
      'ok', true,
      'matrice_id', p_matrice_id,
      'champ_code', code,
      'entite_id', eid,
      'valeur', v_label,
      'created', created,
      'card', '1',
      'replaced', true
    );
  END IF;

  -- Multi : éviter doublon
  EXECUTE format(
    'SELECT EXISTS(SELECT 1 FROM jeupharma.%I WHERE matrice_id = $1 AND %I = $2)',
    liaison, liaison_fk
  ) INTO already USING p_matrice_id, eid;

  IF already THEN
    RETURN jsonb_build_object(
      'ok', true,
      'matrice_id', p_matrice_id,
      'champ_code', code,
      'entite_id', eid,
      'valeur', v_label,
      'created', created,
      'card', 'N',
      'already', true
    );
  END IF;

  EXECUTE format(
    'SELECT coalesce(max(ordre), -1) FROM jeupharma.%I WHERE matrice_id = $1',
    liaison
  ) INTO max_ord USING p_matrice_id;

  EXECUTE format(
    'INSERT INTO jeupharma.%I (matrice_id, %I, ordre) VALUES ($1, $2, $3)',
    liaison, liaison_fk
  ) USING p_matrice_id, eid, max_ord + 1;

  -- Miroir FK singulière (secteur / classes) si vide
  IF singular_fk IS NOT NULL THEN
    EXECUTE format(
      'UPDATE jeupharma.matrice_medicaments
       SET %I = coalesce(%I, $1), fiche_validee = false, updated_at = now()
       WHERE id = $2',
      singular_fk, singular_fk
    ) USING eid, p_matrice_id;
  ELSE
    UPDATE jeupharma.matrice_medicaments
    SET fiche_validee = false, updated_at = now()
    WHERE id = p_matrice_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'matrice_id', p_matrice_id,
    'champ_code', code,
    'entite_id', eid,
    'valeur', v_label,
    'created', created,
    'card', 'N',
    'already', false
  );
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_comparaison_ajouter_liaison(uuid, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_comparaison_ajouter_liaison(uuid, text, uuid, text) TO authenticated;

COMMENT ON FUNCTION jeupharma.v2_comparaison_ajouter_liaison(uuid, text, uuid, text) IS
  'Admin Comparaison : lie une entité (existante ou find-or-create) à une fiche pour un champ.';
