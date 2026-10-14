-- 016 : configuration pédagogique centralisée par niveau.
-- Les niveaux ne sont plus portés par chaque valeur d'entité.
-- Les tables ATC *_staging sont supprimées après vérification que leurs libellés
-- utiles existent bien dans les référentiels métier existants.

CREATE TABLE IF NOT EXISTS jeupharma.niveau_secteurs_therapeutiques (
  niveau_id text NOT NULL REFERENCES jeupharma.niveaux(code) ON DELETE CASCADE,
  secteur_therapeutique_id uuid NOT NULL REFERENCES jeupharma.secteurs_therapeutiques(id) ON DELETE CASCADE,
  PRIMARY KEY (niveau_id, secteur_therapeutique_id)
);

CREATE TABLE IF NOT EXISTS jeupharma.niveau_classes_therapeutiques (
  niveau_id text NOT NULL REFERENCES jeupharma.niveaux(code) ON DELETE CASCADE,
  classe_therapeutique_id uuid NOT NULL REFERENCES jeupharma.classes_therapeutiques(id) ON DELETE CASCADE,
  PRIMARY KEY (niveau_id, classe_therapeutique_id)
);

CREATE TABLE IF NOT EXISTS jeupharma.niveau_classes_pharmacologiques (
  niveau_id text NOT NULL REFERENCES jeupharma.niveaux(code) ON DELETE CASCADE,
  classe_pharmacologique_id uuid NOT NULL REFERENCES jeupharma.classes_pharmacologiques(id) ON DELETE CASCADE,
  PRIMARY KEY (niveau_id, classe_pharmacologique_id)
);

CREATE TABLE IF NOT EXISTS jeupharma.niveau_champs (
  niveau_id text NOT NULL REFERENCES jeupharma.niveaux(code) ON DELETE CASCADE,
  champ_code text NOT NULL CHECK (champ_code IN (
    'nom_commercial', 'dci', 'secteur_therapeutique',
    'classe_therapeutique', 'classe_pharmacologique',
    'detail_pharmacologie', 'indications', 'contre_indications',
    'effets_indesirables', 'precautions_emploi', 'interactions',
    'surveillances'
  )),
  PRIMARY KEY (niveau_id, champ_code)
);

CREATE INDEX IF NOT EXISTS niveau_secteurs_entite_idx
  ON jeupharma.niveau_secteurs_therapeutiques (secteur_therapeutique_id);
CREATE INDEX IF NOT EXISTS niveau_classes_ther_entite_idx
  ON jeupharma.niveau_classes_therapeutiques (classe_therapeutique_id);
CREATE INDEX IF NOT EXISTS niveau_classes_pharma_entite_idx
  ON jeupharma.niveau_classes_pharmacologiques (classe_pharmacologique_id);

-- Reprise du comportement historique : tableau vide = disponible à tous.
INSERT INTO jeupharma.niveau_secteurs_therapeutiques (niveau_id, secteur_therapeutique_id)
SELECT n.code, e.id
FROM jeupharma.niveaux n
CROSS JOIN jeupharma.secteurs_therapeutiques e
WHERE e.actif
  AND NOT EXISTS (SELECT 1 FROM jeupharma.niveau_secteurs_therapeutiques)
  AND (coalesce(cardinality(e.niveaux_connus), 0) = 0 OR n.code = ANY(e.niveaux_connus))
ON CONFLICT DO NOTHING;

INSERT INTO jeupharma.niveau_classes_therapeutiques (niveau_id, classe_therapeutique_id)
SELECT n.code, e.id
FROM jeupharma.niveaux n
CROSS JOIN jeupharma.classes_therapeutiques e
WHERE e.actif
  AND NOT EXISTS (SELECT 1 FROM jeupharma.niveau_classes_therapeutiques)
  AND (coalesce(cardinality(e.niveaux_connus), 0) = 0 OR n.code = ANY(e.niveaux_connus))
ON CONFLICT DO NOTHING;

INSERT INTO jeupharma.niveau_classes_pharmacologiques (niveau_id, classe_pharmacologique_id)
SELECT n.code, e.id
FROM jeupharma.niveaux n
CROSS JOIN jeupharma.classes_pharmacologiques e
WHERE e.actif
  AND NOT EXISTS (SELECT 1 FROM jeupharma.niveau_classes_pharmacologiques)
  AND (coalesce(cardinality(e.niveaux_connus), 0) = 0 OR n.code = ANY(e.niveaux_connus))
ON CONFLICT DO NOTHING;

INSERT INTO jeupharma.niveau_champs (niveau_id, champ_code)
SELECT n.code, c.code
FROM jeupharma.niveaux n
CROSS JOIN (VALUES
  ('nom_commercial'), ('dci'), ('secteur_therapeutique'),
  ('classe_therapeutique'), ('classe_pharmacologique'),
  ('detail_pharmacologie'), ('indications'), ('contre_indications'),
  ('effets_indesirables'), ('precautions_emploi'), ('interactions'),
  ('surveillances')
) AS c(code)
WHERE NOT EXISTS (SELECT 1 FROM jeupharma.niveau_champs)
ON CONFLICT DO NOTHING;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'niveau_secteurs_therapeutiques',
    'niveau_classes_therapeutiques',
    'niveau_classes_pharmacologiques',
    'niveau_champs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE jeupharma.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON jeupharma.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON jeupharma.%I FOR SELECT TO authenticated USING (jeupharma.has_jeupharma_access())',
      t || '_select', t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON jeupharma.%I', t || '_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON jeupharma.%I FOR ALL TO authenticated USING (jeupharma.is_portail_admin()) WITH CHECK (jeupharma.is_portail_admin())',
      t || '_write', t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON jeupharma.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON jeupharma.%I TO service_role', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION jeupharma.enregistrer_configuration_niveau(
  p_niveau text,
  p_secteurs uuid[],
  p_classes_therapeutiques uuid[],
  p_classes_pharmacologiques uuid[],
  p_champs text[]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jeupharma.niveaux WHERE code = p_niveau) THEN
    RAISE EXCEPTION 'Niveau inconnu : %', p_niveau;
  END IF;

  DELETE FROM jeupharma.niveau_secteurs_therapeutiques WHERE niveau_id = p_niveau;
  DELETE FROM jeupharma.niveau_classes_therapeutiques WHERE niveau_id = p_niveau;
  DELETE FROM jeupharma.niveau_classes_pharmacologiques WHERE niveau_id = p_niveau;
  DELETE FROM jeupharma.niveau_champs WHERE niveau_id = p_niveau;

  INSERT INTO jeupharma.niveau_secteurs_therapeutiques
  SELECT p_niveau, e.id
  FROM jeupharma.secteurs_therapeutiques e
  WHERE e.actif AND e.id = ANY(coalesce(p_secteurs, ARRAY[]::uuid[]));

  INSERT INTO jeupharma.niveau_classes_therapeutiques
  SELECT p_niveau, e.id
  FROM jeupharma.classes_therapeutiques e
  WHERE e.actif AND e.id = ANY(coalesce(p_classes_therapeutiques, ARRAY[]::uuid[]));

  INSERT INTO jeupharma.niveau_classes_pharmacologiques
  SELECT p_niveau, e.id
  FROM jeupharma.classes_pharmacologiques e
  WHERE e.actif AND e.id = ANY(coalesce(p_classes_pharmacologiques, ARRAY[]::uuid[]));

  INSERT INTO jeupharma.niveau_champs
  SELECT p_niveau, x
  FROM unnest(coalesce(p_champs, ARRAY[]::text[])) x;
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.enregistrer_configuration_niveau(text, uuid[], uuid[], uuid[], text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.enregistrer_configuration_niveau(text, uuid[], uuid[], uuid[], text[]) TO authenticated;

CREATE OR REPLACE FUNCTION jeupharma._niveau_champ_actif(p_niveau text, p_champ text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
  SELECT p_niveau IS NULL OR EXISTS (
    SELECT 1 FROM jeupharma.niveau_champs
    WHERE niveau_id = p_niveau AND champ_code = p_champ
  );
$$;

CREATE OR REPLACE FUNCTION jeupharma._matrice_disponible_niveau(p_matrice_id uuid, p_niveau text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
  SELECT p_niveau IS NULL OR EXISTS (
    SELECT 1
    FROM jeupharma.matrice_medicaments m
    WHERE m.id = p_matrice_id
      AND (
        (p_niveau = 'hospitalier' AND m.hospitalier)
        OR (p_niveau <> 'hospitalier' AND NOT m.hospitalier)
      )
      AND (
        NOT EXISTS (SELECT 1 FROM jeupharma.matrice_secteurs_therapeutiques j WHERE j.matrice_id=m.id)
        OR EXISTS (
          SELECT 1 FROM jeupharma.matrice_secteurs_therapeutiques j
          JOIN jeupharma.niveau_secteurs_therapeutiques n
            ON n.secteur_therapeutique_id=j.secteur_therapeutique_id AND n.niveau_id=p_niveau
          WHERE j.matrice_id=m.id
        )
      )
      AND (
        NOT EXISTS (SELECT 1 FROM jeupharma.matrice_classes_therapeutiques j WHERE j.matrice_id=m.id)
        OR EXISTS (
          SELECT 1 FROM jeupharma.matrice_classes_therapeutiques j
          JOIN jeupharma.niveau_classes_therapeutiques n
            ON n.classe_therapeutique_id=j.classe_therapeutique_id AND n.niveau_id=p_niveau
          WHERE j.matrice_id=m.id
        )
      )
      AND (
        NOT EXISTS (SELECT 1 FROM jeupharma.matrice_classes_pharmacologiques j WHERE j.matrice_id=m.id)
        OR EXISTS (
          SELECT 1 FROM jeupharma.matrice_classes_pharmacologiques j
          JOIN jeupharma.niveau_classes_pharmacologiques n
            ON n.classe_pharmacologique_id=j.classe_pharmacologique_id AND n.niveau_id=p_niveau
          WHERE j.matrice_id=m.id
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION jeupharma._valeur_champ_matrice(
  p_matrice_id uuid, p_champ text, p_niveau text
) RETURNS TABLE(entite_id uuid, valeur text)
LANGUAGE plpgsql
STABLE
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
BEGIN
  IF NOT jeupharma._niveau_champ_actif(p_niveau, p_champ)
     OR NOT jeupharma._matrice_disponible_niveau(p_matrice_id, p_niveau) THEN
    RETURN;
  END IF;
  CASE p_champ
    WHEN 'nom_commercial' THEN RETURN QUERY
      SELECT e.id, e.valeur FROM jeupharma.matrice_noms_commerciaux j
      JOIN jeupharma.noms_commerciaux e ON e.id=j.nom_commercial_id AND e.actif
      WHERE j.matrice_id=p_matrice_id ORDER BY random() LIMIT 1;
    WHEN 'dci' THEN RETURN QUERY
      SELECT e.id, e.valeur FROM jeupharma.matrice_medicaments m
      JOIN jeupharma.dcis e ON e.id=m.dci_id AND e.actif WHERE m.id=p_matrice_id;
    WHEN 'secteur_therapeutique' THEN RETURN QUERY
      SELECT e.id, e.valeur FROM jeupharma.matrice_secteurs_therapeutiques j
      JOIN jeupharma.secteurs_therapeutiques e ON e.id=j.secteur_therapeutique_id AND e.actif
      JOIN jeupharma.niveau_secteurs_therapeutiques n ON n.secteur_therapeutique_id=e.id AND n.niveau_id=p_niveau
      WHERE j.matrice_id=p_matrice_id ORDER BY random() LIMIT 1;
    WHEN 'classe_therapeutique' THEN RETURN QUERY
      SELECT e.id, e.valeur FROM jeupharma.matrice_classes_therapeutiques j
      JOIN jeupharma.classes_therapeutiques e ON e.id=j.classe_therapeutique_id AND e.actif
      JOIN jeupharma.niveau_classes_therapeutiques n ON n.classe_therapeutique_id=e.id AND n.niveau_id=p_niveau
      WHERE j.matrice_id=p_matrice_id ORDER BY random() LIMIT 1;
    WHEN 'classe_pharmacologique' THEN RETURN QUERY
      SELECT e.id, e.valeur FROM jeupharma.matrice_classes_pharmacologiques j
      JOIN jeupharma.classes_pharmacologiques e ON e.id=j.classe_pharmacologique_id AND e.actif
      JOIN jeupharma.niveau_classes_pharmacologiques n ON n.classe_pharmacologique_id=e.id AND n.niveau_id=p_niveau
      WHERE j.matrice_id=p_matrice_id ORDER BY random() LIMIT 1;
    WHEN 'detail_pharmacologie' THEN RETURN QUERY
      SELECT e.id,e.valeur FROM jeupharma.matrice_medicaments m JOIN jeupharma.details_pharmacologie e ON e.id=m.detail_pharmacologie_id AND e.actif WHERE m.id=p_matrice_id;
    WHEN 'indications' THEN RETURN QUERY
      SELECT e.id,e.valeur FROM jeupharma.matrice_indications j JOIN jeupharma.indications e ON e.id=j.indication_id AND e.actif WHERE j.matrice_id=p_matrice_id ORDER BY random() LIMIT 1;
    WHEN 'contre_indications' THEN RETURN QUERY
      SELECT e.id,e.valeur FROM jeupharma.matrice_contre_indications j JOIN jeupharma.contre_indications e ON e.id=j.contre_indication_id AND e.actif WHERE j.matrice_id=p_matrice_id ORDER BY random() LIMIT 1;
    WHEN 'effets_indesirables' THEN RETURN QUERY
      SELECT e.id,e.valeur FROM jeupharma.matrice_effets_indesirables j JOIN jeupharma.effets_indesirables e ON e.id=j.effet_indesirable_id AND e.actif WHERE j.matrice_id=p_matrice_id ORDER BY random() LIMIT 1;
    WHEN 'precautions_emploi' THEN RETURN QUERY
      SELECT e.id,e.valeur FROM jeupharma.matrice_precautions_emploi j JOIN jeupharma.precautions_emploi e ON e.id=j.precaution_emploi_id AND e.actif WHERE j.matrice_id=p_matrice_id ORDER BY random() LIMIT 1;
    WHEN 'interactions' THEN RETURN QUERY
      SELECT e.id,e.valeur FROM jeupharma.matrice_interactions j JOIN jeupharma.interactions e ON e.id=j.interaction_id AND e.actif WHERE j.matrice_id=p_matrice_id ORDER BY random() LIMIT 1;
    WHEN 'surveillances' THEN RETURN QUERY
      SELECT e.id,e.valeur FROM jeupharma.matrice_surveillances j JOIN jeupharma.surveillances e ON e.id=j.surveillance_id AND e.actif WHERE j.matrice_id=p_matrice_id ORDER BY random() LIMIT 1;
    ELSE RETURN;
  END CASE;
END;
$$;

-- Le booléen de fiche devient l'unique source du caractère hospitalier.
UPDATE jeupharma.matrice_medicaments m
SET hospitalier = true
WHERE EXISTS (
  SELECT 1 FROM jeupharma.dcis d
  WHERE d.id=m.dci_id AND d.niveaux_connus = ARRAY['hospitalier']::text[]
) OR EXISTS (
  SELECT 1 FROM jeupharma.matrice_noms_commerciaux j
  JOIN jeupharma.noms_commerciaux n ON n.id=j.nom_commercial_id
  WHERE j.matrice_id=m.id AND n.niveaux_connus = ARRAY['hospitalier']::text[]
);

-- Vérifier que les libellés staging ont bien été matérialisés avant suppression.
DO $$
DECLARE v_missing boolean;
BEGIN
  IF to_regclass('jeupharma.atc_labels_staging') IS NOT NULL THEN
    EXECUTE $check$
      SELECT EXISTS (
        SELECT 1 FROM jeupharma.atc_labels_staging l
        WHERE NOT EXISTS (
          SELECT 1 FROM jeupharma.secteurs_therapeutiques e
          WHERE l.kind='secteur' AND e.valeur_norm=jeupharma.normaliser_valeur(regexp_replace(l.label, '^[A-Z][0-9A-Z]*\s*[-–]\s*', ''))
          UNION ALL
          SELECT 1 FROM jeupharma.classes_therapeutiques e
          WHERE l.kind='ct' AND e.valeur_norm=jeupharma.normaliser_valeur(regexp_replace(l.label, '^[A-Z][0-9A-Z]*\s*[-–]\s*', ''))
          UNION ALL
          SELECT 1 FROM jeupharma.classes_pharmacologiques e
          WHERE l.kind='cp' AND e.valeur_norm=jeupharma.normaliser_valeur(regexp_replace(l.label, '^[A-Z][0-9A-Z]*\s*[-–]\s*', ''))
        )
      )
    $check$ INTO v_missing;
    IF v_missing THEN
      RAISE EXCEPTION 'Suppression ATC staging annulée : libellés non migrés';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS jeupharma.atc_cp_extra_staging;
DROP TABLE IF EXISTS jeupharma.atc_cp_fix_staging;
DROP TABLE IF EXISTS jeupharma.atc_labels_staging;
DROP TABLE IF EXISTS jeupharma.atc_map_staging;
DROP FUNCTION IF EXISTS jeupharma.atc_upsert_entite(text, text);

ALTER VIEW jeupharma.v_medicaments_complet SET (security_invoker = true);

COMMENT ON TABLE jeupharma.niveau_champs IS 'Champs à connaître par niveau pédagogique, indépendants des rôles portail.';
COMMENT ON TABLE jeupharma.niveau_secteurs_therapeutiques IS 'Secteurs disponibles à l apprentissage par niveau.';
