-- 021 — Schéma bdm (BDPM officielle) — reset complet
-- Source : https://base-donnees-publique.medicaments.gouv.fr/telechargement
-- Licence Ouverte — mention de la source obligatoire.

DROP SCHEMA IF EXISTS bdm CASCADE;
CREATE SCHEMA bdm;
GRANT USAGE ON SCHEMA bdm TO authenticated, anon, service_role;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION bdm.immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT translate(
    lower(coalesce($1, '')),
    'àáâãäåāăąçćĉċčďđèéêëēĕėęěĝğġģĥħìíîïĩīĭįıĵķĺļľŀłñńņňŉŋòóôõöøōŏőŕŗřśŝşšţťŧùúûüũūŭůűųŵýÿŷźżžÀÁÂÃÄÅĀĂĄÇĆĈĊČĎĐÈÉÊËĒĔĖĘĚĜĞĠĢĤĦÌÍÎÏĨĪĬĮİĴĶĹĻĽĿŁÑŃŅŇŊÒÓÔÕÖØŌŎŐŔŖŘŚŜŞŠŢŤŦÙÚÛÜŨŪŬŮŰŲŴÝŸŶŹŻŽ',
    'aaaaaaaaacccccddeeeeeeeegggghhiiiiiiiiijklllllnnnnnooooooooorrrsssstttuuuuuuuuuuwyyyzzzaaaaaaaaacccccddeeeeeeeegggghhiiiiiiiiijklllllnnnnnooooooooorrrsssstttuuuuuuuuuuwyyyzzz'
  );
$$;

CREATE TABLE bdm.specialites (
  cis text PRIMARY KEY,
  denomination text NOT NULL,
  forme_pharmaceutique text,
  voies_administration text,
  statut_amm text,
  type_procedure text,
  etat_commercialisation text,
  date_amm date,
  statut_bdm text,
  numero_autorisation_europeenne text,
  titulaires text,
  surveillance_renforcee boolean DEFAULT false,
  denomination_norm text GENERATED ALWAYS AS (
    bdm.immutable_unaccent(denomination)
  ) STORED
);

CREATE TABLE bdm.presentations (
  id bigserial PRIMARY KEY,
  cis text NOT NULL REFERENCES bdm.specialites(cis) ON DELETE CASCADE,
  cip7 text,
  libelle text,
  statut_administratif text,
  etat_commercialisation text,
  date_declaration_commercialisation date,
  cip13 text,
  agrement_collectivites text,
  taux_remboursement text,
  prix_euro numeric(12, 4),
  prix_hors_honoraire numeric(12, 4),
  honoraire numeric(12, 4),
  indications_remboursement text
);

CREATE UNIQUE INDEX presentations_cip13_uidx ON bdm.presentations (cip13) WHERE cip13 IS NOT NULL;
CREATE INDEX presentations_cip7_idx ON bdm.presentations (cip7);
CREATE INDEX presentations_cis_idx ON bdm.presentations (cis);

CREATE TABLE bdm.compositions (
  id bigserial PRIMARY KEY,
  cis text NOT NULL REFERENCES bdm.specialites(cis) ON DELETE CASCADE,
  designation_element_pharmaceutique text,
  code_substance text,
  denomination_substance text,
  dosage text,
  reference_dosage text,
  nature_composant text,
  numero_lien integer,
  substance_norm text GENERATED ALWAYS AS (
    bdm.immutable_unaccent(denomination_substance)
  ) STORED
);

CREATE INDEX compositions_cis_idx ON bdm.compositions (cis);
CREATE INDEX compositions_code_substance_idx ON bdm.compositions (code_substance);

CREATE TABLE bdm.generiques (
  id bigserial PRIMARY KEY,
  identifiant_groupe text NOT NULL,
  libelle_groupe text,
  cis text NOT NULL REFERENCES bdm.specialites(cis) ON DELETE CASCADE,
  type integer,
  numero_tri integer,
  libelle_norm text GENERATED ALWAYS AS (
    bdm.immutable_unaccent(libelle_groupe)
  ) STORED
);

CREATE INDEX generiques_groupe_idx ON bdm.generiques (identifiant_groupe);
CREATE INDEX generiques_cis_idx ON bdm.generiques (cis);

CREATE TABLE bdm.molecules (
  id bigserial PRIMARY KEY,
  code_substance text,
  libelle text NOT NULL,
  libelle_norm text GENERATED ALWAYS AS (
    bdm.immutable_unaccent(libelle)
  ) STORED,
  UNIQUE (code_substance, libelle)
);

CREATE TABLE bdm.sync_meta (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_synced_at timestamptz,
  source_files text[] DEFAULT '{}',
  rows_loaded jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'idle',
  error_message text,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO bdm.sync_meta (id, status) VALUES (1, 'idle');

CREATE TABLE bdm.sync_runs (
  id bigserial PRIMARY KEY,
  status text NOT NULL DEFAULT 'running',
  triggered_by text,
  source_files text[] DEFAULT '{}',
  rows_loaded jsonb DEFAULT '{}'::jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX specialites_denom_trgm ON bdm.specialites USING gin (denomination_norm gin_trgm_ops);
CREATE INDEX compositions_substance_trgm ON bdm.compositions USING gin (substance_norm gin_trgm_ops);
CREATE INDEX generiques_libelle_trgm ON bdm.generiques USING gin (libelle_norm gin_trgm_ops);
CREATE INDEX molecules_libelle_trgm ON bdm.molecules USING gin (libelle_norm gin_trgm_ops);

CREATE OR REPLACE FUNCTION bdm.truncate_official_tables()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bdm, pg_temp
AS $$
BEGIN
  TRUNCATE TABLE
    bdm.presentations,
    bdm.compositions,
    bdm.generiques,
    bdm.molecules,
    bdm.specialites
  RESTART IDENTITY CASCADE;
END;
$$;

CREATE OR REPLACE FUNCTION bdm.bulk_insert_specialites(payload jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bdm, pg_temp
AS $$
DECLARE n int;
BEGIN
  INSERT INTO bdm.specialites (
    cis, denomination, forme_pharmaceutique, voies_administration,
    statut_amm, type_procedure, etat_commercialisation, date_amm,
    statut_bdm, numero_autorisation_europeenne, titulaires, surveillance_renforcee
  )
  SELECT
    x.cis, x.denomination, x.forme_pharmaceutique, x.voies_administration,
    x.statut_amm, x.type_procedure, x.etat_commercialisation,
    NULLIF(x.date_amm, '')::date,
    x.statut_bdm, x.numero_autorisation_europeenne, x.titulaires,
    coalesce(x.surveillance_renforcee, false)
  FROM jsonb_to_recordset(payload) AS x(
    cis text, denomination text, forme_pharmaceutique text, voies_administration text,
    statut_amm text, type_procedure text, etat_commercialisation text, date_amm text,
    statut_bdm text, numero_autorisation_europeenne text, titulaires text,
    surveillance_renforcee boolean
  )
  ON CONFLICT (cis) DO UPDATE SET
    denomination = EXCLUDED.denomination,
    forme_pharmaceutique = EXCLUDED.forme_pharmaceutique,
    voies_administration = EXCLUDED.voies_administration,
    statut_amm = EXCLUDED.statut_amm,
    type_procedure = EXCLUDED.type_procedure,
    etat_commercialisation = EXCLUDED.etat_commercialisation,
    date_amm = EXCLUDED.date_amm,
    statut_bdm = EXCLUDED.statut_bdm,
    numero_autorisation_europeenne = EXCLUDED.numero_autorisation_europeenne,
    titulaires = EXCLUDED.titulaires,
    surveillance_renforcee = EXCLUDED.surveillance_renforcee;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION bdm.bulk_insert_presentations(payload jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bdm, pg_temp
AS $$
DECLARE n int;
BEGIN
  INSERT INTO bdm.presentations (
    cis, cip7, libelle, statut_administratif, etat_commercialisation,
    date_declaration_commercialisation, cip13, agrement_collectivites,
    taux_remboursement, prix_euro, prix_hors_honoraire, honoraire,
    indications_remboursement
  )
  SELECT
    x.cis, x.cip7, x.libelle, x.statut_administratif, x.etat_commercialisation,
    NULLIF(x.date_declaration_commercialisation, '')::date,
    x.cip13, x.agrement_collectivites, x.taux_remboursement,
    x.prix_euro, x.prix_hors_honoraire, x.honoraire, x.indications_remboursement
  FROM jsonb_to_recordset(payload) AS x(
    cis text, cip7 text, libelle text, statut_administratif text,
    etat_commercialisation text, date_declaration_commercialisation text,
    cip13 text, agrement_collectivites text, taux_remboursement text,
    prix_euro numeric, prix_hors_honoraire numeric, honoraire numeric,
    indications_remboursement text
  )
  WHERE EXISTS (SELECT 1 FROM bdm.specialites s WHERE s.cis = x.cis);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION bdm.bulk_insert_compositions(payload jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bdm, pg_temp
AS $$
DECLARE n int;
BEGIN
  INSERT INTO bdm.compositions (
    cis, designation_element_pharmaceutique, code_substance,
    denomination_substance, dosage, reference_dosage, nature_composant, numero_lien
  )
  SELECT
    x.cis, x.designation_element_pharmaceutique, x.code_substance,
    x.denomination_substance, x.dosage, x.reference_dosage, x.nature_composant, x.numero_lien
  FROM jsonb_to_recordset(payload) AS x(
    cis text, designation_element_pharmaceutique text, code_substance text,
    denomination_substance text, dosage text, reference_dosage text,
    nature_composant text, numero_lien integer
  )
  WHERE EXISTS (SELECT 1 FROM bdm.specialites s WHERE s.cis = x.cis);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION bdm.bulk_insert_generiques(payload jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bdm, pg_temp
AS $$
DECLARE n int;
BEGIN
  INSERT INTO bdm.generiques (
    identifiant_groupe, libelle_groupe, cis, type, numero_tri
  )
  SELECT
    x.identifiant_groupe, x.libelle_groupe, x.cis, x.type, x.numero_tri
  FROM jsonb_to_recordset(payload) AS x(
    identifiant_groupe text, libelle_groupe text, cis text,
    type integer, numero_tri integer
  )
  WHERE EXISTS (SELECT 1 FROM bdm.specialites s WHERE s.cis = x.cis);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION bdm.rebuild_molecules_from_compositions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bdm, pg_temp
AS $$
DECLARE n int;
BEGIN
  INSERT INTO bdm.molecules (code_substance, libelle)
  SELECT DISTINCT ON (coalesce(code_substance, ''), denomination_substance)
    NULLIF(code_substance, ''),
    denomination_substance
  FROM bdm.compositions
  WHERE denomination_substance IS NOT NULL
    AND trim(denomination_substance) <> ''
    AND coalesce(nature_composant, 'SA') = 'SA'
  ORDER BY coalesce(code_substance, ''), denomination_substance
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION bdm.search_products(q text, lim integer DEFAULT 50)
RETURNS TABLE (
  cis text,
  denomination text,
  forme_pharmaceutique text,
  etat_commercialisation text,
  cip13 text,
  cip7 text,
  presentation_libelle text,
  substances text,
  groupe_generique text,
  match_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = bdm, pg_temp
AS $$
DECLARE
  raw text := trim(coalesce(q, ''));
  nq text;
  lim_i int := greatest(1, least(coalesce(lim, 50), 100));
BEGIN
  IF length(raw) < 2 THEN
    RETURN;
  END IF;

  nq := bdm.immutable_unaccent(raw);

  IF raw ~ '^[0-9]{7}$' OR raw ~ '^[0-9]{13}$' THEN
    RETURN QUERY
    SELECT
      s.cis, s.denomination, s.forme_pharmaceutique, s.etat_commercialisation,
      p.cip13, p.cip7, p.libelle,
      (
        SELECT string_agg(DISTINCT c.denomination_substance, ', ' ORDER BY c.denomination_substance)
        FROM bdm.compositions c
        WHERE c.cis = s.cis AND coalesce(c.nature_composant, 'SA') = 'SA'
      ),
      (
        SELECT g.libelle_groupe FROM bdm.generiques g WHERE g.cis = s.cis ORDER BY g.numero_tri NULLS LAST LIMIT 1
      ),
      'cip'::text
    FROM bdm.presentations p
    JOIN bdm.specialites s ON s.cis = p.cis
    WHERE p.cip13 = raw OR p.cip7 = raw
    LIMIT lim_i;
    RETURN;
  END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT
      s.cis,
      s.denomination,
      s.forme_pharmaceutique,
      s.etat_commercialisation,
      CASE
        WHEN s.denomination_norm LIKE nq || '%' THEN 1
        WHEN s.denomination_norm LIKE '%' || nq || '%' THEN 2
        WHEN EXISTS (
          SELECT 1 FROM bdm.compositions c
          WHERE c.cis = s.cis AND c.substance_norm LIKE nq || '%'
        ) THEN 3
        WHEN EXISTS (
          SELECT 1 FROM bdm.generiques g
          WHERE g.cis = s.cis AND g.libelle_norm LIKE nq || '%'
        ) THEN 4
        ELSE 5
      END AS rank_ord,
      CASE
        WHEN s.denomination_norm LIKE '%' || nq || '%' THEN 'specialite'
        WHEN EXISTS (
          SELECT 1 FROM bdm.compositions c
          WHERE c.cis = s.cis AND c.substance_norm LIKE '%' || nq || '%'
        ) THEN 'dci'
        WHEN EXISTS (
          SELECT 1 FROM bdm.generiques g
          WHERE g.cis = s.cis AND g.libelle_norm LIKE '%' || nq || '%'
        ) THEN 'generique'
        ELSE 'autre'
      END AS reason
    FROM bdm.specialites s
    WHERE
      s.denomination_norm LIKE '%' || nq || '%'
      OR EXISTS (
        SELECT 1 FROM bdm.compositions c
        WHERE c.cis = s.cis AND c.substance_norm LIKE '%' || nq || '%'
      )
      OR EXISTS (
        SELECT 1 FROM bdm.generiques g
        WHERE g.cis = s.cis AND g.libelle_norm LIKE '%' || nq || '%'
      )
    ORDER BY rank_ord, s.denomination
    LIMIT lim_i
  )
  SELECT
    sc.cis,
    sc.denomination,
    sc.forme_pharmaceutique,
    sc.etat_commercialisation,
    p.cip13,
    p.cip7,
    p.libelle,
    (
      SELECT string_agg(DISTINCT c.denomination_substance, ', ' ORDER BY c.denomination_substance)
      FROM bdm.compositions c
      WHERE c.cis = sc.cis AND coalesce(c.nature_composant, 'SA') = 'SA'
    ),
    (
      SELECT g.libelle_groupe FROM bdm.generiques g WHERE g.cis = sc.cis ORDER BY g.numero_tri NULLS LAST LIMIT 1
    ),
    sc.reason
  FROM scored sc
  LEFT JOIN LATERAL (
    SELECT pr.cip13, pr.cip7, pr.libelle
    FROM bdm.presentations pr
    WHERE pr.cis = sc.cis
    ORDER BY
      CASE WHEN pr.etat_commercialisation ILIKE '%commercialisation%' THEN 0 ELSE 1 END,
      pr.id
    LIMIT 1
  ) p ON true;
END;
$$;

CREATE OR REPLACE FUNCTION bdm.suggest(q text, lim integer DEFAULT 20)
RETURNS TABLE (
  kind text,
  label text,
  subtitle text,
  cis text,
  cip13 text,
  code_substance text,
  identifiant_groupe text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = bdm, pg_temp
AS $$
DECLARE
  raw text := trim(coalesce(q, ''));
  nq text;
  lim_i int := greatest(1, least(coalesce(lim, 20), 40));
  per int;
BEGIN
  IF length(raw) < 2 THEN
    RETURN;
  END IF;
  nq := bdm.immutable_unaccent(raw);
  per := greatest(3, lim_i / 3);

  IF raw ~ '^[0-9]{5,13}$' THEN
    RETURN QUERY
    SELECT
      'produit'::text,
      s.denomination,
      coalesce(p.cip13, p.cip7),
      s.cis,
      p.cip13,
      NULL::text,
      NULL::text
    FROM bdm.presentations p
    JOIN bdm.specialites s ON s.cis = p.cis
    WHERE p.cip13 LIKE raw || '%' OR p.cip7 LIKE raw || '%'
    LIMIT lim_i;
    RETURN;
  END IF;

  RETURN QUERY
  (
    SELECT
      'dci'::text,
      m.libelle,
      'Substance / DCI'::text,
      NULL::text,
      NULL::text,
      m.code_substance,
      NULL::text
    FROM bdm.molecules m
    WHERE m.libelle_norm LIKE nq || '%' OR m.libelle_norm LIKE '%' || nq || '%'
    ORDER BY CASE WHEN m.libelle_norm LIKE nq || '%' THEN 0 ELSE 1 END, m.libelle
    LIMIT per
  )
  UNION ALL
  (
    SELECT DISTINCT ON (g.identifiant_groupe)
      'groupe_generique'::text,
      g.libelle_groupe,
      'Groupe générique #' || g.identifiant_groupe,
      NULL::text,
      NULL::text,
      NULL::text,
      g.identifiant_groupe
    FROM bdm.generiques g
    WHERE g.libelle_norm LIKE nq || '%' OR g.libelle_norm LIKE '%' || nq || '%'
    ORDER BY g.identifiant_groupe,
      CASE WHEN g.libelle_norm LIKE nq || '%' THEN 0 ELSE 1 END,
      g.libelle_groupe
    LIMIT per
  )
  UNION ALL
  (
    SELECT
      'specialite'::text,
      s.denomination,
      coalesce(s.forme_pharmaceutique, 'Spécialité'),
      s.cis,
      NULL::text,
      NULL::text,
      NULL::text
    FROM bdm.specialites s
    WHERE s.denomination_norm LIKE nq || '%' OR s.denomination_norm LIKE '%' || nq || '%'
    ORDER BY CASE WHEN s.denomination_norm LIKE nq || '%' THEN 0 ELSE 1 END, s.denomination
    LIMIT per
  );
END;
$$;

CREATE OR REPLACE FUNCTION bdm.get_by_cip(cip text)
RETURNS TABLE (
  cis text,
  denomination text,
  forme_pharmaceutique text,
  cip7 text,
  cip13 text,
  presentation_libelle text,
  prix_euro numeric,
  substances text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = bdm, pg_temp
AS $$
  SELECT
    s.cis,
    s.denomination,
    s.forme_pharmaceutique,
    p.cip7,
    p.cip13,
    p.libelle,
    p.prix_euro,
    (
      SELECT string_agg(DISTINCT c.denomination_substance, ', ' ORDER BY c.denomination_substance)
      FROM bdm.compositions c
      WHERE c.cis = s.cis AND coalesce(c.nature_composant, 'SA') = 'SA'
    )
  FROM bdm.presentations p
  JOIN bdm.specialites s ON s.cis = p.cis
  WHERE p.cip13 = trim(cip) OR p.cip7 = trim(cip)
  LIMIT 5;
$$;

GRANT SELECT ON ALL TABLES IN SCHEMA bdm TO authenticated, anon;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA bdm TO authenticated, anon;
GRANT EXECUTE ON FUNCTION bdm.immutable_unaccent(text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION bdm.search_products(text, integer) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION bdm.suggest(text, integer) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION bdm.get_by_cip(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION bdm.truncate_official_tables() TO service_role;
GRANT EXECUTE ON FUNCTION bdm.bulk_insert_specialites(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION bdm.bulk_insert_presentations(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION bdm.bulk_insert_compositions(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION bdm.bulk_insert_generiques(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION bdm.rebuild_molecules_from_compositions() TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA bdm TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA bdm TO service_role;

-- Allow MCP / postgres role to call bulk inserts for local import tooling
GRANT EXECUTE ON FUNCTION bdm.truncate_official_tables() TO postgres;
GRANT EXECUTE ON FUNCTION bdm.bulk_insert_specialites(jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION bdm.bulk_insert_presentations(jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION bdm.bulk_insert_compositions(jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION bdm.bulk_insert_generiques(jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION bdm.rebuild_molecules_from_compositions() TO postgres;

ALTER TABLE bdm.specialites ENABLE ROW LEVEL SECURITY;
ALTER TABLE bdm.presentations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bdm.compositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bdm.generiques ENABLE ROW LEVEL SECURITY;
ALTER TABLE bdm.molecules ENABLE ROW LEVEL SECURITY;
ALTER TABLE bdm.sync_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE bdm.sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY specialites_select ON bdm.specialites FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY presentations_select ON bdm.presentations FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY compositions_select ON bdm.compositions FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY generiques_select ON bdm.generiques FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY molecules_select ON bdm.molecules FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY sync_meta_select ON bdm.sync_meta FOR SELECT TO authenticated USING (true);
CREATE POLICY sync_runs_select ON bdm.sync_runs FOR SELECT TO authenticated USING (true);

DO $$
DECLARE
  current_schemas text;
BEGIN
  current_schemas := current_setting('pgrst.db_schemas', true);
  IF current_schemas IS NULL OR btrim(current_schemas) = '' THEN
    current_schemas := 'public, storage, graphql_public, PharmaOs, portail';
  END IF;
  IF position('bdm' in current_schemas) = 0 THEN
    EXECUTE format('ALTER ROLE authenticator SET pgrst.db_schemas = %L', current_schemas || ', bdm');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
