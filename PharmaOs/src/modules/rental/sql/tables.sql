-- =============================================================================
-- Tables — module rental
-- DDL aligné projet Supabase live kpjflntnotftpzffjbud (2026-09-03)
-- Rôles canoniques app : admin | équipe (member = legacy CHECK seulement)
-- Source module : src/modules/rental/sql/tables.sql
-- =============================================================================
-- --- PharmaOs.rental_assets ---
CREATE TABLE IF NOT EXISTS "PharmaOs".rental_assets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  asset_type text NOT NULL,
  label text,
  origine text DEFAULT 'interne'::text NOT NULL,
  numero_interne text,
  numero_serie_prestataire text,
  prestataire_id uuid,
  requires_coverage_check boolean DEFAULT false NOT NULL,
  status text DEFAULT 'disponible'::text NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CHECK ((asset_type = ANY (ARRAY['lit'::text, 'tens'::text, 'aerosol'::text, 'balance_bebe'::text, 'tensiometre'::text, 'fauteuil_roulant'::text, 'autre'::text]))),
  CHECK ((origine = ANY (ARRAY['interne'::text, 'prestataire'::text]))),
  CHECK ((status = ANY (ARRAY['disponible'::text, 'loue'::text, 'maintenance'::text, 'retire'::text]))),
  FOREIGN KEY (prestataire_id) REFERENCES "PharmaOs".directory_contacts(id) ON DELETE SET NULL,
  PRIMARY KEY ("id")
);

-- --- PharmaOs.rental_contracts ---
CREATE TABLE IF NOT EXISTS "PharmaOs".rental_contracts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  asset_id uuid,
  patient_nom text NOT NULL,
  patient_prenom text NOT NULL,
  patient_dob date,
  addons jsonb DEFAULT '{}'::jsonb NOT NULL,
  date_sortie timestamptz DEFAULT now(),
  date_retour timestamptz,
  caution_type text,
  caution_montant numeric,
  caution_restituee boolean DEFAULT false,
  statut text DEFAULT 'en_cours'::text NOT NULL,
  checklist_iso jsonb DEFAULT '{}'::jsonb NOT NULL,
  coverage_checked boolean DEFAULT false,
  created_by uuid,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  asset_type_requested text,
  prescription_scanned boolean DEFAULT false NOT NULL,
  prescription_valid_until date,
  billing_status text DEFAULT 'en_attente'::text NOT NULL,
  billing_weeks jsonb DEFAULT '[]'::jsonb NOT NULL,
  billing_notes text,
  source_type text,
  numero_serie text,
  caution_encaissee boolean DEFAULT false NOT NULL,
  retour_etat text,
  ordonnance_a_jour boolean,
  desinfection_faite boolean DEFAULT false NOT NULL,
  retour_prestataire boolean DEFAULT false NOT NULL,
  CHECK ((caution_type = ANY (ARRAY['cheque'::text, 'carte'::text]))),
  CHECK (((source_type IS NULL) OR (source_type = ANY (ARRAY['stock_pharma'::text, 'stock_presta'::text, 'commande'::text])))),
  CHECK ((statut = ANY (ARRAY['attente_reception'::text, 'en_cours'::text, 'retourne'::text]))),
  FOREIGN KEY (asset_id) REFERENCES "PharmaOs".rental_assets(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES portail.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY ("id")
);

-- --- PharmaOs.rental_events ---
CREATE TABLE IF NOT EXISTS "PharmaOs".rental_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  contract_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  user_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  CHECK ((event_type = ANY (ARRAY['sortie'::text, 'retour'::text, 'incident'::text, 'note'::text]))),
  FOREIGN KEY (contract_id) REFERENCES "PharmaOs".rental_contracts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES portail.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY ("id")
);
