-- =============================================================================
-- RH étendu : semaines A/B, exceptions, accord horaire, seuil effectif
-- =============================================================================

-- Créneaux : pattern paire/impaire + semaine exceptionnelle (lundi ISO)
ALTER TABLE "PharmaOs".work_schedules
  ADD COLUMN IF NOT EXISTS week_pattern text NOT NULL DEFAULT 'all';

ALTER TABLE "PharmaOs".work_schedules
  ADD COLUMN IF NOT EXISTS exception_week_start date;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'work_schedules_week_pattern_check'
  ) THEN
    ALTER TABLE "PharmaOs".work_schedules DROP CONSTRAINT work_schedules_week_pattern_check;
  END IF;
  ALTER TABLE "PharmaOs".work_schedules
    ADD CONSTRAINT work_schedules_week_pattern_check
    CHECK (week_pattern = ANY (ARRAY['all'::text, 'even'::text, 'odd'::text]));
END $$;

COMMENT ON COLUMN "PharmaOs".work_schedules.week_pattern IS
  'all = chaque semaine ; even/odd = semaines ISO paires/impaires (ignoré si exception_week_start)';
COMMENT ON COLUMN "PharmaOs".work_schedules.exception_week_start IS
  'Si renseigné (lundi ISO), créneau uniquement pour cette semaine — remplace le planning récurrent';

-- Changements d'horaire : workflow validation + type demande
ALTER TABLE "PharmaOs".hr_schedule_changes
  ADD COLUMN IF NOT EXISTS statut text NOT NULL DEFAULT 'validee';
ALTER TABLE "PharmaOs".hr_schedule_changes
  ADD COLUMN IF NOT EXISTS reviewed_by uuid;
ALTER TABLE "PharmaOs".hr_schedule_changes
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE "PharmaOs".hr_schedule_changes
  ADD COLUMN IF NOT EXISTS review_note text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_schedule_changes_change_type_check'
  ) THEN
    ALTER TABLE "PharmaOs".hr_schedule_changes DROP CONSTRAINT hr_schedule_changes_change_type_check;
  END IF;
  ALTER TABLE "PharmaOs".hr_schedule_changes
    ADD CONSTRAINT hr_schedule_changes_change_type_check
    CHECK (change_type = ANY (ARRAY[
      'retard'::text,
      'depart_anticipe'::text,
      'autre'::text,
      'changement_horaire'::text
    ]));
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_schedule_changes_statut_check'
  ) THEN
    ALTER TABLE "PharmaOs".hr_schedule_changes
      ADD CONSTRAINT hr_schedule_changes_statut_check
      CHECK (statut = ANY (ARRAY['en_attente'::text, 'validee'::text, 'refusee'::text]));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_schedule_changes_reviewed_by_fkey'
  ) THEN
    ALTER TABLE "PharmaOs".hr_schedule_changes
      ADD CONSTRAINT hr_schedule_changes_reviewed_by_fkey
      FOREIGN KEY (reviewed_by) REFERENCES portail.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Seuil sous-effectif (défaut 2)
INSERT INTO "PharmaOs".app_settings (key, value, updated_at)
VALUES ('hr_min_staff', '{"min": 2}'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
