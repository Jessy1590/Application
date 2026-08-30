-- =============================================================================
-- PharmaOs — Modules métier v2
-- Tables + RLS (admin / équipe via portail.profiles)
--
-- Exécuter dans le SQL Editor Supabase après les migrations de base.
-- Schéma métier : "PharmaOs" | Profils : portail.profiles (role: admin | équipe)
--
-- Secrets Edge Function send-transactional-email (SMTP / Resend) :
--   supabase secrets set RESEND_API_KEY=re_xxx
--   -- OU SMTP générique :
--   supabase secrets set SMTP_HOST=smtp.example.com SMTP_PORT=587 \
--     SMTP_USER=... SMTP_PASS=... SMTP_FROM="Pharmacie <noreply@exemple.fr>"
-- Déployer : supabase functions deploy send-transactional-email
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS "PharmaOs";

-- ---------------------------------------------------------------------------
-- Helper RLS : staff pharmacie (admin ou équipe)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "PharmaOs".is_pharma_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = portail, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM portail.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'équipe')
  );
$$;

CREATE OR REPLACE FUNCTION "PharmaOs".is_pharma_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = portail, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM portail.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION "PharmaOs".is_pharma_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION "PharmaOs".is_pharma_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "PharmaOs".is_pharma_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION "PharmaOs".is_pharma_admin() TO authenticated;

-- =============================================================================
-- 1. Location de matériel
-- =============================================================================
CREATE TABLE IF NOT EXISTS "PharmaOs".rental_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type text NOT NULL CHECK (asset_type IN (
    'lit', 'tens', 'aerosol', 'balance_bebe', 'tensiometre', 'fauteuil_roulant', 'autre'
  )),
  label text,
  origine text NOT NULL DEFAULT 'interne' CHECK (origine IN ('interne', 'prestataire')),
  numero_interne text,
  numero_serie_prestataire text,
  prestataire_id uuid REFERENCES "PharmaOs".directory_contacts(id) ON DELETE SET NULL,
  requires_coverage_check boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'disponible' CHECK (status IN ('disponible', 'loue', 'maintenance', 'retire')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "PharmaOs".rental_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES "PharmaOs".rental_assets(id) ON DELETE RESTRICT,
  patient_nom text NOT NULL,
  patient_prenom text NOT NULL,
  patient_dob date,
  addons jsonb NOT NULL DEFAULT '{}'::jsonb,
  date_sortie timestamptz NOT NULL DEFAULT now(),
  date_retour timestamptz,
  caution_type text CHECK (caution_type IN ('cheque', 'carte')),
  caution_montant numeric(10,2),
  caution_restituee boolean DEFAULT false,
  statut text NOT NULL DEFAULT 'en_cours' CHECK (statut IN ('en_cours', 'retourne')),
  checklist_iso jsonb NOT NULL DEFAULT '{}'::jsonb,
  coverage_checked boolean DEFAULT false,
  created_by uuid REFERENCES portail.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "PharmaOs".rental_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES "PharmaOs".rental_contracts(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('sortie', 'retour', 'incident', 'note')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id uuid REFERENCES portail.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rental_assets_status ON "PharmaOs".rental_assets(status);
CREATE INDEX IF NOT EXISTS idx_rental_contracts_statut ON "PharmaOs".rental_contracts(statut);
CREATE INDEX IF NOT EXISTS idx_rental_contracts_asset ON "PharmaOs".rental_contracts(asset_id);

-- =============================================================================
-- 2. Préparations magistrales
-- =============================================================================
CREATE TABLE IF NOT EXISTS "PharmaOs".magistral_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  delai_jours integer DEFAULT 5,
  actif boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "PharmaOs".magistral_price_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  forme text, -- crème, gélule, solution…
  base_price numeric(10,2) NOT NULL DEFAULT 0,
  coefficient numeric(8,4) NOT NULL DEFAULT 1,
  unit text DEFAULT 'unité',
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "PharmaOs".magistral_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES "PharmaOs".magistral_providers(id) ON DELETE SET NULL,
  price_rule_id uuid REFERENCES "PharmaOs".magistral_price_rules(id) ON DELETE SET NULL,
  formule text NOT NULL,
  patient_initiales text,
  quantite numeric(10,2) DEFAULT 1,
  forme text,
  prix_calcule numeric(10,2),
  statut text NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'envoye', 'en_cours', 'recu')),
  email_sent_at timestamptz,
  received_at timestamptz,
  created_by uuid REFERENCES portail.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_magistral_orders_statut ON "PharmaOs".magistral_orders(statut);

-- =============================================================================
-- 3. Traçabilité PSL
-- =============================================================================
CREATE TABLE IF NOT EXISTS "PharmaOs".psl_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_produit text NOT NULL,
  numero_unite text NOT NULL,
  groupe_abo text,
  rh text,
  date_peremption date,
  fournisseur text,
  statut text NOT NULL DEFAULT 'en_stock' CHECK (statut IN ('en_stock', 'delivre', 'detruit', 'retourne')),
  created_by uuid REFERENCES portail.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code_produit, numero_unite)
);

CREATE TABLE IF NOT EXISTS "PharmaOs".psl_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES "PharmaOs".psl_units(id) ON DELETE CASCADE,
  movement_type text NOT NULL CHECK (movement_type IN ('reception', 'delivrance', 'destruction', 'retour')),
  patient_initiales text,
  patient_ipp text,
  user_id uuid REFERENCES portail.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_psl_units_statut ON "PharmaOs".psl_units(statut);
CREATE INDEX IF NOT EXISTS idx_psl_movements_unit ON "PharmaOs".psl_movements(unit_id);

-- =============================================================================
-- 4. Clôture de caisse
-- =============================================================================
CREATE TABLE IF NOT EXISTS "PharmaOs".cash_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closure_date date NOT NULL,
  author_id uuid NOT NULL REFERENCES portail.profiles(id) ON DELETE RESTRICT,
  author_name text,
  fond_reel numeric(12,2) NOT NULL DEFAULT 0,
  fond_logiciel numeric(12,2) NOT NULL DEFAULT 0,
  montant_cb numeric(12,2) NOT NULL DEFAULT 0,
  argent_lieu_sur numeric(12,2) NOT NULL DEFAULT 0,
  nb_cheques integer NOT NULL DEFAULT 0,
  montant_cheques numeric(12,2) NOT NULL DEFAULT 0,
  garde boolean NOT NULL DEFAULT false,
  sortie_particuliere boolean NOT NULL DEFAULT false,
  sortie_montant numeric(12,2) DEFAULT 0,
  sortie_motif text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (closure_date, author_id)
);

CREATE INDEX IF NOT EXISTS idx_cash_closures_date ON "PharmaOs".cash_closures(closure_date);

-- =============================================================================
-- 5. RH — Planning / absences
-- =============================================================================
CREATE TABLE IF NOT EXISTS "PharmaOs".work_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES portail.profiles(id) ON DELETE CASCADE,
  -- NULL user_id = horaires d'ouverture pharmacie (plage globale)
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=dimanche
  start_time time NOT NULL,
  end_time time NOT NULL,
  label text,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "PharmaOs".hr_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES portail.profiles(id) ON DELETE CASCADE,
  absence_type text NOT NULL CHECK (absence_type IN (
    'conge', 'absence', 'maladie', 'rtt', 'formation', 'autre'
  )),
  date_debut date NOT NULL,
  date_fin date NOT NULL,
  motif text,
  created_by uuid REFERENCES portail.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_schedules_user ON "PharmaOs".work_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_hr_absences_user ON "PharmaOs".hr_absences(user_id);
CREATE INDEX IF NOT EXISTS idx_hr_absences_dates ON "PharmaOs".hr_absences(date_debut, date_fin);

-- =============================================================================
-- 6. Retrait / rappel de lot (enrichi)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "PharmaOs".lot_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_number text NOT NULL,
  declarant_id uuid REFERENCES portail.profiles(id) ON DELETE SET NULL,
  medicament text NOT NULL,
  lot text NOT NULL,
  laboratoire text,
  motif text,
  source text NOT NULL DEFAULT 'manuel' CHECK (source IN ('manuel', 'ansm')),
  external_ref text, -- prêt connecteur ANSM
  steps_done text,
  reception_validated_at timestamptz,
  requires_return boolean NOT NULL DEFAULT false,
  return_location text,
  task_id uuid,
  status text NOT NULL DEFAULT 'ouvert' CHECK (status IN ('ouvert', 'en_cours', 'clos')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "PharmaOs".lot_alert_acks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES "PharmaOs".lot_alerts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES portail.profiles(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alert_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_lot_alerts_status ON "PharmaOs".lot_alerts(status);
CREATE INDEX IF NOT EXISTS idx_lot_alert_acks_alert ON "PharmaOs".lot_alert_acks(alert_id);

-- =============================================================================
-- 7. Litiges fournisseurs
-- =============================================================================
CREATE TABLE IF NOT EXISTS "PharmaOs".supplier_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_type text NOT NULL CHECK (dispute_type IN (
    'commande', 'facturation', 'perimes', 'challenge', 'retrait_lot', 'autre'
  )),
  fournisseur_id uuid REFERENCES "PharmaOs".directory_contacts(id) ON DELETE SET NULL,
  fournisseur_nom text,
  montant numeric(12,2),
  statut text NOT NULL DEFAULT 'ouvert' CHECK (statut IN ('ouvert', 'en_cours', 'clos')),
  pieces text, -- texte / urls
  description text,
  lot_alert_id uuid REFERENCES "PharmaOs".lot_alerts(id) ON DELETE SET NULL,
  stock_error_id uuid,
  created_by uuid REFERENCES portail.profiles(id) ON DELETE SET NULL,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_disputes_statut ON "PharmaOs".supplier_disputes(statut);
CREATE INDEX IF NOT EXISTS idx_supplier_disputes_type ON "PharmaOs".supplier_disputes(dispute_type);

-- =============================================================================
-- Grants + RLS
-- =============================================================================
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'rental_assets', 'rental_contracts', 'rental_events',
    'magistral_providers', 'magistral_price_rules', 'magistral_orders',
    'psl_units', 'psl_movements',
    'cash_closures',
    'work_schedules', 'hr_absences',
    'lot_alerts', 'lot_alert_acks',
    'supplier_disputes'
  ]
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".%I TO authenticated', t);
    EXECUTE format('ALTER TABLE "PharmaOs".%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Policy générique staff : ALL pour admin/équipe (tables collaboratives métier)
DO $$
DECLARE
  t text;
  pol text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'rental_assets', 'rental_contracts', 'rental_events',
    'magistral_providers', 'magistral_price_rules', 'magistral_orders',
    'psl_units', 'psl_movements',
    'cash_closures',
    'work_schedules', 'hr_absences',
    'lot_alerts', 'lot_alert_acks',
    'supplier_disputes'
  ]
  LOOP
    pol := t || '_staff_all';
    EXECUTE format('DROP POLICY IF EXISTS %I ON "PharmaOs".%I', pol, t);
    EXECUTE format(
      'CREATE POLICY %I ON "PharmaOs".%I FOR ALL TO authenticated
       USING ("PharmaOs".is_pharma_staff())
       WITH CHECK ("PharmaOs".is_pharma_staff())',
      pol, t
    );
  END LOOP;
END $$;

-- Fin modules_metier_v2.sql
