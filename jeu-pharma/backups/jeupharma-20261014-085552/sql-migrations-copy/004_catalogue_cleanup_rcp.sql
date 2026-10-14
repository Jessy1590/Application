-- =============================================================================
-- Jeu Pharma — 004 : nettoyage catalogue RCP / DCI-centrique
-- Projet remote : kpjflntnotftpzffjbud
-- Appliqué via MCP (ne pas réappliquer sans check STATE.md).
-- =============================================================================
-- Objectérations (structurelles uniquement, pas d'invention clinique) :
--   1. DCI Acide acétylsalicylique + merge Aspegic / Kardegic / Aspirine Protect
--   2. Tardyféron B9 → DCI association à part ; 7 fers mono → Sels ferreux
--   3. Fusion Clopidogrel ← Bésilate de clopidogrel ; Bisoprolol ← Fumarate…
--   4. Biogaran = noms commerciaux (déjà OK hors Clopidogrel, traité en 3)
--   5. Soft-archive Calcarea / Hamamelis / Vipera + orphelins scléro douteux
--   6. Eau oxygénée → DCI Peroxyde d'hydrogène (libellé produit explicite)
--   7. Digoxine : retirer nom commercial redondant = DCI ; garder Hémigoxine
-- =============================================================================

CREATE OR REPLACE FUNCTION jeupharma._cleanup_merge_matrice(p_keeper uuid, p_dup uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_keeper IS NULL OR p_dup IS NULL OR p_keeper = p_dup THEN
    RETURN;
  END IF;

  INSERT INTO jeupharma.matrice_noms_commerciaux (matrice_id, nom_commercial_id, ordre)
  SELECT p_keeper, n.nom_commercial_id,
    COALESCE((SELECT MAX(ordre) FROM jeupharma.matrice_noms_commerciaux WHERE matrice_id = p_keeper), -1)
      + ROW_NUMBER() OVER (ORDER BY n.ordre, n.nom_commercial_id)
  FROM jeupharma.matrice_noms_commerciaux n
  WHERE n.matrice_id = p_dup
  ON CONFLICT DO NOTHING;

  INSERT INTO jeupharma.matrice_indications (matrice_id, indication_id, ordre)
  SELECT p_keeper, x.indication_id, x.ordre FROM jeupharma.matrice_indications x
  WHERE x.matrice_id = p_dup
  ON CONFLICT DO NOTHING;

  INSERT INTO jeupharma.matrice_contre_indications (matrice_id, contre_indication_id, ordre)
  SELECT p_keeper, x.contre_indication_id, x.ordre FROM jeupharma.matrice_contre_indications x
  WHERE x.matrice_id = p_dup
  ON CONFLICT DO NOTHING;

  INSERT INTO jeupharma.matrice_effets_indesirables (matrice_id, effet_indesirable_id, ordre)
  SELECT p_keeper, x.effet_indesirable_id, x.ordre FROM jeupharma.matrice_effets_indesirables x
  WHERE x.matrice_id = p_dup
  ON CONFLICT DO NOTHING;

  INSERT INTO jeupharma.matrice_precautions_emploi (matrice_id, precaution_emploi_id, ordre)
  SELECT p_keeper, x.precaution_emploi_id, x.ordre FROM jeupharma.matrice_precautions_emploi x
  WHERE x.matrice_id = p_dup
  ON CONFLICT DO NOTHING;

  INSERT INTO jeupharma.matrice_interactions (matrice_id, interaction_id, ordre)
  SELECT p_keeper, x.interaction_id, x.ordre FROM jeupharma.matrice_interactions x
  WHERE x.matrice_id = p_dup
  ON CONFLICT DO NOTHING;

  INSERT INTO jeupharma.matrice_surveillances (matrice_id, surveillance_id, ordre)
  SELECT p_keeper, x.surveillance_id, x.ordre FROM jeupharma.matrice_surveillances x
  WHERE x.matrice_id = p_dup
  ON CONFLICT DO NOTHING;

  INSERT INTO jeupharma.matrice_voies_administration (matrice_id, voie_administration_id, ordre)
  SELECT p_keeper, x.voie_administration_id, x.ordre FROM jeupharma.matrice_voies_administration x
  WHERE x.matrice_id = p_dup
  ON CONFLICT DO NOTHING;

  UPDATE jeupharma.matrice_medicaments k
  SET
    secteur_therapeutique_id = COALESCE(k.secteur_therapeutique_id, d.secteur_therapeutique_id),
    classe_therapeutique_id = COALESCE(k.classe_therapeutique_id, d.classe_therapeutique_id),
    classe_pharmacologique_id = COALESCE(k.classe_pharmacologique_id, d.classe_pharmacologique_id),
    detail_pharmacologie_id = COALESCE(k.detail_pharmacologie_id, d.detail_pharmacologie_id),
    posologie_generale_id = COALESCE(k.posologie_generale_id, d.posologie_generale_id),
    grossesse_allaitement_id = COALESCE(k.grossesse_allaitement_id, d.grossesse_allaitement_id),
    updated_at = now()
  FROM jeupharma.matrice_medicaments d
  WHERE k.id = p_keeper AND d.id = p_dup;

  UPDATE jeupharma.matrice_medicaments
  SET statut = 'archive', updated_at = now()
  WHERE id = p_dup AND statut <> 'archive';
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma._cleanup_matrice_par_nom(p_nom text)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT m.id
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.matrice_noms_commerciaux mnc ON mnc.matrice_id = m.id
  JOIN jeupharma.noms_commerciaux nc ON nc.id = mnc.nom_commercial_id
  WHERE m.statut <> 'archive'
    AND jeupharma.normaliser_valeur(nc.valeur) = jeupharma.normaliser_valeur(p_nom)
  ORDER BY m.created_at ASC, m.id ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION jeupharma._cleanup_ensure_dci(p_valeur text)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
  v_norm text := jeupharma.normaliser_valeur(p_valeur);
BEGIN
  SELECT id INTO v_id
  FROM jeupharma.dcis
  WHERE valeur_norm = v_norm AND actif
  LIMIT 1;

  IF v_id IS NULL THEN
    SELECT id INTO v_id
    FROM jeupharma.dcis
    WHERE valeur_norm = v_norm
    ORDER BY actif DESC, created_at ASC
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      UPDATE jeupharma.dcis SET actif = true, updated_at = now() WHERE id = v_id AND NOT actif;
    END IF;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO jeupharma.dcis (valeur, valeur_norm)
    VALUES (p_valeur, v_norm)
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

DO $$
DECLARE
  dci_asa uuid;
  dci_sels uuid;
  dci_sels_b9 uuid;
  dci_clopi uuid;
  dci_besilate uuid;
  dci_biso uuid;
  dci_fumarate uuid;
  dci_h2o2 uuid;
  keeper uuid;
  dup uuid;
  nom_ids uuid[];
  m uuid;
BEGIN
  -- -------------------------------------------------------------------------
  -- 1. ASA : créer DCI + fusionner 3 aspirines
  -- -------------------------------------------------------------------------
  dci_asa := jeupharma._cleanup_ensure_dci('Acide acétylsalicylique');

  SELECT id INTO keeper
  FROM (
    SELECT m.id,
      (
        (CASE WHEN m.secteur_therapeutique_id IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN m.classe_therapeutique_id IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN m.classe_pharmacologique_id IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN m.detail_pharmacologie_id IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN m.posologie_generale_id IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN m.grossesse_allaitement_id IS NOT NULL THEN 1 ELSE 0 END)
        + (SELECT COUNT(*)::int FROM jeupharma.matrice_indications x WHERE x.matrice_id = m.id)
        + (SELECT COUNT(*)::int FROM jeupharma.matrice_contre_indications x WHERE x.matrice_id = m.id)
        + (SELECT COUNT(*)::int FROM jeupharma.matrice_effets_indesirables x WHERE x.matrice_id = m.id)
        + (SELECT COUNT(*)::int FROM jeupharma.matrice_precautions_emploi x WHERE x.matrice_id = m.id)
        + (SELECT COUNT(*)::int FROM jeupharma.matrice_interactions x WHERE x.matrice_id = m.id)
        + (SELECT COUNT(*)::int FROM jeupharma.matrice_surveillances x WHERE x.matrice_id = m.id)
        + (SELECT COUNT(*)::int FROM jeupharma.matrice_voies_administration x WHERE x.matrice_id = m.id)
        + (SELECT COUNT(*)::int FROM jeupharma.matrice_noms_commerciaux x WHERE x.matrice_id = m.id)
      ) AS fill_score,
      m.created_at
    FROM jeupharma.matrice_medicaments m
    WHERE m.statut <> 'archive'
      AND m.id IN (
        jeupharma._cleanup_matrice_par_nom('Aspegic'),
        jeupharma._cleanup_matrice_par_nom('Kardegic'),
        jeupharma._cleanup_matrice_par_nom('Aspirine Protect')
      )
  ) s
  ORDER BY fill_score DESC, created_at ASC, id ASC
  LIMIT 1;

  IF keeper IS NOT NULL THEN
    UPDATE jeupharma.matrice_medicaments
    SET dci_id = dci_asa, updated_at = now()
    WHERE id = keeper;

    FOREACH dup IN ARRAY ARRAY[
      jeupharma._cleanup_matrice_par_nom('Aspegic'),
      jeupharma._cleanup_matrice_par_nom('Kardegic'),
      jeupharma._cleanup_matrice_par_nom('Aspirine Protect')
    ]
    LOOP
      IF dup IS NOT NULL AND dup <> keeper THEN
        PERFORM jeupharma._cleanup_merge_matrice(keeper, dup);
      END IF;
    END LOOP;
  END IF;

  -- -------------------------------------------------------------------------
  -- 2. Fers : B9 association à part, puis mono sous Sels ferreux
  -- -------------------------------------------------------------------------
  dci_sels := jeupharma._cleanup_ensure_dci('Sels ferreux');
  dci_sels_b9 := jeupharma._cleanup_ensure_dci('Sels ferreux + acide folique');

  m := jeupharma._cleanup_matrice_par_nom('Tardyféron B9');
  IF m IS NOT NULL THEN
    UPDATE jeupharma.matrice_medicaments
    SET dci_id = dci_sels_b9, updated_at = now()
    WHERE id = m;
  END IF;

  SELECT id INTO keeper
  FROM (
    SELECT m.id,
      (
        (CASE WHEN m.secteur_therapeutique_id IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN m.classe_therapeutique_id IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN m.classe_pharmacologique_id IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN m.detail_pharmacologie_id IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN m.posologie_generale_id IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN m.grossesse_allaitement_id IS NOT NULL THEN 1 ELSE 0 END)
        + (SELECT COUNT(*)::int FROM jeupharma.matrice_indications x WHERE x.matrice_id = m.id)
        + (SELECT COUNT(*)::int FROM jeupharma.matrice_contre_indications x WHERE x.matrice_id = m.id)
        + (SELECT COUNT(*)::int FROM jeupharma.matrice_effets_indesirables x WHERE x.matrice_id = m.id)
        + (SELECT COUNT(*)::int FROM jeupharma.matrice_precautions_emploi x WHERE x.matrice_id = m.id)
        + (SELECT COUNT(*)::int FROM jeupharma.matrice_interactions x WHERE x.matrice_id = m.id)
        + (SELECT COUNT(*)::int FROM jeupharma.matrice_surveillances x WHERE x.matrice_id = m.id)
        + (SELECT COUNT(*)::int FROM jeupharma.matrice_voies_administration x WHERE x.matrice_id = m.id)
        + (SELECT COUNT(*)::int FROM jeupharma.matrice_noms_commerciaux x WHERE x.matrice_id = m.id)
      ) AS fill_score,
      m.created_at
    FROM jeupharma.matrice_medicaments m
    WHERE m.statut <> 'archive'
      AND m.id IN (
        jeupharma._cleanup_matrice_par_nom('Ascofer'),
        jeupharma._cleanup_matrice_par_nom('Ferograd'),
        jeupharma._cleanup_matrice_par_nom('Ferrostrane'),
        jeupharma._cleanup_matrice_par_nom('Fumafer'),
        jeupharma._cleanup_matrice_par_nom('Inofer'),
        jeupharma._cleanup_matrice_par_nom('Tardyféron'),
        jeupharma._cleanup_matrice_par_nom('Timoferol')
      )
  ) s
  ORDER BY fill_score DESC, created_at ASC, id ASC
  LIMIT 1;

  IF keeper IS NOT NULL THEN
    UPDATE jeupharma.matrice_medicaments
    SET dci_id = dci_sels, updated_at = now()
    WHERE id = keeper;

    FOREACH dup IN ARRAY ARRAY[
      jeupharma._cleanup_matrice_par_nom('Ascofer'),
      jeupharma._cleanup_matrice_par_nom('Ferograd'),
      jeupharma._cleanup_matrice_par_nom('Ferrostrane'),
      jeupharma._cleanup_matrice_par_nom('Fumafer'),
      jeupharma._cleanup_matrice_par_nom('Inofer'),
      jeupharma._cleanup_matrice_par_nom('Tardyféron'),
      jeupharma._cleanup_matrice_par_nom('Timoferol')
    ]
    LOOP
      IF dup IS NOT NULL AND dup <> keeper THEN
        PERFORM jeupharma._cleanup_merge_matrice(keeper, dup);
      END IF;
    END LOOP;
  END IF;

  -- -------------------------------------------------------------------------
  -- 3. Clopidogrel / Bisoprolol (sel → INN courte) + Biogaran comme nom
  -- -------------------------------------------------------------------------
  SELECT id INTO dci_clopi FROM jeupharma.dcis
  WHERE valeur_norm = jeupharma.normaliser_valeur('Clopidogrel') AND actif LIMIT 1;
  SELECT id INTO dci_besilate FROM jeupharma.dcis
  WHERE valeur_norm = jeupharma.normaliser_valeur('Bésilate de clopidogrel') AND actif LIMIT 1;

  IF dci_clopi IS NOT NULL THEN
    SELECT id INTO keeper FROM jeupharma.matrice_medicaments
    WHERE dci_id = dci_clopi AND statut <> 'archive' LIMIT 1;

    IF dci_besilate IS NOT NULL THEN
      SELECT id INTO dup FROM jeupharma.matrice_medicaments
      WHERE dci_id = dci_besilate AND statut <> 'archive' LIMIT 1;
      IF keeper IS NOT NULL AND dup IS NOT NULL THEN
        PERFORM jeupharma._cleanup_merge_matrice(keeper, dup);
      ELSIF keeper IS NULL AND dup IS NOT NULL THEN
        UPDATE jeupharma.matrice_medicaments
        SET dci_id = dci_clopi, updated_at = now()
        WHERE id = dup;
      END IF;
      -- Soft-disable DCI sel ; archives déjà pointées
      UPDATE jeupharma.matrice_medicaments
      SET dci_id = dci_clopi, updated_at = now()
      WHERE dci_id = dci_besilate AND statut = 'archive';
      UPDATE jeupharma.dcis
      SET actif = false, updated_at = now()
      WHERE id = dci_besilate AND actif;
    END IF;
  END IF;

  SELECT id INTO dci_biso FROM jeupharma.dcis
  WHERE valeur_norm = jeupharma.normaliser_valeur('Bisoprolol') AND actif LIMIT 1;
  SELECT id INTO dci_fumarate FROM jeupharma.dcis
  WHERE valeur_norm = jeupharma.normaliser_valeur('Fumarate de bisoprolol') AND actif LIMIT 1;

  IF dci_biso IS NOT NULL THEN
    SELECT id INTO keeper FROM jeupharma.matrice_medicaments
    WHERE dci_id = dci_biso AND statut <> 'archive' LIMIT 1;

    IF dci_fumarate IS NOT NULL THEN
      SELECT id INTO dup FROM jeupharma.matrice_medicaments
      WHERE dci_id = dci_fumarate AND statut <> 'archive' LIMIT 1;
      IF keeper IS NOT NULL AND dup IS NOT NULL THEN
        PERFORM jeupharma._cleanup_merge_matrice(keeper, dup);
      ELSIF keeper IS NULL AND dup IS NOT NULL THEN
        UPDATE jeupharma.matrice_medicaments
        SET dci_id = dci_biso, updated_at = now()
        WHERE id = dup;
      END IF;
      UPDATE jeupharma.matrice_medicaments
      SET dci_id = dci_biso, updated_at = now()
      WHERE dci_id = dci_fumarate AND statut = 'archive';
      UPDATE jeupharma.dcis
      SET actif = false, updated_at = now()
      WHERE id = dci_fumarate AND actif;
    END IF;
  END IF;

  -- -------------------------------------------------------------------------
  -- 4. Soft-archive orphelins listés (homéo + scléro douteux)
  -- -------------------------------------------------------------------------
  FOREACH m IN ARRAY ARRAY[
    jeupharma._cleanup_matrice_par_nom('Calcarea fluor'),
    jeupharma._cleanup_matrice_par_nom('Hamamelis composé'),
    jeupharma._cleanup_matrice_par_nom('Vipera redi'),
    jeupharma._cleanup_matrice_par_nom('Aetoxisclérol'),
    jeupharma._cleanup_matrice_par_nom('Sclérémo'),
    jeupharma._cleanup_matrice_par_nom('Trombovar'),
    jeupharma._cleanup_matrice_par_nom('Resitune')
  ]
  LOOP
    IF m IS NOT NULL THEN
      UPDATE jeupharma.matrice_medicaments
      SET statut = 'archive', updated_at = now()
      WHERE id = m AND statut <> 'archive';
    END IF;
  END LOOP;

  -- -------------------------------------------------------------------------
  -- 5. Eau oxygénée → Peroxyde d'hydrogène (libellé produit explicite)
  -- -------------------------------------------------------------------------
  dci_h2o2 := jeupharma._cleanup_ensure_dci('Peroxyde d''hydrogène');
  m := jeupharma._cleanup_matrice_par_nom('Eau oxygénée à 10 volumes');
  IF m IS NOT NULL THEN
    UPDATE jeupharma.matrice_medicaments
    SET dci_id = dci_h2o2, updated_at = now()
    WHERE id = m;
  END IF;

  -- -------------------------------------------------------------------------
  -- 6. Digoxine : retirer nom commercial = DCI ; garder Hémigoxine
  -- -------------------------------------------------------------------------
  SELECT ARRAY_AGG(nc.id) INTO nom_ids
  FROM jeupharma.noms_commerciaux nc
  WHERE nc.actif
    AND jeupharma.normaliser_valeur(nc.valeur) = jeupharma.normaliser_valeur('Digoxine');

  IF nom_ids IS NOT NULL THEN
    DELETE FROM jeupharma.matrice_noms_commerciaux mnc
    USING jeupharma.matrice_medicaments m
    JOIN jeupharma.dcis d ON d.id = m.dci_id
    WHERE mnc.matrice_id = m.id
      AND mnc.nom_commercial_id = ANY (nom_ids)
      AND jeupharma.normaliser_valeur(d.valeur) = jeupharma.normaliser_valeur('Digoxine');

    UPDATE jeupharma.noms_commerciaux nc
    SET actif = false, updated_at = now()
    WHERE nc.id = ANY (nom_ids)
      AND NOT EXISTS (
        SELECT 1 FROM jeupharma.matrice_noms_commerciaux x WHERE x.nom_commercial_id = nc.id
      );
  END IF;
END $$;

-- Helpers one-shot : ne pas laisser en prod
DROP FUNCTION IF EXISTS jeupharma._cleanup_merge_matrice(uuid, uuid);
DROP FUNCTION IF EXISTS jeupharma._cleanup_matrice_par_nom(text);
DROP FUNCTION IF EXISTS jeupharma._cleanup_ensure_dci(text);
