-- =============================================================================
-- Ops 096 — Examen DEUST : trous (colonnes publiées), classement élargi,
-- classement indications, ordonnance BASIC (molécules réellement publiées).
-- Ne remplace pas les poids déjà posés. Nouveaux jeux : poids 1, score_min_pct 0.
-- Projet : kpjflntnotftpzffjbud
-- =============================================================================

DO $$
DECLARE
  pid uuid;
  v_sec uuid;
  bad text;
  cls_items jsonb;
  cls_zones jsonb;
  ind_items jsonb;
  ind_zones jsonb;
  v_cls uuid;
  v_ind uuid;
  v_ord uuid;
  v_biso uuid;
  v_aas uuid;
  v_rami uuid;
  v_pool uuid[];
  ordo jsonb;
  ind_cfg jsonb;
  v_bloc uuid;
  def jsonb;
BEGIN
  SELECT id INTO pid FROM jeupharma.parcours_apprentissage
  WHERE code = 'cardiovasculaires_deust_2a';
  IF pid IS NULL THEN
    RAISE EXCEPTION '096: parcours cardiovasculaires_deust_2a manquant';
  END IF;

  SELECT id INTO v_sec FROM jeupharma.modules_cours
  WHERE parcours_id = pid AND code = 'examen_destination_des_deust' AND NOT coalesce(est_groupe, false);
  IF v_sec IS NULL THEN
    RAISE EXCEPTION '096: leçon examen introuvable';
  END IF;

  -- Colonnes du tableau à trous : classes + CI / EI / interactions.
  -- Le trou côté client ne porte que sur une valeur publiée (fiche résolue).
  UPDATE jeupharma.modeles_jeu SET
    configuration_json = coalesce(configuration_json, '{}'::jsonb) || jsonb_build_object(
      'repertoire', 'parcours',
      'nb_lignes', 4,
      'nb_fiches', 4,
      'taux_trous', 100,
      'colonnes', jsonb_build_array(
        'classe_therapeutique', 'classe_pharmacologique',
        'contre_indications', 'effets_indesirables', 'interactions'
      ),
      'champs', jsonb_build_array(
        'classe_therapeutique', 'classe_pharmacologique',
        'contre_indications', 'effets_indesirables', 'interactions'
      ),
      'champs_interroges', jsonb_build_array(
        'classe_therapeutique', 'classe_pharmacologique',
        'contre_indications', 'effets_indesirables', 'interactions'
      ),
      'toujours_visibles', jsonb_build_array('dci'),
      'consigne', 'Quatre molécules tirées parmi celles affichées dans le parcours'
    ),
    updated_at = now()
  WHERE code_unique = 'JP-EXTRO';
  IF NOT FOUND THEN
    RAISE EXCEPTION '096: JP-EXTRO introuvable';
  END IF;

  CREATE TEMP TABLE _096_cls (zone text, dci text, ord int) ON COMMIT DROP;
  INSERT INTO _096_cls (zone, dci, ord) VALUES
    ('Antihypertenseur', 'Aténolol + chlortalidone', 1),
    ('Antihypertenseur', 'Candésartan', 2),
    ('Antihypertenseur', 'Ramipril', 3),
    ('Antihypertenseur', 'Perindopril', 4),
    ('Antihypertenseur', 'Losartan', 5),
    ('Antihypertenseur', 'Méthyldopa', 6),
    ('Bêtabloquant', 'Acébutolol', 1),
    ('Bêtabloquant', 'Aténolol', 2),
    ('Bêtabloquant', 'Bisoprolol', 3),
    ('Bêtabloquant', 'Propranolol', 4),
    ('Bêtabloquant', 'Nébivolol', 5),
    ('Bêtabloquant', 'Carvédilol', 6),
    ('Anticoagulant', 'Acénocoumarol', 1),
    ('Anticoagulant', 'Apixaban', 2),
    ('Anticoagulant', 'Warfarine', 3),
    ('Anticoagulant', 'Rivaroxaban', 4),
    ('Anticoagulant', 'Énoxaparine sodique', 5),
    ('Anticoagulant', 'Dabigatran étexilate', 6),
    ('Diurétique', 'Amiloride', 1),
    ('Diurétique', 'Bumétanide', 2),
    ('Diurétique', 'Furosémide', 3),
    ('Diurétique', 'Hydrochlorothiazide', 4),
    ('Diurétique', 'Spironolactone', 5),
    ('Diurétique', 'Indapamide', 6);

  SELECT string_agg(c.dci || ' / ' || c.zone, ', ' ORDER BY c.zone, c.dci)
  INTO bad
  FROM _096_cls c
  WHERE NOT EXISTS (
    SELECT 1
    FROM jeupharma.matrice_medicaments mm
    JOIN jeupharma.dcis d ON d.id = mm.dci_id
    WHERE mm.statut = 'publie'
      AND d.valeur = c.dci
      AND EXISTS (
        SELECT 1
        FROM jeupharma.publications_connaissances p
        JOIN jeupharma.connaissances k ON k.id = p.connaissance_id AND k.statut = 'valide'
        JOIN jeupharma.modules_cours mo ON mo.id = p.module_id
        WHERE p.actif AND k.matrice_id = mm.id AND mo.parcours_id = pid
      )
      AND (
        SELECT count(*)
        FROM jeupharma.matrice_classes_therapeutiques j
        JOIN jeupharma.classes_therapeutiques ct ON ct.id = j.classe_therapeutique_id AND ct.actif
        WHERE j.matrice_id = mm.id
      ) = 1
      AND EXISTS (
        SELECT 1
        FROM jeupharma.matrice_classes_therapeutiques j
        JOIN jeupharma.classes_therapeutiques ct ON ct.id = j.classe_therapeutique_id AND ct.actif
        WHERE j.matrice_id = mm.id AND ct.valeur = c.zone
      )
  );
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '096: classement hors cours ou classe ambiguë : %', bad;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', 'i' || n, 'label', dci) ORDER BY n), '[]'::jsonb)
  INTO cls_items
  FROM (
    SELECT c.dci, row_number() OVER (ORDER BY z.ord, c.ord) AS n
    FROM _096_cls c
    JOIN (VALUES
      (1, 'Antihypertenseur'),
      (2, 'Bêtabloquant'),
      (3, 'Anticoagulant'),
      (4, 'Diurétique')
    ) AS z(ord, label) ON z.label = c.zone
  ) s;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', 'z' || z.ord,
    'label', z.label,
    'item_ids', (
      SELECT coalesce(jsonb_agg('i' || x.n ORDER BY x.n), '[]'::jsonb)
      FROM (
        SELECT c.zone, row_number() OVER (ORDER BY z2.ord, c.ord) AS n
        FROM _096_cls c
        JOIN (VALUES
          (1, 'Antihypertenseur'),
          (2, 'Bêtabloquant'),
          (3, 'Anticoagulant'),
          (4, 'Diurétique')
        ) AS z2(ord, label) ON z2.label = c.zone
      ) x
      WHERE x.zone = z.label
    )
  ) ORDER BY z.ord), '[]'::jsonb)
  INTO cls_zones
  FROM (VALUES
    (1, 'Antihypertenseur'),
    (2, 'Bêtabloquant'),
    (3, 'Anticoagulant'),
    (4, 'Diurétique')
  ) AS z(ord, label);

  UPDATE jeupharma.modeles_jeu SET
    configuration_json = coalesce(configuration_json, '{}'::jsonb) || jsonb_build_object(
      'consigne', 'Classez chaque molécule dans sa classe thérapeutique du parcours',
      'items', cls_items,
      'zones', cls_zones
    ),
    updated_at = now()
  WHERE code_unique = 'JP-EXCLS'
  RETURNING id INTO v_cls;
  IF v_cls IS NULL THEN
    RAISE EXCEPTION '096: JP-EXCLS introuvable';
  END IF;

  CREATE TEMP TABLE _096_ind (ord int, zone_ord int, dci text, indication text) ON COMMIT DROP;
  INSERT INTO _096_ind (ord, zone_ord, dci, indication) VALUES
    (1, 1, 'Amlodipine', 'Hypertension artérielle'),
    (2, 1, 'Nicardipine', 'Hypertension artérielle'),
    (3, 2, 'Ivabradine', 'Angor stable'),
    (4, 2, 'Nicorandil', 'Angor stable'),
    (5, 3, 'Isosorbide dinitrate', 'Angor (traitement curatif de la crise)'),
    (6, 4, 'Molsidomine', 'Angine de poitrine (traitement préventif)'),
    (7, 5, 'Valsartan', 'Insuffisance cardiaque'),
    (8, 6, 'Daltéparine', 'Embolie pulmonaire'),
    (9, 7, 'Epoétine alfa', 'Anémie (EPO)'),
    (10, 7, 'Epoétine bêta', 'Anémie (EPO)');

  SELECT string_agg(w.dci, ', ' ORDER BY w.ord)
  INTO bad
  FROM _096_ind w
  WHERE (
    SELECT count(DISTINCT k.entite_id)
    FROM jeupharma.publications_connaissances p
    JOIN jeupharma.connaissances k ON k.id = p.connaissance_id AND k.statut = 'valide'
    JOIN jeupharma.modules_cours mo ON mo.id = p.module_id
    JOIN jeupharma.matrice_medicaments mm ON mm.id = k.matrice_id AND mm.statut = 'publie'
    JOIN jeupharma.dcis d ON d.id = mm.dci_id
    WHERE p.actif AND mo.parcours_id = pid AND d.valeur = w.dci AND k.champ_code = 'indications'
  ) IS DISTINCT FROM 1
  OR (
    SELECT min(jeupharma.v2__valeur_referentiel(k.matrice_id, k.champ_code, k.entite_id))
    FROM jeupharma.publications_connaissances p
    JOIN jeupharma.connaissances k ON k.id = p.connaissance_id AND k.statut = 'valide'
    JOIN jeupharma.modules_cours mo ON mo.id = p.module_id
    JOIN jeupharma.matrice_medicaments mm ON mm.id = k.matrice_id AND mm.statut = 'publie'
    JOIN jeupharma.dcis d ON d.id = mm.dci_id
    WHERE p.actif AND mo.parcours_id = pid AND d.valeur = w.dci AND k.champ_code = 'indications'
  ) IS DISTINCT FROM w.indication;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '096: indication non unique ou absente du cours : %', bad;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', 'i' || ord, 'label', dci) ORDER BY ord), '[]'::jsonb)
  INTO ind_items
  FROM _096_ind;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', 'z' || zone_ord,
    'label', indication,
    'item_ids', ids
  ) ORDER BY zone_ord), '[]'::jsonb)
  INTO ind_zones
  FROM (
    SELECT zone_ord, min(indication) AS indication,
           jsonb_agg('i' || ord ORDER BY ord) AS ids
    FROM _096_ind
    GROUP BY zone_ord
  ) z;

  ind_cfg := jsonb_build_object(
    'parcours_code', 'cardiovasculaires_deust_2a',
    'consigne', 'Classez chaque molécule dans l’indication publiée dans le cours',
    'items', ind_items,
    'zones', ind_zones
  );

  INSERT INTO jeupharma.modeles_jeu (
    code_unique, type_jeu, titre, parcours_id, module_ids, mode,
    configuration_json, en_pause, actif
  ) VALUES (
    'JP-EXIND', 'classement', 'Examen DEUST — Classement des indications',
    pid, ARRAY[v_sec], 'entrainement', ind_cfg, false, true
  )
  ON CONFLICT (code_unique) DO UPDATE SET
    type_jeu = EXCLUDED.type_jeu,
    titre = EXCLUDED.titre,
    parcours_id = EXCLUDED.parcours_id,
    module_ids = EXCLUDED.module_ids,
    mode = EXCLUDED.mode,
    configuration_json = EXCLUDED.configuration_json,
    en_pause = false,
    actif = true,
    updated_at = now()
  RETURNING id INTO v_ind;

  SELECT mm.id INTO v_biso
  FROM jeupharma.matrice_medicaments mm
  JOIN jeupharma.dcis d ON d.id = mm.dci_id
  WHERE mm.statut = 'publie' AND d.valeur = 'Bisoprolol';
  SELECT mm.id INTO v_aas
  FROM jeupharma.matrice_medicaments mm
  JOIN jeupharma.dcis d ON d.id = mm.dci_id
  WHERE mm.statut = 'publie' AND d.valeur = 'Acide acétylsalicylique';
  SELECT mm.id INTO v_rami
  FROM jeupharma.matrice_medicaments mm
  JOIN jeupharma.dcis d ON d.id = mm.dci_id
  WHERE mm.statut = 'publie' AND d.valeur = 'Ramipril';
  IF v_biso IS NULL OR v_aas IS NULL OR v_rami IS NULL THEN
    RAISE EXCEPTION '096: molécule BASIC introuvable';
  END IF;

  SELECT coalesce(array_agg(mo.id), ARRAY[]::uuid[])
  INTO v_pool
  FROM jeupharma.modules_cours mo
  WHERE mo.parcours_id = pid
    AND mo.publie
    AND NOT coalesce(mo.est_groupe, false)
    AND mo.code IN (
      'b_tabloquants',
      'anti_agr_gants_plaquettaire',
      'inhibiteur_enzyme_conversion'
    );
  IF coalesce(cardinality(v_pool), 0) <> 3 THEN
    RAISE EXCEPTION '096: leçons BASIC incomplètes';
  END IF;

  ordo := jsonb_build_object(
    'parcours_code', 'cardiovasculaires_deust_2a',
    'repertoire', 'selection',
    'consigne', 'Ordonnance de sortie BASIC du cours (post-IDM) : 1 bêtabloquant, 1 antiagrégant plaquettaire, 1 IEC. Le cours cite aussi 1 statine et le contrôle des facteurs de risque ; aucune statine n’est publiée sur une leçon.',
    'champs', jsonb_build_array('indications', 'contre_indications', 'effets_indesirables', 'classe_therapeutique'),
    'champs_interroges', jsonb_build_array('indications', 'contre_indications', 'effets_indesirables', 'classe_therapeutique'),
    'regles', jsonb_build_array(
      jsonb_build_object('type', 'matrice', 'matrice_id', v_biso, 'nombre', 1),
      jsonb_build_object('type', 'matrice', 'matrice_id', v_aas, 'nombre', 1),
      jsonb_build_object('type', 'matrice', 'matrice_id', v_rami, 'nombre', 1)
    )
  );

  INSERT INTO jeupharma.modeles_jeu (
    code_unique, type_jeu, titre, parcours_id, module_ids, mode,
    configuration_json, en_pause, actif
  ) VALUES (
    'JP-EXORD', 'ordonnance', 'Examen DEUST — Ordonnance de sortie BASIC',
    pid, v_pool, 'entrainement', ordo, false, true
  )
  ON CONFLICT (code_unique) DO UPDATE SET
    type_jeu = EXCLUDED.type_jeu,
    titre = EXCLUDED.titre,
    parcours_id = EXCLUDED.parcours_id,
    module_ids = EXCLUDED.module_ids,
    mode = EXCLUDED.mode,
    configuration_json = EXCLUDED.configuration_json,
    en_pause = false,
    actif = true,
    updated_at = now()
  RETURNING id INTO v_ord;

  FOR def IN
    SELECT value FROM jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('code', 'JP-EXIND', 'type', 'classement', 'titre', 'Examen DEUST — Classement des indications', 'ordre', 60, 'id', v_ind),
      jsonb_build_object('code', 'JP-EXORD', 'type', 'ordonnance', 'titre', 'Examen DEUST — Ordonnance de sortie BASIC', 'ordre', 70, 'id', v_ord)
    ))
  LOOP
    SELECT id INTO v_bloc FROM jeupharma.module_blocs
    WHERE module_id = v_sec AND type_bloc = 'jeu'
      AND payload_json->>'code_unique' = def->>'code'
    LIMIT 1;

    IF v_bloc IS NULL THEN
      INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
      VALUES (
        v_sec, (def->>'ordre')::int, 'jeu', def->>'titre',
        jsonb_build_object(
          'modele_id', def->>'id',
          'code_unique', def->>'code',
          'libelle_cta', 'Jouer',
          'type_jeu', def->>'type',
          'seed_key', '096:examen:' || (def->>'code')
        ),
        true
      );
    ELSE
      UPDATE jeupharma.module_blocs SET
        titre = def->>'titre',
        ordre = (def->>'ordre')::int,
        visible = true,
        payload_json = coalesce(payload_json, '{}'::jsonb) || jsonb_build_object(
          'modele_id', def->>'id',
          'code_unique', def->>'code',
          'libelle_cta', 'Jouer',
          'type_jeu', def->>'type',
          'seed_key', '096:examen:' || (def->>'code')
        ),
        updated_at = now()
      WHERE id = v_bloc;
    END IF;
  END LOOP;

  UPDATE jeupharma.modules_cours SET
    criteres_json = jsonb_set(
      coalesce(criteres_json, '{}'::jsonb),
      '{jeux}',
      (
        SELECT coalesce(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
        FROM (
          SELECT elem, t.ord
          FROM jsonb_array_elements(coalesce(criteres_json->'jeux', '[]'::jsonb))
            WITH ORDINALITY AS t(elem, ord)
          WHERE elem->>'modele_id' IS DISTINCT FROM v_ind::text
            AND elem->>'modele_id' IS DISTINCT FROM v_ord::text
          UNION ALL
          SELECT jsonb_build_object('modele_id', v_ind, 'poids', 1, 'score_min_pct', 0), 1000
          UNION ALL
          SELECT jsonb_build_object('modele_id', v_ord, 'poids', 1, 'score_min_pct', 0), 1001
        ) s
      )
    ),
    contenu_maj_at = now(),
    updated_at = now()
  WHERE id = v_sec;
END;
$$;
