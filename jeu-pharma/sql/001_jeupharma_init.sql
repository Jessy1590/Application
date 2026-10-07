-- =============================================================================
-- Jeu Pharma — schéma initial `jeupharma`
-- Contenu pédagogique issu des cours physiques (saisie / CSV manuel).
-- Pas de BDPM / OCR / IA en v1.
--
-- Appliquer via SQL Editor Dashboard après exposition du schéma API.
-- Exposer `jeupharma` dans Exposed schemas (voir supabase/SETUP.md §3).
--
-- SITE_ID : après création portail.sites « Jeu Pharma », remplacer le placeholder
-- UUID dans has_jeupharma_access() par le MÊME UUID collé dans js/supabase.js
-- (SITE_ID) et .cursor/docs/STATE.md.
-- Placeholder SQL = 00000000-… ; JS = REPLACE_WITH_PORTAIL_SITE_UUID.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS jeupharma;
GRANT USAGE ON SCHEMA jeupharma TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Admin métier Jeu Pharma = portail.profiles.role = 'admin' uniquement
CREATE OR REPLACE FUNCTION jeupharma.is_portail_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'portail', 'jeupharma', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM portail.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;
REVOKE ALL ON FUNCTION jeupharma.is_portail_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.is_portail_admin() TO authenticated;

-- Accès site Jeu Pharma (site_access) ou admin portail
-- SITE_ID placeholder : coller l'UUID portail.sites après création du site
CREATE OR REPLACE FUNCTION jeupharma.has_jeupharma_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'portail', 'jeupharma', 'pg_temp'
AS $$
  SELECT
    jeupharma.is_portail_admin()
    OR EXISTS (
      SELECT 1
      FROM portail.site_access sa
      WHERE sa.user_id = auth.uid()
        -- SITE_ID Jeu Pharma — À REMPLACER (portail.sites.id)
        AND sa.site_id = '00000000-0000-0000-0000-000000000000'::uuid
    );
$$;
REVOKE ALL ON FUNCTION jeupharma.has_jeupharma_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.has_jeupharma_access() TO authenticated;

-- Normalisation (trim + lower ; unaccent si extension dispo)
CREATE OR REPLACE FUNCTION jeupharma.normaliser_valeur(p_valeur text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text;
BEGIN
  IF p_valeur IS NULL THEN
    RETURN NULL;
  END IF;
  v := trim(both FROM p_valeur);
  BEGIN
    v := lower(extensions.unaccent(v));
  EXCEPTION
    WHEN undefined_function THEN
      v := lower(v);
    WHEN undefined_schema THEN
      BEGIN
        v := lower(public.unaccent(v));
      EXCEPTION
        WHEN OTHERS THEN
          v := lower(v);
      END;
    WHEN OTHERS THEN
      v := lower(v);
  END;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION jeupharma.normaliser_valeur(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.normaliser_valeur(text) TO authenticated;

CREATE OR REPLACE FUNCTION jeupharma.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Référentiel niveaux (seed)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS jeupharma.niveaux (
  code text PRIMARY KEY,
  libelle text NOT NULL,
  ordre int NOT NULL DEFAULT 0
);

INSERT INTO jeupharma.niveaux (code, libelle, ordre) VALUES
  ('apprenti', 'Apprenti', 1),
  ('pharmacien', 'Pharmacien', 2),
  ('preparatrice', 'Préparatrice', 3),
  ('etu_3a', 'Etudiant pharma 3A', 4),
  ('etu_4a', 'Etudiant pharma 4A', 5),
  ('etu_6a', 'Etudiant pharma 6A', 6)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Entités — colonnes communes + triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION jeupharma.trg_entite_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  c text;
BEGIN
  NEW.valeur := trim(both FROM NEW.valeur);
  IF NEW.valeur IS NULL OR length(NEW.valeur) = 0 THEN
    RAISE EXCEPTION 'valeur obligatoire';
  END IF;
  NEW.valeur_norm := jeupharma.normaliser_valeur(NEW.valeur);
  IF NEW.niveaux_connus IS NULL THEN
    NEW.niveaux_connus := '{}'::text[];
  END IF;
  FOREACH c IN ARRAY NEW.niveaux_connus LOOP
    IF NOT EXISTS (SELECT 1 FROM jeupharma.niveaux n WHERE n.code = c) THEN
      RAISE EXCEPTION 'niveau inconnu dans niveaux_connus: %', c;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

-- Macro locale : créer une table d'entité standard
-- (répété explicitement pour clarté / maintenance SQL)

CREATE TABLE IF NOT EXISTS jeupharma.noms_commerciaux (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valeur text NOT NULL,
  valeur_norm text NOT NULL,
  niveaux_connus text[] NOT NULL DEFAULT '{}'::text[],
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS noms_commerciaux_valeur_norm_actif_uidx
  ON jeupharma.noms_commerciaux (valeur_norm) WHERE actif;
CREATE INDEX IF NOT EXISTS noms_commerciaux_niveaux_gin
  ON jeupharma.noms_commerciaux USING gin (niveaux_connus);

CREATE TABLE IF NOT EXISTS jeupharma.dcis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valeur text NOT NULL,
  valeur_norm text NOT NULL,
  niveaux_connus text[] NOT NULL DEFAULT '{}'::text[],
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS dcis_valeur_norm_actif_uidx
  ON jeupharma.dcis (valeur_norm) WHERE actif;
CREATE INDEX IF NOT EXISTS dcis_niveaux_gin
  ON jeupharma.dcis USING gin (niveaux_connus);

CREATE TABLE IF NOT EXISTS jeupharma.secteurs_therapeutiques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valeur text NOT NULL,
  valeur_norm text NOT NULL,
  niveaux_connus text[] NOT NULL DEFAULT '{}'::text[],
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS secteurs_therapeutiques_valeur_norm_actif_uidx
  ON jeupharma.secteurs_therapeutiques (valeur_norm) WHERE actif;
CREATE INDEX IF NOT EXISTS secteurs_therapeutiques_niveaux_gin
  ON jeupharma.secteurs_therapeutiques USING gin (niveaux_connus);

CREATE TABLE IF NOT EXISTS jeupharma.classes_therapeutiques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valeur text NOT NULL,
  valeur_norm text NOT NULL,
  niveaux_connus text[] NOT NULL DEFAULT '{}'::text[],
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS classes_therapeutiques_valeur_norm_actif_uidx
  ON jeupharma.classes_therapeutiques (valeur_norm) WHERE actif;
CREATE INDEX IF NOT EXISTS classes_therapeutiques_niveaux_gin
  ON jeupharma.classes_therapeutiques USING gin (niveaux_connus);

CREATE TABLE IF NOT EXISTS jeupharma.classes_pharmacologiques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valeur text NOT NULL,
  valeur_norm text NOT NULL,
  niveaux_connus text[] NOT NULL DEFAULT '{}'::text[],
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS classes_pharmacologiques_valeur_norm_actif_uidx
  ON jeupharma.classes_pharmacologiques (valeur_norm) WHERE actif;
CREATE INDEX IF NOT EXISTS classes_pharmacologiques_niveaux_gin
  ON jeupharma.classes_pharmacologiques USING gin (niveaux_connus);

CREATE TABLE IF NOT EXISTS jeupharma.details_pharmacologie (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valeur text NOT NULL,
  valeur_norm text NOT NULL,
  niveaux_connus text[] NOT NULL DEFAULT '{}'::text[],
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS details_pharmacologie_valeur_norm_actif_uidx
  ON jeupharma.details_pharmacologie (valeur_norm) WHERE actif;
CREATE INDEX IF NOT EXISTS details_pharmacologie_niveaux_gin
  ON jeupharma.details_pharmacologie USING gin (niveaux_connus);

CREATE TABLE IF NOT EXISTS jeupharma.indications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valeur text NOT NULL,
  valeur_norm text NOT NULL,
  niveaux_connus text[] NOT NULL DEFAULT '{}'::text[],
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS indications_valeur_norm_actif_uidx
  ON jeupharma.indications (valeur_norm) WHERE actif;
CREATE INDEX IF NOT EXISTS indications_niveaux_gin
  ON jeupharma.indications USING gin (niveaux_connus);

CREATE TABLE IF NOT EXISTS jeupharma.contre_indications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valeur text NOT NULL,
  valeur_norm text NOT NULL,
  niveaux_connus text[] NOT NULL DEFAULT '{}'::text[],
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS contre_indications_valeur_norm_actif_uidx
  ON jeupharma.contre_indications (valeur_norm) WHERE actif;
CREATE INDEX IF NOT EXISTS contre_indications_niveaux_gin
  ON jeupharma.contre_indications USING gin (niveaux_connus);

CREATE TABLE IF NOT EXISTS jeupharma.effets_indesirables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valeur text NOT NULL,
  valeur_norm text NOT NULL,
  niveaux_connus text[] NOT NULL DEFAULT '{}'::text[],
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS effets_indesirables_valeur_norm_actif_uidx
  ON jeupharma.effets_indesirables (valeur_norm) WHERE actif;
CREATE INDEX IF NOT EXISTS effets_indesirables_niveaux_gin
  ON jeupharma.effets_indesirables USING gin (niveaux_connus);

CREATE TABLE IF NOT EXISTS jeupharma.precautions_emploi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valeur text NOT NULL,
  valeur_norm text NOT NULL,
  niveaux_connus text[] NOT NULL DEFAULT '{}'::text[],
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS precautions_emploi_valeur_norm_actif_uidx
  ON jeupharma.precautions_emploi (valeur_norm) WHERE actif;
CREATE INDEX IF NOT EXISTS precautions_emploi_niveaux_gin
  ON jeupharma.precautions_emploi USING gin (niveaux_connus);

CREATE TABLE IF NOT EXISTS jeupharma.posologies_generales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valeur text NOT NULL,
  valeur_norm text NOT NULL,
  niveaux_connus text[] NOT NULL DEFAULT '{}'::text[],
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS posologies_generales_valeur_norm_actif_uidx
  ON jeupharma.posologies_generales (valeur_norm) WHERE actif;
CREATE INDEX IF NOT EXISTS posologies_generales_niveaux_gin
  ON jeupharma.posologies_generales USING gin (niveaux_connus);

CREATE TABLE IF NOT EXISTS jeupharma.interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valeur text NOT NULL,
  valeur_norm text NOT NULL,
  niveaux_connus text[] NOT NULL DEFAULT '{}'::text[],
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS interactions_valeur_norm_actif_uidx
  ON jeupharma.interactions (valeur_norm) WHERE actif;
CREATE INDEX IF NOT EXISTS interactions_niveaux_gin
  ON jeupharma.interactions USING gin (niveaux_connus);

CREATE TABLE IF NOT EXISTS jeupharma.surveillances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valeur text NOT NULL,
  valeur_norm text NOT NULL,
  niveaux_connus text[] NOT NULL DEFAULT '{}'::text[],
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS surveillances_valeur_norm_actif_uidx
  ON jeupharma.surveillances (valeur_norm) WHERE actif;
CREATE INDEX IF NOT EXISTS surveillances_niveaux_gin
  ON jeupharma.surveillances USING gin (niveaux_connus);

CREATE TABLE IF NOT EXISTS jeupharma.grossesse_allaitement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valeur text NOT NULL,
  valeur_norm text NOT NULL,
  niveaux_connus text[] NOT NULL DEFAULT '{}'::text[],
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS grossesse_allaitement_valeur_norm_actif_uidx
  ON jeupharma.grossesse_allaitement (valeur_norm) WHERE actif;
CREATE INDEX IF NOT EXISTS grossesse_allaitement_niveaux_gin
  ON jeupharma.grossesse_allaitement USING gin (niveaux_connus);

CREATE TABLE IF NOT EXISTS jeupharma.voies_administration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valeur text NOT NULL,
  valeur_norm text NOT NULL,
  niveaux_connus text[] NOT NULL DEFAULT '{}'::text[],
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS voies_administration_valeur_norm_actif_uidx
  ON jeupharma.voies_administration (valeur_norm) WHERE actif;
CREATE INDEX IF NOT EXISTS voies_administration_niveaux_gin
  ON jeupharma.voies_administration USING gin (niveaux_connus);

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'noms_commerciaux', 'dcis', 'secteurs_therapeutiques', 'classes_therapeutiques',
    'classes_pharmacologiques', 'details_pharmacologie', 'indications',
    'contre_indications', 'effets_indesirables', 'precautions_emploi',
    'posologies_generales', 'interactions', 'surveillances',
    'grossesse_allaitement', 'voies_administration'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%1$s_before_write ON jeupharma.%1$s;
       CREATE TRIGGER trg_%1$s_before_write
         BEFORE INSERT OR UPDATE ON jeupharma.%1$s
         FOR EACH ROW EXECUTE FUNCTION jeupharma.trg_entite_before_write();
       DROP TRIGGER IF EXISTS trg_%1$s_set_updated_at ON jeupharma.%1$s;
       CREATE TRIGGER trg_%1$s_set_updated_at
         BEFORE UPDATE ON jeupharma.%1$s
         FOR EACH ROW EXECUTE FUNCTION jeupharma.set_updated_at();',
      t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Matrice médicaments + liaisons multi
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS jeupharma.matrice_medicaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom_commercial_id uuid REFERENCES jeupharma.noms_commerciaux(id) ON DELETE SET NULL,
  dci_id uuid REFERENCES jeupharma.dcis(id) ON DELETE SET NULL,
  secteur_therapeutique_id uuid REFERENCES jeupharma.secteurs_therapeutiques(id) ON DELETE SET NULL,
  classe_therapeutique_id uuid REFERENCES jeupharma.classes_therapeutiques(id) ON DELETE SET NULL,
  classe_pharmacologique_id uuid REFERENCES jeupharma.classes_pharmacologiques(id) ON DELETE SET NULL,
  detail_pharmacologie_id uuid REFERENCES jeupharma.details_pharmacologie(id) ON DELETE SET NULL,
  posologie_generale_id uuid REFERENCES jeupharma.posologies_generales(id) ON DELETE SET NULL,
  grossesse_allaitement_id uuid REFERENCES jeupharma.grossesse_allaitement(id) ON DELETE SET NULL,
  statut text NOT NULL DEFAULT 'brouillon'
    CHECK (statut = ANY (ARRAY['brouillon'::text, 'publie'::text, 'archive'::text])),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES portail.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS matrice_medicaments_statut_idx
  ON jeupharma.matrice_medicaments (statut);
CREATE INDEX IF NOT EXISTS matrice_medicaments_secteur_idx
  ON jeupharma.matrice_medicaments (secteur_therapeutique_id);

DROP TRIGGER IF EXISTS trg_matrice_set_updated_at ON jeupharma.matrice_medicaments;
CREATE TRIGGER trg_matrice_set_updated_at
  BEFORE UPDATE ON jeupharma.matrice_medicaments
  FOR EACH ROW EXECUTE FUNCTION jeupharma.set_updated_at();

CREATE TABLE IF NOT EXISTS jeupharma.matrice_indications (
  matrice_id uuid NOT NULL REFERENCES jeupharma.matrice_medicaments(id) ON DELETE CASCADE,
  indication_id uuid NOT NULL REFERENCES jeupharma.indications(id) ON DELETE CASCADE,
  ordre int NOT NULL DEFAULT 0,
  PRIMARY KEY (matrice_id, indication_id)
);

CREATE TABLE IF NOT EXISTS jeupharma.matrice_contre_indications (
  matrice_id uuid NOT NULL REFERENCES jeupharma.matrice_medicaments(id) ON DELETE CASCADE,
  contre_indication_id uuid NOT NULL REFERENCES jeupharma.contre_indications(id) ON DELETE CASCADE,
  ordre int NOT NULL DEFAULT 0,
  PRIMARY KEY (matrice_id, contre_indication_id)
);

CREATE TABLE IF NOT EXISTS jeupharma.matrice_effets_indesirables (
  matrice_id uuid NOT NULL REFERENCES jeupharma.matrice_medicaments(id) ON DELETE CASCADE,
  effet_indesirable_id uuid NOT NULL REFERENCES jeupharma.effets_indesirables(id) ON DELETE CASCADE,
  ordre int NOT NULL DEFAULT 0,
  PRIMARY KEY (matrice_id, effet_indesirable_id)
);

CREATE TABLE IF NOT EXISTS jeupharma.matrice_precautions_emploi (
  matrice_id uuid NOT NULL REFERENCES jeupharma.matrice_medicaments(id) ON DELETE CASCADE,
  precaution_emploi_id uuid NOT NULL REFERENCES jeupharma.precautions_emploi(id) ON DELETE CASCADE,
  ordre int NOT NULL DEFAULT 0,
  PRIMARY KEY (matrice_id, precaution_emploi_id)
);

CREATE TABLE IF NOT EXISTS jeupharma.matrice_interactions (
  matrice_id uuid NOT NULL REFERENCES jeupharma.matrice_medicaments(id) ON DELETE CASCADE,
  interaction_id uuid NOT NULL REFERENCES jeupharma.interactions(id) ON DELETE CASCADE,
  ordre int NOT NULL DEFAULT 0,
  PRIMARY KEY (matrice_id, interaction_id)
);

CREATE TABLE IF NOT EXISTS jeupharma.matrice_surveillances (
  matrice_id uuid NOT NULL REFERENCES jeupharma.matrice_medicaments(id) ON DELETE CASCADE,
  surveillance_id uuid NOT NULL REFERENCES jeupharma.surveillances(id) ON DELETE CASCADE,
  ordre int NOT NULL DEFAULT 0,
  PRIMARY KEY (matrice_id, surveillance_id)
);

CREATE TABLE IF NOT EXISTS jeupharma.matrice_voies_administration (
  matrice_id uuid NOT NULL REFERENCES jeupharma.matrice_medicaments(id) ON DELETE CASCADE,
  voie_administration_id uuid NOT NULL REFERENCES jeupharma.voies_administration(id) ON DELETE CASCADE,
  ordre int NOT NULL DEFAULT 0,
  PRIMARY KEY (matrice_id, voie_administration_id)
);

-- ---------------------------------------------------------------------------
-- Profil apprenant
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS jeupharma.profil_apprentissage (
  user_id uuid PRIMARY KEY REFERENCES portail.profiles(id) ON DELETE CASCADE,
  niveau_id text REFERENCES jeupharma.niveaux(code) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_profil_set_updated_at ON jeupharma.profil_apprentissage;
CREATE TRIGGER trg_profil_set_updated_at
  BEFORE UPDATE ON jeupharma.profil_apprentissage
  FOR EACH ROW EXECUTE FUNCTION jeupharma.set_updated_at();

-- ---------------------------------------------------------------------------
-- Quiz
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS jeupharma.quizz (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_unique varchar(8) NOT NULL UNIQUE,
  titre text NOT NULL,
  secteur_therapeutique_id uuid REFERENCES jeupharma.secteurs_therapeutiques(id) ON DELETE SET NULL,
  niveau_cible text NOT NULL REFERENCES jeupharma.niveaux(code),
  mode text NOT NULL DEFAULT 'entrainement'
    CHECK (mode = ANY (ARRAY['entrainement'::text, 'evaluation'::text])),
  configuration_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_questions jsonb,
  created_by uuid REFERENCES portail.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  actif boolean NOT NULL DEFAULT true,
  CONSTRAINT quizz_code_format CHECK (code_unique ~ '^PH-[A-Z0-9]{5}$')
);

CREATE INDEX IF NOT EXISTS quizz_actif_idx ON jeupharma.quizz (actif);
CREATE INDEX IF NOT EXISTS quizz_niveau_idx ON jeupharma.quizz (niveau_cible);

CREATE TABLE IF NOT EXISTS jeupharma.quizz_reponses_utilisateur (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quizz_id uuid NOT NULL REFERENCES jeupharma.quizz(id) ON DELETE CASCADE,
  utilisateur_id uuid NOT NULL REFERENCES portail.profiles(id) ON DELETE CASCADE,
  mode text NOT NULL
    CHECK (mode = ANY (ARRAY['entrainement'::text, 'evaluation'::text])),
  score_obtenu numeric NOT NULL DEFAULT 0,
  score_max numeric NOT NULL DEFAULT 0,
  details_reponses jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quizz_reponses_user_idx
  ON jeupharma.quizz_reponses_utilisateur (utilisateur_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quizz_reponses_quizz_idx
  ON jeupharma.quizz_reponses_utilisateur (quizz_id, created_at DESC);
-- Une seule tentative en mode évaluation
CREATE UNIQUE INDEX IF NOT EXISTS quizz_reponses_eval_unique
  ON jeupharma.quizz_reponses_utilisateur (quizz_id, utilisateur_id)
  WHERE mode = 'evaluation';

-- ---------------------------------------------------------------------------
-- Tableau à trous (miroir quiz)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS jeupharma.parties_tableau_trous (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_unique varchar(8) NOT NULL UNIQUE,
  titre text NOT NULL,
  secteur_therapeutique_id uuid REFERENCES jeupharma.secteurs_therapeutiques(id) ON DELETE SET NULL,
  niveau_cible text NOT NULL REFERENCES jeupharma.niveaux(code),
  mode text NOT NULL DEFAULT 'entrainement'
    CHECK (mode = ANY (ARRAY['entrainement'::text, 'evaluation'::text])),
  configuration_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_grille jsonb,
  created_by uuid REFERENCES portail.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  actif boolean NOT NULL DEFAULT true,
  CONSTRAINT parties_code_format CHECK (code_unique ~ '^TT-[A-Z0-9]{5}$')
);

CREATE TABLE IF NOT EXISTS jeupharma.parties_reponses_utilisateur (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partie_id uuid NOT NULL REFERENCES jeupharma.parties_tableau_trous(id) ON DELETE CASCADE,
  utilisateur_id uuid NOT NULL REFERENCES portail.profiles(id) ON DELETE CASCADE,
  mode text NOT NULL
    CHECK (mode = ANY (ARRAY['entrainement'::text, 'evaluation'::text])),
  score_obtenu numeric NOT NULL DEFAULT 0,
  score_max numeric NOT NULL DEFAULT 0,
  details_reponses jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS parties_reponses_user_idx
  ON jeupharma.parties_reponses_utilisateur (utilisateur_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS parties_reponses_eval_unique
  ON jeupharma.parties_reponses_utilisateur (partie_id, utilisateur_id)
  WHERE mode = 'evaluation';

-- ---------------------------------------------------------------------------
-- Bugs + logs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS jeupharma.bugs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type = ANY (ARRAY['bug'::text, 'amelioration'::text])),
  titre text NOT NULL,
  description text NOT NULL DEFAULT '',
  statut text NOT NULL DEFAULT 'nouveau'
    CHECK (statut = ANY (ARRAY[
      'nouveau'::text, 'en_cours'::text, 'modifie'::text, 'impossible'::text, 'annule'::text
    ])),
  page_path text,
  created_by uuid REFERENCES portail.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bugs_statut_idx ON jeupharma.bugs (statut);
CREATE INDEX IF NOT EXISTS bugs_created_at_idx ON jeupharma.bugs (created_at DESC);

DROP TRIGGER IF EXISTS trg_bugs_set_updated_at ON jeupharma.bugs;
CREATE TRIGGER trg_bugs_set_updated_at
  BEFORE UPDATE ON jeupharma.bugs
  FOR EACH ROW EXECUTE FUNCTION jeupharma.set_updated_at();

CREATE TABLE IF NOT EXISTS jeupharma.logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_label text,
  module text,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  path text,
  level text NOT NULL DEFAULT 'info'
    CHECK (level = ANY (ARRAY['info'::text, 'warn'::text, 'error'::text])),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT logs_action_nonempty CHECK (length(trim(action)) > 0)
);

CREATE INDEX IF NOT EXISTS logs_created_at_idx ON jeupharma.logs (created_at DESC);
CREATE INDEX IF NOT EXISTS logs_user_id_idx ON jeupharma.logs (user_id);
CREATE INDEX IF NOT EXISTS logs_module_action_idx ON jeupharma.logs (module, action);

COMMENT ON TABLE jeupharma.logs IS
  'Journal d''activité Jeu Pharma. Lecture réservée admin portail.';

-- ---------------------------------------------------------------------------
-- Audit contenu
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS jeupharma.historique_modifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  operation text NOT NULL
    CHECK (operation = ANY (ARRAY['insert'::text, 'update'::text, 'delete'::text])),
  ancien_etat jsonb,
  nouvel_etat jsonb,
  user_id uuid REFERENCES portail.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  etat text NOT NULL DEFAULT 'applique'
    CHECK (etat = ANY (ARRAY['applique'::text, 'annule'::text]))
);

CREATE INDEX IF NOT EXISTS historique_table_idx
  ON jeupharma.historique_modifications (table_name, created_at DESC);

CREATE OR REPLACE FUNCTION jeupharma.trg_audit_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO jeupharma.historique_modifications (
      table_name, record_id, operation, ancien_etat, nouvel_etat, user_id, etat
    ) VALUES (
      TG_TABLE_NAME, NEW.id, 'insert', NULL, to_jsonb(NEW), auth.uid(), 'applique'
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO jeupharma.historique_modifications (
      table_name, record_id, operation, ancien_etat, nouvel_etat, user_id, etat
    ) VALUES (
      TG_TABLE_NAME, NEW.id, 'update', to_jsonb(OLD), to_jsonb(NEW), auth.uid(), 'applique'
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO jeupharma.historique_modifications (
      table_name, record_id, operation, ancien_etat, nouvel_etat, user_id, etat
    ) VALUES (
      TG_TABLE_NAME, OLD.id, 'delete', to_jsonb(OLD), NULL, auth.uid(), 'applique'
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DO $$
DECLARE
  t text;
  audit_tables text[] := ARRAY[
    'noms_commerciaux', 'dcis', 'secteurs_therapeutiques', 'classes_therapeutiques',
    'classes_pharmacologiques', 'details_pharmacologie', 'indications',
    'contre_indications', 'effets_indesirables', 'precautions_emploi',
    'posologies_generales', 'interactions', 'surveillances',
    'grossesse_allaitement', 'voies_administration', 'matrice_medicaments'
  ];
BEGIN
  FOREACH t IN ARRAY audit_tables LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%1$s_audit ON jeupharma.%1$s;
       CREATE TRIGGER trg_%1$s_audit
         AFTER INSERT OR UPDATE OR DELETE ON jeupharma.%1$s
         FOR EACH ROW EXECUTE FUNCTION jeupharma.trg_audit_row();',
      t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Vue catalogue complet
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW jeupharma.v_medicaments_complet AS
SELECT
  m.id,
  m.statut,
  m.created_at,
  m.updated_at,
  m.updated_by,
  m.nom_commercial_id,
  nc.valeur AS nom_commercial,
  nc.niveaux_connus AS nom_commercial_niveaux,
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
LEFT JOIN jeupharma.noms_commerciaux nc ON nc.id = m.nom_commercial_id
LEFT JOIN jeupharma.dcis d ON d.id = m.dci_id
LEFT JOIN jeupharma.secteurs_therapeutiques s ON s.id = m.secteur_therapeutique_id
LEFT JOIN jeupharma.classes_therapeutiques ct ON ct.id = m.classe_therapeutique_id
LEFT JOIN jeupharma.classes_pharmacologiques cp ON cp.id = m.classe_pharmacologique_id
LEFT JOIN jeupharma.details_pharmacologie dp ON dp.id = m.detail_pharmacologie_id
LEFT JOIN jeupharma.posologies_generales pg ON pg.id = m.posologie_generale_id
LEFT JOIN jeupharma.grossesse_allaitement ga ON ga.id = m.grossesse_allaitement_id;

COMMENT ON VIEW jeupharma.v_medicaments_complet IS
  'Fiches médicament + agrégats multi. Filtrer statut=publie côté joueur ; admin voit tout.';

GRANT SELECT ON jeupharma.v_medicaments_complet TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC : génération / ouverture / soumission quiz
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION jeupharma._libelle_champ(p_champ text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_champ
    WHEN 'nom_commercial' THEN 'nom commercial'
    WHEN 'dci' THEN 'DCI'
    WHEN 'secteur_therapeutique' THEN 'secteur thérapeutique'
    WHEN 'classe_therapeutique' THEN 'classe thérapeutique'
    WHEN 'classe_pharmacologique' THEN 'classe pharmacologique'
    WHEN 'detail_pharmacologie' THEN 'détail pharmacologie'
    WHEN 'posologie_generale' THEN 'posologie générale'
    WHEN 'grossesse_allaitement' THEN 'précautions grossesse & allaitement'
    WHEN 'indications' THEN 'indication'
    WHEN 'contre_indications' THEN 'contre-indication'
    WHEN 'effets_indesirables' THEN 'effet indésirable'
    WHEN 'precautions_emploi' THEN 'précaution d''emploi'
    WHEN 'interactions' THEN 'interaction'
    WHEN 'surveillances' THEN 'surveillance'
    WHEN 'voies_administration' THEN 'voie d''administration'
    ELSE p_champ
  END;
$$;

-- Résout (id, valeur, niveaux) pour un champ singulier ou multi (premier / aléatoire)
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
      FROM jeupharma.matrice_medicaments m
      JOIN jeupharma.noms_commerciaux nc ON nc.id = m.nom_commercial_id AND nc.actif
      WHERE m.id = p_matrice_id
        AND (p_niveau IS NULL OR p_niveau = ANY (nc.niveaux_connus));
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

CREATE OR REPLACE FUNCTION jeupharma._distracteurs_champ(
  p_champ text,
  p_exclure_id uuid,
  p_secteur_id uuid,
  p_niveau text,
  p_limit int
)
RETURNS TABLE (entite_id uuid, valeur text)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  -- Distracteurs : mêmes types d'entité, fiches publiées même secteur (fallback niveau)
  RETURN QUERY
  WITH candidats AS (
    SELECT v.entite_id, v.valeur, 1 AS prio
    FROM jeupharma.matrice_medicaments m
    CROSS JOIN LATERAL jeupharma._valeur_champ_matrice(m.id, p_champ, p_niveau) v
    WHERE m.statut = 'publie'
      AND (p_secteur_id IS NULL OR m.secteur_therapeutique_id = p_secteur_id)
      AND v.entite_id IS DISTINCT FROM p_exclure_id
    UNION ALL
    SELECT v.entite_id, v.valeur, 2 AS prio
    FROM jeupharma.matrice_medicaments m
    CROSS JOIN LATERAL jeupharma._valeur_champ_matrice(m.id, p_champ, p_niveau) v
    WHERE m.statut = 'publie'
      AND p_secteur_id IS NOT NULL
      AND m.secteur_therapeutique_id IS DISTINCT FROM p_secteur_id
      AND v.entite_id IS DISTINCT FROM p_exclure_id
  ),
  distincts AS (
    SELECT DISTINCT ON (c.entite_id) c.entite_id, c.valeur, c.prio
    FROM candidats c
    ORDER BY c.entite_id, c.prio
  )
  SELECT d.entite_id, d.valeur
  FROM distincts d
  ORDER BY d.prio, random()
  LIMIT greatest(p_limit, 0);
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
    SELECT nc.valeur INTO nom_val
    FROM jeupharma.matrice_medicaments m
    LEFT JOIN jeupharma.noms_commerciaux nc ON nc.id = m.nom_commercial_id
    WHERE m.id = mid;

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

    -- Mélange simple
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

CREATE OR REPLACE FUNCTION jeupharma.ouvrir_quiz(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  q jeupharma.quizz%ROWTYPE;
  out_snap jsonb;
  stripped jsonb := '[]'::jsonb;
  elem jsonb;
  props jsonb;
BEGIN
  IF NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT * INTO q
  FROM jeupharma.quizz
  WHERE upper(code_unique) = upper(trim(p_code))
    AND actif;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz introuvable ou inactif';
  END IF;

  IF q.snapshot_questions IS NULL OR jsonb_typeof(q.snapshot_questions) <> 'array' THEN
    RAISE EXCEPTION 'Quiz non généré (snapshot manquant)';
  END IF;

  IF q.mode = 'entrainement' THEN
    out_snap := q.snapshot_questions;
  ELSE
    -- Évaluation : propositions sans flag correct ni bonne_reponse_id
    FOR elem IN SELECT * FROM jsonb_array_elements(q.snapshot_questions)
    LOOP
      SELECT coalesce(jsonb_agg(
        jsonb_build_object('id', p->>'id', 'valeur', p->>'valeur')
        ORDER BY ordinality
      ), '[]'::jsonb)
      INTO props
      FROM jsonb_array_elements(elem->'propositions') WITH ORDINALITY AS t(p, ordinality);

      stripped := stripped || jsonb_build_array(jsonb_build_object(
        'ordre', elem->'ordre',
        'enonce', elem->'enonce',
        'matrice_id', elem->'matrice_id',
        'champ_code', elem->'champ_code',
        'propositions', props
      ));
    END LOOP;
    out_snap := stripped;
  END IF;

  RETURN jsonb_build_object(
    'id', q.id,
    'code_unique', q.code_unique,
    'titre', q.titre,
    'mode', q.mode,
    'niveau_cible', q.niveau_cible,
    'secteur_therapeutique_id', q.secteur_therapeutique_id,
    'questions', out_snap
  );
END;
$$;
REVOKE ALL ON FUNCTION jeupharma.ouvrir_quiz(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.ouvrir_quiz(text) TO authenticated;

CREATE OR REPLACE FUNCTION jeupharma.soumettre_quiz(p_quizz_id uuid, p_reponses jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  q jeupharma.quizz%ROWTYPE;
  elem jsonb;
  rep jsonb;
  bonne_id uuid;
  choix_id uuid;
  ok boolean;
  score int := 0;
  total int := 0;
  details jsonb := '[]'::jsonb;
  rid uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT * INTO q FROM jeupharma.quizz WHERE id = p_quizz_id AND actif;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz introuvable';
  END IF;
  IF q.snapshot_questions IS NULL THEN
    RAISE EXCEPTION 'Snapshot manquant';
  END IF;

  IF q.mode = 'evaluation' AND EXISTS (
    SELECT 1 FROM jeupharma.quizz_reponses_utilisateur r
    WHERE r.quizz_id = p_quizz_id
      AND r.utilisateur_id = auth.uid()
      AND r.mode = 'evaluation'
  ) THEN
    RAISE EXCEPTION 'Tentative évaluation déjà enregistrée';
  END IF;

  FOR elem IN SELECT * FROM jsonb_array_elements(q.snapshot_questions)
  LOOP
    total := total + 1;
    bonne_id := (elem->>'bonne_reponse_id')::uuid;
    choix_id := NULL;
    SELECT (r->>'proposition_id')::uuid INTO choix_id
    FROM jsonb_array_elements(coalesce(p_reponses, '[]'::jsonb)) r
    WHERE (r->>'ordre')::int = (elem->>'ordre')::int
       OR r->>'matrice_id' = elem->>'matrice_id'
    LIMIT 1;

    ok := (choix_id IS NOT NULL AND choix_id = bonne_id);
    IF ok THEN score := score + 1; END IF;

    details := details || jsonb_build_array(jsonb_build_object(
      'ordre', elem->'ordre',
      'matrice_id', elem->'matrice_id',
      'champ_code', elem->'champ_code',
      'proposition_id', choix_id,
      'bonne_reponse_id', bonne_id,
      'correct', ok
    ));
  END LOOP;

  INSERT INTO jeupharma.quizz_reponses_utilisateur (
    quizz_id, utilisateur_id, mode, score_obtenu, score_max, details_reponses
  ) VALUES (
    p_quizz_id, auth.uid(), q.mode, score, total, details
  )
  RETURNING id INTO rid;

  RETURN jsonb_build_object(
    'reponse_id', rid,
    'mode', q.mode,
    'score_obtenu', score,
    'score_max', total,
    'details', CASE WHEN q.mode = 'entrainement' THEN details ELSE details END
  );
END;
$$;
REVOKE ALL ON FUNCTION jeupharma.soumettre_quiz(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.soumettre_quiz(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC fusion entités (admin)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION jeupharma.fusionner_entites(
  p_table_name text,
  p_id_keep uuid,
  p_id_drop uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'pg_temp'
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

  -- FKs singulières matrice
  IF p_table_name = 'noms_commerciaux' THEN
    UPDATE jeupharma.matrice_medicaments SET nom_commercial_id = p_id_keep
      WHERE nom_commercial_id = p_id_drop;
  ELSIF p_table_name = 'dcis' THEN
    UPDATE jeupharma.matrice_medicaments SET dci_id = p_id_keep WHERE dci_id = p_id_drop;
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

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
  entity_tables text[] := ARRAY[
    'noms_commerciaux', 'dcis', 'secteurs_therapeutiques', 'classes_therapeutiques',
    'classes_pharmacologiques', 'details_pharmacologie', 'indications',
    'contre_indications', 'effets_indesirables', 'precautions_emploi',
    'posologies_generales', 'interactions', 'surveillances',
    'grossesse_allaitement', 'voies_administration'
  ];
  liaison_tables text[] := ARRAY[
    'matrice_indications', 'matrice_contre_indications', 'matrice_effets_indesirables',
    'matrice_precautions_emploi', 'matrice_interactions', 'matrice_surveillances',
    'matrice_voies_administration'
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

ALTER TABLE jeupharma.niveaux ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON jeupharma.niveaux TO authenticated;
GRANT ALL ON jeupharma.niveaux TO service_role;
DROP POLICY IF EXISTS niveaux_select ON jeupharma.niveaux;
CREATE POLICY niveaux_select ON jeupharma.niveaux
  FOR SELECT TO authenticated
  USING (jeupharma.has_jeupharma_access());

ALTER TABLE jeupharma.matrice_medicaments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON jeupharma.matrice_medicaments TO authenticated;
GRANT ALL ON jeupharma.matrice_medicaments TO service_role;
DROP POLICY IF EXISTS matrice_select ON jeupharma.matrice_medicaments;
CREATE POLICY matrice_select ON jeupharma.matrice_medicaments
  FOR SELECT TO authenticated
  USING (
    jeupharma.has_jeupharma_access()
    AND (statut = 'publie' OR jeupharma.is_portail_admin())
  );
DROP POLICY IF EXISTS matrice_admin ON jeupharma.matrice_medicaments;
CREATE POLICY matrice_admin ON jeupharma.matrice_medicaments
  FOR ALL TO authenticated
  USING (jeupharma.is_portail_admin())
  WITH CHECK (jeupharma.is_portail_admin());

-- Profil : soi
ALTER TABLE jeupharma.profil_apprentissage ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON jeupharma.profil_apprentissage TO authenticated;
GRANT ALL ON jeupharma.profil_apprentissage TO service_role;
DROP POLICY IF EXISTS profil_select_own ON jeupharma.profil_apprentissage;
CREATE POLICY profil_select_own ON jeupharma.profil_apprentissage
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR jeupharma.is_portail_admin());
DROP POLICY IF EXISTS profil_upsert_own ON jeupharma.profil_apprentissage;
CREATE POLICY profil_upsert_own ON jeupharma.profil_apprentissage
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS profil_update_own ON jeupharma.profil_apprentissage;
CREATE POLICY profil_update_own ON jeupharma.profil_apprentissage
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Quiz
ALTER TABLE jeupharma.quizz ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON jeupharma.quizz TO authenticated;
GRANT ALL ON jeupharma.quizz TO service_role;
DROP POLICY IF EXISTS quizz_select ON jeupharma.quizz;
CREATE POLICY quizz_select ON jeupharma.quizz
  FOR SELECT TO authenticated
  USING (jeupharma.has_jeupharma_access() AND (actif OR jeupharma.is_portail_admin()));
DROP POLICY IF EXISTS quizz_admin ON jeupharma.quizz;
CREATE POLICY quizz_admin ON jeupharma.quizz
  FOR ALL TO authenticated
  USING (jeupharma.is_portail_admin())
  WITH CHECK (jeupharma.is_portail_admin());

ALTER TABLE jeupharma.quizz_reponses_utilisateur ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON jeupharma.quizz_reponses_utilisateur TO authenticated;
GRANT ALL ON jeupharma.quizz_reponses_utilisateur TO service_role;
DROP POLICY IF EXISTS quizz_rep_select ON jeupharma.quizz_reponses_utilisateur;
CREATE POLICY quizz_rep_select ON jeupharma.quizz_reponses_utilisateur
  FOR SELECT TO authenticated
  USING (utilisateur_id = auth.uid() OR jeupharma.is_portail_admin());
DROP POLICY IF EXISTS quizz_rep_insert ON jeupharma.quizz_reponses_utilisateur;
CREATE POLICY quizz_rep_insert ON jeupharma.quizz_reponses_utilisateur
  FOR INSERT TO authenticated
  WITH CHECK (utilisateur_id = auth.uid() AND jeupharma.has_jeupharma_access());

-- Trous
ALTER TABLE jeupharma.parties_tableau_trous ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON jeupharma.parties_tableau_trous TO authenticated;
GRANT ALL ON jeupharma.parties_tableau_trous TO service_role;
DROP POLICY IF EXISTS parties_select ON jeupharma.parties_tableau_trous;
CREATE POLICY parties_select ON jeupharma.parties_tableau_trous
  FOR SELECT TO authenticated
  USING (jeupharma.has_jeupharma_access() AND (actif OR jeupharma.is_portail_admin()));
DROP POLICY IF EXISTS parties_admin ON jeupharma.parties_tableau_trous;
CREATE POLICY parties_admin ON jeupharma.parties_tableau_trous
  FOR ALL TO authenticated
  USING (jeupharma.is_portail_admin())
  WITH CHECK (jeupharma.is_portail_admin());

ALTER TABLE jeupharma.parties_reponses_utilisateur ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON jeupharma.parties_reponses_utilisateur TO authenticated;
GRANT ALL ON jeupharma.parties_reponses_utilisateur TO service_role;
DROP POLICY IF EXISTS parties_rep_select ON jeupharma.parties_reponses_utilisateur;
CREATE POLICY parties_rep_select ON jeupharma.parties_reponses_utilisateur
  FOR SELECT TO authenticated
  USING (utilisateur_id = auth.uid() OR jeupharma.is_portail_admin());
DROP POLICY IF EXISTS parties_rep_insert ON jeupharma.parties_reponses_utilisateur;
CREATE POLICY parties_rep_insert ON jeupharma.parties_reponses_utilisateur
  FOR INSERT TO authenticated
  WITH CHECK (utilisateur_id = auth.uid() AND jeupharma.has_jeupharma_access());

-- Bugs
ALTER TABLE jeupharma.bugs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON jeupharma.bugs TO authenticated;
GRANT ALL ON jeupharma.bugs TO service_role;
DROP POLICY IF EXISTS bugs_insert_own ON jeupharma.bugs;
CREATE POLICY bugs_insert_own ON jeupharma.bugs
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND jeupharma.has_jeupharma_access());
DROP POLICY IF EXISTS bugs_select_own_or_admin ON jeupharma.bugs;
CREATE POLICY bugs_select_own_or_admin ON jeupharma.bugs
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR jeupharma.is_portail_admin());
DROP POLICY IF EXISTS bugs_update_admin ON jeupharma.bugs;
CREATE POLICY bugs_update_admin ON jeupharma.bugs
  FOR UPDATE TO authenticated
  USING (jeupharma.is_portail_admin())
  WITH CHECK (jeupharma.is_portail_admin());

-- Logs
ALTER TABLE jeupharma.logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON jeupharma.logs TO authenticated;
GRANT ALL ON jeupharma.logs TO service_role;
DROP POLICY IF EXISTS logs_insert_access ON jeupharma.logs;
CREATE POLICY logs_insert_access ON jeupharma.logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND jeupharma.has_jeupharma_access());
DROP POLICY IF EXISTS logs_select_admin ON jeupharma.logs;
CREATE POLICY logs_select_admin ON jeupharma.logs
  FOR SELECT TO authenticated
  USING (jeupharma.is_portail_admin());

-- Historique : lecture admin ; écriture via trigger only
ALTER TABLE jeupharma.historique_modifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON jeupharma.historique_modifications TO authenticated;
GRANT ALL ON jeupharma.historique_modifications TO service_role;
DROP POLICY IF EXISTS historique_select_admin ON jeupharma.historique_modifications;
CREATE POLICY historique_select_admin ON jeupharma.historique_modifications
  FOR SELECT TO authenticated
  USING (jeupharma.is_portail_admin());

COMMENT ON SCHEMA jeupharma IS
  'Jeu Pharma — catalogue pédagogique (cours physiques), quiz/trous, bugs/logs. Pas de BDPM.';
