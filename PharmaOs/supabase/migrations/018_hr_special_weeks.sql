-- Semaines spéciales nommées (Noël, etc.) + lien optionnel sur créneaux

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

ALTER TABLE "PharmaOs".work_schedules
  ADD COLUMN IF NOT EXISTS special_week_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'work_schedules_special_week_id_fkey'
  ) THEN
    ALTER TABLE "PharmaOs".work_schedules
      ADD CONSTRAINT work_schedules_special_week_id_fkey
      FOREIGN KEY (special_week_id) REFERENCES "PharmaOs".hr_special_weeks(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE "PharmaOs".hr_special_weeks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_special_weeks_staff_all" ON "PharmaOs".hr_special_weeks;
CREATE POLICY "hr_special_weeks_staff_all"
  ON "PharmaOs".hr_special_weeks FOR ALL
  USING ("PharmaOs".is_pharma_staff())
  WITH CHECK ("PharmaOs".is_pharma_staff());

GRANT ALL ON TABLE "PharmaOs".hr_special_weeks TO authenticated;
GRANT ALL ON TABLE "PharmaOs".hr_special_weeks TO service_role;
