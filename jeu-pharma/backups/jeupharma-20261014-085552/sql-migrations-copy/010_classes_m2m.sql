-- Jeu Pharma — 010 : classes thérapeutiques et pharmacologiques en N-N
-- Projet remote : kpjflntnotftpzffjbud
--
-- La FK singulière (card 1) ne peut pas stocker plusieurs classes.
-- Jonctions sur le modèle matrice_indications. La FK matrice est conservée
-- et recopiée depuis la classe d'ordre 0 (compat filtres / quiz legacy).
-- Migration : chaque FK non nulle devient la ligne d'ordre 0.
-- Ne pas réappliquer sans vérifier l'état remote.

-- ---------------------------------------------------------------------------
-- 1. Jonctions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS jeupharma.matrice_classes_therapeutiques (
  matrice_id uuid NOT NULL REFERENCES jeupharma.matrice_medicaments(id) ON DELETE CASCADE,
  classe_therapeutique_id uuid NOT NULL REFERENCES jeupharma.classes_therapeutiques(id) ON DELETE CASCADE,
  ordre int NOT NULL DEFAULT 0,
  PRIMARY KEY (matrice_id, classe_therapeutique_id)
);

CREATE INDEX IF NOT EXISTS matrice_classes_therapeutiques_classe_idx
  ON jeupharma.matrice_classes_therapeutiques (classe_therapeutique_id);

CREATE TABLE IF NOT EXISTS jeupharma.matrice_classes_pharmacologiques (
  matrice_id uuid NOT NULL REFERENCES jeupharma.matrice_medicaments(id) ON DELETE CASCADE,
  classe_pharmacologique_id uuid NOT NULL REFERENCES jeupharma.classes_pharmacologiques(id) ON DELETE CASCADE,
  ordre int NOT NULL DEFAULT 0,
  PRIMARY KEY (matrice_id, classe_pharmacologique_id)
);

CREATE INDEX IF NOT EXISTS matrice_classes_pharmacologiques_classe_idx
  ON jeupharma.matrice_classes_pharmacologiques (classe_pharmacologique_id);

INSERT INTO jeupharma.matrice_classes_therapeutiques (matrice_id, classe_therapeutique_id, ordre)
SELECT m.id, m.classe_therapeutique_id, 0
FROM jeupharma.matrice_medicaments m
WHERE m.classe_therapeutique_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO jeupharma.matrice_classes_pharmacologiques (matrice_id, classe_pharmacologique_id, ordre)
SELECT m.id, m.classe_pharmacologique_id, 0
FROM jeupharma.matrice_medicaments m
WHERE m.classe_pharmacologique_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. FK = classe d'ordre minimum (ne remplace pas une FK déjà égale)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION jeupharma.trg_sync_classe_fk()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  mid uuid;
BEGIN
  mid := COALESCE(NEW.matrice_id, OLD.matrice_id);
  IF TG_TABLE_NAME = 'matrice_classes_therapeutiques' THEN
    UPDATE jeupharma.matrice_medicaments m
    SET classe_therapeutique_id = (
      SELECT j.classe_therapeutique_id
      FROM jeupharma.matrice_classes_therapeutiques j
      WHERE j.matrice_id = mid
      ORDER BY j.ordre, j.classe_therapeutique_id
      LIMIT 1
    )
    WHERE m.id = mid;
  ELSIF TG_TABLE_NAME = 'matrice_classes_pharmacologiques' THEN
    UPDATE jeupharma.matrice_medicaments m
    SET classe_pharmacologique_id = (
      SELECT j.classe_pharmacologique_id
      FROM jeupharma.matrice_classes_pharmacologiques j
      WHERE j.matrice_id = mid
      ORDER BY j.ordre, j.classe_pharmacologique_id
      LIMIT 1
    )
    WHERE m.id = mid;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_classe_th_fk ON jeupharma.matrice_classes_therapeutiques;
CREATE TRIGGER trg_sync_classe_th_fk
  AFTER INSERT OR UPDATE OR DELETE ON jeupharma.matrice_classes_therapeutiques
  FOR EACH ROW EXECUTE FUNCTION jeupharma.trg_sync_classe_fk();

DROP TRIGGER IF EXISTS trg_sync_classe_ph_fk ON jeupharma.matrice_classes_pharmacologiques;
CREATE TRIGGER trg_sync_classe_ph_fk
  AFTER INSERT OR UPDATE OR DELETE ON jeupharma.matrice_classes_pharmacologiques
  FOR EACH ROW EXECUTE FUNCTION jeupharma.trg_sync_classe_fk();

-- ---------------------------------------------------------------------------
-- 3. RLS (même modèle que matrice_indications)
-- ---------------------------------------------------------------------------

ALTER TABLE jeupharma.matrice_classes_therapeutiques ENABLE ROW LEVEL SECURITY;
ALTER TABLE jeupharma.matrice_classes_pharmacologiques ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON jeupharma.matrice_classes_therapeutiques TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON jeupharma.matrice_classes_pharmacologiques TO authenticated;
GRANT ALL ON jeupharma.matrice_classes_therapeutiques TO service_role;
GRANT ALL ON jeupharma.matrice_classes_pharmacologiques TO service_role;

DROP POLICY IF EXISTS matrice_classes_therapeutiques_select ON jeupharma.matrice_classes_therapeutiques;
CREATE POLICY matrice_classes_therapeutiques_select
  ON jeupharma.matrice_classes_therapeutiques
  FOR SELECT TO authenticated
  USING (jeupharma.has_jeupharma_access());

DROP POLICY IF EXISTS matrice_classes_therapeutiques_admin ON jeupharma.matrice_classes_therapeutiques;
CREATE POLICY matrice_classes_therapeutiques_admin
  ON jeupharma.matrice_classes_therapeutiques
  FOR ALL TO authenticated
  USING (jeupharma.is_portail_admin())
  WITH CHECK (jeupharma.is_portail_admin());

DROP POLICY IF EXISTS matrice_classes_pharmacologiques_select ON jeupharma.matrice_classes_pharmacologiques;
CREATE POLICY matrice_classes_pharmacologiques_select
  ON jeupharma.matrice_classes_pharmacologiques
  FOR SELECT TO authenticated
  USING (jeupharma.has_jeupharma_access());

DROP POLICY IF EXISTS matrice_classes_pharmacologiques_admin ON jeupharma.matrice_classes_pharmacologiques;
CREATE POLICY matrice_classes_pharmacologiques_admin
  ON jeupharma.matrice_classes_pharmacologiques
  FOR ALL TO authenticated
  USING (jeupharma.is_portail_admin())
  WITH CHECK (jeupharma.is_portail_admin());

-- ---------------------------------------------------------------------------
-- 4. Vue : classes en jsonb[] ; FK et niveaux du 1er rang conservés
--    DROP requis : le type texte ne peut pas devenir jsonb via OR REPLACE.
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS jeupharma.v_medicaments_complet;

CREATE VIEW jeupharma.v_medicaments_complet AS
SELECT
  m.id,
  m.statut,
  m.created_at,
  m.updated_at,
  m.updated_by,
  m.dci_id,
  d.valeur AS dci,
  d.niveaux_connus AS dci_niveaux,
  m.secteur_therapeutique_id,
  s.valeur AS secteur_therapeutique,
  s.niveaux_connus AS secteur_niveaux,
  m.classe_therapeutique_id,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', ct.id, 'valeur', ct.valeur, 'ordre', mct.ordre, 'niveaux_connus', ct.niveaux_connus
    ) ORDER BY mct.ordre, ct.valeur)
    FROM jeupharma.matrice_classes_therapeutiques mct
    JOIN jeupharma.classes_therapeutiques ct ON ct.id = mct.classe_therapeutique_id
    WHERE mct.matrice_id = m.id
  ), '[]'::jsonb) AS classe_therapeutique,
  (
    SELECT ct.niveaux_connus
    FROM jeupharma.matrice_classes_therapeutiques mct
    JOIN jeupharma.classes_therapeutiques ct ON ct.id = mct.classe_therapeutique_id
    WHERE mct.matrice_id = m.id
    ORDER BY mct.ordre, ct.valeur
    LIMIT 1
  ) AS classe_therapeutique_niveaux,
  m.classe_pharmacologique_id,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', cp.id, 'valeur', cp.valeur, 'ordre', mcp.ordre, 'niveaux_connus', cp.niveaux_connus
    ) ORDER BY mcp.ordre, cp.valeur)
    FROM jeupharma.matrice_classes_pharmacologiques mcp
    JOIN jeupharma.classes_pharmacologiques cp ON cp.id = mcp.classe_pharmacologique_id
    WHERE mcp.matrice_id = m.id
  ), '[]'::jsonb) AS classe_pharmacologique,
  (
    SELECT cp.niveaux_connus
    FROM jeupharma.matrice_classes_pharmacologiques mcp
    JOIN jeupharma.classes_pharmacologiques cp ON cp.id = mcp.classe_pharmacologique_id
    WHERE mcp.matrice_id = m.id
    ORDER BY mcp.ordre, cp.valeur
    LIMIT 1
  ) AS classe_pharmacologique_niveaux,
  m.detail_pharmacologie_id,
  dp.valeur AS detail_pharmacologie,
  m.posologie_generale_id,
  pg.valeur AS posologie_generale,
  m.grossesse_allaitement_id,
  ga.valeur AS grossesse_allaitement,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', nc.id, 'valeur', nc.valeur, 'ordre', mnc.ordre)
      ORDER BY mnc.ordre, nc.valeur)
    FROM jeupharma.matrice_noms_commerciaux mnc
    JOIN jeupharma.noms_commerciaux nc ON nc.id = mnc.nom_commercial_id
    WHERE mnc.matrice_id = m.id
  ), '[]'::jsonb) AS noms_commerciaux,
  (
    SELECT nc.valeur
    FROM jeupharma.matrice_noms_commerciaux mnc
    JOIN jeupharma.noms_commerciaux nc ON nc.id = mnc.nom_commercial_id
    WHERE mnc.matrice_id = m.id
    ORDER BY mnc.ordre, nc.valeur
    LIMIT 1
  ) AS nom_commercial,
  (
    SELECT nc.niveaux_connus
    FROM jeupharma.matrice_noms_commerciaux mnc
    JOIN jeupharma.noms_commerciaux nc ON nc.id = mnc.nom_commercial_id
    WHERE mnc.matrice_id = m.id
    ORDER BY mnc.ordre, nc.valeur
    LIMIT 1
  ) AS nom_commercial_niveaux,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', i.id, 'valeur', i.valeur, 'ordre', mi.ordre)
      ORDER BY mi.ordre, i.valeur)
    FROM jeupharma.matrice_indications mi
    JOIN jeupharma.indications i ON i.id = mi.indication_id
    WHERE mi.matrice_id = m.id
  ), '[]'::jsonb) AS indications,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', ci.id, 'valeur', ci.valeur, 'ordre', mci.ordre)
      ORDER BY mci.ordre, ci.valeur)
    FROM jeupharma.matrice_contre_indications mci
    JOIN jeupharma.contre_indications ci ON ci.id = mci.contre_indication_id
    WHERE mci.matrice_id = m.id
  ), '[]'::jsonb) AS contre_indications,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', ei.id, 'valeur', ei.valeur, 'ordre', mei.ordre)
      ORDER BY mei.ordre, ei.valeur)
    FROM jeupharma.matrice_effets_indesirables mei
    JOIN jeupharma.effets_indesirables ei ON ei.id = mei.effet_indesirable_id
    WHERE mei.matrice_id = m.id
  ), '[]'::jsonb) AS effets_indesirables,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', pe.id, 'valeur', pe.valeur, 'ordre', mpe.ordre)
      ORDER BY mpe.ordre, pe.valeur)
    FROM jeupharma.matrice_precautions_emploi mpe
    JOIN jeupharma.precautions_emploi pe ON pe.id = mpe.precaution_emploi_id
    WHERE mpe.matrice_id = m.id
  ), '[]'::jsonb) AS precautions_emploi,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', ix.id, 'valeur', ix.valeur, 'ordre', mix.ordre)
      ORDER BY mix.ordre, ix.valeur)
    FROM jeupharma.matrice_interactions mix
    JOIN jeupharma.interactions ix ON ix.id = mix.interaction_id
    WHERE mix.matrice_id = m.id
  ), '[]'::jsonb) AS interactions,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', sv.id, 'valeur', sv.valeur, 'ordre', msv.ordre)
      ORDER BY msv.ordre, sv.valeur)
    FROM jeupharma.matrice_surveillances msv
    JOIN jeupharma.surveillances sv ON sv.id = msv.surveillance_id
    WHERE msv.matrice_id = m.id
  ), '[]'::jsonb) AS surveillances,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', va.id, 'valeur', va.valeur, 'ordre', mva.ordre)
      ORDER BY mva.ordre, va.valeur)
    FROM jeupharma.matrice_voies_administration mva
    JOIN jeupharma.voies_administration va ON va.id = mva.voie_administration_id
    WHERE mva.matrice_id = m.id
  ), '[]'::jsonb) AS voies_administration,
  m.hospitalier
FROM jeupharma.matrice_medicaments m
LEFT JOIN jeupharma.dcis d ON d.id = m.dci_id
LEFT JOIN jeupharma.secteurs_therapeutiques s ON s.id = m.secteur_therapeutique_id
LEFT JOIN jeupharma.details_pharmacologie dp ON dp.id = m.detail_pharmacologie_id
LEFT JOIN jeupharma.posologies_generales pg ON pg.id = m.posologie_generale_id
LEFT JOIN jeupharma.grossesse_allaitement ga ON ga.id = m.grossesse_allaitement_id;

COMMENT ON VIEW jeupharma.v_medicaments_complet IS
  'Fiches DCI + agrégats multi. classe_therapeutique et classe_pharmacologique = jsonb[]. '
  'FK *_id = classe d''ordre 0. hospitalier = niveau pédagogique hospitalier. Filtrer statut=publie côté joueur.';

GRANT SELECT, INSERT, UPDATE, DELETE ON jeupharma.v_medicaments_complet TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Quiz : une classe au hasard parmi la jonction
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION jeupharma._valeur_champ_matrice(
  p_matrice_id uuid,
  p_champ text,
  p_niveau text
)
RETURNS TABLE (entite_id uuid, valeur text)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  CASE p_champ
    WHEN 'nom_commercial' THEN
      RETURN QUERY
      SELECT nc.id, nc.valeur
      FROM jeupharma.matrice_noms_commerciaux mnc
      JOIN jeupharma.noms_commerciaux nc ON nc.id = mnc.nom_commercial_id AND nc.actif
      WHERE mnc.matrice_id = p_matrice_id
        AND (p_niveau IS NULL OR p_niveau = ANY (nc.niveaux_connus))
      ORDER BY random()
      LIMIT 1;
    WHEN 'dci' THEN
      RETURN QUERY
      SELECT d.id, d.valeur
      FROM jeupharma.matrice_medicaments m
      JOIN jeupharma.dcis d ON d.id = m.dci_id AND d.actif
      WHERE m.id = p_matrice_id
        AND (p_niveau IS NULL OR p_niveau = ANY (d.niveaux_connus));
    WHEN 'secteur_therapeutique' THEN
      RETURN QUERY
      SELECT s.id, s.valeur
      FROM jeupharma.matrice_medicaments m
      JOIN jeupharma.secteurs_therapeutiques s ON s.id = m.secteur_therapeutique_id AND s.actif
      WHERE m.id = p_matrice_id
        AND (p_niveau IS NULL OR p_niveau = ANY (s.niveaux_connus));
    WHEN 'classe_therapeutique' THEN
      RETURN QUERY
      SELECT ct.id, ct.valeur
      FROM jeupharma.matrice_classes_therapeutiques mct
      JOIN jeupharma.classes_therapeutiques ct ON ct.id = mct.classe_therapeutique_id AND ct.actif
      WHERE mct.matrice_id = p_matrice_id
        AND (p_niveau IS NULL OR p_niveau = ANY (ct.niveaux_connus))
      ORDER BY random()
      LIMIT 1;
    WHEN 'classe_pharmacologique' THEN
      RETURN QUERY
      SELECT cp.id, cp.valeur
      FROM jeupharma.matrice_classes_pharmacologiques mcp
      JOIN jeupharma.classes_pharmacologiques cp ON cp.id = mcp.classe_pharmacologique_id AND cp.actif
      WHERE mcp.matrice_id = p_matrice_id
        AND (p_niveau IS NULL OR p_niveau = ANY (cp.niveaux_connus))
      ORDER BY random()
      LIMIT 1;
    WHEN 'detail_pharmacologie' THEN
      RETURN QUERY
      SELECT dp.id, dp.valeur
      FROM jeupharma.matrice_medicaments m
      JOIN jeupharma.details_pharmacologie dp ON dp.id = m.detail_pharmacologie_id AND dp.actif
      WHERE m.id = p_matrice_id
        AND (p_niveau IS NULL OR p_niveau = ANY (dp.niveaux_connus));
    WHEN 'posologie_generale' THEN
      RETURN QUERY
      SELECT pg.id, pg.valeur
      FROM jeupharma.matrice_medicaments m
      JOIN jeupharma.posologies_generales pg ON pg.id = m.posologie_generale_id AND pg.actif
      WHERE m.id = p_matrice_id
        AND (p_niveau IS NULL OR p_niveau = ANY (pg.niveaux_connus));
    WHEN 'grossesse_allaitement' THEN
      RETURN QUERY
      SELECT ga.id, ga.valeur
      FROM jeupharma.matrice_medicaments m
      JOIN jeupharma.grossesse_allaitement ga ON ga.id = m.grossesse_allaitement_id AND ga.actif
      WHERE m.id = p_matrice_id
        AND (p_niveau IS NULL OR p_niveau = ANY (ga.niveaux_connus));
    WHEN 'indications' THEN
      RETURN QUERY
      SELECT i.id, i.valeur
      FROM jeupharma.matrice_indications mi
      JOIN jeupharma.indications i ON i.id = mi.indication_id AND i.actif
      WHERE mi.matrice_id = p_matrice_id
        AND (p_niveau IS NULL OR p_niveau = ANY (i.niveaux_connus))
      ORDER BY random()
      LIMIT 1;
    WHEN 'contre_indications' THEN
      RETURN QUERY
      SELECT ci.id, ci.valeur
      FROM jeupharma.matrice_contre_indications mci
      JOIN jeupharma.contre_indications ci ON ci.id = mci.contre_indication_id AND ci.actif
      WHERE mci.matrice_id = p_matrice_id
        AND (p_niveau IS NULL OR p_niveau = ANY (ci.niveaux_connus))
      ORDER BY random()
      LIMIT 1;
    WHEN 'effets_indesirables' THEN
      RETURN QUERY
      SELECT ei.id, ei.valeur
      FROM jeupharma.matrice_effets_indesirables mei
      JOIN jeupharma.effets_indesirables ei ON ei.id = mei.effet_indesirable_id AND ei.actif
      WHERE mei.matrice_id = p_matrice_id
        AND (p_niveau IS NULL OR p_niveau = ANY (ei.niveaux_connus))
      ORDER BY random()
      LIMIT 1;
    WHEN 'precautions_emploi' THEN
      RETURN QUERY
      SELECT pe.id, pe.valeur
      FROM jeupharma.matrice_precautions_emploi mpe
      JOIN jeupharma.precautions_emploi pe ON pe.id = mpe.precaution_emploi_id AND pe.actif
      WHERE mpe.matrice_id = p_matrice_id
        AND (p_niveau IS NULL OR p_niveau = ANY (pe.niveaux_connus))
      ORDER BY random()
      LIMIT 1;
    WHEN 'interactions' THEN
      RETURN QUERY
      SELECT ix.id, ix.valeur
      FROM jeupharma.matrice_interactions mix
      JOIN jeupharma.interactions ix ON ix.id = mix.interaction_id AND ix.actif
      WHERE mix.matrice_id = p_matrice_id
        AND (p_niveau IS NULL OR p_niveau = ANY (ix.niveaux_connus))
      ORDER BY random()
      LIMIT 1;
    WHEN 'surveillances' THEN
      RETURN QUERY
      SELECT sv.id, sv.valeur
      FROM jeupharma.matrice_surveillances msv
      JOIN jeupharma.surveillances sv ON sv.id = msv.surveillance_id AND sv.actif
      WHERE msv.matrice_id = p_matrice_id
        AND (p_niveau IS NULL OR p_niveau = ANY (sv.niveaux_connus))
      ORDER BY random()
      LIMIT 1;
    WHEN 'voies_administration' THEN
      RETURN QUERY
      SELECT va.id, va.valeur
      FROM jeupharma.matrice_voies_administration mva
      JOIN jeupharma.voies_administration va ON va.id = mva.voie_administration_id AND va.actif
      WHERE mva.matrice_id = p_matrice_id
        AND (p_niveau IS NULL OR p_niveau = ANY (va.niveaux_connus))
      ORDER BY random()
      LIMIT 1;
    ELSE
      RETURN;
  END CASE;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Fusion : réécrire aussi les jonctions de classes
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  src text;
  n int;
BEGIN
  SELECT pg_get_functiondef('jeupharma.fusionner_entites(text,uuid,uuid)'::regprocedure) INTO src;

  src := regexp_replace(
    src,
    'ELSIF p_table_name = ''classes_therapeutiques'' THEN\s+UPDATE jeupharma\.matrice_medicaments SET classe_therapeutique_id = p_id_keep\s+WHERE classe_therapeutique_id = p_id_drop;',
    $body$ELSIF p_table_name = 'classes_therapeutiques' THEN
    UPDATE jeupharma.matrice_classes_therapeutiques SET classe_therapeutique_id = p_id_keep
      WHERE classe_therapeutique_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_classes_therapeutiques x
          WHERE x.matrice_id = matrice_classes_therapeutiques.matrice_id
            AND x.classe_therapeutique_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_classes_therapeutiques WHERE classe_therapeutique_id = p_id_drop;
    UPDATE jeupharma.matrice_medicaments SET classe_therapeutique_id = p_id_keep
      WHERE classe_therapeutique_id = p_id_drop;$body$,
    'n'
  );

  src := regexp_replace(
    src,
    'ELSIF p_table_name = ''classes_pharmacologiques'' THEN\s+UPDATE jeupharma\.matrice_medicaments SET classe_pharmacologique_id = p_id_keep\s+WHERE classe_pharmacologique_id = p_id_drop;',
    $body$ELSIF p_table_name = 'classes_pharmacologiques' THEN
    UPDATE jeupharma.matrice_classes_pharmacologiques SET classe_pharmacologique_id = p_id_keep
      WHERE classe_pharmacologique_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_classes_pharmacologiques x
          WHERE x.matrice_id = matrice_classes_pharmacologiques.matrice_id
            AND x.classe_pharmacologique_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_classes_pharmacologiques WHERE classe_pharmacologique_id = p_id_drop;
    UPDATE jeupharma.matrice_medicaments SET classe_pharmacologique_id = p_id_keep
      WHERE classe_pharmacologique_id = p_id_drop;$body$,
    'n'
  );

  IF src NOT LIKE '%matrice_classes_therapeutiques%' OR src NOT LIKE '%matrice_classes_pharmacologiques%' THEN
    RAISE EXCEPTION 'patch fusionner_entites non appliqué';
  END IF;

  EXECUTE src;
  GET DIAGNOSTICS n = ROW_COUNT;
END $$;
