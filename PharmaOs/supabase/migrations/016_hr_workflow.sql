-- =============================================================================
-- RH : workflow absences (validation) + change_type retards
-- =============================================================================

-- Absences : statut de validation + revue admin
ALTER TABLE "PharmaOs".hr_absences
  ADD COLUMN IF NOT EXISTS statut text NOT NULL DEFAULT 'validee';
ALTER TABLE "PharmaOs".hr_absences
  ADD COLUMN IF NOT EXISTS reviewed_by uuid;
ALTER TABLE "PharmaOs".hr_absences
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE "PharmaOs".hr_absences
  ADD COLUMN IF NOT EXISTS review_note text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_absences_statut_check'
  ) THEN
    ALTER TABLE "PharmaOs".hr_absences
      ADD CONSTRAINT hr_absences_statut_check
      CHECK (statut = ANY (ARRAY['en_attente'::text, 'validee'::text, 'refusee'::text]));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_absences_reviewed_by_fkey'
  ) THEN
    ALTER TABLE "PharmaOs".hr_absences
      ADD CONSTRAINT hr_absences_reviewed_by_fkey
      FOREIGN KEY (reviewed_by) REFERENCES portail.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Retards / changements : type canonique (plus de motifs Congés / Absence)
ALTER TABLE "PharmaOs".hr_schedule_changes
  ADD COLUMN IF NOT EXISTS change_type text;

UPDATE "PharmaOs".hr_schedule_changes
SET change_type = CASE
  WHEN change_type IS NOT NULL THEN change_type
  WHEN lower(motif) LIKE '%départ%' OR lower(motif) LIKE '%depart%' THEN 'depart_anticipe'
  WHEN lower(motif) LIKE '%congé%' OR lower(motif) LIKE '%conge%'
    OR lower(motif) LIKE '%absence%' THEN 'autre'
  WHEN lower(motif) LIKE '%retard%' OR lower(motif) LIKE '%arrivée%' OR lower(motif) LIKE '%arrivee%' THEN 'retard'
  ELSE 'retard'
END
WHERE change_type IS NULL;

ALTER TABLE "PharmaOs".hr_schedule_changes
  ALTER COLUMN change_type SET DEFAULT 'retard';

UPDATE "PharmaOs".hr_schedule_changes
SET change_type = 'retard'
WHERE change_type IS NULL;

ALTER TABLE "PharmaOs".hr_schedule_changes
  ALTER COLUMN change_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_schedule_changes_change_type_check'
  ) THEN
    ALTER TABLE "PharmaOs".hr_schedule_changes
      ADD CONSTRAINT hr_schedule_changes_change_type_check
      CHECK (change_type = ANY (ARRAY['retard'::text, 'depart_anticipe'::text, 'autre'::text]));
  END IF;
END $$;
