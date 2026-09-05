-- =============================================================================
-- 006 — modules métier
-- DDL aligné projet Supabase live kpjflntnotftpzffjbud (2026-09-03)
-- Rôles canoniques app : admin | équipe (member = legacy CHECK seulement)
-- Source module : src/modules/rental/sql/
-- Source module : src/modules/magistral/sql/
-- Source module : src/modules/psl/sql/
-- Source module : src/modules/cash/sql/
-- Source module : src/modules/lot-alerts/sql/
-- Source module : src/modules/disputes/sql/
-- Source module : src/modules/hr/sql/
-- =============================================================================

-- >>> src/modules/rental/sql :: PharmaOs.rental_assets
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

-- >>> src/modules/rental/sql :: PharmaOs.rental_contracts
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

-- >>> src/modules/rental/sql :: PharmaOs.rental_events
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

-- >>> src/modules/magistral/sql :: PharmaOs.magistral_providers
CREATE TABLE IF NOT EXISTS "PharmaOs".magistral_providers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  delai_jours integer DEFAULT 5,
  actif boolean DEFAULT true NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("id")
);

-- >>> src/modules/magistral/sql :: PharmaOs.magistral_price_rules
CREATE TABLE IF NOT EXISTS "PharmaOs".magistral_price_rules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  forme text,
  base_price numeric DEFAULT 0 NOT NULL,
  coefficient numeric DEFAULT 1 NOT NULL,
  unit text DEFAULT 'unité'::text,
  params jsonb DEFAULT '{}'::jsonb NOT NULL,
  actif boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("id")
);

-- >>> src/modules/magistral/sql :: PharmaOs.magistral_settings
CREATE TABLE IF NOT EXISTS "PharmaOs".magistral_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  pharmacy_name text,
  pharmacy_address text,
  pharmacy_email text,
  pharmacy_interlocuteur text,
  provider_name text,
  provider_email text,
  frais_port numeric DEFAULT 0 NOT NULL,
  coefficient numeric DEFAULT 1 NOT NULL,
  tva_rate numeric DEFAULT 5.5 NOT NULL,
  internal_prep_enabled boolean DEFAULT false NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("id")
);

-- >>> src/modules/magistral/sql :: PharmaOs.magistral_orders
CREATE TABLE IF NOT EXISTS "PharmaOs".magistral_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  provider_id uuid,
  price_rule_id uuid,
  formule text NOT NULL,
  patient_initiales text,
  quantite numeric DEFAULT 1,
  forme text,
  prix_calcule numeric,
  statut text DEFAULT 'devis'::text NOT NULL,
  email_sent_at timestamptz,
  received_at timestamptz,
  created_by uuid,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  form_data jsonb DEFAULT '{}'::jsonb NOT NULL,
  prix_ht_net numeric,
  patient_email text,
  ordonnance_path text,
  preparation_interne boolean DEFAULT false NOT NULL,
  closed_at timestamptz,
  closed_reason text,
  tva_rate numeric,
  CHECK ((statut = ANY (ARRAY['devis'::text, 'commande'::text, 'receptionne'::text, 'cloture'::text]))),
  FOREIGN KEY (created_by) REFERENCES portail.profiles(id) ON DELETE SET NULL,
  FOREIGN KEY (price_rule_id) REFERENCES "PharmaOs".magistral_price_rules(id) ON DELETE SET NULL,
  FOREIGN KEY (provider_id) REFERENCES "PharmaOs".magistral_providers(id) ON DELETE SET NULL,
  PRIMARY KEY ("id")
);

-- >>> src/modules/psl/sql :: PharmaOs.psl_units
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

-- >>> src/modules/psl/sql :: PharmaOs.psl_movements
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

-- >>> src/modules/cash/sql :: PharmaOs.cash_closures
CREATE TABLE IF NOT EXISTS "PharmaOs".cash_closures (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  closure_date date NOT NULL,
  author_id uuid NOT NULL,
  author_name text,
  fond_reel numeric DEFAULT 0 NOT NULL,
  fond_logiciel numeric DEFAULT 0 NOT NULL,
  montant_cb numeric DEFAULT 0 NOT NULL,
  argent_lieu_sur numeric DEFAULT 0 NOT NULL,
  nb_cheques integer DEFAULT 0 NOT NULL,
  montant_cheques numeric DEFAULT 0 NOT NULL,
  garde boolean DEFAULT false NOT NULL,
  sortie_particuliere boolean DEFAULT false NOT NULL,
  sortie_montant numeric DEFAULT 0,
  sortie_motif text,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (closure_date, author_id),
  FOREIGN KEY (author_id) REFERENCES portail.profiles(id) ON DELETE RESTRICT,
  PRIMARY KEY ("id")
);

-- >>> src/modules/cash/sql :: PharmaOs.app_settings
CREATE TABLE IF NOT EXISTS "PharmaOs".app_settings (
  key text NOT NULL,
  value jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("key")
);

-- >>> src/modules/lot-alerts/sql :: PharmaOs.lot_alerts
CREATE TABLE IF NOT EXISTS "PharmaOs".lot_alerts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  alert_number text NOT NULL,
  declarant_id uuid,
  medicament text NOT NULL,
  lot text NOT NULL,
  laboratoire text,
  motif text,
  source text DEFAULT 'manuel'::text NOT NULL,
  external_ref text,
  steps_done text,
  reception_validated_at timestamptz,
  requires_return boolean DEFAULT false NOT NULL,
  return_location text,
  task_id uuid,
  status text DEFAULT 'ouvert'::text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CHECK ((source = ANY (ARRAY['manuel'::text, 'ansm'::text]))),
  CHECK ((status = ANY (ARRAY['ouvert'::text, 'en_cours'::text, 'clos'::text]))),
  FOREIGN KEY (declarant_id) REFERENCES portail.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY ("id")
);

-- >>> src/modules/lot-alerts/sql :: PharmaOs.lot_alert_acks
CREATE TABLE IF NOT EXISTS "PharmaOs".lot_alert_acks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  alert_id uuid NOT NULL,
  user_id uuid NOT NULL,
  read_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (alert_id, user_id),
  FOREIGN KEY (alert_id) REFERENCES "PharmaOs".lot_alerts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES portail.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY ("id")
);

-- >>> src/modules/disputes/sql :: PharmaOs.supplier_disputes
CREATE TABLE IF NOT EXISTS "PharmaOs".supplier_disputes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  dispute_type text NOT NULL,
  fournisseur_id uuid,
  fournisseur_nom text,
  montant numeric,
  statut text DEFAULT 'ouvert'::text NOT NULL,
  pieces text,
  description text,
  lot_alert_id uuid,
  stock_error_id uuid,
  created_by uuid,
  closed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CHECK ((dispute_type = ANY (ARRAY['commande'::text, 'facturation'::text, 'perimes'::text, 'challenge'::text, 'retrait_lot'::text, 'autre'::text]))),
  CHECK ((statut = ANY (ARRAY['ouvert'::text, 'en_cours'::text, 'clos'::text]))),
  FOREIGN KEY (created_by) REFERENCES portail.profiles(id) ON DELETE SET NULL,
  FOREIGN KEY (fournisseur_id) REFERENCES "PharmaOs".directory_contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (lot_alert_id) REFERENCES "PharmaOs".lot_alerts(id) ON DELETE SET NULL,
  PRIMARY KEY ("id")
);

-- >>> src/modules/hr/sql :: PharmaOs.work_schedules
CREATE TABLE IF NOT EXISTS "PharmaOs".work_schedules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  day_of_week integer NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  label text,
  actif boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CHECK (((day_of_week >= 0) AND (day_of_week <= 6))),
  FOREIGN KEY (user_id) REFERENCES portail.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY ("id")
);

-- >>> src/modules/hr/sql :: PharmaOs.hr_absences
CREATE TABLE IF NOT EXISTS "PharmaOs".hr_absences (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  absence_type text NOT NULL,
  date_debut date NOT NULL,
  date_fin date NOT NULL,
  motif text,
  created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  CHECK ((absence_type = ANY (ARRAY['conge'::text, 'absence'::text, 'maladie'::text, 'rtt'::text, 'formation'::text, 'autre'::text]))),
  FOREIGN KEY (created_by) REFERENCES portail.profiles(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES portail.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY ("id")
);

-- >>> src/modules/hr/sql :: PharmaOs.hr_schedule_changes
CREATE TABLE IF NOT EXISTS "PharmaOs".hr_schedule_changes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  motif text NOT NULL,
  date_debut date NOT NULL,
  heure_debut time,
  date_fin date,
  heure_fin time,
  commentaire text,
  created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  heure_prevue time,
  heure_arrivee time,
  FOREIGN KEY (created_by) REFERENCES portail.profiles(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES portail.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY ("id")
);

ALTER TABLE "PharmaOs".rental_assets ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".rental_assets TO authenticated;
DROP POLICY IF EXISTS "rental_assets_staff_all" ON "PharmaOs".rental_assets;
CREATE POLICY "rental_assets_staff_all" ON "PharmaOs".rental_assets
  FOR ALL TO authenticated
  USING ("PharmaOs".is_pharma_staff())
  WITH CHECK ("PharmaOs".is_pharma_staff());

ALTER TABLE "PharmaOs".rental_contracts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".rental_contracts TO authenticated;
DROP POLICY IF EXISTS "rental_contracts_staff_all" ON "PharmaOs".rental_contracts;
CREATE POLICY "rental_contracts_staff_all" ON "PharmaOs".rental_contracts
  FOR ALL TO authenticated
  USING ("PharmaOs".is_pharma_staff())
  WITH CHECK ("PharmaOs".is_pharma_staff());

ALTER TABLE "PharmaOs".rental_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".rental_events TO authenticated;
DROP POLICY IF EXISTS "rental_events_staff_all" ON "PharmaOs".rental_events;
CREATE POLICY "rental_events_staff_all" ON "PharmaOs".rental_events
  FOR ALL TO authenticated
  USING ("PharmaOs".is_pharma_staff())
  WITH CHECK ("PharmaOs".is_pharma_staff());

ALTER TABLE "PharmaOs".magistral_providers ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".magistral_providers TO authenticated;
DROP POLICY IF EXISTS "magistral_providers_staff_all" ON "PharmaOs".magistral_providers;
CREATE POLICY "magistral_providers_staff_all" ON "PharmaOs".magistral_providers
  FOR ALL TO authenticated
  USING ("PharmaOs".is_pharma_staff())
  WITH CHECK ("PharmaOs".is_pharma_staff());

ALTER TABLE "PharmaOs".magistral_price_rules ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".magistral_price_rules TO authenticated;
DROP POLICY IF EXISTS "magistral_price_rules_staff_all" ON "PharmaOs".magistral_price_rules;
CREATE POLICY "magistral_price_rules_staff_all" ON "PharmaOs".magistral_price_rules
  FOR ALL TO authenticated
  USING ("PharmaOs".is_pharma_staff())
  WITH CHECK ("PharmaOs".is_pharma_staff());

ALTER TABLE "PharmaOs".magistral_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".magistral_settings TO authenticated;
DROP POLICY IF EXISTS "magistral_settings_staff_all" ON "PharmaOs".magistral_settings;
CREATE POLICY "magistral_settings_staff_all" ON "PharmaOs".magistral_settings
  FOR ALL TO authenticated
  USING ("PharmaOs".is_pharma_staff())
  WITH CHECK ("PharmaOs".is_pharma_staff());

ALTER TABLE "PharmaOs".magistral_orders ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".magistral_orders TO authenticated;
DROP POLICY IF EXISTS "magistral_orders_staff_all" ON "PharmaOs".magistral_orders;
CREATE POLICY "magistral_orders_staff_all" ON "PharmaOs".magistral_orders
  FOR ALL TO authenticated
  USING ("PharmaOs".is_pharma_staff())
  WITH CHECK ("PharmaOs".is_pharma_staff());

ALTER TABLE "PharmaOs".psl_units ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".psl_units TO authenticated;
DROP POLICY IF EXISTS "psl_units_staff_all" ON "PharmaOs".psl_units;
CREATE POLICY "psl_units_staff_all" ON "PharmaOs".psl_units
  FOR ALL TO authenticated
  USING ("PharmaOs".is_pharma_staff())
  WITH CHECK ("PharmaOs".is_pharma_staff());

ALTER TABLE "PharmaOs".psl_movements ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".psl_movements TO authenticated;
DROP POLICY IF EXISTS "psl_movements_staff_all" ON "PharmaOs".psl_movements;
CREATE POLICY "psl_movements_staff_all" ON "PharmaOs".psl_movements
  FOR ALL TO authenticated
  USING ("PharmaOs".is_pharma_staff())
  WITH CHECK ("PharmaOs".is_pharma_staff());

ALTER TABLE "PharmaOs".cash_closures ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".cash_closures TO authenticated;
DROP POLICY IF EXISTS "cash_closures_staff_all" ON "PharmaOs".cash_closures;
CREATE POLICY "cash_closures_staff_all" ON "PharmaOs".cash_closures
  FOR ALL TO authenticated
  USING ("PharmaOs".is_pharma_staff())
  WITH CHECK ("PharmaOs".is_pharma_staff());

ALTER TABLE "PharmaOs".app_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".app_settings TO authenticated;
DROP POLICY IF EXISTS "app_settings_staff_all" ON "PharmaOs".app_settings;
CREATE POLICY "app_settings_staff_all" ON "PharmaOs".app_settings
  FOR ALL TO authenticated
  USING ("PharmaOs".is_pharma_staff())
  WITH CHECK ("PharmaOs".is_pharma_staff());

ALTER TABLE "PharmaOs".lot_alerts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".lot_alerts TO authenticated;
DROP POLICY IF EXISTS "lot_alerts_staff_all" ON "PharmaOs".lot_alerts;
CREATE POLICY "lot_alerts_staff_all" ON "PharmaOs".lot_alerts
  FOR ALL TO authenticated
  USING ("PharmaOs".is_pharma_staff())
  WITH CHECK ("PharmaOs".is_pharma_staff());

ALTER TABLE "PharmaOs".lot_alert_acks ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".lot_alert_acks TO authenticated;
DROP POLICY IF EXISTS "lot_alert_acks_staff_all" ON "PharmaOs".lot_alert_acks;
CREATE POLICY "lot_alert_acks_staff_all" ON "PharmaOs".lot_alert_acks
  FOR ALL TO authenticated
  USING ("PharmaOs".is_pharma_staff())
  WITH CHECK ("PharmaOs".is_pharma_staff());

ALTER TABLE "PharmaOs".supplier_disputes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".supplier_disputes TO authenticated;
DROP POLICY IF EXISTS "supplier_disputes_staff_all" ON "PharmaOs".supplier_disputes;
CREATE POLICY "supplier_disputes_staff_all" ON "PharmaOs".supplier_disputes
  FOR ALL TO authenticated
  USING ("PharmaOs".is_pharma_staff())
  WITH CHECK ("PharmaOs".is_pharma_staff());

ALTER TABLE "PharmaOs".work_schedules ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".work_schedules TO authenticated;
DROP POLICY IF EXISTS "work_schedules_staff_all" ON "PharmaOs".work_schedules;
CREATE POLICY "work_schedules_staff_all" ON "PharmaOs".work_schedules
  FOR ALL TO authenticated
  USING ("PharmaOs".is_pharma_staff())
  WITH CHECK ("PharmaOs".is_pharma_staff());

ALTER TABLE "PharmaOs".hr_absences ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".hr_absences TO authenticated;
DROP POLICY IF EXISTS "hr_absences_staff_all" ON "PharmaOs".hr_absences;
CREATE POLICY "hr_absences_staff_all" ON "PharmaOs".hr_absences
  FOR ALL TO authenticated
  USING ("PharmaOs".is_pharma_staff())
  WITH CHECK ("PharmaOs".is_pharma_staff());

ALTER TABLE "PharmaOs".hr_schedule_changes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".hr_schedule_changes TO authenticated;
DROP POLICY IF EXISTS "hr_schedule_changes_staff_all" ON "PharmaOs".hr_schedule_changes;
CREATE POLICY "hr_schedule_changes_staff_all" ON "PharmaOs".hr_schedule_changes
  FOR ALL TO authenticated
  USING ("PharmaOs".is_pharma_staff())
  WITH CHECK ("PharmaOs".is_pharma_staff());

