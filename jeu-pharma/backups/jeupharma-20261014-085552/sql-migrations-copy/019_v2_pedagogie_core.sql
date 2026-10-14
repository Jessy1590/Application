-- =============================================================================
-- 019 : Jeu Pharma V2 — référentiel versionné + parcours/modules + publications
-- Additif : ne touche pas aux tables V1 (matrice_*, quizz, parties_*, niveau_*).
-- Ne pas confondre avec 018 (vue legacy, non appliqué).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Sources & imports (provenance)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS jeupharma.sources_contenu (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  libelle text NOT NULL,
  type_source text NOT NULL CHECK (type_source = ANY (ARRAY[
    'cours'::text, 'rcp'::text, 'referentiel'::text, 'migration_v1'::text
  ])),
  description text NOT NULL DEFAULT '',
  actif boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES portail.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jeupharma.versions_source (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES jeupharma.sources_contenu(id) ON DELETE CASCADE,
  version_label text NOT NULL,
  reference_externe text,
  content_hash text,
  statut text NOT NULL DEFAULT 'brouillon' CHECK (statut = ANY (ARRAY[
    'brouillon'::text, 'a_valider'::text, 'valide'::text, 'retire'::text
  ])),
  notes text NOT NULL DEFAULT '',
  published_at timestamptz,
  created_by uuid REFERENCES portail.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, version_label)
);

CREATE TABLE IF NOT EXISTS jeupharma.imports_source (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES jeupharma.sources_contenu(id) ON DELETE CASCADE,
  version_source_id uuid REFERENCES jeupharma.versions_source(id) ON DELETE SET NULL,
  statut text NOT NULL DEFAULT 'en_cours' CHECK (statut = ANY (ARRAY[
    'en_cours'::text, 'termine'::text, 'erreur'::text, 'annule'::text
  ])),
  resume_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  erreurs_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES portail.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS versions_source_source_idx
  ON jeupharma.versions_source (source_id, statut);
CREATE INDEX IF NOT EXISTS imports_source_source_idx
  ON jeupharma.imports_source (source_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Connaissances atomiques versionnées
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS jeupharma.connaissances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matrice_id uuid NOT NULL REFERENCES jeupharma.matrice_medicaments(id) ON DELETE CASCADE,
  champ_code text NOT NULL CHECK (champ_code IN (
    'nom_commercial', 'dci', 'secteur_therapeutique',
    'classe_therapeutique', 'classe_pharmacologique',
    'detail_pharmacologie', 'indications', 'contre_indications',
    'effets_indesirables', 'precautions_emploi', 'interactions',
    'surveillances', 'posologie_generale', 'grossesse_allaitement',
    'voies_administration'
  )),
  entite_id uuid,
  entite_key uuid GENERATED ALWAYS AS (
    coalesce(entite_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED,
  texte text NOT NULL,
  texte_norm text NOT NULL,
  statut text NOT NULL DEFAULT 'brouillon' CHECK (statut = ANY (ARRAY[
    'brouillon'::text, 'a_valider'::text, 'valide'::text, 'retire'::text
  ])),
  source_id uuid REFERENCES jeupharma.sources_contenu(id) ON DELETE SET NULL,
  version_source_id uuid REFERENCES jeupharma.versions_source(id) ON DELETE SET NULL,
  revision int NOT NULL DEFAULT 1,
  ordre int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES portail.profiles(id) ON DELETE SET NULL,
  validated_by uuid REFERENCES portail.profiles(id) ON DELETE SET NULL,
  validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS connaissances_matrice_champ_entite_uidx
  ON jeupharma.connaissances (matrice_id, champ_code, entite_key)
  WHERE statut <> 'retire';

CREATE INDEX IF NOT EXISTS connaissances_matrice_idx
  ON jeupharma.connaissances (matrice_id, champ_code, statut);
CREATE INDEX IF NOT EXISTS connaissances_texte_norm_idx
  ON jeupharma.connaissances (texte_norm);

CREATE TABLE IF NOT EXISTS jeupharma.connaissances_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connaissance_id uuid NOT NULL REFERENCES jeupharma.connaissances(id) ON DELETE CASCADE,
  revision int NOT NULL,
  texte text NOT NULL,
  texte_norm text NOT NULL,
  statut text NOT NULL,
  source_id uuid,
  version_source_id uuid,
  changed_by uuid REFERENCES portail.profiles(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connaissance_id, revision)
);

CREATE TABLE IF NOT EXISTS jeupharma.connaissances_alias (
  old_entite_id uuid PRIMARY KEY,
  connaissance_id uuid NOT NULL REFERENCES jeupharma.connaissances(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3. Parcours / modules / publications / progression
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS jeupharma.parcours_apprentissage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  libelle text NOT NULL,
  description text NOT NULL DEFAULT '',
  niveau_lie text REFERENCES jeupharma.niveaux(code) ON DELETE SET NULL,
  mode_contenu text NOT NULL DEFAULT 'publications' CHECK (mode_contenu = ANY (ARRAY[
    'publications'::text,  -- uniquement connaissances publiées dans modules débloqués
    'referentiel_valide'::text -- toutes connaissances statut=valide (parcours pharmacien)
  ])),
  actif boolean NOT NULL DEFAULT true,
  ordre int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES portail.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jeupharma.modules_cours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parcours_id uuid NOT NULL REFERENCES jeupharma.parcours_apprentissage(id) ON DELETE CASCADE,
  code text NOT NULL,
  titre text NOT NULL,
  resume text NOT NULL DEFAULT '',
  objectifs text NOT NULL DEFAULT '',
  ordre int NOT NULL DEFAULT 0,
  prerequis_module_id uuid REFERENCES jeupharma.modules_cours(id) ON DELETE SET NULL,
  publie boolean NOT NULL DEFAULT false,
  version_publication int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES portail.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parcours_id, code)
);

CREATE INDEX IF NOT EXISTS modules_cours_parcours_ordre_idx
  ON jeupharma.modules_cours (parcours_id, ordre);

CREATE TABLE IF NOT EXISTS jeupharma.publications_connaissances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES jeupharma.modules_cours(id) ON DELETE CASCADE,
  connaissance_id uuid NOT NULL REFERENCES jeupharma.connaissances(id) ON DELETE CASCADE,
  libelle_pedagogique text,
  ordre int NOT NULL DEFAULT 0,
  version_publication int NOT NULL DEFAULT 1,
  publie_le timestamptz NOT NULL DEFAULT now(),
  publie_par uuid REFERENCES portail.profiles(id) ON DELETE SET NULL,
  actif boolean NOT NULL DEFAULT true,
  UNIQUE (module_id, connaissance_id)
);

CREATE INDEX IF NOT EXISTS publications_module_idx
  ON jeupharma.publications_connaissances (module_id, actif);
CREATE INDEX IF NOT EXISTS publications_connaissance_idx
  ON jeupharma.publications_connaissances (connaissance_id);

CREATE TABLE IF NOT EXISTS jeupharma.inscriptions_parcours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES portail.profiles(id) ON DELETE CASCADE,
  parcours_id uuid NOT NULL REFERENCES jeupharma.parcours_apprentissage(id) ON DELETE CASCADE,
  actif boolean NOT NULL DEFAULT true,
  debut_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, parcours_id)
);

CREATE INDEX IF NOT EXISTS inscriptions_user_actif_idx
  ON jeupharma.inscriptions_parcours (user_id) WHERE actif;

CREATE TABLE IF NOT EXISTS jeupharma.progression_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES portail.profiles(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES jeupharma.modules_cours(id) ON DELETE CASCADE,
  statut text NOT NULL DEFAULT 'verrouille' CHECK (statut = ANY (ARRAY[
    'verrouille'::text, 'debloque'::text, 'termine'::text
  ])),
  debloque_at timestamptz,
  termine_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_id)
);

-- Profil : parcours actif (nullable = comportement V1 via niveau_id)
ALTER TABLE jeupharma.profil_apprentissage
  ADD COLUMN IF NOT EXISTS parcours_id uuid REFERENCES jeupharma.parcours_apprentissage(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profil_parcours_idx
  ON jeupharma.profil_apprentissage (parcours_id);

-- ---------------------------------------------------------------------------
-- 4. Jeux V2 (modèles + tentatives)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS jeupharma.modeles_jeu (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_unique varchar(10) NOT NULL UNIQUE,
  type_jeu text NOT NULL CHECK (type_jeu = ANY (ARRAY[
    'quiz'::text, 'trous'::text, 'ordonnance'::text, 'fiche_aleatoire'::text
  ])),
  titre text NOT NULL,
  parcours_id uuid REFERENCES jeupharma.parcours_apprentissage(id) ON DELETE SET NULL,
  module_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  mode text NOT NULL DEFAULT 'entrainement' CHECK (mode = ANY (ARRAY[
    'entrainement'::text, 'evaluation'::text
  ])),
  configuration_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_json jsonb,
  en_pause boolean NOT NULL DEFAULT false,
  actif boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES portail.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT modeles_jeu_code_format CHECK (code_unique ~ '^JP-[A-Z0-9]{5}$')
);

CREATE INDEX IF NOT EXISTS modeles_jeu_type_actif_idx
  ON jeupharma.modeles_jeu (type_jeu, actif, en_pause);
CREATE INDEX IF NOT EXISTS modeles_jeu_parcours_idx
  ON jeupharma.modeles_jeu (parcours_id);

CREATE TABLE IF NOT EXISTS jeupharma.tentatives_jeu (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modele_id uuid NOT NULL REFERENCES jeupharma.modeles_jeu(id) ON DELETE CASCADE,
  utilisateur_id uuid NOT NULL REFERENCES portail.profiles(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode = ANY (ARRAY['entrainement'::text, 'evaluation'::text])),
  snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  reponses_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  score_obtenu numeric,
  score_max numeric,
  details_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  revele_at timestamptz,
  termine_at timestamptz,
  parent_tentative_id uuid REFERENCES jeupharma.tentatives_jeu(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tentatives_jeu_user_idx
  ON jeupharma.tentatives_jeu (utilisateur_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tentatives_jeu_modele_idx
  ON jeupharma.tentatives_jeu (modele_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS tentatives_jeu_eval_unique
  ON jeupharma.tentatives_jeu (modele_id, utilisateur_id)
  WHERE mode = 'evaluation' AND termine_at IS NOT NULL;

-- Triggers updated_at
DROP TRIGGER IF EXISTS trg_sources_set_updated_at ON jeupharma.sources_contenu;
CREATE TRIGGER trg_sources_set_updated_at
  BEFORE UPDATE ON jeupharma.sources_contenu
  FOR EACH ROW EXECUTE FUNCTION jeupharma.set_updated_at();

DROP TRIGGER IF EXISTS trg_versions_source_set_updated_at ON jeupharma.versions_source;
CREATE TRIGGER trg_versions_source_set_updated_at
  BEFORE UPDATE ON jeupharma.versions_source
  FOR EACH ROW EXECUTE FUNCTION jeupharma.set_updated_at();

DROP TRIGGER IF EXISTS trg_connaissances_set_updated_at ON jeupharma.connaissances;
CREATE TRIGGER trg_connaissances_set_updated_at
  BEFORE UPDATE ON jeupharma.connaissances
  FOR EACH ROW EXECUTE FUNCTION jeupharma.set_updated_at();

DROP TRIGGER IF EXISTS trg_parcours_set_updated_at ON jeupharma.parcours_apprentissage;
CREATE TRIGGER trg_parcours_set_updated_at
  BEFORE UPDATE ON jeupharma.parcours_apprentissage
  FOR EACH ROW EXECUTE FUNCTION jeupharma.set_updated_at();

DROP TRIGGER IF EXISTS trg_modules_set_updated_at ON jeupharma.modules_cours;
CREATE TRIGGER trg_modules_set_updated_at
  BEFORE UPDATE ON jeupharma.modules_cours
  FOR EACH ROW EXECUTE FUNCTION jeupharma.set_updated_at();

DROP TRIGGER IF EXISTS trg_modeles_jeu_set_updated_at ON jeupharma.modeles_jeu;
CREATE TRIGGER trg_modeles_jeu_set_updated_at
  BEFORE UPDATE ON jeupharma.modeles_jeu
  FOR EACH ROW EXECUTE FUNCTION jeupharma.set_updated_at();

COMMENT ON TABLE jeupharma.sources_contenu IS 'V2 — provenance cours / RCP / migration.';
COMMENT ON TABLE jeupharma.connaissances IS 'V2 — assertions atomiques versionnées (référentiel).';
COMMENT ON TABLE jeupharma.parcours_apprentissage IS 'V2 — parcours pédagogiques cumulatifs.';
COMMENT ON TABLE jeupharma.publications_connaissances IS 'V2 — ce qui est explicitement enseigné dans un module.';
COMMENT ON TABLE jeupharma.modeles_jeu IS 'V2 — modèles de jeux liés à un parcours/modules.';
