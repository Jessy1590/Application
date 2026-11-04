-- =============================================================================
-- 098 : Parcours laboratoire jeux V3 (bac à sable admin)
-- Colonne est_laboratoire + seed jp_lab_jeux + isolation listings joueur
-- =============================================================================

ALTER TABLE jeupharma.parcours_apprentissage
  ADD COLUMN IF NOT EXISTS est_laboratoire boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN jeupharma.parcours_apprentissage.est_laboratoire IS
  'Parcours bac à sable admin (jeux V3). Invisible hub joueur / studio normal.';

-- RLS lecture : lab réservé admin
DROP POLICY IF EXISTS parcours_select ON jeupharma.parcours_apprentissage;
CREATE POLICY parcours_select ON jeupharma.parcours_apprentissage
  FOR SELECT TO authenticated
  USING (
    jeupharma.has_jeupharma_access()
    AND actif
    AND (NOT est_laboratoire OR jeupharma.is_portail_admin())
  );

-- Seed parcours + leçon
INSERT INTO jeupharma.parcours_apprentissage (
  code, libelle, description, mode_contenu, ordre, actif, est_laboratoire
) VALUES (
  'jp_lab_jeux',
  'Labo jeux V3',
  'Bac à sable admin — Test features.',
  'publications',
  999,
  true,
  true
)
ON CONFLICT (code) DO UPDATE SET
  libelle = EXCLUDED.libelle,
  description = EXCLUDED.description,
  mode_contenu = EXCLUDED.mode_contenu,
  actif = true,
  est_laboratoire = true,
  updated_at = now();

DO $$
DECLARE
  pid uuid;
  mid uuid;
BEGIN
  SELECT id INTO pid FROM jeupharma.parcours_apprentissage WHERE code = 'jp_lab_jeux';
  IF pid IS NULL THEN RAISE EXCEPTION 'parcours jp_lab_jeux manquant'; END IF;

  INSERT INTO jeupharma.modules_cours (
    parcours_id, code, titre, resume, objectifs, ordre, publie, est_groupe,
    version_publication, statut, criteres_json, niveau_min, niveau_max
  ) VALUES (
    pid, 'lecon_test_jeu', 'Leçon test de jeu',
    'Bac à sable pour valider les jeux V3.',
    '',
    1, true, false, 1, 'publie',
    '{"lecture": true, "logique": "et"}'::jsonb,
    1, 5
  )
  ON CONFLICT (parcours_id, code) DO UPDATE SET
    titre = EXCLUDED.titre,
    resume = EXCLUDED.resume,
    publie = true,
    statut = 'publie',
    niveau_min = 1,
    niveau_max = 5,
    updated_at = now()
  RETURNING id INTO mid;
END;
$$;

-- Inscriptions : exclure lab
CREATE OR REPLACE FUNCTION jeupharma.v2_lister_mes_inscriptions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', i.id,
      'parcours_id', i.parcours_id,
      'statut', i.statut,
      'actif', i.actif,
      'niveau_parcours', i.niveau_parcours,
      'demande_at', i.demande_at,
      'code', pa.code,
      'libelle', pa.libelle,
      'description', pa.description,
      'ordre', pa.ordre
    ) ORDER BY pa.ordre)
    FROM jeupharma.inscriptions_parcours i
    JOIN jeupharma.parcours_apprentissage pa ON pa.id = i.parcours_id
    WHERE i.user_id = auth.uid()
      AND pa.actif
      AND NOT pa.est_laboratoire
  ), '[]'::jsonb);
END;
$$;

-- Helper RPC admin : ids lab (parcours + leçon)
CREATE OR REPLACE FUNCTION jeupharma.lab_jeux_ids()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
STABLE
AS $$
DECLARE
  pid uuid;
  mid uuid;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  SELECT id INTO pid FROM jeupharma.parcours_apprentissage WHERE code = 'jp_lab_jeux';
  IF pid IS NULL THEN
    RETURN jsonb_build_object('parcours_id', null, 'module_id', null);
  END IF;
  SELECT id INTO mid FROM jeupharma.modules_cours
  WHERE parcours_id = pid AND code = 'lecon_test_jeu';
  RETURN jsonb_build_object('parcours_id', pid, 'module_id', mid);
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.lab_jeux_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.lab_jeux_ids() TO authenticated;
