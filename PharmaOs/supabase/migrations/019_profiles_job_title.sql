-- Sous-type métier équipe (orthogonal au role admin|équipe)
ALTER TABLE portail.profiles
  ADD COLUMN IF NOT EXISTS job_title text NOT NULL DEFAULT 'autre';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_job_title_check'
  ) THEN
    ALTER TABLE portail.profiles DROP CONSTRAINT profiles_job_title_check;
  END IF;
  ALTER TABLE portail.profiles
    ADD CONSTRAINT profiles_job_title_check
    CHECK (job_title = ANY (ARRAY['preparateur'::text, 'pharmacien'::text, 'autre'::text]));
END $$;

COMMENT ON COLUMN portail.profiles.job_title IS
  'Métier PharmaOS : preparateur | pharmacien | autre';
