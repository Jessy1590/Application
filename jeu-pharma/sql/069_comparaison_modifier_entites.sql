-- =============================================================================
-- 069 : Comparaison — modifier libellé d’entité (+ fusion optionnelle)
-- Projet : kpjflntnotftpzffjbud
-- =============================================================================

CREATE OR REPLACE FUNCTION jeupharma.v2_modifier_entites(
  p_table_name text,
  p_id_keep uuid,
  p_id_drops uuid[] DEFAULT NULL,
  p_nouvelle_valeur text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
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
  drops uuid[];
  drop_id uuid;
  new_val text;
  new_norm text;
  conflict_id uuid;
  keep_ok boolean;
  n_merged int := 0;
  n_conn int := 0;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF p_id_keep IS NULL THEN
    RAISE EXCEPTION 'id keep requis';
  END IF;
  IF NOT (p_table_name = ANY (allowed)) THEN
    RAISE EXCEPTION 'table non autorisée: %', p_table_name;
  END IF;

  new_val := nullif(btrim(coalesce(p_nouvelle_valeur, '')), '');

  SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::uuid[])
  INTO drops
  FROM unnest(coalesce(p_id_drops, ARRAY[]::uuid[])) AS x
  WHERE x IS NOT NULL AND x <> p_id_keep;

  IF new_val IS NULL AND (drops IS NULL OR cardinality(drops) = 0) THEN
    RAISE EXCEPTION 'valeur ou entités à fusionner requises';
  END IF;

  EXECUTE format(
    'SELECT EXISTS(SELECT 1 FROM jeupharma.%I WHERE id = $1 AND actif)',
    p_table_name
  ) INTO keep_ok USING p_id_keep;
  IF NOT keep_ok THEN
    RAISE EXCEPTION 'entité cible introuvable ou inactive';
  END IF;

  IF new_val IS NOT NULL THEN
    new_norm := jeupharma.normaliser_valeur(new_val);

    -- Collision valeur_norm : absorber l’entité conflictuelle dans keep
    EXECUTE format(
      'SELECT id FROM jeupharma.%I WHERE actif AND valeur_norm = $1 AND id <> $2 LIMIT 1',
      p_table_name
    ) INTO conflict_id USING new_norm, p_id_keep;

    IF conflict_id IS NOT NULL THEN
      PERFORM jeupharma.fusionner_entites(p_table_name, p_id_keep, conflict_id);
      PERFORM jeupharma.v2__remap_connaissances_entite(p_id_keep, conflict_id);
      n_merged := n_merged + 1;
      drops := array_remove(coalesce(drops, ARRAY[]::uuid[]), conflict_id);
    END IF;

    EXECUTE format(
      'UPDATE jeupharma.%I SET valeur = $1, updated_at = now() WHERE id = $2',
      p_table_name
    ) USING new_val, p_id_keep;

    -- Aligner textes connaissances encore stockés (référentiel lit surtout l’entité)
    UPDATE jeupharma.connaissances
    SET texte = new_val,
        texte_norm = new_norm,
        updated_at = now()
    WHERE entite_id = p_id_keep
      AND statut <> 'retire';
    GET DIAGNOSTICS n_conn = ROW_COUNT;
  END IF;

  FOREACH drop_id IN ARRAY coalesce(drops, ARRAY[]::uuid[])
  LOOP
    PERFORM jeupharma.fusionner_entites(p_table_name, p_id_keep, drop_id);
    PERFORM jeupharma.v2__remap_connaissances_entite(p_id_keep, drop_id);
    n_merged := n_merged + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'table', p_table_name,
    'keep', p_id_keep,
    'valeur', new_val,
    'merged', n_merged,
    'connaissances_texte', n_conn
  );
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_modifier_entites(text, uuid, uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_modifier_entites(text, uuid, uuid[], text) TO authenticated;

COMMENT ON FUNCTION jeupharma.v2_modifier_entites(text, uuid, uuid[], text) IS
  'Admin Comparaison : renomme une entité (valeur/valeur_norm) et fusionne optionnellement les autres sélectionnées.';
