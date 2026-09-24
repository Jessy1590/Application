-- Facturation OK à la clôture dossier
-- Appliqué via Supabase (projet kpjflntnotftpzffjbud) — migration location_dossiers_facturation_ok

ALTER TABLE phieevreux.location_dossiers
  ADD COLUMN IF NOT EXISTS facturation_ok boolean;

COMMENT ON COLUMN phieevreux.location_dossiers.facturation_ok IS
  'Confirmé à la clôture : facturation OK (oui/non)';
