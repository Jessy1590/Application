-- =============================================================================
-- 041 : Purge profil pédagogique (apprenti/pharmacien) + hospitalier/complexe
-- Dépend de 040 (étoiles). À appliquer après 040.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Trigger entité : plus de validation contre jeupharma.niveaux
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.trg_entite_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
BEGIN
  NEW.valeur := trim(both FROM NEW.valeur);
  IF NEW.valeur IS NULL OR length(NEW.valeur) = 0 THEN
    RAISE EXCEPTION 'valeur obligatoire';
  END IF;
  NEW.valeur_norm := jeupharma.normaliser_valeur(NEW.valeur);
  IF NEW.niveaux_connus IS NULL THEN
    NEW.niveaux_connus := '{}'::text[];
  END IF;
  -- niveaux_connus conservé en colonnes legacy, non piloté par l’UI
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Drop helpers / RPC configuration niveaux
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS jeupharma.enregistrer_configuration_niveau(text, uuid[], uuid[], uuid[], text[]);
DROP FUNCTION IF EXISTS jeupharma._matrice_disponible_niveau(uuid, text);
DROP FUNCTION IF EXISTS jeupharma._niveau_champ_actif(text, text);
DROP FUNCTION IF EXISTS jeupharma.generer_et_geler_quiz(uuid);

-- ---------------------------------------------------------------------------
-- 3. Drop tables niveau_* puis colonnes FK puis table niveaux
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS jeupharma.niveau_champs CASCADE;
DROP TABLE IF EXISTS jeupharma.niveau_secteurs_therapeutiques CASCADE;
DROP TABLE IF EXISTS jeupharma.niveau_classes_therapeutiques CASCADE;
DROP TABLE IF EXISTS jeupharma.niveau_classes_pharmacologiques CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Policy matrice AVANT drop niveau_id (dépendance)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS matrice_select ON jeupharma.matrice_medicaments;
CREATE POLICY matrice_select ON jeupharma.matrice_medicaments
  FOR SELECT TO authenticated
  USING (
    jeupharma.has_jeupharma_access()
    AND (
      jeupharma.is_portail_admin()
      OR statut = 'publie'
    )
  );

ALTER TABLE jeupharma.profil_apprentissage DROP COLUMN IF EXISTS niveau_id;
ALTER TABLE jeupharma.parcours_apprentissage DROP COLUMN IF EXISTS niveau_lie;

DROP TABLE IF EXISTS jeupharma.niveaux CASCADE;

-- ---------------------------------------------------------------------------
-- 5. Vue sans hospitalier/complexe ni *_niveaux
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
  m.fiche_validee
FROM jeupharma.matrice_medicaments m
LEFT JOIN jeupharma.dcis d ON d.id = m.dci_id
LEFT JOIN jeupharma.details_pharmacologie dp ON dp.id = m.detail_pharmacologie_id
LEFT JOIN jeupharma.posologies_generales pg ON pg.id = m.posologie_generale_id
LEFT JOIN jeupharma.grossesse_allaitement ga ON ga.id = m.grossesse_allaitement_id;

ALTER VIEW jeupharma.v_medicaments_complet SET (security_invoker = true);
GRANT SELECT ON jeupharma.v_medicaments_complet TO authenticated;
COMMENT ON VIEW jeupharma.v_medicaments_complet IS
  'Fiches DCI et agrégats. Accès joueur via pubs + ★ parcours (pas hospitalier/complexe).';

-- ---------------------------------------------------------------------------
-- 6. DROP colonnes hospitalier / complexe
-- ---------------------------------------------------------------------------
ALTER TABLE jeupharma.matrice_medicaments DROP COLUMN IF EXISTS hospitalier;
ALTER TABLE jeupharma.matrice_medicaments DROP COLUMN IF EXISTS complexe;

-- ---------------------------------------------------------------------------
-- 7. Parcours pharmacien : mode déjà basculé en 040 ; neutre niveau_lie
-- ---------------------------------------------------------------------------
UPDATE jeupharma.parcours_apprentissage
SET mode_contenu = 'publications', updated_at = now()
WHERE mode_contenu IS DISTINCT FROM 'publications';
