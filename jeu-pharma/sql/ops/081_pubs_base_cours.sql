-- =============================================================================
-- Ops 081 — Pubs « base » alignées sur le texte des leçons (Cardio DEUST 2A)
-- Projet : kpjflntnotftpzffjbud
-- Parcours : cardiovasculaires_deust_2a
--
-- Pour chaque leçon priorité avec blocs molecule :
--   1. Agrège le plain text (texte / conseil / recommandation)
--   2. Pour chaque matrice du carrousel, sélectionne les connaissances
--      EXISTANTES (statut=valide) dont le libellé apparaît dans le cours
--      (normalisation jeupharma.normaliser_valeur + forme compacte)
--   3. Union dans payload_json.valeurs[matrice_id] (ne retire pas les cids
--      déjà cochés ; n’invente aucune valeur hors référentiel)
--   4. Sync pubs via v2_sync_pubs_depuis_blocs_molecule
--
-- Anti-invention : pas d’INSERT connaissances ; match substring compact ≥ 4
-- caractères alphanum. DCI / noms commerciaux restent via sync automatique.
-- Priorité : hta_associations, pathologie_du_globule_rouge, m_dicaments_du_gr,
--            cv_angor, cv_ic, hta_classes.
-- Idempotent (union).
-- =============================================================================

DO $ops$
DECLARE
  v_parcours uuid;
  r_mod record;
  r_bloc record;
  v_txtc text;
  v_valeurs jsonb;
  v_mid uuid;
  v_elem text;
  v_cid_txt text;
  v_existing uuid[];
  v_matched uuid[];
  v_union uuid[];
  v_cid uuid;
  sync_res jsonb;
  n_blocs int := 0;
  n_mats_touch int := 0;
  n_cids_add int := 0;
  n_sync int := 0;
BEGIN
  SELECT id INTO v_parcours
  FROM jeupharma.parcours_apprentissage
  WHERE code = 'cardiovasculaires_deust_2a'
  LIMIT 1;

  IF v_parcours IS NULL THEN
    RAISE EXCEPTION '081: parcours cardiovasculaires_deust_2a introuvable';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _081_counts (
    module_code text PRIMARY KEY,
    mats_touchees int NOT NULL DEFAULT 0,
    cids_ajoutes int NOT NULL DEFAULT 0,
    pubs_clin_avant int NOT NULL DEFAULT 0,
    pubs_clin_apres int NOT NULL DEFAULT 0,
    sync_json jsonb
  ) ON COMMIT DROP;

  FOR r_mod IN
    SELECT m.id, m.code
    FROM jeupharma.modules_cours m
    WHERE m.parcours_id = v_parcours
      AND NOT m.est_groupe
      AND m.code IN (
        'hta_associations',
        'pathologie_du_globule_rouge',
        'm_dicaments_du_gr',
        'cv_angor',
        'cv_ic',
        'hta_classes'
      )
    ORDER BY m.code
  LOOP
    INSERT INTO _081_counts (module_code, pubs_clin_avant)
    SELECT r_mod.code,
      count(*)::int
    FROM jeupharma.publications_connaissances pc
    JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
    WHERE pc.module_id = r_mod.id
      AND pc.actif
      AND c.champ_code NOT IN ('dci', 'nom_commercial')
    ON CONFLICT (module_code) DO UPDATE
      SET pubs_clin_avant = EXCLUDED.pubs_clin_avant;

    SELECT regexp_replace(
      jeupharma.normaliser_valeur(
        regexp_replace(
          coalesce(string_agg(
            coalesce(
              b.payload_json->>'html',
              b.payload_json->>'corps_html',
              ''
            ),
            ' '
          ), ''),
          '<[^>]+>', ' ', 'g'
        )
      ),
      '[^a-z0-9]+', '', 'g'
    )
    INTO v_txtc
    FROM jeupharma.module_blocs b
    WHERE b.module_id = r_mod.id
      AND b.type_bloc IN ('texte', 'conseil', 'recommandation');

    v_txtc := coalesce(v_txtc, '');

    FOR r_bloc IN
      SELECT b.id, b.payload_json
      FROM jeupharma.module_blocs b
      WHERE b.module_id = r_mod.id
        AND b.type_bloc = 'molecule'
      ORDER BY b.ordre, b.id
    LOOP
      v_valeurs := coalesce(r_bloc.payload_json->'valeurs', '{}'::jsonb);
      IF jsonb_typeof(v_valeurs) <> 'object' THEN
        v_valeurs := '{}'::jsonb;
      END IF;

      IF jsonb_typeof(r_bloc.payload_json->'matrice_ids') <> 'array' THEN
        CONTINUE;
      END IF;

      FOR v_elem IN
        SELECT jsonb_array_elements_text(r_bloc.payload_json->'matrice_ids')
      LOOP
        BEGIN
          v_mid := nullif(trim(v_elem), '')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
          CONTINUE;
        END;
        IF v_mid IS NULL THEN
          CONTINUE;
        END IF;

        v_existing := ARRAY[]::uuid[];
        IF jsonb_typeof(v_valeurs->v_mid::text) = 'array' THEN
          FOR v_cid_txt IN SELECT jsonb_array_elements_text(v_valeurs->v_mid::text)
          LOOP
            BEGIN
              v_cid := v_cid_txt::uuid;
              IF v_cid IS NOT NULL AND NOT (v_cid = ANY (v_existing)) THEN
                v_existing := array_append(v_existing, v_cid);
              END IF;
            EXCEPTION WHEN invalid_text_representation THEN
              NULL;
            END;
          END LOOP;
        END IF;

        SELECT coalesce(array_agg(c.id ORDER BY c.ordre, c.id), ARRAY[]::uuid[])
        INTO v_matched
        FROM jeupharma.connaissances c
        WHERE c.matrice_id = v_mid
          AND c.statut = 'valide'
          AND c.champ_code NOT IN ('dci', 'nom_commercial')
          AND length(
            regexp_replace(jeupharma.normaliser_valeur(c.texte), '[^a-z0-9]+', '', 'g')
          ) >= 4
          AND position(
            regexp_replace(jeupharma.normaliser_valeur(c.texte), '[^a-z0-9]+', '', 'g')
            IN v_txtc
          ) > 0;

        v_matched := coalesce(v_matched, ARRAY[]::uuid[]);
        IF coalesce(array_length(v_matched, 1), 0) = 0 THEN
          CONTINUE;
        END IF;

        v_union := v_existing;
        n_cids_add := 0;
        FOREACH v_cid IN ARRAY v_matched
        LOOP
          IF NOT (v_cid = ANY (v_union)) THEN
            v_union := array_append(v_union, v_cid);
            n_cids_add := n_cids_add + 1;
          END IF;
        END LOOP;

        IF n_cids_add > 0 THEN
          v_valeurs := jsonb_set(
            v_valeurs,
            ARRAY[v_mid::text],
            to_jsonb(v_union),
            true
          );
          UPDATE _081_counts
          SET
            mats_touchees = mats_touchees + 1,
            cids_ajoutes = cids_ajoutes + n_cids_add
          WHERE module_code = r_mod.code;
          n_mats_touch := n_mats_touch + 1;
        END IF;
      END LOOP;

      UPDATE jeupharma.module_blocs b
      SET
        payload_json = jsonb_set(
          coalesce(b.payload_json, '{}'::jsonb)
            || jsonb_build_object('081_pubs_base', true),
          '{valeurs}',
          v_valeurs,
          true
        ),
        updated_at = now()
      WHERE b.id = r_bloc.id;

      n_blocs := n_blocs + 1;
    END LOOP;

    sync_res := jeupharma.v2_sync_pubs_depuis_blocs_molecule(r_mod.id);
    n_sync := n_sync + 1;

    UPDATE _081_counts c
    SET
      sync_json = sync_res,
      pubs_clin_apres = (
        SELECT count(*)::int
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances k ON k.id = pc.connaissance_id
        WHERE pc.module_id = r_mod.id
          AND pc.actif
          AND k.champ_code NOT IN ('dci', 'nom_commercial')
      )
    WHERE c.module_code = r_mod.code;

    RAISE NOTICE '081 % → sync % ; mats+ % ; cids+ %',
      r_mod.code, sync_res,
      (SELECT mats_touchees FROM _081_counts WHERE module_code = r_mod.code),
      (SELECT cids_ajoutes FROM _081_counts WHERE module_code = r_mod.code);
  END LOOP;

  RAISE NOTICE '081 done: blocs=% mats_touch=% sync_modules=%',
    n_blocs, n_mats_touch, n_sync;
END
$ops$;

-- Résumé apply remote 2026-10-28 (temp _081_counts dans la même transaction) :
--   cv_angor              mats+15 cids+26  clin 23→49
--   cv_ic                 mats+5  cids+10  clin  0→10
--   hta_associations      mats+5  cids+6   clin  0→6
--   hta_classes           mats+32 cids+80  clin  0→80
--   m_dicaments_du_gr     mats+11 cids+20  clin 204→224
--   pathologie_du_globule_rouge mats+3 cids+6 clin 117→123
--
-- Contrôle post-apply (hors transaction ops) :
-- SELECT m.code,
--   count(*) FILTER (WHERE pc.actif AND c.champ_code NOT IN ('dci','nom_commercial')) AS pubs_clin
-- FROM jeupharma.modules_cours m
-- JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
-- LEFT JOIN jeupharma.publications_connaissances pc ON pc.module_id = m.id
-- LEFT JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
-- WHERE p.code = 'cardiovasculaires_deust_2a'
--   AND m.code IN ('hta_associations','hta_classes','cv_ic','cv_angor',
--                  'pathologie_du_globule_rouge','m_dicaments_du_gr')
-- GROUP BY m.code ORDER BY m.code;
