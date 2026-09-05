-- =============================================================================
-- Tables — module disputes
-- DDL aligné projet Supabase live kpjflntnotftpzffjbud (2026-09-03)
-- Rôles canoniques app : admin | équipe (member = legacy CHECK seulement)
-- Source module : src/modules/disputes/sql/tables.sql
-- =============================================================================
-- --- PharmaOs.supplier_disputes ---
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
  perime_id uuid,
  created_by uuid,
  closed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CHECK ((dispute_type = ANY (ARRAY['commande'::text, 'facturation'::text, 'perimes'::text, 'challenge'::text, 'retrait_lot'::text, 'autre'::text]))),
  CHECK ((statut = ANY (ARRAY['ouvert'::text, 'en_attente'::text, 'en_cours'::text, 'clos'::text, 'annule'::text]))),
  FOREIGN KEY (created_by) REFERENCES portail.profiles(id) ON DELETE SET NULL,
  FOREIGN KEY (fournisseur_id) REFERENCES "PharmaOs".directory_contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (lot_alert_id) REFERENCES "PharmaOs".lot_alerts(id) ON DELETE SET NULL,
  FOREIGN KEY (perime_id) REFERENCES "PharmaOs".perimes(id) ON DELETE SET NULL,
  PRIMARY KEY ("id")
);
