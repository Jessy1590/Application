-- =============================================================================
-- 024 : Parcours démo « Introduction » — ce qu’un admin met en place
-- Idempotent. Montre : thèmes, feuilles, publications, 4 jeux paramétrés.
-- Déblocage : feuille sans prerequis_module_id = ouverte (voir fin de fichier).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Source + parcours
-- ---------------------------------------------------------------------------

INSERT INTO jeupharma.sources_contenu (code, libelle, type_source, description)
VALUES (
  'demo_introduction',
  'Démo parcours Introduction',
  'cours',
  'Corpus pédagogique réduit pour découvrir l’application (admin → joueur).'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO jeupharma.parcours_apprentissage (
  code, libelle, description, niveau_lie, mode_contenu, ordre, actif
)
VALUES (
  'introduction',
  'Introduction',
  'Parcours de prise en main : lire une fiche, découvrir Sang (anémie / anticoagulation), puis réviser avec les 4 jeux. Créé comme un admin le ferait.',
  'apprenti',
  'publications',
  1,
  true
)
ON CONFLICT (code) DO UPDATE SET
  libelle = EXCLUDED.libelle,
  description = EXCLUDED.description,
  niveau_lie = EXCLUDED.niveau_lie,
  mode_contenu = EXCLUDED.mode_contenu,
  ordre = EXCLUDED.ordre,
  actif = true,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 2. Arborescence modules
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  pid uuid;
  g_prise uuid;
  g_sang uuid;
  g_pratique uuid;
  m_lire uuid;
  m_anemie uuid;
  m_anticoag uuid;
  m_revision uuid;
BEGIN
  SELECT id INTO pid FROM jeupharma.parcours_apprentissage WHERE code = 'introduction';
  IF pid IS NULL THEN
    RAISE EXCEPTION 'parcours introduction manquant';
  END IF;

  -- Groupes
  INSERT INTO jeupharma.modules_cours (
    parcours_id, code, titre, resume, objectifs, ordre, publie, est_groupe, version_publication
  ) VALUES
    (pid, 'prise_en_main', 'Prise en main',
     'Comprendre le catalogue résolu avant de jouer.',
     'Savoir lire une fiche médicament filtrée par le parcours.',
     10, true, true, 1)
  ON CONFLICT (parcours_id, code) DO UPDATE SET
    titre = EXCLUDED.titre, resume = EXCLUDED.resume, objectifs = EXCLUDED.objectifs,
    ordre = EXCLUDED.ordre, publie = true, est_groupe = true, parent_id = NULL, updated_at = now()
  RETURNING id INTO g_prise;
  SELECT id INTO g_prise FROM jeupharma.modules_cours WHERE parcours_id = pid AND code = 'prise_en_main';

  INSERT INTO jeupharma.modules_cours (
    parcours_id, code, titre, resume, objectifs, ordre, publie, est_groupe, version_publication
  ) VALUES
    (pid, 'sang_intro', 'Sang — premiers pas',
     'Sous-parcours introductif anémie et anticoagulation.',
     'Repérer les classes et indications du module Sang.',
     20, true, true, 1)
  ON CONFLICT (parcours_id, code) DO UPDATE SET
    titre = EXCLUDED.titre, resume = EXCLUDED.resume, objectifs = EXCLUDED.objectifs,
    ordre = EXCLUDED.ordre, publie = true, est_groupe = true, parent_id = NULL, updated_at = now();
  SELECT id INTO g_sang FROM jeupharma.modules_cours WHERE parcours_id = pid AND code = 'sang_intro';

  INSERT INTO jeupharma.modules_cours (
    parcours_id, code, titre, resume, objectifs, ordre, publie, est_groupe, version_publication
  ) VALUES
    (pid, 'mise_en_pratique', 'Mise en pratique',
     'Révision guidée + entrée vers les jeux du parcours.',
     'Mobiliser le corpus intro via quiz, trous, fiche et ordonnance.',
     30, true, true, 1)
  ON CONFLICT (parcours_id, code) DO UPDATE SET
    titre = EXCLUDED.titre, resume = EXCLUDED.resume, objectifs = EXCLUDED.objectifs,
    ordre = EXCLUDED.ordre, publie = true, est_groupe = true, parent_id = NULL, updated_at = now();
  SELECT id INTO g_pratique FROM jeupharma.modules_cours WHERE parcours_id = pid AND code = 'mise_en_pratique';

  -- Feuilles
  INSERT INTO jeupharma.modules_cours (
    parcours_id, parent_id, code, titre, resume, objectifs, ordre, publie, est_groupe, version_publication
  ) VALUES
    (pid, g_prise, 'lire_fiche', 'Lire une fiche médicament',
     'Deux molécules exemples (fer, énoxaparine) pour découvrir champs et catalogue.',
     'Identifier DCI, noms, indications, CI, EI sur une fiche résolue.',
     11, true, false, 1),
    (pid, g_sang, 'anemie_intro', 'Anémie',
     'Premiers anti-anémiques du cours.',
     'Connaître fer et folates dans le parcours.',
     21, true, false, 1),
    (pid, g_sang, 'anticoag_intro', 'Anticoagulation',
     'Anticoagulants et antiagrégants d’introduction.',
     'Situer HNF/HBPM, AVK, AOD et antiagrégants.',
     22, true, false, 1),
    (pid, g_pratique, 'revision_intro', 'Révision guidée',
     'Corpus intro complet pour les jeux.',
     'Réviser avant de lancer quiz / trous / fiche / ordonnance.',
     31, true, false, 1)
  ON CONFLICT (parcours_id, code) DO UPDATE SET
    parent_id = EXCLUDED.parent_id,
    titre = EXCLUDED.titre,
    resume = EXCLUDED.resume,
    objectifs = EXCLUDED.objectifs,
    ordre = EXCLUDED.ordre,
    publie = true,
    est_groupe = false,
    updated_at = now();

  SELECT id INTO m_lire FROM jeupharma.modules_cours WHERE parcours_id = pid AND code = 'lire_fiche';
  SELECT id INTO m_anemie FROM jeupharma.modules_cours WHERE parcours_id = pid AND code = 'anemie_intro';
  SELECT id INTO m_anticoag FROM jeupharma.modules_cours WHERE parcours_id = pid AND code = 'anticoag_intro';
  SELECT id INTO m_revision FROM jeupharma.modules_cours WHERE parcours_id = pid AND code = 'revision_intro';

  -- Intro : toutes les feuilles ouvertes (pas de chaîne) pour jouer tout de suite
  UPDATE jeupharma.modules_cours SET prerequis_module_id = NULL
  WHERE id IN (m_lire, m_anemie, m_anticoag, m_revision);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Publications (connaissances déjà validées du référentiel)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  pid uuid;
  mid uuid;
  ids_lire uuid[] := ARRAY[
    'd122d669-2f7c-48ed-a517-aa6e4bd765b8'::uuid, -- Sels ferreux
    'b6b1bcf8-63af-4882-8b5b-0078b271e1e6'::uuid  -- Énoxaparine
  ];
  ids_anemie uuid[] := ARRAY[
    'd122d669-2f7c-48ed-a517-aa6e4bd765b8'::uuid, -- Sels ferreux
    '480be154-0bca-433c-a97d-4e9b23e73729'::uuid, -- Acide folique
    '6062f202-2407-493f-aa22-c26fc374877e'::uuid  -- Sels ferreux + acide folique
  ];
  ids_anticoag uuid[] := ARRAY[
    'b6b1bcf8-63af-4882-8b5b-0078b271e1e6'::uuid, -- Énoxaparine
    '7df6b28a-35f6-47a0-aacb-d73d5482e275'::uuid, -- Rivaroxaban
    '4a0382c1-76f8-4e60-8c8c-ea50a644f869'::uuid, -- Warfarine
    'da85c070-cf70-4440-bf0b-9db4bb1995e6'::uuid, -- Clopidogrel
    'de52a954-d5c1-434a-ab55-df2d6af685d3'::uuid  -- ASA
  ];
BEGIN
  SELECT id INTO pid FROM jeupharma.parcours_apprentissage WHERE code = 'introduction';

  SELECT id INTO mid FROM jeupharma.modules_cours WHERE parcours_id = pid AND code = 'lire_fiche';
  INSERT INTO jeupharma.publications_connaissances (module_id, connaissance_id, ordre)
  SELECT mid, c.id, c.ordre
  FROM jeupharma.connaissances c
  WHERE c.statut = 'valide' AND c.matrice_id = ANY (ids_lire)
  ON CONFLICT (module_id, connaissance_id) DO NOTHING;
  UPDATE jeupharma.modules_cours SET version_publication = version_publication + 1, updated_at = now() WHERE id = mid;

  SELECT id INTO mid FROM jeupharma.modules_cours WHERE parcours_id = pid AND code = 'anemie_intro';
  INSERT INTO jeupharma.publications_connaissances (module_id, connaissance_id, ordre)
  SELECT mid, c.id, c.ordre
  FROM jeupharma.connaissances c
  WHERE c.statut = 'valide' AND c.matrice_id = ANY (ids_anemie)
  ON CONFLICT (module_id, connaissance_id) DO NOTHING;
  UPDATE jeupharma.modules_cours SET version_publication = version_publication + 1, updated_at = now() WHERE id = mid;

  SELECT id INTO mid FROM jeupharma.modules_cours WHERE parcours_id = pid AND code = 'anticoag_intro';
  INSERT INTO jeupharma.publications_connaissances (module_id, connaissance_id, ordre)
  SELECT mid, c.id, c.ordre
  FROM jeupharma.connaissances c
  WHERE c.statut = 'valide' AND c.matrice_id = ANY (ids_anticoag)
  ON CONFLICT (module_id, connaissance_id) DO NOTHING;
  UPDATE jeupharma.modules_cours SET version_publication = version_publication + 1, updated_at = now() WHERE id = mid;

  -- Révision = union anémie + anticoag (+ exemples lire_fiche)
  SELECT id INTO mid FROM jeupharma.modules_cours WHERE parcours_id = pid AND code = 'revision_intro';
  INSERT INTO jeupharma.publications_connaissances (module_id, connaissance_id, ordre)
  SELECT mid, c.id, c.ordre
  FROM jeupharma.connaissances c
  WHERE c.statut = 'valide'
    AND c.matrice_id = ANY (ids_anemie || ids_anticoag)
  ON CONFLICT (module_id, connaissance_id) DO NOTHING;
  UPDATE jeupharma.modules_cours SET version_publication = version_publication + 1, updated_at = now() WHERE id = mid;

  -- Pubs légères aussi sur le groupe Sang (héritage ancêtres)
  SELECT id INTO mid FROM jeupharma.modules_cours WHERE parcours_id = pid AND code = 'sang_intro';
  INSERT INTO jeupharma.publications_connaissances (module_id, connaissance_id, ordre)
  SELECT mid, c.id, c.ordre
  FROM jeupharma.connaissances c
  WHERE c.statut = 'valide'
    AND c.matrice_id = ANY (ids_anemie || ids_anticoag)
    AND c.champ_code IN ('nom_commercial', 'dci', 'classe_therapeutique', 'indications')
  ON CONFLICT (module_id, connaissance_id) DO NOTHING;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Quatre jeux admin (codes JP-*****)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  pid uuid;
  id_anemie uuid;
  id_anticoag uuid;
  id_revision uuid;
  -- Pool démo Sang (8 matrices) — figé pour jeux intro même si le listing RPC est vide
  pool_sang uuid[] := ARRAY[
    'd122d669-2f7c-48ed-a517-aa6e4bd765b8'::uuid,
    '480be154-0bca-433c-a97d-4e9b23e73729'::uuid,
    '6062f202-2407-493f-aa22-c26fc374877e'::uuid,
    'b6b1bcf8-63af-4882-8b5b-0078b271e1e6'::uuid,
    '7df6b28a-35f6-47a0-aacb-d73d5482e275'::uuid,
    '4a0382c1-76f8-4e60-8c8c-ea50a644f869'::uuid,
    'da85c070-cf70-4440-bf0b-9db4bb1995e6'::uuid,
    'de52a954-d5c1-434a-ab55-df2d6af685d3'::uuid
  ];
BEGIN
  SELECT id INTO pid FROM jeupharma.parcours_apprentissage WHERE code = 'introduction';
  SELECT id INTO id_anemie FROM jeupharma.modules_cours WHERE parcours_id = pid AND code = 'anemie_intro';
  SELECT id INTO id_anticoag FROM jeupharma.modules_cours WHERE parcours_id = pid AND code = 'anticoag_intro';
  SELECT id INTO id_revision FROM jeupharma.modules_cours WHERE parcours_id = pid AND code = 'revision_intro';

  -- Quiz
  INSERT INTO jeupharma.modeles_jeu (
    code_unique, type_jeu, titre, parcours_id, module_ids, mode,
    configuration_json, en_pause, actif
  ) VALUES (
    'JP-INTQ1',
    'quiz',
    'Intro — Quiz Sang',
    pid,
    ARRAY[id_anemie, id_anticoag, id_revision],
    'entrainement',
    jsonb_build_object(
      'champs', jsonb_build_array('indications','contre_indications','effets_indesirables','classe_pharmacologique'),
      'champs_interroges', jsonb_build_array('indications','contre_indications','effets_indesirables','classe_pharmacologique'),
      'nb_questions', 8,
      'nb_propositions', 3,
      'matrice_ids', to_jsonb(pool_sang),
      'demo', true,
      'parcours_demo', 'introduction'
    ),
    false,
    true
  )
  ON CONFLICT (code_unique) DO UPDATE SET
    titre = EXCLUDED.titre,
    parcours_id = EXCLUDED.parcours_id,
    module_ids = EXCLUDED.module_ids,
    configuration_json = EXCLUDED.configuration_json,
    en_pause = false,
    actif = true,
    updated_at = now();

  -- Tableau à trous
  INSERT INTO jeupharma.modeles_jeu (
    code_unique, type_jeu, titre, parcours_id, module_ids, mode,
    configuration_json, en_pause, actif
  ) VALUES (
    'JP-INTT1',
    'trous',
    'Intro — Tableau à trous Sang',
    pid,
    ARRAY[id_revision],
    'entrainement',
    jsonb_build_object(
      'champs', jsonb_build_array('indications','contre_indications','effets_indesirables','surveillances'),
      'champs_interroges', jsonb_build_array('indications','contre_indications','effets_indesirables','surveillances'),
      'nb_fiches', 4,
      'densite_trous', 3,
      'matrice_ids', to_jsonb(pool_sang),
      'demo', true
    ),
    false,
    true
  )
  ON CONFLICT (code_unique) DO UPDATE SET
    titre = EXCLUDED.titre,
    parcours_id = EXCLUDED.parcours_id,
    module_ids = EXCLUDED.module_ids,
    configuration_json = EXCLUDED.configuration_json,
    en_pause = false,
    actif = true,
    updated_at = now();

  -- Fiche aléatoire
  INSERT INTO jeupharma.modeles_jeu (
    code_unique, type_jeu, titre, parcours_id, module_ids, mode,
    configuration_json, en_pause, actif
  ) VALUES (
    'JP-INTF1',
    'fiche_aleatoire',
    'Intro — Fiche aléatoire Sang',
    pid,
    ARRAY[id_anemie, id_anticoag, id_revision],
    'entrainement',
    jsonb_build_object(
      'seuil_exclusion', 8,
      'nb_notes_exclusion', 3,
      'matrice_ids', to_jsonb(pool_sang),
      'demo', true
    ),
    false,
    true
  )
  ON CONFLICT (code_unique) DO UPDATE SET
    titre = EXCLUDED.titre,
    parcours_id = EXCLUDED.parcours_id,
    module_ids = EXCLUDED.module_ids,
    configuration_json = EXCLUDED.configuration_json,
    en_pause = false,
    actif = true,
    updated_at = now();

  -- Ordonnance type
  INSERT INTO jeupharma.modeles_jeu (
    code_unique, type_jeu, titre, parcours_id, module_ids, mode,
    configuration_json, en_pause, actif
  ) VALUES (
    'JP-INTO1',
    'ordonnance',
    'Intro — Ordonnance type Sang',
    pid,
    ARRAY[id_revision],
    'entrainement',
    jsonb_build_object(
      'champs', jsonb_build_array('indications','contre_indications','effets_indesirables','surveillances'),
      'champs_interroges', jsonb_build_array('indications','contre_indications','effets_indesirables','surveillances'),
      'matrice_ids', to_jsonb(pool_sang),
      'regles', jsonb_build_array(
        jsonb_build_object('type','matrice','matrice_id', pool_sang[1]),
        jsonb_build_object('type','matrice','matrice_id', pool_sang[2]),
        jsonb_build_object('type','matrice','matrice_id', pool_sang[3])
      ),
      'demo', true
    ),
    false,
    true
  )
  ON CONFLICT (code_unique) DO UPDATE SET
    titre = EXCLUDED.titre,
    parcours_id = EXCLUDED.parcours_id,
    module_ids = EXCLUDED.module_ids,
    configuration_json = EXCLUDED.configuration_json,
    en_pause = false,
    actif = true,
    updated_at = now();
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Déblocage : feuille sans prérequis = accessible (intro + admin flexible)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION jeupharma.v2_modules_debloques(
  p_user uuid DEFAULT auth.uid(),
  p_parcours uuid DEFAULT NULL
)
RETURNS TABLE (module_id uuid, ordre int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
  WITH parcours AS (
    SELECT COALESCE(p_parcours, jeupharma.v2_parcours_actif(p_user)) AS id
  ),
  leaves AS (
    SELECT m.id, m.ordre, m.prerequis_module_id
    FROM jeupharma.modules_cours m
    JOIN parcours p ON p.id = m.parcours_id
    WHERE m.publie AND NOT m.est_groupe
  ),
  prog AS (
    SELECT pm.module_id, pm.statut
    FROM jeupharma.progression_modules pm
    WHERE pm.user_id = p_user
  )
  SELECT m.id, m.ordre
  FROM leaves m
  LEFT JOIN prog g ON g.module_id = m.id
  WHERE
    m.ordre = (SELECT MIN(ordre) FROM leaves)
    OR m.prerequis_module_id IS NULL
    OR g.statut IN ('debloque', 'termine')
    OR (
      m.prerequis_module_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM prog g2
        WHERE g2.module_id = m.prerequis_module_id
          AND g2.statut = 'termine'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM leaves prev
      JOIN prog gp ON gp.module_id = prev.id AND gp.statut = 'termine'
      WHERE prev.ordre = (
        SELECT MAX(l2.ordre) FROM leaves l2 WHERE l2.ordre < m.ordre
      )
    );
$$;
