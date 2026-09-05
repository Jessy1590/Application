-- =============================================================================
-- Tables — module hr
-- DDL aligné projet Supabase live kpjflntnotftpzffjbud (2026-09-03)
-- Rôles canoniques app : admin | équipe (member = legacy CHECK seulement)
-- Source module : src/modules/hr/sql/tables.sql
-- =============================================================================
-- --- PharmaOs.work_schedules ---
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

-- --- PharmaOs.hr_absences ---
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

-- --- PharmaOs.hr_schedule_changes ---
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
