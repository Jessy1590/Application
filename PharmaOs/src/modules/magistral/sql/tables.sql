-- =============================================================================
-- Tables — module magistral (donneur d’ordre / sous-traitance unique)
-- Prestataire / tarifs / contrat = magistral_settings
-- =============================================================================

-- --- PharmaOs.magistral_settings ---
CREATE TABLE IF NOT EXISTS "PharmaOs".magistral_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  pharmacy_name text,
  pharmacy_address text,
  pharmacy_email text,
  pharmacy_interlocuteur text,
  provider_name text,
  provider_email text,
  provider_ars_auth text,
  contract_ref text,
  contract_valid_until date,
  provider_forms text[] DEFAULT '{}'::text[],
  provider_delai_jours integer DEFAULT 5,
  frais_port numeric DEFAULT 0 NOT NULL,
  coefficient numeric DEFAULT 1 NOT NULL,
  tva_rate numeric DEFAULT 5.5 NOT NULL,
  internal_prep_enabled boolean DEFAULT false NOT NULL,
  mail_templates jsonb DEFAULT '{}'::jsonb NOT NULL,
  docs_retention_days integer DEFAULT 365,
  updated_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("id")
);

-- --- PharmaOs.magistral_orders ---
CREATE TABLE IF NOT EXISTS "PharmaOs".magistral_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  formule text NOT NULL,
  patient_initiales text,
  patient_phone text,
  patient_email text,
  patient_call jsonb DEFAULT '{}'::jsonb NOT NULL,
  quantite numeric DEFAULT 1,
  forme text,
  prix_calcule numeric,
  prix_ht_net numeric,
  tva_rate numeric,
  statut text DEFAULT 'devis'::text NOT NULL,
  email_sent_at timestamptz,
  received_at timestamptz,
  created_by uuid,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  form_data jsonb DEFAULT '{}'::jsonb NOT NULL,
  ordonnance_path text,
  preparation_interne boolean DEFAULT false NOT NULL,
  closed_at timestamptz,
  closed_reason text,
  analyse_validated_at timestamptz,
  analyse_validated_by uuid,
  provider_ref text,
  provider_lot text,
  date_fabrication date,
  date_peremption date,
  liberation_path text,
  liberation_received_at timestamptz,
  reception_checklist jsonb DEFAULT '{}'::jsonb NOT NULL,
  reception_validated_by uuid,
  ordonnancier_number text,
  dispensed_at timestamptz,
  dispensed_by uuid,
  provider_ordonnancier text,
  nc_reason text,
  status_history jsonb DEFAULT '[]'::jsonb NOT NULL,
  CHECK ((statut = ANY (ARRAY[
    'brouillon'::text, 'analyse_ok'::text, 'devis'::text, 'commande'::text,
    'en_transit'::text, 'a_controler'::text, 'receptionne'::text, 'a_rappeler'::text,
    'non_conforme'::text, 'refuse'::text, 'dispense'::text, 'cloture'::text
  ]))),
  FOREIGN KEY (created_by) REFERENCES portail.profiles(id) ON DELETE SET NULL,
  FOREIGN KEY (analyse_validated_by) REFERENCES portail.profiles(id) ON DELETE SET NULL,
  FOREIGN KEY (reception_validated_by) REFERENCES portail.profiles(id) ON DELETE SET NULL,
  FOREIGN KEY (dispensed_by) REFERENCES portail.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY ("id")
);

-- Storage bucket (voir migration 027) : magistral-ordonnances
