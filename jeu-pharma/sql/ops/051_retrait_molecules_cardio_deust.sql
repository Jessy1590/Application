-- =============================================================================
-- Ops 051 : Retrait TOUTES les molécules du programme Cardio DEUST
-- Projet : kpjflntnotftpzffjbud
-- Parcours cible UNIQUEMENT : cardiovasculaires_deust_2a
-- =============================================================================
-- Fait :
--   1) Soft-off (actif=false) toutes les publications_connaissances liées à une
--      connaissance molécule (matrice_id IS NOT NULL) sur les modules de ce parcours.
--   2) Blocs type_bloc='molecule' de ce parcours :
--      - payload_json.matrice_ids = []
--      - retrait matrice_id / _brouillon.matrice_*
--      - visible = false
--
-- Ne touche PAS :
--   - matrice_medicaments / entités / jonctions référentiel
--   - connaissances (pas de retire/delete)
--   - leçons / groupes / blocs non-molecule (texte, jeu, …)
--   - parcours pharmacien / test
--   - inscriptions / modeles_jeu
-- =============================================================================

DO $$
DECLARE
  v_parcours_id uuid;
  n_pubs int := 0;
  n_blocs int := 0;
  n_mods_blocs int := 0;
  n_mods_pubs int := 0;
  n_matrice_avant bigint := 0;
BEGIN
  SELECT id INTO v_parcours_id
  FROM jeupharma.parcours_apprentissage
  WHERE code = 'cardiovasculaires_deust_2a';

  IF v_parcours_id IS NULL THEN
    RAISE EXCEPTION '051: parcours cardiovasculaires_deust_2a introuvable';
  END IF;

  -- Garde-fou : aucun autre code ne doit matcher ce id
  IF EXISTS (
    SELECT 1 FROM jeupharma.parcours_apprentissage
    WHERE id = v_parcours_id AND code IS DISTINCT FROM 'cardiovasculaires_deust_2a'
  ) THEN
    RAISE EXCEPTION '051: parcours_id ambigu';
  END IF;

  SELECT count(*) INTO n_matrice_avant FROM jeupharma.matrice_medicaments;

  -- Modules touchés (pubs actives mol) avant update
  SELECT count(DISTINCT pc.module_id) INTO n_mods_pubs
  FROM jeupharma.publications_connaissances pc
  JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
  JOIN jeupharma.modules_cours m ON m.id = pc.module_id
  WHERE m.parcours_id = v_parcours_id
    AND pc.actif = true
    AND c.matrice_id IS NOT NULL;

  -- 1) Soft-off pubs molécules du parcours
  UPDATE jeupharma.publications_connaissances pc
  SET actif = false
  FROM jeupharma.connaissances c,
       jeupharma.modules_cours m
  WHERE pc.connaissance_id = c.id
    AND pc.module_id = m.id
    AND m.parcours_id = v_parcours_id
    AND pc.actif = true
    AND c.matrice_id IS NOT NULL;

  GET DIAGNOSTICS n_pubs = ROW_COUNT;

  -- Modules avec blocs molecule (avant clear)
  SELECT count(DISTINCT b.module_id) INTO n_mods_blocs
  FROM jeupharma.module_blocs b
  JOIN jeupharma.modules_cours m ON m.id = b.module_id
  WHERE m.parcours_id = v_parcours_id
    AND b.type_bloc = 'molecule';

  -- 2) Vider payloads molecule + masquer
  --    Retire matrice_id + _brouillon (ids fantômes) ; matrice_ids = [].
  UPDATE jeupharma.module_blocs b
  SET
    visible = false,
    payload_json = (
      (COALESCE(b.payload_json, '{}'::jsonb) - 'matrice_id' - '_brouillon')
      || jsonb_build_object(
        'matrice_ids', '[]'::jsonb,
        'mode', coalesce(nullif(b.payload_json->>'mode', ''), 'fiche')
      )
    ),
    updated_at = now()
  FROM jeupharma.modules_cours m
  WHERE b.module_id = m.id
    AND m.parcours_id = v_parcours_id
    AND b.type_bloc = 'molecule';

  GET DIAGNOSTICS n_blocs = ROW_COUNT;

  -- Contrôles post
  IF EXISTS (
    SELECT 1
    FROM jeupharma.publications_connaissances pc
    JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
    JOIN jeupharma.modules_cours m ON m.id = pc.module_id
    WHERE m.parcours_id = v_parcours_id
      AND pc.actif = true
      AND c.matrice_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION '051: pubs mol actives restantes sur cardiovasculaires_deust_2a';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jeupharma.module_blocs b
    JOIN jeupharma.modules_cours m ON m.id = b.module_id
    WHERE m.parcours_id = v_parcours_id
      AND b.type_bloc = 'molecule'
      AND (
        b.visible = true
        OR NULLIF(b.payload_json->>'matrice_id', '') IS NOT NULL
        OR (
          jsonb_typeof(b.payload_json->'matrice_ids') = 'array'
          AND jsonb_array_length(b.payload_json->'matrice_ids') > 0
        )
      )
  ) THEN
    RAISE EXCEPTION '051: bloc molecule encore visible ou avec matrice_ids';
  END IF;

  IF (SELECT count(*) FROM jeupharma.matrice_medicaments) <> n_matrice_avant THEN
    RAISE EXCEPTION '051: matrice_medicaments a changé (interdit)';
  END IF;

  RAISE NOTICE '051 parcours=% pubs_soft_off=% blocs_molecule_vides=% modules_pubs=% modules_blocs=% matrice_inchangee=%',
    v_parcours_id, n_pubs, n_blocs, n_mods_pubs, n_mods_blocs, n_matrice_avant;
END $$;
