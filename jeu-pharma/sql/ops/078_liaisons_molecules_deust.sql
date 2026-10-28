-- =============================================================================
-- Ops 078 — Phase 2 Cardio DEUST : liaisons blocs molecule + sync pubs base
-- Projet : kpjflntnotftpzffjbud
-- Parcours : cardiovasculaires_deust_2a
-- Source de vérité : AUDIT_CARDIO_DEUST_PHASE0.md §2
--
-- Pubs « base » : sync v2_sync_pubs_depuis_blocs_molecule → dci + nom_commercial
-- uniquement (pas de valeurs cliniques inventées). Folinate déjà lié (mapper,
-- ne pas créer « acide folinique »). rappel_sang / pathologie_du_globule_blanc :
-- 0 molécule. Trimétazidine → cv_angor.
-- Idempotent (seed_key 078:p2:* + merge matrice_ids).
-- =============================================================================

CREATE TEMP TABLE IF NOT EXISTS _078_plan (
  module_code text NOT NULL,
  target text NOT NULL,          -- 'ordre:N' | 'seed:KEY' | 'new:SEED'
  bloc_ordre int,
  bloc_titre text,
  dci_label text NOT NULL
) ON COMMIT DROP;

TRUNCATE _078_plan;

INSERT INTO _078_plan (module_code, target, bloc_ordre, bloc_titre, dci_label) VALUES
  -- pathologie_du_globule_rouge : Ig anti-D (folinate déjà lié ordre 200)
  ('pathologie_du_globule_rouge', 'ordre:260', 260, NULL, 'Immunoglobulines anti-D'),

  -- pathologie_plaquettes : compléter lot hémostatiques
  ('pathologie_plaquettes', 'ordre:260', 260, 'Molécules du programme', 'Phytoménadione'),
  ('pathologie_plaquettes', 'ordre:260', 260, 'Molécules du programme', 'Alginate de calcium'),
  ('pathologie_plaquettes', 'ordre:260', 260, 'Molécules du programme', 'Peroxyde d''hydrogène'),

  -- m_dicaments_du_gr : antiagrégant + anticoagulants rares + thrombolytiques
  ('m_dicaments_du_gr', 'ordre:40', 40, NULL, 'Dipyridamole'),
  ('m_dicaments_du_gr', 'new:078:p2:mol:m_dicaments_du_gr:thrombo', 500, 'Thrombolytiques et antidotes', 'Danaparoïde'),
  ('m_dicaments_du_gr', 'new:078:p2:mol:m_dicaments_du_gr:thrombo', 500, 'Thrombolytiques et antidotes', 'Idarucizumab'),
  ('m_dicaments_du_gr', 'new:078:p2:mol:m_dicaments_du_gr:thrombo', 500, 'Thrombolytiques et antidotes', 'Désirudine'),
  ('m_dicaments_du_gr', 'new:078:p2:mol:m_dicaments_du_gr:thrombo', 500, 'Thrombolytiques et antidotes', 'Lépirudine'),
  ('m_dicaments_du_gr', 'new:078:p2:mol:m_dicaments_du_gr:thrombo', 500, 'Thrombolytiques et antidotes', 'Altéplase'),
  ('m_dicaments_du_gr', 'new:078:p2:mol:m_dicaments_du_gr:thrombo', 500, 'Thrombolytiques et antidotes', 'Ténectéplase'),
  ('m_dicaments_du_gr', 'new:078:p2:mol:m_dicaments_du_gr:thrombo', 500, 'Thrombolytiques et antidotes', 'Rétéplase'),
  ('m_dicaments_du_gr', 'new:078:p2:mol:m_dicaments_du_gr:thrombo', 500, 'Thrombolytiques et antidotes', 'Streptokinase'),
  ('m_dicaments_du_gr', 'new:078:p2:mol:m_dicaments_du_gr:thrombo', 500, 'Thrombolytiques et antidotes', 'Urokinase'),

  -- cv_angor : remplir lots vides + compléter
  ('cv_angor', 'ordre:100', 100, 'Dérivés nitrés', 'Trinitrine'),
  ('cv_angor', 'ordre:100', 100, 'Dérivés nitrés', 'Isosorbide dinitrate'),
  ('cv_angor', 'ordre:310', 310, 'Béta-bloquants', 'Carvédilol'),
  ('cv_angor', 'ordre:450', 450, 'Molécules du programme', 'Nifédipine'),
  ('cv_angor', 'ordre:450', 450, 'Molécules du programme', 'Nicardipine'),
  ('cv_angor', 'ordre:450', 450, 'Molécules du programme', 'Nitrendipine'),
  ('cv_angor', 'ordre:450', 450, 'Molécules du programme', 'Isradipine'),
  ('cv_angor', 'ordre:450', 450, 'Molécules du programme', 'Amlodipine'),
  ('cv_angor', 'ordre:450', 450, 'Molécules du programme', 'Félodipine'),
  ('cv_angor', 'ordre:450', 450, 'Molécules du programme', 'Manidipine'),
  ('cv_angor', 'ordre:450', 450, 'Molécules du programme', 'Lercanidipine'),
  ('cv_angor', 'ordre:430', 430, 'Autres médicaments', 'Trimétazidine'),

  -- cv_idm : BASIC + IEC
  ('cv_idm', 'new:078:p2:mol:cv_idm', 900, 'Molécules du programme', 'Atorvastatine'),
  ('cv_idm', 'new:078:p2:mol:cv_idm', 900, 'Molécules du programme', 'Enalapril'),
  ('cv_idm', 'new:078:p2:mol:cv_idm', 900, 'Molécules du programme', 'Ramipril'),
  ('cv_idm', 'new:078:p2:mol:cv_idm', 900, 'Molécules du programme', 'Captopril'),
  ('cv_idm', 'new:078:p2:mol:cv_idm', 900, 'Molécules du programme', 'Lisinopril'),
  ('cv_idm', 'new:078:p2:mol:cv_idm', 900, 'Molécules du programme', 'Perindopril'),
  ('cv_idm', 'new:078:p2:mol:cv_idm', 900, 'Molécules du programme', 'Acide acétylsalicylique'),
  ('cv_idm', 'new:078:p2:mol:cv_idm', 900, 'Molécules du programme', 'Bisoprolol'),

  -- cv_arythmies : classe IV citée dans le cours
  ('cv_arythmies', 'new:078:p2:mol:cv_arythmies:c4', 300, 'Anti-arythmiques de classe 4', 'Vérapamil'),
  ('cv_arythmies', 'new:078:p2:mol:cv_arythmies:c4', 300, 'Anti-arythmiques de classe 4', 'Diltiazem'),

  -- cv_ic
  ('cv_ic', 'new:078:p2:mol:cv_ic', 900, 'Molécules du programme', 'Fosinopril'),
  ('cv_ic', 'new:078:p2:mol:cv_ic', 900, 'Molécules du programme', 'Losartan'),
  ('cv_ic', 'new:078:p2:mol:cv_ic', 900, 'Molécules du programme', 'Valsartan'),
  ('cv_ic', 'new:078:p2:mol:cv_ic', 900, 'Molécules du programme', 'Candésartan'),
  ('cv_ic', 'new:078:p2:mol:cv_ic', 900, 'Molécules du programme', 'Dapagliflozine'),
  ('cv_ic', 'new:078:p2:mol:cv_ic', 900, 'Molécules du programme', 'Digoxine'),
  ('cv_ic', 'new:078:p2:mol:cv_ic', 900, 'Molécules du programme', 'Furosémide'),
  ('cv_ic', 'new:078:p2:mol:cv_ic', 900, 'Molécules du programme', 'Spironolactone'),
  ('cv_ic', 'new:078:p2:mol:cv_ic', 900, 'Molécules du programme', 'Éplérénone'),
  ('cv_ic', 'new:078:p2:mol:cv_ic', 900, 'Molécules du programme', 'Sacubitril + valsartan'),

  -- cv_arterite (trimétazidine → cv_angor, pas ici)
  ('cv_arterite', 'new:078:p2:mol:cv_arterite', 900, 'Molécules du programme', 'Naftidrofuryl'),
  ('cv_arterite', 'new:078:p2:mol:cv_arterite', 900, 'Molécules du programme', 'Piribédil'),

  -- cv_veines
  ('cv_veines', 'new:078:p2:mol:cv_veines', 900, 'Molécules du programme', 'Fraction flavonoïque'),
  ('cv_veines', 'new:078:p2:mol:cv_veines', 900, 'Molécules du programme', 'Diosmine'),
  ('cv_veines', 'new:078:p2:mol:cv_veines', 900, 'Molécules du programme', 'Ginkgo biloba'),
  ('cv_veines', 'new:078:p2:mol:cv_veines', 900, 'Molécules du programme', 'Troxérutine'),
  ('cv_veines', 'new:078:p2:mol:cv_veines', 900, 'Molécules du programme', 'Ruscoside'),
  ('cv_veines', 'new:078:p2:mol:cv_veines', 900, 'Molécules du programme', 'Naftazone'),

  -- cv_urgences
  ('cv_urgences', 'new:078:p2:mol:cv_urgences', 900, 'Molécules du programme', 'Adrénaline'),

  -- hta_classes (lot 033 L16 + monos déjà vus utiles au cours HTA)
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Acébutolol'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Aténolol'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Céliprolol'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Bétaxolol'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Propranolol'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Pindolol'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Nadolol'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Labétalol'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Timolol'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Tertatolol'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Pirétanide'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Bumétanide'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Hydrochlorothiazide'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Indapamide'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Ciclétanine'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Amiloride'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Triamtérène'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Urapidil'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Prazosine'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Doxazosine'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Minoxidil'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Rilménidine'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Méthyldopa'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Moxonidine'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Clonidine'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Bénazépril'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Quinapril'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Trandolapril'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Zofénopril'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Irbésartan'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Telmisartan'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Éprosartan'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Olmésartan'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Losartan'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Valsartan'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Candésartan'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Enalapril'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Ramipril'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Captopril'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Lisinopril'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Perindopril'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Fosinopril'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Amlodipine'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Nifédipine'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Nicardipine'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Vérapamil'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Diltiazem'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Furosémide'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Spironolactone'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Éplérénone'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Bisoprolol'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Métoprolol'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Nébivolol'),
  ('hta_classes', 'seed:035:hta_classes:molecule-lot', 900, 'Molécules du programme', 'Carvédilol');

-- Assos HTA (exclure sang / clopidogrel+aspirine / sacubitril → cv_ic)
INSERT INTO _078_plan (module_code, target, bloc_ordre, bloc_titre, dci_label)
SELECT
  'hta_associations',
  'seed:035:hta_associations:molecule-lot',
  900,
  'Molécules du programme',
  d.valeur
FROM jeupharma.matrice_medicaments m
JOIN jeupharma.dcis d ON d.id = m.dci_id
WHERE m.statut IN ('publie', 'brouillon')
  AND d.valeur_norm LIKE '% + %'
  AND d.valeur_norm NOT IN (
    jeupharma.normaliser_valeur('Acide ascorbique + sulfate ferreux'),
    jeupharma.normaliser_valeur('Sels ferreux + acide folique'),
    jeupharma.normaliser_valeur('Clopidogrel + aspirine'),
    jeupharma.normaliser_valeur('Sacubitril + valsartan')
    -- Caduet (amlodipine + atorvastatine) inclus : cité audit §6.2 assos HTA
  );

DO $ops$
DECLARE
  v_parcours uuid;
  r RECORD;
  v_module uuid;
  v_bloc uuid;
  v_ids uuid[];
  v_missing text[] := ARRAY[]::text[];
  v_synced int := 0;
  sync_res jsonb;
  mid uuid;
  seed_key text;
BEGIN
  SELECT id INTO v_parcours
  FROM jeupharma.parcours_apprentissage
  WHERE code = 'cardiovasculaires_deust_2a';
  IF v_parcours IS NULL THEN
    RAISE EXCEPTION '078: parcours cardiovasculaires_deust_2a introuvable';
  END IF;

  -- Résolution DCI → matrice (1 fiche non archive, préfère publie)
  CREATE TEMP TABLE _078_resolved (
    module_code text NOT NULL,
    target text NOT NULL,
    bloc_ordre int,
    bloc_titre text,
    dci_label text NOT NULL,
    matrice_id uuid
  ) ON COMMIT DROP;

  INSERT INTO _078_resolved (module_code, target, bloc_ordre, bloc_titre, dci_label, matrice_id)
  SELECT
    p.module_code,
    p.target,
    p.bloc_ordre,
    p.bloc_titre,
    p.dci_label,
    (
      SELECT m2.id
      FROM jeupharma.matrice_medicaments m2
      JOIN jeupharma.dcis d2 ON d2.id = m2.dci_id
      WHERE m2.statut <> 'archive'
        AND jeupharma.normaliser_valeur(d2.valeur) = jeupharma.normaliser_valeur(p.dci_label)
      ORDER BY CASE WHEN m2.statut = 'publie' THEN 0 WHEN m2.statut = 'brouillon' THEN 1 ELSE 2 END,
               m2.updated_at DESC NULLS LAST
      LIMIT 1
    )
  FROM _078_plan p;

  SELECT array_agg(DISTINCT dci_label ORDER BY dci_label)
  INTO v_missing
  FROM _078_resolved
  WHERE matrice_id IS NULL;

  IF v_missing IS NOT NULL AND array_length(v_missing, 1) > 0 THEN
    RAISE NOTICE '078: DCI sans fiche (Phase 3) : %', array_to_string(v_missing, ', ');
  END IF;

  -- Groupes (module, target) → appliquer
  FOR r IN
    SELECT module_code, target, max(bloc_ordre) AS bloc_ordre, max(bloc_titre) AS bloc_titre,
           array_agg(DISTINCT matrice_id) FILTER (WHERE matrice_id IS NOT NULL) AS ids
    FROM _078_resolved
    GROUP BY module_code, target
  LOOP
    SELECT id INTO v_module
    FROM jeupharma.modules_cours
    WHERE parcours_id = v_parcours AND code = r.module_code AND NOT est_groupe;
    IF v_module IS NULL THEN
      RAISE EXCEPTION '078: module % introuvable', r.module_code;
    END IF;

    v_ids := coalesce(r.ids, ARRAY[]::uuid[]);
    IF array_length(v_ids, 1) IS NULL THEN
      CONTINUE;
    END IF;

    v_bloc := NULL;
    IF r.target LIKE 'ordre:%' THEN
      SELECT b.id INTO v_bloc
      FROM jeupharma.module_blocs b
      WHERE b.module_id = v_module
        AND b.type_bloc = 'molecule'
        AND b.ordre = r.bloc_ordre
      ORDER BY b.id
      LIMIT 1;
    ELSIF r.target LIKE 'seed:%' THEN
      seed_key := substring(r.target FROM 6);
      SELECT b.id INTO v_bloc
      FROM jeupharma.module_blocs b
      WHERE b.module_id = v_module
        AND b.type_bloc = 'molecule'
        AND b.payload_json->>'seed_key' = seed_key
      ORDER BY b.id
      LIMIT 1;
    ELSIF r.target LIKE 'new:%' THEN
      seed_key := substring(r.target FROM 5);
      SELECT b.id INTO v_bloc
      FROM jeupharma.module_blocs b
      WHERE b.module_id = v_module
        AND b.type_bloc = 'molecule'
        AND b.payload_json->>'seed_key' = seed_key
      ORDER BY b.id
      LIMIT 1;
    END IF;

    IF v_bloc IS NULL AND r.target LIKE 'new:%' THEN
      seed_key := substring(r.target FROM 5);
      INSERT INTO jeupharma.module_blocs (
        module_id, ordre, type_bloc, titre, payload_json, visible
      ) VALUES (
        v_module,
        coalesce(r.bloc_ordre, 900),
        'molecule',
        coalesce(r.bloc_titre, 'Molécules du programme'),
        jsonb_build_object(
          'mode', 'fiche',
          'matrice_id', '',
          'matrice_ids', (
            SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY u::text), '[]'::jsonb)
            FROM unnest(v_ids) AS u
          ),
          'valeurs', '{}'::jsonb,
          'seed_key', seed_key
        ),
        true
      )
      RETURNING id INTO v_bloc;
    ELSIF v_bloc IS NOT NULL THEN
      UPDATE jeupharma.module_blocs b
      SET
        visible = true,
        titre = CASE
          WHEN r.module_code = 'cv_angor' AND r.bloc_ordre = 100 AND r.bloc_titre IS NOT NULL
            THEN r.bloc_titre
          ELSE b.titre
        END,
        payload_json = jsonb_set(
          coalesce(b.payload_json, '{}'::jsonb)
            || jsonb_build_object('mode', coalesce(b.payload_json->>'mode', 'fiche')),
          '{matrice_ids}',
          (
            SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY u::text), '[]'::jsonb)
            FROM (
              SELECT DISTINCT x::uuid AS u
              FROM (
                SELECT jsonb_array_elements_text(coalesce(b.payload_json->'matrice_ids', '[]'::jsonb)) AS x
                UNION ALL
                SELECT unnest(v_ids)::text
              ) s
              WHERE nullif(trim(x), '') IS NOT NULL
            ) d
          ),
          true
        )
      WHERE b.id = v_bloc;
    ELSE
      RAISE EXCEPTION '078: bloc cible introuvable % / %', r.module_code, r.target;
    END IF;
  END LOOP;

  -- Sync pubs (dci + nom_commercial) pour modules touchés
  FOR mid IN
    SELECT DISTINCT m.id
    FROM jeupharma.modules_cours m
    WHERE m.parcours_id = v_parcours
      AND m.code IN (
        SELECT DISTINCT module_code FROM _078_resolved WHERE matrice_id IS NOT NULL
      )
  LOOP
    sync_res := jeupharma.v2_sync_pubs_depuis_blocs_molecule(mid);
    v_synced := v_synced + 1;
    RAISE NOTICE '078 sync % → %', mid, sync_res;
  END LOOP;

  RAISE NOTICE '078: modules synchronisés=% ; DCI manquantes=%',
    v_synced,
    coalesce(array_to_string(v_missing, ', '), '(aucune)');
END
$ops$;
