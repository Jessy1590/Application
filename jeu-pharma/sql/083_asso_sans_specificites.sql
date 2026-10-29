-- =============================================================================
-- 083 : Fiches association — identité + noms commerciaux seulement
--
-- Une association (≥ 2 lignes dans matrice_composants) ne conserve que :
--   dci_id, matrice_composants, matrice_noms_commerciaux, connaissances dci / nom.
-- Les champs cliniques (secteur, classes, indications, CI, EI, etc.) sont retirés
-- de la fiche association. Les molécules séparées ne sont pas modifiées.
-- Les valeurs affichées en leçon viennent ensuite des molécules séparées.
--
-- masque_ids (payload molécule) : union Base ∪ ★N, comme matrice_ids.
-- Une molécule masquée reste dans le bloc sans diapositive.
-- =============================================================================

CREATE OR REPLACE FUNCTION jeupharma.v2__payload_resolu(p_payload jsonb, p_niveau int)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  base jsonb;
  v jsonb;
  k text;
  merged jsonb;
  val text;
  arr_base jsonb;
  arr_add jsonb;
  mid text;
  ids_base jsonb;
  ids_add jsonb;
  vals_base jsonb;
  vals_add jsonb;
  merged_vals jsonb;
  cid text;
  arr jsonb;
BEGIN
  base := coalesce(p_payload, '{}'::jsonb) - 'variantes' - '_brouillon';
  IF p_niveau IS NULL OR p_niveau < 1 THEN
    RETURN base;
  END IF;
  v := coalesce(p_payload, '{}'::jsonb)->'variantes'->(p_niveau::text);
  IF v IS NULL OR jsonb_typeof(v) <> 'object' THEN
    RETURN base;
  END IF;

  merged := base;
  FOR k IN SELECT jsonb_object_keys(v)
  LOOP
    IF k = 'matrice_ids' AND jsonb_typeof(v->k) = 'array' THEN
      arr_base := coalesce(merged->'matrice_ids', '[]'::jsonb);
      IF jsonb_typeof(arr_base) <> 'array' THEN
        arr_base := '[]'::jsonb;
      END IF;
      arr_add := v->k;
      merged := jsonb_set(
        merged,
        ARRAY['matrice_ids'],
        (
          SELECT coalesce(jsonb_agg(to_jsonb(x.elem) ORDER BY x.ord), '[]'::jsonb)
          FROM (
            SELECT elem, min(ord) AS ord
            FROM (
              SELECT jsonb_array_elements_text(arr_base) AS elem, 1 AS ord
              UNION ALL
              SELECT jsonb_array_elements_text(arr_add), 2
            ) u
            WHERE elem IS NOT NULL AND elem <> ''
            GROUP BY elem
          ) x
        ),
        true
      );
      IF jsonb_typeof(merged->'matrice_ids') = 'array'
         AND jsonb_array_length(merged->'matrice_ids') > 0 THEN
        merged := jsonb_set(merged, ARRAY['matrice_id'], merged->'matrice_ids'->0, true);
      END IF;

    ELSIF k = 'masque_ids' AND jsonb_typeof(v->k) = 'array' THEN
      arr_base := coalesce(merged->'masque_ids', '[]'::jsonb);
      IF jsonb_typeof(arr_base) <> 'array' THEN
        arr_base := '[]'::jsonb;
      END IF;
      arr_add := v->k;
      merged := jsonb_set(
        merged,
        ARRAY['masque_ids'],
        (
          SELECT coalesce(jsonb_agg(to_jsonb(x.elem) ORDER BY x.ord), '[]'::jsonb)
          FROM (
            SELECT elem, min(ord) AS ord
            FROM (
              SELECT jsonb_array_elements_text(arr_base) AS elem, 1 AS ord
              UNION ALL
              SELECT jsonb_array_elements_text(arr_add), 2
            ) u
            WHERE elem IS NOT NULL AND elem <> ''
            GROUP BY elem
          ) x
        ),
        true
      );

    ELSIF k = 'valeurs' AND jsonb_typeof(v->k) = 'object' THEN
      vals_base := coalesce(merged->'valeurs', '{}'::jsonb);
      IF jsonb_typeof(vals_base) <> 'object' THEN
        vals_base := '{}'::jsonb;
      END IF;
      vals_add := v->k;
      merged_vals := vals_base;
      FOR mid IN SELECT jsonb_object_keys(vals_add)
      LOOP
        ids_base := coalesce(vals_base->mid, '[]'::jsonb);
        ids_add := coalesce(vals_add->mid, '[]'::jsonb);
        IF jsonb_typeof(ids_base) <> 'array' THEN ids_base := '[]'::jsonb; END IF;
        IF jsonb_typeof(ids_add) <> 'array' THEN ids_add := '[]'::jsonb; END IF;
        arr := (
          SELECT coalesce(jsonb_agg(to_jsonb(x.elem)), '[]'::jsonb)
          FROM (
            SELECT DISTINCT elem
            FROM (
              SELECT jsonb_array_elements_text(ids_base) AS elem
              UNION ALL
              SELECT jsonb_array_elements_text(ids_add)
            ) u
            WHERE elem IS NOT NULL AND elem <> ''
          ) x
        );
        merged_vals := jsonb_set(merged_vals, ARRAY[mid], arr, true);
      END LOOP;
      merged := jsonb_set(merged, ARRAY['valeurs'], merged_vals, true);

    ELSIF jsonb_typeof(v->k) = 'string' THEN
      val := v->>k;
      IF NOT jeupharma.v2__texte_html_vide(val) THEN
        merged := jsonb_set(merged, ARRAY[k], to_jsonb(val), true);
      END IF;
    ELSIF v->k IS NOT NULL AND jsonb_typeof(v->k) <> 'null' THEN
      merged := jsonb_set(merged, ARRAY[k], v->k, true);
    END IF;
  END LOOP;
  RETURN merged;
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2__payload_resolu(jsonb, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION jeupharma.v2__payload_resolu(jsonb, int) FROM authenticated, anon;

-- Aides locales au nettoyage des payloads (supprimées en fin de migration).
CREATE OR REPLACE FUNCTION jeupharma.v2__filtrer_ids_json(p_arr jsonb, p_dead text[])
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_arr IS NULL OR jsonb_typeof(p_arr) <> 'array' THEN p_arr
    ELSE coalesce((
      SELECT jsonb_agg(to_jsonb(elem))
      FROM jsonb_array_elements_text(p_arr) elem
      WHERE NOT (elem = ANY (p_dead))
    ), '[]'::jsonb)
  END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2__purge_valeurs_map(p_vals jsonb, p_dead text[])
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  k text;
  out jsonb := '{}'::jsonb;
  arr jsonb;
BEGIN
  IF p_vals IS NULL OR jsonb_typeof(p_vals) <> 'object' THEN
    RETURN p_vals;
  END IF;
  FOR k IN SELECT jsonb_object_keys(p_vals)
  LOOP
    arr := jeupharma.v2__filtrer_ids_json(p_vals->k, p_dead);
    IF arr IS NOT NULL AND jsonb_typeof(arr) = 'array' AND jsonb_array_length(arr) > 0 THEN
      out := jsonb_set(out, ARRAY[k], arr, true);
    END IF;
  END LOOP;
  RETURN out;
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2__purge_payload_ids(p jsonb, p_dead text[])
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  out jsonb := coalesce(p, '{}'::jsonb);
  variantes jsonb;
  k text;
  layer jsonb;
  brou jsonb;
  brou_pay jsonb;
BEGIN
  IF jsonb_typeof(out->'valeurs') = 'object' THEN
    out := jsonb_set(out, ARRAY['valeurs'], jeupharma.v2__purge_valeurs_map(out->'valeurs', p_dead), true);
  END IF;
  IF jsonb_typeof(out->'variantes') = 'object' THEN
    variantes := out->'variantes';
    FOR k IN SELECT jsonb_object_keys(variantes)
    LOOP
      layer := variantes->k;
      IF jsonb_typeof(layer) = 'object' AND jsonb_typeof(layer->'valeurs') = 'object' THEN
        layer := jsonb_set(
          layer,
          ARRAY['valeurs'],
          jeupharma.v2__purge_valeurs_map(layer->'valeurs', p_dead),
          true
        );
        variantes := jsonb_set(variantes, ARRAY[k], layer, true);
      END IF;
    END LOOP;
    out := jsonb_set(out, ARRAY['variantes'], variantes, true);
  END IF;
  IF jsonb_typeof(out->'_brouillon') = 'object'
     AND jsonb_typeof(out->'_brouillon'->'payload') = 'object' THEN
    brou := out->'_brouillon';
    brou_pay := jeupharma.v2__purge_payload_ids(brou->'payload', p_dead);
    brou := jsonb_set(brou, ARRAY['payload'], brou_pay, true);
    out := jsonb_set(out, ARRAY['_brouillon'], brou, true);
  END IF;
  RETURN out;
END;
$$;

DO $do$
DECLARE
  asso_ids uuid[];
  dead_ids uuid[];
  dead_txt text[];
  mono_ids uuid[];
  sig_before text;
  sig_after text;
  noms_before int;
  noms_after int;
  comps_before int;
  comps_after int;
  clin_after int;
BEGIN
  SELECT coalesce(array_agg(matrice_id), ARRAY[]::uuid[])
  INTO asso_ids
  FROM (
    SELECT matrice_id
    FROM jeupharma.matrice_composants
    GROUP BY matrice_id
    HAVING count(*) >= 2
  ) s;

  IF asso_ids IS NULL OR cardinality(asso_ids) = 0 THEN
    RETURN;
  END IF;

  -- Molécules séparées : composants qui ne sont pas eux-mêmes une association.
  SELECT coalesce(array_agg(DISTINCT c.composant_matrice_id), ARRAY[]::uuid[])
  INTO mono_ids
  FROM jeupharma.matrice_composants c
  WHERE NOT (c.composant_matrice_id = ANY (asso_ids));

  SELECT coalesce(md5(string_agg(
    m.id::text || '|' ||
    coalesce(m.dci_id::text, '') || '|' ||
    coalesce(m.secteur_therapeutique_id::text, '') || '|' ||
    coalesce(m.classe_therapeutique_id::text, '') || '|' ||
    coalesce(m.classe_pharmacologique_id::text, '') || '|' ||
    coalesce(m.detail_pharmacologie_id::text, '') || '|' ||
    coalesce(m.posologie_generale_id::text, '') || '|' ||
    coalesce(m.grossesse_allaitement_id::text, '') || '|' ||
    coalesce(m.fiche_validee::text, '') || '|' ||
    coalesce((
      SELECT string_agg(i.indication_id::text, ',' ORDER BY i.indication_id)
      FROM jeupharma.matrice_indications i WHERE i.matrice_id = m.id
    ), '') || '|' ||
    coalesce((
      SELECT count(*)::text FROM jeupharma.connaissances k
      WHERE k.matrice_id = m.id AND k.statut <> 'retire'
    ), '0'),
    ',' ORDER BY m.id
  )), '')
  INTO sig_before
  FROM jeupharma.matrice_medicaments m
  WHERE m.id = ANY (mono_ids);

  SELECT count(*) INTO noms_before
  FROM jeupharma.matrice_noms_commerciaux
  WHERE matrice_id = ANY (asso_ids);

  SELECT count(*) INTO comps_before
  FROM jeupharma.matrice_composants
  WHERE matrice_id = ANY (asso_ids);

  DELETE FROM jeupharma.matrice_indications WHERE matrice_id = ANY (asso_ids);
  DELETE FROM jeupharma.matrice_contre_indications WHERE matrice_id = ANY (asso_ids);
  DELETE FROM jeupharma.matrice_effets_indesirables WHERE matrice_id = ANY (asso_ids);
  DELETE FROM jeupharma.matrice_precautions_emploi WHERE matrice_id = ANY (asso_ids);
  DELETE FROM jeupharma.matrice_interactions WHERE matrice_id = ANY (asso_ids);
  DELETE FROM jeupharma.matrice_surveillances WHERE matrice_id = ANY (asso_ids);
  DELETE FROM jeupharma.matrice_voies_administration WHERE matrice_id = ANY (asso_ids);
  DELETE FROM jeupharma.matrice_conditions_prescription_delivrance WHERE matrice_id = ANY (asso_ids);
  DELETE FROM jeupharma.matrice_conseils_delivrance WHERE matrice_id = ANY (asso_ids);
  DELETE FROM jeupharma.matrice_secteurs_therapeutiques WHERE matrice_id = ANY (asso_ids);
  DELETE FROM jeupharma.matrice_classes_therapeutiques WHERE matrice_id = ANY (asso_ids);
  DELETE FROM jeupharma.matrice_classes_pharmacologiques WHERE matrice_id = ANY (asso_ids);

  UPDATE jeupharma.matrice_medicaments
  SET secteur_therapeutique_id = NULL,
      classe_therapeutique_id = NULL,
      classe_pharmacologique_id = NULL,
      detail_pharmacologie_id = NULL,
      posologie_generale_id = NULL,
      grossesse_allaitement_id = NULL,
      fiche_validee = false
  WHERE id = ANY (asso_ids);

  SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
  INTO dead_ids
  FROM jeupharma.connaissances
  WHERE matrice_id = ANY (asso_ids)
    AND champ_code NOT IN ('dci', 'nom_commercial');

  IF dead_ids IS NOT NULL AND cardinality(dead_ids) > 0 THEN
    dead_txt := ARRAY(SELECT id::text FROM unnest(dead_ids) AS id);
    DELETE FROM jeupharma.connaissances WHERE id = ANY (dead_ids);

    UPDATE jeupharma.module_blocs b
    SET payload_json = jeupharma.v2__purge_payload_ids(b.payload_json, dead_txt)
    WHERE b.type_bloc = 'molecule'
      AND EXISTS (
        SELECT 1
        FROM unnest(dead_txt) AS d(txt)
        WHERE b.payload_json::text LIKE '%' || d.txt || '%'
      );
  END IF;

  SELECT count(*) INTO clin_after
  FROM jeupharma.connaissances
  WHERE matrice_id = ANY (asso_ids)
    AND statut <> 'retire'
    AND champ_code NOT IN ('dci', 'nom_commercial');

  SELECT count(*) INTO noms_after
  FROM jeupharma.matrice_noms_commerciaux
  WHERE matrice_id = ANY (asso_ids);

  SELECT count(*) INTO comps_after
  FROM jeupharma.matrice_composants
  WHERE matrice_id = ANY (asso_ids);

  SELECT coalesce(md5(string_agg(
    m.id::text || '|' ||
    coalesce(m.dci_id::text, '') || '|' ||
    coalesce(m.secteur_therapeutique_id::text, '') || '|' ||
    coalesce(m.classe_therapeutique_id::text, '') || '|' ||
    coalesce(m.classe_pharmacologique_id::text, '') || '|' ||
    coalesce(m.detail_pharmacologie_id::text, '') || '|' ||
    coalesce(m.posologie_generale_id::text, '') || '|' ||
    coalesce(m.grossesse_allaitement_id::text, '') || '|' ||
    coalesce(m.fiche_validee::text, '') || '|' ||
    coalesce((
      SELECT string_agg(i.indication_id::text, ',' ORDER BY i.indication_id)
      FROM jeupharma.matrice_indications i WHERE i.matrice_id = m.id
    ), '') || '|' ||
    coalesce((
      SELECT count(*)::text FROM jeupharma.connaissances k
      WHERE k.matrice_id = m.id AND k.statut <> 'retire'
    ), '0'),
    ',' ORDER BY m.id
  )), '')
  INTO sig_after
  FROM jeupharma.matrice_medicaments m
  WHERE m.id = ANY (mono_ids);

  IF sig_before IS DISTINCT FROM sig_after THEN
    RAISE EXCEPTION 'Garde-fou : une molécule séparée a été modifiée';
  END IF;
  IF noms_before IS DISTINCT FROM noms_after THEN
    RAISE EXCEPTION 'Garde-fou : noms commerciaux d’association modifiés';
  END IF;
  IF comps_before IS DISTINCT FROM comps_after THEN
    RAISE EXCEPTION 'Garde-fou : liens d’association modifiés';
  END IF;
  IF clin_after <> 0 THEN
    RAISE EXCEPTION 'Garde-fou : spécificités d’association encore présentes';
  END IF;
END;
$do$;

DROP FUNCTION IF EXISTS jeupharma.v2__purge_payload_ids(jsonb, text[]);
DROP FUNCTION IF EXISTS jeupharma.v2__purge_valeurs_map(jsonb, text[]);
DROP FUNCTION IF EXISTS jeupharma.v2__filtrer_ids_json(jsonb, text[]);
