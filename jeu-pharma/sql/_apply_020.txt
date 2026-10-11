-- =============================================================================
-- 020 : Jeu Pharma V2 — résolveur SQL + RLS
-- Dépend de 019_v2_pedagogie_core.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers parcours / modules
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION jeupharma.v2_parcours_actif(p_user uuid DEFAULT auth.uid())
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
  SELECT COALESCE(
    (SELECT p.parcours_id
       FROM jeupharma.profil_apprentissage p
      WHERE p.user_id = p_user AND p.parcours_id IS NOT NULL),
    (SELECT i.parcours_id
       FROM jeupharma.inscriptions_parcours i
       JOIN jeupharma.parcours_apprentissage pa ON pa.id = i.parcours_id AND pa.actif
      WHERE i.user_id = p_user AND i.actif
      ORDER BY i.debut_at DESC
      LIMIT 1),
    (SELECT pa.id
       FROM jeupharma.profil_apprentissage pr
       JOIN jeupharma.parcours_apprentissage pa
         ON pa.niveau_lie = pr.niveau_id AND pa.actif
      WHERE pr.user_id = p_user
      ORDER BY pa.ordre
      LIMIT 1)
  );
$$;

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
  mods AS (
    SELECT m.id, m.ordre, m.prerequis_module_id, m.publie
    FROM jeupharma.modules_cours m
    JOIN parcours p ON p.id = m.parcours_id
    WHERE m.publie
  ),
  prog AS (
    SELECT pm.module_id, pm.statut
    FROM jeupharma.progression_modules pm
    WHERE pm.user_id = p_user
  )
  SELECT m.id, m.ordre
  FROM mods m
  LEFT JOIN prog g ON g.module_id = m.id
  WHERE
    -- Premier module toujours accessible
    m.ordre = (SELECT MIN(ordre) FROM mods)
    OR g.statut IN ('debloque', 'termine')
    OR (
      m.prerequis_module_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM prog g2
        WHERE g2.module_id = m.prerequis_module_id
          AND g2.statut = 'termine'
      )
    );
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_mode_contenu(p_parcours uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
  SELECT COALESCE(
    (SELECT mode_contenu FROM jeupharma.parcours_apprentissage WHERE id = p_parcours),
    'publications'
  );
$$;

-- Connaissances visibles pour l'utilisateur courant (ou admin preview)
CREATE OR REPLACE FUNCTION jeupharma.v2_connaissances_visibles(
  p_user uuid DEFAULT auth.uid(),
  p_parcours uuid DEFAULT NULL,
  p_module_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  connaissance_id uuid,
  matrice_id uuid,
  champ_code text,
  entite_id uuid,
  texte text,
  texte_norm text,
  ordre int,
  module_id uuid,
  libelle_pedagogique text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  v_parcours uuid;
  v_mode text;
BEGIN
  IF p_user IS NULL THEN
    RETURN;
  END IF;
  IF NOT jeupharma.has_jeupharma_access() AND NOT jeupharma.is_portail_admin() THEN
    RETURN;
  END IF;

  v_parcours := COALESCE(p_parcours, jeupharma.v2_parcours_actif(p_user));
  IF v_parcours IS NULL THEN
    RETURN;
  END IF;
  v_mode := jeupharma.v2_mode_contenu(v_parcours);

  IF v_mode = 'referentiel_valide' THEN
    RETURN QUERY
    SELECT c.id, c.matrice_id, c.champ_code, c.entite_id, c.texte, c.texte_norm, c.ordre,
           NULL::uuid, NULL::text
    FROM jeupharma.connaissances c
    JOIN jeupharma.matrice_medicaments m ON m.id = c.matrice_id AND m.statut = 'publie'
    WHERE c.statut = 'valide'
    ORDER BY c.matrice_id, c.champ_code, c.ordre;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT c.id, c.matrice_id, c.champ_code, c.entite_id,
         COALESCE(pub.libelle_pedagogique, c.texte) AS texte,
         c.texte_norm, pub.ordre, pub.module_id, pub.libelle_pedagogique
  FROM jeupharma.publications_connaissances pub
  JOIN jeupharma.connaissances c ON c.id = pub.connaissance_id AND c.statut = 'valide'
  JOIN jeupharma.matrice_medicaments m ON m.id = c.matrice_id AND m.statut = 'publie'
  JOIN jeupharma.v2_modules_debloques(p_user, v_parcours) md ON md.module_id = pub.module_id
  WHERE pub.actif
    AND (p_module_ids IS NULL OR pub.module_id = ANY (p_module_ids))
  ORDER BY c.matrice_id, c.champ_code, pub.ordre;
END;
$$;

-- Liste médicaments visibles (ids + libellés)
CREATE OR REPLACE FUNCTION jeupharma.v2_lister_medicaments(
  p_parcours uuid DEFAULT NULL,
  p_module_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.dci, x.noms)
    FROM (
      SELECT
        m.id,
        d.valeur AS dci,
        COALESCE((
          SELECT string_agg(n.valeur, ', ' ORDER BY mn.ordre, n.valeur)
          FROM jeupharma.matrice_noms_commerciaux mn
          JOIN jeupharma.noms_commerciaux n ON n.id = mn.nom_commercial_id AND n.actif
          WHERE mn.matrice_id = m.id
        ), '') AS noms,
        m.hospitalier,
        m.complexe,
        count(DISTINCT cv.connaissance_id) AS nb_connaissances
      FROM jeupharma.matrice_medicaments m
      JOIN jeupharma.dcis d ON d.id = m.dci_id
      JOIN (
        SELECT DISTINCT matrice_id, connaissance_id
        FROM jeupharma.v2_connaissances_visibles(uid, p_parcours, p_module_ids)
      ) cv ON cv.matrice_id = m.id
      WHERE m.statut = 'publie'
      GROUP BY m.id, d.valeur, m.hospitalier, m.complexe
    ) x
  ), '[]'::jsonb);
END;
$$;

-- Fiche résolue : uniquement champs/valeurs autorisés
CREATE OR REPLACE FUNCTION jeupharma.v2_fiche_resolue(
  p_matrice_id uuid,
  p_parcours uuid DEFAULT NULL,
  p_module_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  uid uuid := auth.uid();
  base jsonb;
  champs jsonb;
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT jsonb_build_object(
    'id', m.id,
    'dci', d.valeur,
    'hospitalier', m.hospitalier,
    'complexe', m.complexe,
    'noms_commerciaux', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', n.id, 'valeur', n.valeur) ORDER BY mn.ordre)
      FROM jeupharma.matrice_noms_commerciaux mn
      JOIN jeupharma.noms_commerciaux n ON n.id = mn.nom_commercial_id AND n.actif
      WHERE mn.matrice_id = m.id
    ), '[]'::jsonb)
  )
  INTO base
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.dcis d ON d.id = m.dci_id
  WHERE m.id = p_matrice_id AND m.statut = 'publie';

  IF base IS NULL THEN
    RETURN NULL;
  END IF;

  -- Si aucune connaissance visible pour cette fiche → inaccessible
  IF NOT EXISTS (
    SELECT 1 FROM jeupharma.v2_connaissances_visibles(uid, p_parcours, p_module_ids) cv
    WHERE cv.matrice_id = p_matrice_id
  ) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_object_agg(champ_code, items)
  INTO champs
  FROM (
    SELECT cv.champ_code,
           jsonb_agg(
             jsonb_build_object(
               'connaissance_id', cv.connaissance_id,
               'entite_id', cv.entite_id,
               'valeur', cv.texte,
               'ordre', cv.ordre,
               'module_id', cv.module_id
             )
             ORDER BY cv.ordre, cv.texte
           ) AS items
    FROM jeupharma.v2_connaissances_visibles(uid, p_parcours, p_module_ids) cv
    WHERE cv.matrice_id = p_matrice_id
    GROUP BY cv.champ_code
  ) t;

  RETURN base || jsonb_build_object('champs', COALESCE(champs, '{}'::jsonb));
END;
$$;

-- Progression modules pour l'utilisateur
CREATE OR REPLACE FUNCTION jeupharma.v2_progression_parcours(
  p_parcours uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  uid uuid := auth.uid();
  v_parcours uuid;
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  v_parcours := COALESCE(p_parcours, jeupharma.v2_parcours_actif(uid));
  IF v_parcours IS NULL THEN
    RETURN jsonb_build_object('parcours_id', null, 'modules', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'parcours_id', v_parcours,
    'parcours', (
      SELECT jsonb_build_object('id', pa.id, 'code', pa.code, 'libelle', pa.libelle,
                                'mode_contenu', pa.mode_contenu)
      FROM jeupharma.parcours_apprentissage pa WHERE pa.id = v_parcours
    ),
    'modules', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'code', m.code,
          'titre', m.titre,
          'resume', m.resume,
          'objectifs', m.objectifs,
          'ordre', m.ordre,
          'publie', m.publie,
          'statut', CASE
            WHEN EXISTS (
              SELECT 1 FROM jeupharma.v2_modules_debloques(uid, v_parcours) d
              WHERE d.module_id = m.id
            ) THEN COALESCE(pm.statut, 'debloque')
            ELSE COALESCE(pm.statut, 'verrouille')
          END
        )
        ORDER BY m.ordre
      )
      FROM jeupharma.modules_cours m
      LEFT JOIN jeupharma.progression_modules pm
        ON pm.module_id = m.id AND pm.user_id = uid
      WHERE m.parcours_id = v_parcours AND m.publie
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_parcours_actif(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_modules_debloques(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_mode_contenu(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_connaissances_visibles(uuid, uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_lister_medicaments(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_fiche_resolue(uuid, uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_progression_parcours(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION jeupharma.v2_parcours_actif(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_modules_debloques(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_connaissances_visibles(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_lister_medicaments(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_fiche_resolue(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_progression_parcours(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS tables V2
-- ---------------------------------------------------------------------------

ALTER TABLE jeupharma.sources_contenu ENABLE ROW LEVEL SECURITY;
ALTER TABLE jeupharma.versions_source ENABLE ROW LEVEL SECURITY;
ALTER TABLE jeupharma.imports_source ENABLE ROW LEVEL SECURITY;
ALTER TABLE jeupharma.connaissances ENABLE ROW LEVEL SECURITY;
ALTER TABLE jeupharma.connaissances_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE jeupharma.connaissances_alias ENABLE ROW LEVEL SECURITY;
ALTER TABLE jeupharma.parcours_apprentissage ENABLE ROW LEVEL SECURITY;
ALTER TABLE jeupharma.modules_cours ENABLE ROW LEVEL SECURITY;
ALTER TABLE jeupharma.publications_connaissances ENABLE ROW LEVEL SECURITY;
ALTER TABLE jeupharma.inscriptions_parcours ENABLE ROW LEVEL SECURITY;
ALTER TABLE jeupharma.progression_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE jeupharma.modeles_jeu ENABLE ROW LEVEL SECURITY;
ALTER TABLE jeupharma.tentatives_jeu ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON jeupharma.sources_contenu TO authenticated;
GRANT SELECT ON jeupharma.versions_source TO authenticated;
GRANT SELECT ON jeupharma.parcours_apprentissage TO authenticated;
GRANT SELECT ON jeupharma.modules_cours TO authenticated;
GRANT SELECT, INSERT, UPDATE ON jeupharma.inscriptions_parcours TO authenticated;
GRANT SELECT, INSERT, UPDATE ON jeupharma.progression_modules TO authenticated;
GRANT SELECT ON jeupharma.modeles_jeu TO authenticated;
GRANT SELECT, INSERT, UPDATE ON jeupharma.tentatives_jeu TO authenticated;

GRANT ALL ON jeupharma.sources_contenu TO service_role;
GRANT ALL ON jeupharma.versions_source TO service_role;
GRANT ALL ON jeupharma.imports_source TO service_role;
GRANT ALL ON jeupharma.connaissances TO service_role;
GRANT ALL ON jeupharma.connaissances_revisions TO service_role;
GRANT ALL ON jeupharma.connaissances_alias TO service_role;
GRANT ALL ON jeupharma.parcours_apprentissage TO service_role;
GRANT ALL ON jeupharma.modules_cours TO service_role;
GRANT ALL ON jeupharma.publications_connaissances TO service_role;
GRANT ALL ON jeupharma.inscriptions_parcours TO service_role;
GRANT ALL ON jeupharma.progression_modules TO service_role;
GRANT ALL ON jeupharma.modeles_jeu TO service_role;
GRANT ALL ON jeupharma.tentatives_jeu TO service_role;

-- Admin CRUD sur tout le référentiel V2
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sources_contenu', 'versions_source', 'imports_source',
    'connaissances', 'connaissances_revisions', 'connaissances_alias',
    'parcours_apprentissage', 'modules_cours', 'publications_connaissances',
    'modeles_jeu'
  ]
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON jeupharma.%I TO authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON jeupharma.%I', t || '_admin', t);
    EXECUTE format(
      'CREATE POLICY %I ON jeupharma.%I FOR ALL TO authenticated USING (jeupharma.is_portail_admin()) WITH CHECK (jeupharma.is_portail_admin())',
      t || '_admin', t
    );
  END LOOP;
END $$;

-- Lecture limitée joueurs
DROP POLICY IF EXISTS sources_select ON jeupharma.sources_contenu;
CREATE POLICY sources_select ON jeupharma.sources_contenu
  FOR SELECT TO authenticated
  USING (jeupharma.has_jeupharma_access() AND actif);

DROP POLICY IF EXISTS versions_select ON jeupharma.versions_source;
CREATE POLICY versions_select ON jeupharma.versions_source
  FOR SELECT TO authenticated
  USING (jeupharma.has_jeupharma_access() AND statut = 'valide');

DROP POLICY IF EXISTS parcours_select ON jeupharma.parcours_apprentissage;
CREATE POLICY parcours_select ON jeupharma.parcours_apprentissage
  FOR SELECT TO authenticated
  USING (jeupharma.has_jeupharma_access() AND actif);

DROP POLICY IF EXISTS modules_select ON jeupharma.modules_cours;
CREATE POLICY modules_select ON jeupharma.modules_cours
  FOR SELECT TO authenticated
  USING (jeupharma.has_jeupharma_access() AND publie);

-- Publications : pas de SELECT direct joueur (passer par RPC)
DROP POLICY IF EXISTS publications_select_admin ON jeupharma.publications_connaissances;
-- déjà couvert par admin ALL

DROP POLICY IF EXISTS connaissances_select_admin ON jeupharma.connaissances;
-- admin ALL ; joueurs via RPC uniquement (pas de policy SELECT joueur)

DROP POLICY IF EXISTS inscriptions_own ON jeupharma.inscriptions_parcours;
CREATE POLICY inscriptions_own ON jeupharma.inscriptions_parcours
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR jeupharma.is_portail_admin())
  WITH CHECK (user_id = auth.uid() OR jeupharma.is_portail_admin());

DROP POLICY IF EXISTS progression_own ON jeupharma.progression_modules;
CREATE POLICY progression_own ON jeupharma.progression_modules
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR jeupharma.is_portail_admin())
  WITH CHECK (user_id = auth.uid() OR jeupharma.is_portail_admin());

DROP POLICY IF EXISTS modeles_jeu_select ON jeupharma.modeles_jeu;
CREATE POLICY modeles_jeu_select ON jeupharma.modeles_jeu
  FOR SELECT TO authenticated
  USING (
    jeupharma.has_jeupharma_access()
    AND actif
    AND NOT en_pause
  );

DROP POLICY IF EXISTS tentatives_own ON jeupharma.tentatives_jeu;
CREATE POLICY tentatives_own ON jeupharma.tentatives_jeu
  FOR ALL TO authenticated
  USING (utilisateur_id = auth.uid() OR jeupharma.is_portail_admin())
  WITH CHECK (utilisateur_id = auth.uid() OR jeupharma.is_portail_admin());
