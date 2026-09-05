-- =============================================================================
-- Tables — module psl
-- DDL aligné projet Supabase live kpjflntnotftpzffjbud (2026-09-03)
-- Rôles canoniques app : admin | équipe (member = legacy CHECK seulement)
-- Source module : src/modules/psl/sql/tables.sql
-- =============================================================================
-- --- PharmaOs.psl_units ---
CREATE TABLE IF NOT EXISTS "PharmaOs".psl_units (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code_produit text NOT NULL,
  numero_unite text NOT NULL,
  groupe_abo text,
  rh text,
  date_peremption date,
  fournisseur text,
  statut text DEFAULT 'en_stock'::text NOT NULL,
  created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  denomination text,
  datamatrix_raw text,
  lot text,
  gtin text,
  UNIQUE (code_produit, numero_unite),
  CHECK ((statut = ANY (ARRAY['en_stock'::text, 'delivre'::text, 'detruit'::text, 'retourne'::text]))),
  FOREIGN KEY (created_by) REFERENCES portail.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY ("id")
);

-- --- PharmaOs.psl_movements ---
CREATE TABLE IF NOT EXISTS "PharmaOs".psl_movements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  unit_id uuid NOT NULL,
  movement_type text NOT NULL,
  patient_initiales text,
  patient_ipp text,
  user_id uuid,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  registry_number integer,
  prescripteur_nom text,
  prescripteur_adresse text,
  patient_nom text,
  patient_prenom text,
  patient_adresse text,
  patient_dob date,
  date_delivrance date,
  denomination text,
  quantite numeric DEFAULT 1,
  etiquette_tracabilite text,
  datamatrix_raw text,
  CHECK ((movement_type = ANY (ARRAY['reception'::text, 'delivrance'::text, 'destruction'::text, 'retour'::text]))),
  FOREIGN KEY (unit_id) REFERENCES "PharmaOs".psl_units(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES portail.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY ("id")
);
