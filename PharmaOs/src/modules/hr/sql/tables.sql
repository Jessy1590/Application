-- =============================================================================
-- Tables — module hr
-- DDL aligné projet Supabase live kpjflntnotftpzffjbud
-- Rôles canoniques app : admin | équipe (member = legacy CHECK seulement)
-- Source module : src/modules/hr/sql/tables.sql
-- =============================================================================

-- --- PharmaOs.hr_special_weeks ---
CREATE TABLE IF NOT EXISTS "PharmaOs".hr_special_weeks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  label text NOT NULL,
  week_start date NOT NULL,
  week_end date NOT NULL,
  note text,
  created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  CHECK (week_end >= week_start),
  FOREIGN KEY (created_by) REFERENCES portail.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (id)
);

-- --- PharmaOs.work_schedules ---
CREATE TABLE IF NOT EXISTS "PharmaOs".work_schedules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  day_of_week integer NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  label text,
  actif boolean DEFAULT true NOT NULL,
  week_pattern text DEFAULT 'all'::text NOT NULL,
  exception_week_start date,
  special_week_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CHECK (((day_of_week >= 0) AND (day_of_week <= 6))),
  CHECK ((week_pattern = ANY (ARRAY['all'::text, 'even'::text, 'odd'::text]))),
  FOREIGN KEY (user_id) REFERENCES portail.profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (special_week_id) REFERENCES "PharmaOs".hr_special_weeks(id) ON DELETE SET NULL,
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
  statut text DEFAULT 'validee'::text NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  CHECK ((absence_type = ANY (ARRAY['conge'::text, 'absence'::text, 'maladie'::text, 'rtt'::text, 'formation'::text, 'autre'::text]))),
  CHECK ((statut = ANY (ARRAY['en_attente'::text, 'validee'::text, 'refusee'::text]))),
  FOREIGN KEY (created_by) REFERENCES portail.profiles(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewed_by) REFERENCES portail.profiles(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES portail.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY ("id")
);

-- --- PharmaOs.hr_schedule_changes ---
CREATE TABLE IF NOT EXISTS "PharmaOs".hr_schedule_changes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  motif text NOT NULL,
  change_type text DEFAULT 'retard'::text NOT NULL,
  date_debut date NOT NULL,
  heure_debut time,
  date_fin date,
  heure_fin time,
  commentaire text,
  created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  heure_prevue time,
  heure_arrivee time,
  statut text DEFAULT 'validee'::text NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  CHECK ((change_type = ANY (ARRAY['retard'::text, 'depart_anticipe'::text, 'autre'::text, 'changement_horaire'::text]))),
  CHECK ((statut = ANY (ARRAY['en_attente'::text, 'validee'::text, 'refusee'::text]))),
  FOREIGN KEY (created_by) REFERENCES portail.profiles(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewed_by) REFERENCES portail.profiles(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES portail.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY ("id")
);
