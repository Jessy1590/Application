-- =============================================================================
-- Tables — module lot-alerts
-- DDL aligné projet Supabase live kpjflntnotftpzffjbud (2026-09-03)
-- Rôles canoniques app : admin | équipe (member = legacy CHECK seulement)
-- Source module : src/modules/lot-alerts/sql/tables.sql
-- =============================================================================
-- --- PharmaOs.lot_alerts ---
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

-- --- PharmaOs.lot_alert_acks ---
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
