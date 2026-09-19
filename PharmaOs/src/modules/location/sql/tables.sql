-- =============================================================================
-- Tables — module location (port PhieEvreux → schéma PharmaOs)
-- Aligné colonnes / CHECK phieevreux.location_* (projet kpjflntnotftpzffjbud)
-- Source : src/modules/location/sql/tables.sql
-- =============================================================================

-- --- PharmaOs.location_patients ---
CREATE TABLE IF NOT EXISTS "PharmaOs".location_patients (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nom text NOT NULL,
  prenom text NOT NULL,
  date_naissance date,
  adresse text,
  telephones text[] DEFAULT '{}'::text[] NOT NULL,
  mails text[] DEFAULT '{}'::text[] NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

-- --- PharmaOs.location_prestataires ---
CREATE TABLE IF NOT EXISTS "PharmaOs".location_prestataires (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nom text NOT NULL,
  contact text,
  telephone text,
  email text,
  notes text,
  actif boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

-- --- PharmaOs.location_templates_contact ---
CREATE TABLE IF NOT EXISTS "PharmaOs".location_templates_contact (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  type_appareil text,
  motif text NOT NULL,
  titre text NOT NULL,
  corps text DEFAULT ''::text NOT NULL,
  actif boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CHECK ((type_appareil IS NULL) OR (type_appareil = ANY (ARRAY['aerosol'::text, 'tire_lait'::text, 'pese_bebe'::text, 'tens'::text, 'fauteuil'::text, 'autre'::text]))),
  PRIMARY KEY (id)
);

-- --- PharmaOs.location_parametres ---
CREATE TABLE IF NOT EXISTS "PharmaOs".location_parametres (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  cle text NOT NULL,
  valeur jsonb DEFAULT '{}'::jsonb NOT NULL,
  description text,
  updated_at timestamptz DEFAULT now() NOT NULL,
  updated_by uuid,
  UNIQUE (cle),
  FOREIGN KEY (updated_by) REFERENCES portail.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (id)
);

-- --- PharmaOs.location_dossiers ---
CREATE TABLE IF NOT EXISTS "PharmaOs".location_dossiers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  patient_id uuid NOT NULL,
  code_op text,
  caution text,
  caution_rendue boolean DEFAULT false NOT NULL,
  caution_rendue_le date,
  caution_rendue_op text,
  statut text DEFAULT 'actif'::text NOT NULL,
  date_debut date,
  date_cloture date,
  cloture_op text,
  appareil_rendu boolean DEFAULT false NOT NULL,
  qui_facture text DEFAULT 'pharmacie'::text NOT NULL,
  created_by uuid,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  facturation_ok boolean,
  appareil_rendu_le date,
  appareil_rendu_op text,
  facturation_ok_le date,
  facturation_ok_op text,
  journal text,
  CHECK ((caution IS NULL) OR (caution = ANY (ARRAY['cheque_150'::text, 'especes'::text, 'autre'::text]))),
  CHECK (qui_facture = ANY (ARRAY['pharmacie'::text, 'prestataire'::text])),
  CHECK (statut = ANY (ARRAY['actif'::text, 'cloture'::text, 'annule'::text, 'en_attente'::text])),
  FOREIGN KEY (patient_id) REFERENCES "PharmaOs".location_patients(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES portail.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (id)
);

-- --- PharmaOs.location_appareils ---
CREATE TABLE IF NOT EXISTS "PharmaOs".location_appareils (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  dossier_id uuid NOT NULL,
  type_appareil text NOT NULL,
  type_libelle text,
  source text DEFAULT 'parc'::text NOT NULL,
  prestataire_id uuid,
  matricule text,
  numero_pharmacie text,
  mode_obtention text,
  livraison text,
  desinfection boolean DEFAULT false NOT NULL,
  encart_texte text,
  pese_bebe_regler_avance boolean,
  pese_bebe_periode text,
  facturation_prestataire boolean DEFAULT false NOT NULL,
  date_accouchement date,
  actif boolean DEFAULT true NOT NULL,
  date_debut date,
  date_fin date,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  champs_extra jsonb DEFAULT '{}'::jsonb NOT NULL,
  CHECK (type_appareil = ANY (ARRAY['aerosol'::text, 'tire_lait'::text, 'pese_bebe'::text, 'tens'::text, 'fauteuil'::text, 'autre'::text])),
  CHECK ((livraison IS NULL) OR (livraison = ANY (ARRAY['pharmacie'::text, 'patient'::text]))),
  CHECK ((pese_bebe_periode IS NULL) OR (pese_bebe_periode = ANY (ARRAY['semaine'::text, 'mois'::text]))),
  CHECK ((mode_obtention IS NULL) OR (mode_obtention = ANY (ARRAY['depot'::text, 'appel'::text]))),
  CHECK (source = ANY (ARRAY['parc'::text, 'prestataire'::text])),
  FOREIGN KEY (dossier_id) REFERENCES "PharmaOs".location_dossiers(id) ON DELETE CASCADE,
  FOREIGN KEY (prestataire_id) REFERENCES "PharmaOs".location_prestataires(id) ON DELETE SET NULL,
  PRIMARY KEY (id)
);

-- --- PharmaOs.location_prolongations ---
CREATE TABLE IF NOT EXISTS "PharmaOs".location_prolongations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  dossier_id uuid NOT NULL,
  date_ordo date,
  duree integer NOT NULL,
  unite text NOT NULL,
  date_fin date,
  notes text,
  created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  CHECK (unite = ANY (ARRAY['jours'::text, 'semaines'::text, 'mois'::text])),
  CHECK (duree > 0),
  FOREIGN KEY (dossier_id) REFERENCES "PharmaOs".location_dossiers(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES portail.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (id)
);

-- --- PharmaOs.location_suivi_lignes ---
CREATE TABLE IF NOT EXISTS "PharmaOs".location_suivi_lignes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  dossier_id uuid NOT NULL,
  appareil_id uuid,
  date_ligne date,
  libelle text,
  details text,
  created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  FOREIGN KEY (dossier_id) REFERENCES "PharmaOs".location_dossiers(id) ON DELETE CASCADE,
  FOREIGN KEY (appareil_id) REFERENCES "PharmaOs".location_appareils(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES portail.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (id)
);

-- --- PharmaOs.location_regles ---
CREATE TABLE IF NOT EXISTS "PharmaOs".location_regles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text NOT NULL,
  nom text NOT NULL,
  type_appareil text,
  conditions jsonb DEFAULT '{}'::jsonb NOT NULL,
  action text NOT NULL,
  message text,
  actif boolean DEFAULT true NOT NULL,
  priorite integer DEFAULT 100 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  template_id uuid,
  UNIQUE (code),
  CHECK ((type_appareil IS NULL) OR (type_appareil = ANY (ARRAY['aerosol'::text, 'tire_lait'::text, 'pese_bebe'::text, 'tens'::text, 'fauteuil'::text, 'autre'::text]))),
  FOREIGN KEY (template_id) REFERENCES "PharmaOs".location_templates_contact(id) ON DELETE SET NULL,
  PRIMARY KEY (id)
);

-- --- PharmaOs.location_contacts ---
CREATE TABLE IF NOT EXISTS "PharmaOs".location_contacts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  dossier_id uuid NOT NULL,
  motif text,
  statut text DEFAULT 'a_contacter'::text NOT NULL,
  commentaire text,
  resultat text,
  canal text,
  planned_at timestamptz,
  contacted_at timestamptz,
  created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  phase text DEFAULT 'commentaire'::text NOT NULL,
  phase_date_fin date,
  commentaire_fait_at timestamptz,
  mail_envoye boolean DEFAULT false NOT NULL,
  CHECK ((canal IS NULL) OR (canal = ANY (ARRAY['telephone'::text, 'mail'::text, 'comptoir'::text]))),
  CHECK (phase = ANY (ARRAY['commentaire'::text, 'appel'::text])),
  CHECK (statut = ANY (ARRAY['a_contacter'::text, 'en_cours'::text, 'contacte'::text, 'reporte'::text, 'annule'::text, 'resolu'::text])),
  FOREIGN KEY (dossier_id) REFERENCES "PharmaOs".location_dossiers(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES portail.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (id)
);

-- --- PharmaOs.location_champs_creation ---
CREATE TABLE IF NOT EXISTS "PharmaOs".location_champs_creation (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  type_appareil text NOT NULL,
  code text NOT NULL,
  libelle text NOT NULL,
  data_type text NOT NULL,
  options jsonb DEFAULT '{}'::jsonb NOT NULL,
  obligatoire boolean DEFAULT false NOT NULL,
  ordre integer DEFAULT 100 NOT NULL,
  actif boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (type_appareil, code),
  CHECK (type_appareil = ANY (ARRAY['aerosol'::text, 'tire_lait'::text, 'pese_bebe'::text, 'tens'::text, 'fauteuil'::text, 'autre'::text])),
  CHECK (data_type = ANY (ARRAY['texte'::text, 'date'::text, 'oui_non'::text, 'nombre'::text, 'liste'::text, 'attention'::text])),
  PRIMARY KEY (id)
);

-- Index utiles
CREATE INDEX IF NOT EXISTS location_dossiers_statut_idx ON "PharmaOs".location_dossiers (statut);
CREATE INDEX IF NOT EXISTS location_dossiers_patient_idx ON "PharmaOs".location_dossiers (patient_id);
CREATE INDEX IF NOT EXISTS location_appareils_dossier_idx ON "PharmaOs".location_appareils (dossier_id);
CREATE INDEX IF NOT EXISTS location_contacts_dossier_idx ON "PharmaOs".location_contacts (dossier_id);
CREATE INDEX IF NOT EXISTS location_contacts_statut_idx ON "PharmaOs".location_contacts (statut);
CREATE INDEX IF NOT EXISTS location_regles_template_id_idx ON "PharmaOs".location_regles (template_id);

-- Paramètres seed minimaux
INSERT INTO "PharmaOs".location_parametres (cle, valeur)
SELECT 'seuil_contact_jours', to_jsonb(7)
WHERE NOT EXISTS (SELECT 1 FROM "PharmaOs".location_parametres WHERE cle = 'seuil_contact_jours');

INSERT INTO "PharmaOs".location_parametres (cle, valeur)
SELECT 'seuil_reclame_mois', to_jsonb(6)
WHERE NOT EXISTS (SELECT 1 FROM "PharmaOs".location_parametres WHERE cle = 'seuil_reclame_mois');

INSERT INTO "PharmaOs".location_parametres (cle, valeur)
SELECT 'qui_facture_defaut', to_jsonb('pharmacie'::text)
WHERE NOT EXISTS (SELECT 1 FROM "PharmaOs".location_parametres WHERE cle = 'qui_facture_defaut');
