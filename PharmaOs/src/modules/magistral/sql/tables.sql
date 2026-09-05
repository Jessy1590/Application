-- =============================================================================
-- Tables — module magistral
-- Prestataire / tarifs = magistral_settings (plus de magistral_providers / price_rules)
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
  frais_port numeric DEFAULT 0 NOT NULL,
  coefficient numeric DEFAULT 1 NOT NULL,
  tva_rate numeric DEFAULT 5.5 NOT NULL,
  internal_prep_enabled boolean DEFAULT false NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("id")
);

-- --- PharmaOs.magistral_orders ---
CREATE TABLE IF NOT EXISTS "PharmaOs".magistral_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
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
  PRIMARY KEY ("id")
);
