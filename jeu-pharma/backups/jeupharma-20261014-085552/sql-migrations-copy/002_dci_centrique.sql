-- =============================================================================
-- Jeu Pharma — migration 002 : fiche centrée DCI + multi noms commerciaux
-- Projet remote : kpjflntnotftpzffjbud
-- Appliqué via MCP apply_migration (ne pas réappliquer sans check STATE.md).
-- =============================================================================
-- Modèle cible :
--   1 matrice_medicaments = 1 DCI (identité dci_id, unique hors archive)
--   N noms commerciaux via jeupharma.matrice_noms_commerciaux
--   Autres champs pédagogiques restent sur la matrice (partagés).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table liaison noms commerciaux
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS jeupharma.matrice_noms_commerciaux (
  matrice_id uuid NOT NULL REFERENCES jeupharma.matrice_medicaments(id) ON DELETE CASCADE,
  nom_commercial_id uuid NOT NULL REFERENCES jeupharma.noms_commerciaux(id) ON DELETE CASCADE,
  ordre int NOT NULL DEFAULT 0,
  PRIMARY KEY (matrice_id, nom_commercial_id)
);

CREATE INDEX IF NOT EXISTS matrice_noms_commerciaux_nom_idx
  ON jeupharma.matrice_noms_commerciaux (nom_commercial_id);

ALTER TABLE jeupharma.matrice_noms_commerciaux ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON jeupharma.matrice_noms_commerciaux TO authenticated;
GRANT ALL ON jeupharma.matrice_noms_commerciaux TO service_role;

DROP POLICY IF EXISTS matrice_noms_commerciaux_select ON jeupharma.matrice_noms_commerciaux;
CREATE POLICY matrice_noms_commerciaux_select ON jeupharma.matrice_noms_commerciaux
  FOR SELECT TO authenticated
  USING (jeupharma.has_jeupharma_access());

DROP POLICY IF EXISTS matrice_noms_commerciaux_admin ON jeupharma.matrice_noms_commerciaux;
CREATE POLICY matrice_noms_commerciaux_admin ON jeupharma.matrice_noms_commerciaux
  FOR ALL TO authenticated
  USING (jeupharma.is_portail_admin())
  WITH CHECK (jeupharma.is_portail_admin());

-- ---------------------------------------------------------------------------
-- 2. Migrer nom_commercial_id → liaison (toutes les lignes)
-- ---------------------------------------------------------------------------

INSERT INTO jeupharma.matrice_noms_commerciaux (matrice_id, nom_commercial_id, ordre)
SELECT m.id, m.nom_commercial_id, 0
FROM jeupharma.matrice_medicaments m
WHERE m.nom_commercial_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Fusion structurelle des doublons DCI (hors archive)
--    Keeper : publie > score remplissage > plus ancien created_at
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
  keeper uuid;
  dup uuid;
  fill_score int;
BEGIN
  FOR r IN
    SELECT dci_id
    FROM jeupharma.matrice_medicaments
    WHERE dci_id IS NOT NULL AND statut <> 'archive'
    GROUP BY dci_id
    HAVING COUNT(*) > 1
  LOOP
    -- Choisir le keeper
    SELECT m.id INTO keeper
    FROM jeupharma.matrice_medicaments m
    WHERE m.dci_id = r.dci_id AND m.statut <> 'archive'
    ORDER BY
      CASE WHEN m.statut = 'publie' THEN 0 ELSE 1 END,
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
      ) DESC,
      m.created_at ASC,
      m.id ASC
    LIMIT 1;

    FOR dup IN
      SELECT m.id
      FROM jeupharma.matrice_medicaments m
      WHERE m.dci_id = r.dci_id AND m.statut <> 'archive' AND m.id <> keeper
    LOOP
      -- Noms commerciaux
      INSERT INTO jeupharma.matrice_noms_commerciaux (matrice_id, nom_commercial_id, ordre)
      SELECT keeper, n.nom_commercial_id,
        COALESCE((SELECT MAX(ordre) FROM jeupharma.matrice_noms_commerciaux WHERE matrice_id = keeper), -1)
          + ROW_NUMBER() OVER (ORDER BY n.ordre, n.nom_commercial_id)
      FROM jeupharma.matrice_noms_commerciaux n
      WHERE n.matrice_id = dup
      ON CONFLICT DO NOTHING;

      -- Multi-liaisons (dédupliquer par entity id)
      INSERT INTO jeupharma.matrice_indications (matrice_id, indication_id, ordre)
      SELECT keeper, x.indication_id, x.ordre FROM jeupharma.matrice_indications x
      WHERE x.matrice_id = dup
      ON CONFLICT DO NOTHING;

      INSERT INTO jeupharma.matrice_contre_indications (matrice_id, contre_indication_id, ordre)
      SELECT keeper, x.contre_indication_id, x.ordre FROM jeupharma.matrice_contre_indications x
      WHERE x.matrice_id = dup
      ON CONFLICT DO NOTHING;

      INSERT INTO jeupharma.matrice_effets_indesirables (matrice_id, effet_indesirable_id, ordre)
      SELECT keeper, x.effet_indesirable_id, x.ordre FROM jeupharma.matrice_effets_indesirables x
      WHERE x.matrice_id = dup
      ON CONFLICT DO NOTHING;

      INSERT INTO jeupharma.matrice_precautions_emploi (matrice_id, precaution_emploi_id, ordre)
      SELECT keeper, x.precaution_emploi_id, x.ordre FROM jeupharma.matrice_precautions_emploi x
      WHERE x.matrice_id = dup
      ON CONFLICT DO NOTHING;

      INSERT INTO jeupharma.matrice_interactions (matrice_id, interaction_id, ordre)
      SELECT keeper, x.interaction_id, x.ordre FROM jeupharma.matrice_interactions x
      WHERE x.matrice_id = dup
      ON CONFLICT DO NOTHING;

      INSERT INTO jeupharma.matrice_surveillances (matrice_id, surveillance_id, ordre)
      SELECT keeper, x.surveillance_id, x.ordre FROM jeupharma.matrice_surveillances x
      WHERE x.matrice_id = dup
      ON CONFLICT DO NOTHING;

      INSERT INTO jeupharma.matrice_voies_administration (matrice_id, voie_administration_id, ordre)
      SELECT keeper, x.voie_administration_id, x.ordre FROM jeupharma.matrice_voies_administration x
      WHERE x.matrice_id = dup
      ON CONFLICT DO NOTHING;

      -- FKs singulières : remplir keeper seulement si NULL
      UPDATE jeupharma.matrice_medicaments k
      SET
        secteur_therapeutique_id = COALESCE(k.secteur_therapeutique_id, d.secteur_therapeutique_id),
        classe_therapeutique_id = COALESCE(k.classe_therapeutique_id, d.classe_therapeutique_id),
        classe_pharmacologique_id = COALESCE(k.classe_pharmacologique_id, d.classe_pharmacologique_id),
        detail_pharmacologie_id = COALESCE(k.detail_pharmacologie_id, d.detail_pharmacologie_id),
        posologie_generale_id = COALESCE(k.posologie_generale_id, d.posologie_generale_id),
        grossesse_allaitement_id = COALESCE(k.grossesse_allaitement_id, d.grossesse_allaitement_id)
      FROM jeupharma.matrice_medicaments d
      WHERE k.id = keeper AND d.id = dup;

      -- Soft-archive du doublon
      UPDATE jeupharma.matrice_medicaments
      SET statut = 'archive'
      WHERE id = dup;
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Drop colonne singulière nom_commercial_id
-- ---------------------------------------------------------------------------

ALTER TABLE jeupharma.matrice_medicaments
  DROP COLUMN IF EXISTS nom_commercial_id;

-- ---------------------------------------------------------------------------
-- 5. Index unique partiel : 1 fiche active par DCI
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS matrice_medicaments_dci_unique_actif
  ON jeupharma.matrice_medicaments (dci_id)
  WHERE dci_id IS NOT NULL AND statut <> 'archive';

-- ---------------------------------------------------------------------------
-- 6. Vue v_medicaments_complet
--    noms_commerciaux = array_agg {id,valeur,ordre}
--    nom_commercial = 1er nom (compat / déprécié)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW jeupharma.v_medicaments_complet AS
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
  ct.valeur AS classe_therapeutique,
  ct.niveaux_connus AS classe_therapeutique_niveaux,
  m.classe_pharmacologique_id,
  cp.valeur AS classe_pharmacologique,
  cp.niveaux_connus AS classe_pharmacologique_niveaux,
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
  -- Déprécié : premier nom commercial (compat UI / CSV)
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
  ), '[]'::jsonb) AS voies_administration
FROM jeupharma.matrice_medicaments m
LEFT JOIN jeupharma.dcis d ON d.id = m.dci_id
LEFT JOIN jeupharma.secteurs_therapeutiques s ON s.id = m.secteur_therapeutique_id
LEFT JOIN jeupharma.classes_therapeutiques ct ON ct.id = m.classe_therapeutique_id
LEFT JOIN jeupharma.classes_pharmacologiques cp ON cp.id = m.classe_pharmacologique_id
LEFT JOIN jeupharma.details_pharmacologie dp ON dp.id = m.detail_pharmacologie_id
LEFT JOIN jeupharma.posologies_generales pg ON pg.id = m.posologie_generale_id
LEFT JOIN jeupharma.grossesse_allaitement ga ON ga.id = m.grossesse_allaitement_id;

COMMENT ON VIEW jeupharma.v_medicaments_complet IS
  'Fiches DCI + agrégats multi (noms_commerciaux[]). nom_commercial = 1er nom (déprécié). Filtrer statut=publie côté joueur.';

GRANT SELECT ON jeupharma.v_medicaments_complet TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. RPC quiz : nom_commercial via liaison
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
      FROM jeupharma.matrice_medicaments m
      JOIN jeupharma.classes_therapeutiques ct ON ct.id = m.classe_therapeutique_id AND ct.actif
      WHERE m.id = p_matrice_id
        AND (p_niveau IS NULL OR p_niveau = ANY (ct.niveaux_connus));
    WHEN 'classe_pharmacologique' THEN
      RETURN QUERY
      SELECT cp.id, cp.valeur
      FROM jeupharma.matrice_medicaments m
      JOIN jeupharma.classes_pharmacologiques cp ON cp.id = m.classe_pharmacologique_id AND cp.actif
      WHERE m.id = p_matrice_id
        AND (p_niveau IS NULL OR p_niveau = ANY (cp.niveaux_connus));
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

CREATE OR REPLACE FUNCTION jeupharma.generer_et_geler_quiz(p_quizz_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  q jeupharma.quizz%ROWTYPE;
  cfg jsonb;
  champs text[];
  nb_q int;
  nb_prop int;
  questions jsonb := '[]'::jsonb;
  pool uuid[];
  mid uuid;
  champ text;
  bonne record;
  distracteurs jsonb;
  props jsonb;
  enonce text;
  dci_val text;
  nom_val text;
  i int;
  attempts int;
  has_eval boolean;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;

  SELECT * INTO q FROM jeupharma.quizz WHERE id = p_quizz_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz introuvable';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM jeupharma.quizz_reponses_utilisateur r
    WHERE r.quizz_id = p_quizz_id AND r.mode = 'evaluation'
  ) INTO has_eval;
  IF has_eval THEN
    RAISE EXCEPTION 'Snapshot verrouillé : des réponses évaluation existent déjà';
  END IF;

  cfg := coalesce(q.configuration_json, '{}'::jsonb);
  champs := coalesce(
    ARRAY(SELECT jsonb_array_elements_text(cfg->'champs_interroges')),
    ARRAY['classe_pharmacologique']::text[]
  );
  IF cardinality(champs) IS NULL OR cardinality(champs) = 0 THEN
    champs := ARRAY['classe_pharmacologique'];
  END IF;
  nb_q := coalesce((cfg->>'nb_questions')::int, 10);
  nb_prop := coalesce((cfg->>'nb_propositions')::int, 3);
  IF nb_q < 1 THEN nb_q := 10; END IF;
  IF nb_prop < 2 THEN nb_prop := 3; END IF;

  SELECT coalesce(array_agg(m.id), ARRAY[]::uuid[])
  INTO pool
  FROM jeupharma.matrice_medicaments m
  WHERE m.statut = 'publie'
    AND (q.secteur_therapeutique_id IS NULL OR m.secteur_therapeutique_id = q.secteur_therapeutique_id);

  IF coalesce(cardinality(pool), 0) = 0 THEN
    RAISE EXCEPTION 'Pas assez de médicaments publiés dans ce secteur pour % QCM', nb_q;
  END IF;

  i := 0;
  attempts := 0;
  WHILE i < nb_q AND attempts < nb_q * 20 LOOP
    attempts := attempts + 1;
    mid := pool[1 + floor(random() * cardinality(pool))::int];
    champ := champs[1 + floor(random() * cardinality(champs))::int];

    SELECT * INTO bonne FROM jeupharma._valeur_champ_matrice(mid, champ, q.niveau_cible) LIMIT 1;
    IF bonne.entite_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT d.valeur INTO dci_val
    FROM jeupharma.matrice_medicaments m
    LEFT JOIN jeupharma.dcis d ON d.id = m.dci_id
    WHERE m.id = mid;

    SELECT string_agg(nc.valeur, ', ' ORDER BY mnc.ordre, nc.valeur)
    INTO nom_val
    FROM jeupharma.matrice_noms_commerciaux mnc
    JOIN jeupharma.noms_commerciaux nc ON nc.id = mnc.nom_commercial_id
    WHERE mnc.matrice_id = mid;

    IF champ = 'dci' THEN
      enonce := format('Quelle est la DCI de %s ?', coalesce(nom_val, 'ce médicament'));
    ELSIF champ = 'nom_commercial' THEN
      enonce := format('Quel est le nom commercial de %s ?', coalesce(dci_val, 'cette DCI'));
    ELSE
      enonce := format(
        'Quelle est la %s de %s (%s) ?',
        jeupharma._libelle_champ(champ),
        coalesce(dci_val, '…'),
        coalesce(nom_val, '…')
      );
    END IF;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', x.entite_id,
      'valeur', x.valeur,
      'correct', false
    )), '[]'::jsonb)
    INTO distracteurs
    FROM jeupharma._distracteurs_champ(
      champ, bonne.entite_id, q.secteur_therapeutique_id, q.niveau_cible, nb_prop - 1
    ) x;

    IF jsonb_array_length(distracteurs) < (nb_prop - 1) THEN
      CONTINUE;
    END IF;

    props := distracteurs || jsonb_build_array(jsonb_build_object(
      'id', bonne.entite_id,
      'valeur', bonne.valeur,
      'correct', true
    ));

    SELECT jsonb_agg(e.elem ORDER BY random())
    INTO props
    FROM jsonb_array_elements(props) AS e(elem);

    questions := questions || jsonb_build_array(jsonb_build_object(
      'ordre', i + 1,
      'enonce', enonce,
      'matrice_id', mid,
      'champ_code', champ,
      'bonne_reponse_id', bonne.entite_id,
      'propositions', props
    ));
    i := i + 1;
  END LOOP;

  IF i < nb_q THEN
    RAISE EXCEPTION
      'Pas assez de médicaments publiés dans ce secteur pour % QCM (généré: %)',
      nb_q, i;
  END IF;

  UPDATE jeupharma.quizz
  SET snapshot_questions = questions
  WHERE id = p_quizz_id;

  RETURN questions;
END;
$$;
REVOKE ALL ON FUNCTION jeupharma.generer_et_geler_quiz(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.generer_et_geler_quiz(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Fusion entités : noms via liaison (plus de FK singulière)
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
    'grossesse_allaitement', 'voies_administration'
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
    -- Si keep et drop ont chacun une fiche active, fusionner vers la fiche keep
    -- puis pointer les matrices drop → keep (hors conflit unique)
    UPDATE jeupharma.matrice_medicaments SET dci_id = p_id_keep
      WHERE dci_id = p_id_drop
        AND statut = 'archive';
    -- Fiches non-archive : si keeper DCI a déjà une fiche, archiver les drop
    UPDATE jeupharma.matrice_medicaments m
    SET statut = 'archive'
    WHERE m.dci_id = p_id_drop
      AND m.statut <> 'archive'
      AND EXISTS (
        SELECT 1 FROM jeupharma.matrice_medicaments k
        WHERE k.dci_id = p_id_keep AND k.statut <> 'archive'
      );
    UPDATE jeupharma.matrice_medicaments SET dci_id = p_id_keep
      WHERE dci_id = p_id_drop AND statut <> 'archive'
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_medicaments k
          WHERE k.dci_id = p_id_keep AND k.statut <> 'archive'
        );
  ELSIF p_table_name = 'secteurs_therapeutiques' THEN
    UPDATE jeupharma.matrice_medicaments SET secteur_therapeutique_id = p_id_keep
      WHERE secteur_therapeutique_id = p_id_drop;
    UPDATE jeupharma.quizz SET secteur_therapeutique_id = p_id_keep
      WHERE secteur_therapeutique_id = p_id_drop;
    UPDATE jeupharma.parties_tableau_trous SET secteur_therapeutique_id = p_id_keep
      WHERE secteur_therapeutique_id = p_id_drop;
  ELSIF p_table_name = 'classes_therapeutiques' THEN
    UPDATE jeupharma.matrice_medicaments SET classe_therapeutique_id = p_id_keep
      WHERE classe_therapeutique_id = p_id_drop;
  ELSIF p_table_name = 'classes_pharmacologiques' THEN
    UPDATE jeupharma.matrice_medicaments SET classe_pharmacologique_id = p_id_keep
      WHERE classe_pharmacologique_id = p_id_drop;
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
  END IF;

  EXECUTE format(
    'UPDATE jeupharma.%I SET actif = false, updated_at = now() WHERE id = $1',
    p_table_name
  ) USING p_id_drop;
END;
$$;
REVOKE ALL ON FUNCTION jeupharma.fusionner_entites(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.fusionner_entites(text, uuid, uuid) TO authenticated;
