-- =============================================================================
-- Ops 050 : Retrait pubs molécules obsolètes (parcours Cardio DEUST)
-- Projet : kpjflntnotftpzffjbud
-- =============================================================================
-- Contexte :
--   Cleanup 048 avait soft-off toutes les pubs molécules (actif=false).
--   Ops 049 a réactivé/créé des pubs cours Sels ferreux (sang_rappel + Pathologie
--   Globule Rouge) et des pubs RCP avaient aussi réapparu sur Pathologie GR.
--   L’admin ne veut PAS ce contenu cours/RCP divergent : il republiera lui-même.
--
-- Fait :
--   1) Soft-off TOUTES les pubs liées à une connaissance molécule (matrice_id)
--      → retour à l’état post-048 (pubs mol actives = 0).
--   2) Retire (statut='retire') les connaissances cours Sels ferreux
--      (source cours_cardio_deust_2a) — obsolètes vs référentiel RCP.
--
-- Ne touche PAS :
--   - matrice_medicaments / entités référentiel / jonctions
--   - connaissances source rcp_bdpm_* (reste en référentiel, juste dépublié)
--   - modules_cours / module_blocs (dont matrice_ids du bloc molecule)
--   - inscriptions / jeux / v2_connaissances_visibles (bypass admin 049 conservé)
-- =============================================================================

-- 1) Soft-off pubs molécules (même logique que 048 §1)
UPDATE jeupharma.publications_connaissances pc
SET actif = false
WHERE pc.actif = true
  AND EXISTS (
    SELECT 1 FROM jeupharma.connaissances c
    WHERE c.id = pc.connaissance_id
      AND c.matrice_id IS NOT NULL
  );

-- 2) Retirer connaissances cours Sels ferreux (obsolètes)
UPDATE jeupharma.connaissances c
SET statut = 'retire',
    updated_at = now()
FROM jeupharma.sources_contenu s
WHERE c.source_id = s.id
  AND s.code = 'cours_cardio_deust_2a'
  AND c.matrice_id = 'd122d669-2f7c-48ed-a517-aa6e4bd765b8'
  AND c.statut = 'valide';

-- 3) Contrôles (NOTICE)
DO $$
DECLARE
  n_pubs_mol_actives int;
  n_sels_pubs_actives int;
  n_sels_conn_valides int;
  n_sels_conn_retirees int;
BEGIN
  SELECT count(*) INTO n_pubs_mol_actives
  FROM jeupharma.publications_connaissances pc
  JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
  WHERE pc.actif AND c.matrice_id IS NOT NULL;

  SELECT count(*) INTO n_sels_pubs_actives
  FROM jeupharma.publications_connaissances pc
  JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
  WHERE pc.actif AND c.matrice_id = 'd122d669-2f7c-48ed-a517-aa6e4bd765b8';

  SELECT count(*) INTO n_sels_conn_valides
  FROM jeupharma.connaissances c
  JOIN jeupharma.sources_contenu s ON s.id = c.source_id
  WHERE c.matrice_id = 'd122d669-2f7c-48ed-a517-aa6e4bd765b8'
    AND s.code = 'cours_cardio_deust_2a'
    AND c.statut = 'valide';

  SELECT count(*) INTO n_sels_conn_retirees
  FROM jeupharma.connaissances c
  JOIN jeupharma.sources_contenu s ON s.id = c.source_id
  WHERE c.matrice_id = 'd122d669-2f7c-48ed-a517-aa6e4bd765b8'
    AND s.code = 'cours_cardio_deust_2a'
    AND c.statut = 'retire';

  RAISE NOTICE '050 pubs_mol_actives=% sels_pubs_actives=% sels_conn_valides=% sels_conn_retirees=%',
    n_pubs_mol_actives, n_sels_pubs_actives, n_sels_conn_valides, n_sels_conn_retirees;

  IF n_pubs_mol_actives <> 0 THEN
    RAISE EXCEPTION '050: attendu 0 pubs mol actives, got %', n_pubs_mol_actives;
  END IF;
END $$;
