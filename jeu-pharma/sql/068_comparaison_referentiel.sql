-- =============================================================================
-- 068 : Admin Référentiel — vue Comparaison (scope, fiches bulk, fusion multi,
--       suppression entité, valeurs ★ leçon)
-- Projet : kpjflntnotftpzffjbud
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper : remapper connaissances + pubs + payloads blocs après fusion d’entité
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2__remap_connaissances_entite(
  p_id_keep uuid,
  p_id_drop uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  r RECORD;
  keep_cid uuid;
BEGIN
  IF p_id_keep IS NULL OR p_id_drop IS NULL OR p_id_keep = p_id_drop THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT c.id, c.matrice_id, c.champ_code
    FROM jeupharma.connaissances c
    WHERE c.entite_id = p_id_drop
      AND c.statut <> 'retire'
  LOOP
    SELECT c2.id INTO keep_cid
    FROM jeupharma.connaissances c2
    WHERE c2.matrice_id = r.matrice_id
      AND c2.champ_code = r.champ_code
      AND c2.entite_id = p_id_keep
      AND c2.statut <> 'retire'
    LIMIT 1;

    IF keep_cid IS NULL THEN
      UPDATE jeupharma.connaissances
      SET entite_id = p_id_keep, updated_at = now()
      WHERE id = r.id;
    ELSE
      -- Réassigner pubs du drop → keep (éviter doublon unique module+connaissance)
      UPDATE jeupharma.publications_connaissances pub
      SET connaissance_id = keep_cid
      WHERE pub.connaissance_id = r.id
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.publications_connaissances x
          WHERE x.module_id = pub.module_id
            AND x.connaissance_id = keep_cid
        );
      DELETE FROM jeupharma.publications_connaissances
      WHERE connaissance_id = r.id;
      UPDATE jeupharma.connaissances
      SET statut = 'retire', updated_at = now()
      WHERE id = r.id;

      -- Remplacer UUID drop → keep dans payloads blocs molécule
      UPDATE jeupharma.module_blocs b
      SET payload_json = replace(b.payload_json::text, r.id::text, keep_cid::text)::jsonb,
          updated_at = now()
      WHERE b.type_bloc = 'molecule'
        AND b.payload_json::text LIKE '%' || r.id::text || '%';
    END IF;
  END LOOP;

  -- Remplacer entite_id restants (cas UPDATE simple)
  UPDATE jeupharma.module_blocs b
  SET payload_json = replace(b.payload_json::text, p_id_drop::text, p_id_keep::text)::jsonb,
      updated_at = now()
  WHERE b.type_bloc = 'molecule'
    AND b.payload_json::text LIKE '%' || p_id_drop::text || '%';
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2__remap_connaissances_entite(uuid, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- v2_fusionner_entites : fusion multi (keep + drops[]) — admin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_fusionner_entites(
  p_table_name text,
  p_id_keep uuid,
  p_id_drops uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  drop_id uuid;
  n int := 0;
  drops uuid[];
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF p_id_keep IS NULL THEN
    RAISE EXCEPTION 'id keep requis';
  END IF;

  SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::uuid[])
  INTO drops
  FROM unnest(coalesce(p_id_drops, ARRAY[]::uuid[])) AS x
  WHERE x IS NOT NULL AND x <> p_id_keep;

  IF drops IS NULL OR cardinality(drops) = 0 THEN
    RAISE EXCEPTION 'au moins une entité à fusionner requise';
  END IF;

  FOREACH drop_id IN ARRAY drops
  LOOP
    PERFORM jeupharma.fusionner_entites(p_table_name, p_id_keep, drop_id);
    PERFORM jeupharma.v2__remap_connaissances_entite(p_id_keep, drop_id);
    n := n + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'table', p_table_name,
    'keep', p_id_keep,
    'merged', n
  );
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_fusionner_entites(text, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_fusionner_entites(text, uuid, uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- v2_supprimer_entite : retire liaisons + soft-delete + retire connaissances
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_supprimer_entite(
  p_table_name text,
  p_id uuid
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
  n_conn int := 0;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'id requis';
  END IF;
  IF NOT (p_table_name = ANY (allowed)) THEN
    RAISE EXCEPTION 'table non autorisée: %', p_table_name;
  END IF;

  IF p_table_name = 'noms_commerciaux' THEN
    DELETE FROM jeupharma.matrice_noms_commerciaux WHERE nom_commercial_id = p_id;
  ELSIF p_table_name = 'dcis' THEN
    -- Ne pas laisser de fiche orpheline de DCI : refuser si encore référencée
    IF EXISTS (
      SELECT 1 FROM jeupharma.matrice_medicaments m
      WHERE m.dci_id = p_id AND m.statut IS DISTINCT FROM 'archive'
    ) THEN
      RAISE EXCEPTION 'DCI encore liée à une fiche active — fusionnez d’abord';
    END IF;
    UPDATE jeupharma.matrice_medicaments SET dci_id = NULL WHERE dci_id = p_id;
  ELSIF p_table_name = 'secteurs_therapeutiques' THEN
    UPDATE jeupharma.matrice_medicaments SET secteur_therapeutique_id = NULL
      WHERE secteur_therapeutique_id = p_id;
    DELETE FROM jeupharma.matrice_secteurs_therapeutiques WHERE secteur_therapeutique_id = p_id;
  ELSIF p_table_name = 'classes_therapeutiques' THEN
    UPDATE jeupharma.matrice_medicaments SET classe_therapeutique_id = NULL
      WHERE classe_therapeutique_id = p_id;
    DELETE FROM jeupharma.matrice_classes_therapeutiques WHERE classe_therapeutique_id = p_id;
  ELSIF p_table_name = 'classes_pharmacologiques' THEN
    UPDATE jeupharma.matrice_medicaments SET classe_pharmacologique_id = NULL
      WHERE classe_pharmacologique_id = p_id;
    DELETE FROM jeupharma.matrice_classes_pharmacologiques WHERE classe_pharmacologique_id = p_id;
  ELSIF p_table_name = 'details_pharmacologie' THEN
    UPDATE jeupharma.matrice_medicaments SET detail_pharmacologie_id = NULL
      WHERE detail_pharmacologie_id = p_id;
  ELSIF p_table_name = 'posologies_generales' THEN
    UPDATE jeupharma.matrice_medicaments SET posologie_generale_id = NULL
      WHERE posologie_generale_id = p_id;
  ELSIF p_table_name = 'grossesse_allaitement' THEN
    UPDATE jeupharma.matrice_medicaments SET grossesse_allaitement_id = NULL
      WHERE grossesse_allaitement_id = p_id;
  ELSIF p_table_name = 'indications' THEN
    DELETE FROM jeupharma.matrice_indications WHERE indication_id = p_id;
  ELSIF p_table_name = 'contre_indications' THEN
    DELETE FROM jeupharma.matrice_contre_indications WHERE contre_indication_id = p_id;
  ELSIF p_table_name = 'effets_indesirables' THEN
    DELETE FROM jeupharma.matrice_effets_indesirables WHERE effet_indesirable_id = p_id;
  ELSIF p_table_name = 'precautions_emploi' THEN
    DELETE FROM jeupharma.matrice_precautions_emploi WHERE precaution_emploi_id = p_id;
  ELSIF p_table_name = 'interactions' THEN
    DELETE FROM jeupharma.matrice_interactions WHERE interaction_id = p_id;
  ELSIF p_table_name = 'surveillances' THEN
    DELETE FROM jeupharma.matrice_surveillances WHERE surveillance_id = p_id;
  ELSIF p_table_name = 'voies_administration' THEN
    DELETE FROM jeupharma.matrice_voies_administration WHERE voie_administration_id = p_id;
  ELSIF p_table_name = 'conditions_prescription_delivrance' THEN
    DELETE FROM jeupharma.matrice_conditions_prescription_delivrance
      WHERE condition_prescription_delivrance_id = p_id;
  ELSIF p_table_name = 'conseils_delivrance' THEN
    DELETE FROM jeupharma.matrice_conseils_delivrance WHERE conseil_delivrance_id = p_id;
  END IF;

  -- Retirer pubs + connaissances liées
  DELETE FROM jeupharma.publications_connaissances pub
  USING jeupharma.connaissances c
  WHERE pub.connaissance_id = c.id AND c.entite_id = p_id;

  UPDATE jeupharma.connaissances
  SET statut = 'retire', updated_at = now()
  WHERE entite_id = p_id AND statut <> 'retire';
  GET DIAGNOSTICS n_conn = ROW_COUNT;

  EXECUTE format(
    'UPDATE jeupharma.%I SET actif = false, updated_at = now() WHERE id = $1',
    p_table_name
  ) USING p_id;

  RETURN jsonb_build_object(
    'ok', true,
    'table', p_table_name,
    'id', p_id,
    'connaissances_retirees', n_conn
  );
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_supprimer_entite(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_supprimer_entite(text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- v2_comparaison_scope : molécules d’un parcours / chapitre / leçon
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_comparaison_scope(
  p_kind text,
  p_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  kind text := lower(trim(coalesce(p_kind, '')));
  parcours_id uuid;
  label text;
  lecon_ids uuid[] := ARRAY[]::uuid[];
  lecons jsonb := '[]'::jsonb;
  mid uuid;
  ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF p_id IS NULL OR kind NOT IN ('parcours', 'chapitre', 'lecon') THEN
    RAISE EXCEPTION 'scope invalide';
  END IF;

  IF kind = 'parcours' THEN
    SELECT p.id, p.libelle INTO parcours_id, label
    FROM jeupharma.parcours_apprentissage p WHERE p.id = p_id;
    IF parcours_id IS NULL THEN RAISE EXCEPTION 'parcours introuvable'; END IF;

    SELECT coalesce(array_agg(m.id ORDER BY m.ordre, m.titre), ARRAY[]::uuid[])
    INTO lecon_ids
    FROM jeupharma.modules_cours m
    WHERE m.parcours_id = parcours_id AND NOT coalesce(m.est_groupe, false);

  ELSIF kind = 'chapitre' THEN
    SELECT m.id, m.titre, m.parcours_id INTO mid, label, parcours_id
    FROM jeupharma.modules_cours m
    WHERE m.id = p_id AND coalesce(m.est_groupe, false);
    IF mid IS NULL THEN RAISE EXCEPTION 'chapitre introuvable'; END IF;

    -- Leçons descendants (enfants directs + petits-enfants)
    WITH RECURSIVE tree AS (
      SELECT c.id, c.titre, c.ordre, c.est_groupe
      FROM jeupharma.modules_cours c
      WHERE c.parent_id = p_id
      UNION ALL
      SELECT c.id, c.titre, c.ordre, c.est_groupe
      FROM jeupharma.modules_cours c
      JOIN tree t ON c.parent_id = t.id
    )
    SELECT coalesce(array_agg(t.id ORDER BY t.ordre, t.titre), ARRAY[]::uuid[])
    INTO lecon_ids
    FROM tree t
    WHERE NOT coalesce(t.est_groupe, false);

  ELSE -- lecon
    SELECT m.id, m.titre, m.parcours_id INTO mid, label, parcours_id
    FROM jeupharma.modules_cours m
    WHERE m.id = p_id AND NOT coalesce(m.est_groupe, false);
    IF mid IS NULL THEN RAISE EXCEPTION 'leçon introuvable'; END IF;
    lecon_ids := ARRAY[mid];
  END IF;

  SELECT coalesce(
    jsonb_agg(jsonb_build_object('id', m.id, 'titre', m.titre) ORDER BY m.ordre, m.titre),
    '[]'::jsonb
  )
  INTO lecons
  FROM jeupharma.modules_cours m
  WHERE m.id = ANY (lecon_ids);

  -- Union pubs actives + blocs molecule (base + variantes + brouillon)
  SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::uuid[])
  INTO ids
  FROM (
    SELECT c.matrice_id AS x
    FROM jeupharma.publications_connaissances pc
    JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
    WHERE pc.module_id = ANY (lecon_ids)
      AND pc.actif
      AND c.matrice_id IS NOT NULL
    UNION
    SELECT unnest(jeupharma.v2__matrice_ids_from_payload(b.payload_json, true)) AS x
    FROM jeupharma.module_blocs b
    WHERE b.module_id = ANY (lecon_ids)
      AND b.type_bloc = 'molecule'
  ) u
  WHERE u.x IS NOT NULL;

  RETURN jsonb_build_object(
    'kind', kind,
    'id', p_id,
    'label', coalesce(label, ''),
    'parcours_id', parcours_id,
    'lecons', lecons,
    'matrice_ids', to_jsonb(coalesce(ids, ARRAY[]::uuid[]))
  );
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_comparaison_scope(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_comparaison_scope(text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- v2_comparaison_fiches : bulk v_medicaments_complet pour le tableau
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_comparaison_fiches(
  p_matrice_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  ids uuid[];
  outj jsonb;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;

  SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::uuid[])
  INTO ids
  FROM unnest(coalesce(p_matrice_ids, ARRAY[]::uuid[])) AS x
  WHERE x IS NOT NULL;

  IF ids IS NULL OR cardinality(ids) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.dci NULLS LAST, v.id), '[]'::jsonb)
  INTO outj
  FROM jeupharma.v_medicaments_complet v
  WHERE v.id = ANY (ids);

  RETURN outj;
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_comparaison_fiches(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_comparaison_fiches(uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- v2_comparaison_valeurs_lecon : état valeurs ★ pour un bloc molécule
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_comparaison_valeurs_lecon(
  p_module_id uuid,
  p_niveau int DEFAULT 0,
  p_bloc_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  niv int := coalesce(p_niveau, 0);
  b RECORD;
  eff jsonb;
  layer jsonb;
  base_layer jsonb;
  mat_ids uuid[] := ARRAY[]::uuid[];
  selected jsonb := '{}'::jsonb;
  available jsonb := '[]'::jsonb;
  mid uuid;
  rows_json jsonb;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF p_module_id IS NULL THEN
    RAISE EXCEPTION 'module requis';
  END IF;
  IF niv < 0 OR niv > 5 THEN
    RAISE EXCEPTION 'niveau invalide (0=base, 1–5)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM jeupharma.modules_cours m
    WHERE m.id = p_module_id AND NOT coalesce(m.est_groupe, false)
  ) THEN
    RAISE EXCEPTION 'leçon introuvable';
  END IF;

  SELECT bl.* INTO b
  FROM jeupharma.module_blocs bl
  WHERE bl.module_id = p_module_id
    AND bl.type_bloc = 'molecule'
    AND (p_bloc_id IS NULL OR bl.id = p_bloc_id)
  ORDER BY bl.ordre, bl.created_at
  LIMIT 1;

  IF b.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'aucun_bloc_molecule',
      'module_id', p_module_id,
      'niveau', niv
    );
  END IF;

  -- Payload effectif (publié ∪ brouillon)
  eff := (coalesce(b.payload_json, '{}'::jsonb) - '_brouillon')
    || coalesce(b.payload_json->'_brouillon'->'payload', '{}'::jsonb);

  base_layer := jsonb_build_object(
    'matrice_ids', coalesce(eff->'matrice_ids', '[]'::jsonb),
    'valeurs', coalesce(eff->'valeurs', '{}'::jsonb)
  );

  IF niv = 0 THEN
    layer := base_layer;
  ELSE
    layer := coalesce(eff->'variantes'->(niv::text), '{}'::jsonb);
  END IF;

  -- Scope molécules : base seule, ou base ∪ variante ★N (comme studio)
  IF niv = 0 THEN
    SELECT coalesce(array_agg(DISTINCT (e)::uuid), ARRAY[]::uuid[])
    INTO mat_ids
    FROM jsonb_array_elements_text(coalesce(layer->'matrice_ids', '[]'::jsonb)) e
    WHERE e IS NOT NULL AND e <> '';
  ELSE
    SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::uuid[])
    INTO mat_ids
    FROM (
      SELECT (e)::uuid AS x
      FROM jsonb_array_elements_text(coalesce(base_layer->'matrice_ids', '[]'::jsonb)) e
      WHERE e IS NOT NULL AND e <> ''
      UNION
      SELECT (e)::uuid
      FROM jsonb_array_elements_text(coalesce(layer->'matrice_ids', '[]'::jsonb)) e
      WHERE e IS NOT NULL AND e <> ''
    ) u
    WHERE u.x IS NOT NULL;
  END IF;

  selected := coalesce(layer->'valeurs', '{}'::jsonb);

  -- Disponibles : sync connaissances référentiel par matrice (réutilise RPC)
  FOREACH mid IN ARRAY coalesce(mat_ids, ARRAY[]::uuid[])
  LOOP
    rows_json := jeupharma.v2_lister_connaissances_matrice(mid, p_module_id);
    IF jsonb_typeof(rows_json) = 'array' THEN
      SELECT coalesce(
        jsonb_agg(elem || jsonb_build_object('matrice_id', mid)),
        '[]'::jsonb
      )
      INTO rows_json
      FROM jsonb_array_elements(rows_json) elem;
      available := available || coalesce(rows_json, '[]'::jsonb);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'module_id', p_module_id,
    'bloc_id', b.id,
    'niveau', niv,
    'matrice_ids', to_jsonb(coalesce(mat_ids, ARRAY[]::uuid[])),
    'selected', selected,
    'available', available
  );
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_comparaison_valeurs_lecon(uuid, int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_comparaison_valeurs_lecon(uuid, int, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- v2_comparaison_enregistrer_valeurs : persiste couche ★ + sync pubs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_comparaison_enregistrer_valeurs(
  p_module_id uuid,
  p_niveau int,
  p_valeurs jsonb,
  p_bloc_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  niv int := coalesce(p_niveau, 0);
  b RECORD;
  pj jsonb;
  pub jsonb;
  draft jsonb;
  payload jsonb;
  variantes jsonb;
  layer jsonb;
  sync_res jsonb;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF p_module_id IS NULL THEN
    RAISE EXCEPTION 'module requis';
  END IF;
  IF niv < 0 OR niv > 5 THEN
    RAISE EXCEPTION 'niveau invalide';
  END IF;
  IF p_valeurs IS NULL OR jsonb_typeof(p_valeurs) <> 'object' THEN
    RAISE EXCEPTION 'valeurs objet requis';
  END IF;

  SELECT bl.* INTO b
  FROM jeupharma.module_blocs bl
  WHERE bl.module_id = p_module_id
    AND bl.type_bloc = 'molecule'
    AND (p_bloc_id IS NULL OR bl.id = p_bloc_id)
  ORDER BY bl.ordre, bl.created_at
  LIMIT 1;

  IF b.id IS NULL THEN
    RAISE EXCEPTION 'aucun bloc molécule sur cette leçon';
  END IF;

  pj := coalesce(b.payload_json, '{}'::jsonb);
  -- Payload effectif actuel
  payload := (pj - '_brouillon') || coalesce(pj->'_brouillon'->'payload', '{}'::jsonb);

  IF niv = 0 THEN
    payload := payload || jsonb_build_object('valeurs', p_valeurs);
  ELSE
    variantes := coalesce(payload->'variantes', '{}'::jsonb);
    layer := coalesce(variantes->(niv::text), '{}'::jsonb);
    layer := layer || jsonb_build_object('valeurs', p_valeurs);
    -- Conserver matrice_ids de la variante s’ils existent
    IF NOT (layer ? 'matrice_ids') THEN
      layer := layer || jsonb_build_object('matrice_ids', '[]'::jsonb);
    END IF;
    variantes := variantes || jsonb_build_object(niv::text, layer);
    payload := payload || jsonb_build_object('variantes', variantes);
  END IF;

  -- Écrire en publié (admin comparaison = persistance directe) + nettoyer brouillon
  pub := (pj - '_brouillon');
  IF niv = 0 THEN
    pub := pub || jsonb_build_object('valeurs', p_valeurs);
  ELSE
    variantes := coalesce(pub->'variantes', '{}'::jsonb);
    layer := coalesce(variantes->(niv::text), '{}'::jsonb);
    layer := layer || jsonb_build_object('valeurs', p_valeurs);
    IF NOT (layer ? 'matrice_ids') THEN
      layer := layer || jsonb_build_object('matrice_ids', '[]'::jsonb);
    END IF;
    variantes := variantes || jsonb_build_object(niv::text, layer);
    pub := pub || jsonb_build_object('variantes', variantes);
  END IF;

  -- Si un brouillon existe, y synchroniser aussi la couche valeurs
  IF pj ? '_brouillon' THEN
    draft := coalesce(pj->'_brouillon', '{}'::jsonb);
    draft := draft || jsonb_build_object(
      'payload',
      coalesce(draft->'payload', '{}'::jsonb) || CASE
        WHEN niv = 0 THEN jsonb_build_object('valeurs', p_valeurs)
        ELSE jsonb_build_object(
          'variantes',
          coalesce(draft->'payload'->'variantes', pub->'variantes', '{}'::jsonb)
            || jsonb_build_object(
              niv::text,
              coalesce(draft->'payload'->'variantes'->(niv::text), '{}'::jsonb)
                || jsonb_build_object('valeurs', p_valeurs)
            )
        )
      END
    );
    pub := pub || jsonb_build_object('_brouillon', draft);
  END IF;

  UPDATE jeupharma.module_blocs
  SET payload_json = pub, updated_at = now()
  WHERE id = b.id;

  sync_res := jeupharma.v2_sync_pubs_depuis_blocs_molecule(p_module_id);

  RETURN jsonb_build_object(
    'ok', true,
    'bloc_id', b.id,
    'module_id', p_module_id,
    'niveau', niv,
    'sync', sync_res
  );
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_comparaison_enregistrer_valeurs(uuid, int, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_comparaison_enregistrer_valeurs(uuid, int, jsonb, uuid) TO authenticated;

COMMENT ON FUNCTION jeupharma.v2_comparaison_scope(text, uuid) IS
  'Admin : molécules d’un parcours/chapitre/leçon (pubs ∪ blocs molecule).';
COMMENT ON FUNCTION jeupharma.v2_comparaison_fiches(uuid[]) IS
  'Admin : fiches référentiel bulk pour tableau Comparaison.';
COMMENT ON FUNCTION jeupharma.v2_fusionner_entites(text, uuid, uuid[]) IS
  'Admin : fusionne N entités vers keep (liaisons + soft-delete + remap connaissances).';
COMMENT ON FUNCTION jeupharma.v2_supprimer_entite(text, uuid) IS
  'Admin : soft-delete entité + retrait liaisons + retire connaissances.';
COMMENT ON FUNCTION jeupharma.v2_comparaison_valeurs_lecon(uuid, int, uuid) IS
  'Admin : valeurs sélectionnées / disponibles pour une leçon et un niveau ★.';
COMMENT ON FUNCTION jeupharma.v2_comparaison_enregistrer_valeurs(uuid, int, jsonb, uuid) IS
  'Admin : persiste valeurs ★ dans le bloc molécule + sync publications.';
