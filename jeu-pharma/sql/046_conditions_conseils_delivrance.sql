-- =============================================================================
-- 046 : Conditions de prescription/délivrance + conseils de délivrance
-- Pattern classique entité (valeur / valeur_norm / actif) + jonction matrice_*
-- + vue v_medicaments_complet + RLS + fusionner_entites + CHECK connaissances.
-- Pas de hospitalier/complexe. 1 DCI = 1 fiche inchangé.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tables entités
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jeupharma.conditions_prescription_delivrance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valeur text NOT NULL,
  valeur_norm text NOT NULL,
  niveaux_connus text[] NOT NULL DEFAULT '{}'::text[],
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS conditions_prescription_delivrance_valeur_norm_actif_uidx
  ON jeupharma.conditions_prescription_delivrance (valeur_norm) WHERE actif;
CREATE INDEX IF NOT EXISTS conditions_prescription_delivrance_niveaux_gin
  ON jeupharma.conditions_prescription_delivrance USING gin (niveaux_connus);

CREATE TABLE IF NOT EXISTS jeupharma.conseils_delivrance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valeur text NOT NULL,
  valeur_norm text NOT NULL,
  niveaux_connus text[] NOT NULL DEFAULT '{}'::text[],
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS conseils_delivrance_valeur_norm_actif_uidx
  ON jeupharma.conseils_delivrance (valeur_norm) WHERE actif;
CREATE INDEX IF NOT EXISTS conseils_delivrance_niveaux_gin
  ON jeupharma.conseils_delivrance USING gin (niveaux_connus);

DROP TRIGGER IF EXISTS trg_conditions_prescription_delivrance_before_write
  ON jeupharma.conditions_prescription_delivrance;
CREATE TRIGGER trg_conditions_prescription_delivrance_before_write
  BEFORE INSERT OR UPDATE ON jeupharma.conditions_prescription_delivrance
  FOR EACH ROW EXECUTE FUNCTION jeupharma.trg_entite_before_write();
DROP TRIGGER IF EXISTS trg_conditions_prescription_delivrance_set_updated_at
  ON jeupharma.conditions_prescription_delivrance;
CREATE TRIGGER trg_conditions_prescription_delivrance_set_updated_at
  BEFORE UPDATE ON jeupharma.conditions_prescription_delivrance
  FOR EACH ROW EXECUTE FUNCTION jeupharma.set_updated_at();

DROP TRIGGER IF EXISTS trg_conseils_delivrance_before_write ON jeupharma.conseils_delivrance;
CREATE TRIGGER trg_conseils_delivrance_before_write
  BEFORE INSERT OR UPDATE ON jeupharma.conseils_delivrance
  FOR EACH ROW EXECUTE FUNCTION jeupharma.trg_entite_before_write();
DROP TRIGGER IF EXISTS trg_conseils_delivrance_set_updated_at ON jeupharma.conseils_delivrance;
CREATE TRIGGER trg_conseils_delivrance_set_updated_at
  BEFORE UPDATE ON jeupharma.conseils_delivrance
  FOR EACH ROW EXECUTE FUNCTION jeupharma.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Jonctions matrice
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jeupharma.matrice_conditions_prescription_delivrance (
  matrice_id uuid NOT NULL REFERENCES jeupharma.matrice_medicaments(id) ON DELETE CASCADE,
  condition_prescription_delivrance_id uuid NOT NULL
    REFERENCES jeupharma.conditions_prescription_delivrance(id) ON DELETE CASCADE,
  ordre int NOT NULL DEFAULT 0,
  PRIMARY KEY (matrice_id, condition_prescription_delivrance_id)
);

CREATE TABLE IF NOT EXISTS jeupharma.matrice_conseils_delivrance (
  matrice_id uuid NOT NULL REFERENCES jeupharma.matrice_medicaments(id) ON DELETE CASCADE,
  conseil_delivrance_id uuid NOT NULL
    REFERENCES jeupharma.conseils_delivrance(id) ON DELETE CASCADE,
  ordre int NOT NULL DEFAULT 0,
  PRIMARY KEY (matrice_id, conseil_delivrance_id)
);

-- ---------------------------------------------------------------------------
-- 3. RLS (même modèle que indications / précautions)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  entity_tables text[] := ARRAY[
    'conditions_prescription_delivrance',
    'conseils_delivrance'
  ];
  liaison_tables text[] := ARRAY[
    'matrice_conditions_prescription_delivrance',
    'matrice_conseils_delivrance'
  ];
BEGIN
  FOREACH t IN ARRAY entity_tables LOOP
    EXECUTE format('ALTER TABLE jeupharma.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON jeupharma.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON jeupharma.%I TO service_role', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON jeupharma.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON jeupharma.%I FOR SELECT TO authenticated
       USING (jeupharma.has_jeupharma_access())',
      t || '_select', t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON jeupharma.%I', t || '_admin', t);
    EXECUTE format(
      'CREATE POLICY %I ON jeupharma.%I FOR ALL TO authenticated
       USING (jeupharma.is_portail_admin())
       WITH CHECK (jeupharma.is_portail_admin())',
      t || '_admin', t
    );
  END LOOP;

  FOREACH t IN ARRAY liaison_tables LOOP
    EXECUTE format('ALTER TABLE jeupharma.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON jeupharma.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON jeupharma.%I TO service_role', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON jeupharma.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON jeupharma.%I FOR SELECT TO authenticated
       USING (jeupharma.has_jeupharma_access())',
      t || '_select', t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON jeupharma.%I', t || '_admin', t);
    EXECUTE format(
      'CREATE POLICY %I ON jeupharma.%I FOR ALL TO authenticated
       USING (jeupharma.is_portail_admin())
       WITH CHECK (jeupharma.is_portail_admin())',
      t || '_admin', t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Vue v_medicaments_complet (+ 2 agrégats jsonb)
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
  m.secteur_therapeutique_id,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', s.id, 'valeur', s.valeur, 'ordre', ms.ordre
    ) ORDER BY ms.ordre, s.valeur)
    FROM jeupharma.matrice_secteurs_therapeutiques ms
    JOIN jeupharma.secteurs_therapeutiques s ON s.id = ms.secteur_therapeutique_id
    WHERE ms.matrice_id = m.id
  ), '[]'::jsonb) AS secteur_therapeutique,
  m.classe_therapeutique_id,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', ct.id, 'valeur', ct.valeur, 'ordre', mct.ordre
    ) ORDER BY mct.ordre, ct.valeur)
    FROM jeupharma.matrice_classes_therapeutiques mct
    JOIN jeupharma.classes_therapeutiques ct ON ct.id = mct.classe_therapeutique_id
    WHERE mct.matrice_id = m.id
  ), '[]'::jsonb) AS classe_therapeutique,
  m.classe_pharmacologique_id,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', cp.id, 'valeur', cp.valeur, 'ordre', mcp.ordre
    ) ORDER BY mcp.ordre, cp.valeur)
    FROM jeupharma.matrice_classes_pharmacologiques mcp
    JOIN jeupharma.classes_pharmacologiques cp ON cp.id = mcp.classe_pharmacologique_id
    WHERE mcp.matrice_id = m.id
  ), '[]'::jsonb) AS classe_pharmacologique,
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
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', cpd.id, 'valeur', cpd.valeur, 'ordre', mcpd.ordre)
      ORDER BY mcpd.ordre, cpd.valeur)
    FROM jeupharma.matrice_conditions_prescription_delivrance mcpd
    JOIN jeupharma.conditions_prescription_delivrance cpd
      ON cpd.id = mcpd.condition_prescription_delivrance_id
    WHERE mcpd.matrice_id = m.id
  ), '[]'::jsonb) AS conditions_prescription_delivrance,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', cd.id, 'valeur', cd.valeur, 'ordre', mcd.ordre)
      ORDER BY mcd.ordre, cd.valeur)
    FROM jeupharma.matrice_conseils_delivrance mcd
    JOIN jeupharma.conseils_delivrance cd ON cd.id = mcd.conseil_delivrance_id
    WHERE mcd.matrice_id = m.id
  ), '[]'::jsonb) AS conseils_delivrance,
  m.fiche_validee
FROM jeupharma.matrice_medicaments m
LEFT JOIN jeupharma.dcis d ON d.id = m.dci_id
LEFT JOIN jeupharma.details_pharmacologie dp ON dp.id = m.detail_pharmacologie_id
LEFT JOIN jeupharma.posologies_generales pg ON pg.id = m.posologie_generale_id
LEFT JOIN jeupharma.grossesse_allaitement ga ON ga.id = m.grossesse_allaitement_id;

ALTER VIEW jeupharma.v_medicaments_complet SET (security_invoker = true);
GRANT SELECT ON jeupharma.v_medicaments_complet TO authenticated;
COMMENT ON VIEW jeupharma.v_medicaments_complet IS
  'Fiches DCI et agrégats (dont CPD + conseils délivrance). Accès joueur via pubs + ★.';

-- ---------------------------------------------------------------------------
-- 5. CHECK connaissances : autoriser les 2 nouveaux codes
-- ---------------------------------------------------------------------------
ALTER TABLE jeupharma.connaissances DROP CONSTRAINT IF EXISTS connaissances_champ_code_check;
ALTER TABLE jeupharma.connaissances ADD CONSTRAINT connaissances_champ_code_check CHECK (champ_code = ANY (ARRAY[
  'nom_commercial'::text, 'dci'::text, 'secteur_therapeutique'::text,
  'classe_therapeutique'::text, 'classe_pharmacologique'::text,
  'detail_pharmacologie'::text, 'indications'::text, 'contre_indications'::text,
  'effets_indesirables'::text, 'precautions_emploi'::text, 'interactions'::text,
  'surveillances'::text, 'posologie_generale'::text, 'grossesse_allaitement'::text,
  'voies_administration'::text,
  'conditions_prescription_delivrance'::text, 'conseils_delivrance'::text
]));

-- ---------------------------------------------------------------------------
-- 6. fusionner_entites : autoriser + jonctions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.fusionner_entites(
  p_table_name text,
  p_id_keep uuid,
  p_id_drop uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  allowed text[] := ARRAY[
    'noms_commerciaux', 'dcis', 'secteurs_therapeutiques', 'classes_therapeutiques',
    'classes_pharmacologiques', 'details_pharmacologie', 'indications',
    'contre_indications', 'effets_indesirables', 'precautions_emploi',
    'posologies_generales', 'interactions', 'surveillances',
    'grossesse_allaitement', 'voies_administration',
    'conditions_prescription_delivrance', 'conseils_delivrance'
  ];
  niveaux_union text[];
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF p_id_keep IS NULL OR p_id_drop IS NULL OR p_id_keep = p_id_drop THEN
    RAISE EXCEPTION 'ids invalides';
  END IF;
  IF NOT (p_table_name = ANY (allowed)) THEN
    RAISE EXCEPTION 'table non autorisée: %', p_table_name;
  END IF;

  EXECUTE format(
    'SELECT ARRAY(SELECT DISTINCT unnest(a.niveaux_connus || b.niveaux_connus)
      FROM jeupharma.%1$I a, jeupharma.%1$I b
      WHERE a.id = $1 AND b.id = $2)',
    p_table_name
  ) INTO niveaux_union USING p_id_keep, p_id_drop;

  EXECUTE format(
    'UPDATE jeupharma.%I SET niveaux_connus = $1, updated_at = now() WHERE id = $2',
    p_table_name
  ) USING coalesce(niveaux_union, '{}'::text[]), p_id_keep;

  IF p_table_name = 'noms_commerciaux' THEN
    UPDATE jeupharma.matrice_noms_commerciaux SET nom_commercial_id = p_id_keep
      WHERE nom_commercial_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_noms_commerciaux x
          WHERE x.matrice_id = matrice_noms_commerciaux.matrice_id
            AND x.nom_commercial_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_noms_commerciaux WHERE nom_commercial_id = p_id_drop;
  ELSIF p_table_name = 'dcis' THEN
    UPDATE jeupharma.matrice_medicaments SET dci_id = p_id_keep WHERE dci_id = p_id_drop;
  ELSIF p_table_name = 'secteurs_therapeutiques' THEN
    UPDATE jeupharma.matrice_medicaments SET secteur_therapeutique_id = p_id_keep
      WHERE secteur_therapeutique_id = p_id_drop;
    UPDATE jeupharma.matrice_secteurs_therapeutiques SET secteur_therapeutique_id = p_id_keep
      WHERE secteur_therapeutique_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_secteurs_therapeutiques x
          WHERE x.matrice_id = matrice_secteurs_therapeutiques.matrice_id
            AND x.secteur_therapeutique_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_secteurs_therapeutiques WHERE secteur_therapeutique_id = p_id_drop;
  ELSIF p_table_name = 'classes_therapeutiques' THEN
    UPDATE jeupharma.matrice_medicaments SET classe_therapeutique_id = p_id_keep
      WHERE classe_therapeutique_id = p_id_drop;
    UPDATE jeupharma.matrice_classes_therapeutiques SET classe_therapeutique_id = p_id_keep
      WHERE classe_therapeutique_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_classes_therapeutiques x
          WHERE x.matrice_id = matrice_classes_therapeutiques.matrice_id
            AND x.classe_therapeutique_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_classes_therapeutiques WHERE classe_therapeutique_id = p_id_drop;
  ELSIF p_table_name = 'classes_pharmacologiques' THEN
    UPDATE jeupharma.matrice_medicaments SET classe_pharmacologique_id = p_id_keep
      WHERE classe_pharmacologique_id = p_id_drop;
    UPDATE jeupharma.matrice_classes_pharmacologiques SET classe_pharmacologique_id = p_id_keep
      WHERE classe_pharmacologique_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_classes_pharmacologiques x
          WHERE x.matrice_id = matrice_classes_pharmacologiques.matrice_id
            AND x.classe_pharmacologique_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_classes_pharmacologiques WHERE classe_pharmacologique_id = p_id_drop;
  ELSIF p_table_name = 'details_pharmacologie' THEN
    UPDATE jeupharma.matrice_medicaments SET detail_pharmacologie_id = p_id_keep
      WHERE detail_pharmacologie_id = p_id_drop;
  ELSIF p_table_name = 'posologies_generales' THEN
    UPDATE jeupharma.matrice_medicaments SET posologie_generale_id = p_id_keep
      WHERE posologie_generale_id = p_id_drop;
  ELSIF p_table_name = 'grossesse_allaitement' THEN
    UPDATE jeupharma.matrice_medicaments SET grossesse_allaitement_id = p_id_keep
      WHERE grossesse_allaitement_id = p_id_drop;
  ELSIF p_table_name = 'indications' THEN
    UPDATE jeupharma.matrice_indications SET indication_id = p_id_keep
      WHERE indication_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_indications x
          WHERE x.matrice_id = matrice_indications.matrice_id AND x.indication_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_indications WHERE indication_id = p_id_drop;
  ELSIF p_table_name = 'contre_indications' THEN
    UPDATE jeupharma.matrice_contre_indications SET contre_indication_id = p_id_keep
      WHERE contre_indication_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_contre_indications x
          WHERE x.matrice_id = matrice_contre_indications.matrice_id
            AND x.contre_indication_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_contre_indications WHERE contre_indication_id = p_id_drop;
  ELSIF p_table_name = 'effets_indesirables' THEN
    UPDATE jeupharma.matrice_effets_indesirables SET effet_indesirable_id = p_id_keep
      WHERE effet_indesirable_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_effets_indesirables x
          WHERE x.matrice_id = matrice_effets_indesirables.matrice_id
            AND x.effet_indesirable_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_effets_indesirables WHERE effet_indesirable_id = p_id_drop;
  ELSIF p_table_name = 'precautions_emploi' THEN
    UPDATE jeupharma.matrice_precautions_emploi SET precaution_emploi_id = p_id_keep
      WHERE precaution_emploi_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_precautions_emploi x
          WHERE x.matrice_id = matrice_precautions_emploi.matrice_id
            AND x.precaution_emploi_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_precautions_emploi WHERE precaution_emploi_id = p_id_drop;
  ELSIF p_table_name = 'interactions' THEN
    UPDATE jeupharma.matrice_interactions SET interaction_id = p_id_keep
      WHERE interaction_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_interactions x
          WHERE x.matrice_id = matrice_interactions.matrice_id AND x.interaction_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_interactions WHERE interaction_id = p_id_drop;
  ELSIF p_table_name = 'surveillances' THEN
    UPDATE jeupharma.matrice_surveillances SET surveillance_id = p_id_keep
      WHERE surveillance_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_surveillances x
          WHERE x.matrice_id = matrice_surveillances.matrice_id AND x.surveillance_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_surveillances WHERE surveillance_id = p_id_drop;
  ELSIF p_table_name = 'voies_administration' THEN
    UPDATE jeupharma.matrice_voies_administration SET voie_administration_id = p_id_keep
      WHERE voie_administration_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_voies_administration x
          WHERE x.matrice_id = matrice_voies_administration.matrice_id
            AND x.voie_administration_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_voies_administration WHERE voie_administration_id = p_id_drop;
  ELSIF p_table_name = 'conditions_prescription_delivrance' THEN
    UPDATE jeupharma.matrice_conditions_prescription_delivrance
      SET condition_prescription_delivrance_id = p_id_keep
      WHERE condition_prescription_delivrance_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_conditions_prescription_delivrance x
          WHERE x.matrice_id = matrice_conditions_prescription_delivrance.matrice_id
            AND x.condition_prescription_delivrance_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_conditions_prescription_delivrance
      WHERE condition_prescription_delivrance_id = p_id_drop;
  ELSIF p_table_name = 'conseils_delivrance' THEN
    UPDATE jeupharma.matrice_conseils_delivrance SET conseil_delivrance_id = p_id_keep
      WHERE conseil_delivrance_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_conseils_delivrance x
          WHERE x.matrice_id = matrice_conseils_delivrance.matrice_id
            AND x.conseil_delivrance_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_conseils_delivrance WHERE conseil_delivrance_id = p_id_drop;
  END IF;

  EXECUTE format(
    'UPDATE jeupharma.%I SET actif = false, updated_at = now() WHERE id = $1',
    p_table_name
  ) USING p_id_drop;
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.fusionner_entites(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.fusionner_entites(text, uuid, uuid) TO authenticated;

COMMENT ON TABLE jeupharma.conditions_prescription_delivrance IS
  'CPD / conditions de prescription et délivrance (entité classique).';
COMMENT ON TABLE jeupharma.conseils_delivrance IS
  'Conseils de délivrance officinale (entité classique).';
