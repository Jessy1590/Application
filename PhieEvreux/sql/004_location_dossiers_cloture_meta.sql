-- Métadonnées clôture : date + OP pour chaque élément « oui »
-- Appliqué via Supabase (projet kpjflntnotftpzffjbud)

ALTER TABLE phieevreux.location_dossiers
  ADD COLUMN IF NOT EXISTS appareil_rendu_le date,
  ADD COLUMN IF NOT EXISTS appareil_rendu_op text,
  ADD COLUMN IF NOT EXISTS facturation_ok_le date,
  ADD COLUMN IF NOT EXISTS facturation_ok_op text;

COMMENT ON COLUMN phieevreux.location_dossiers.appareil_rendu_le IS
  'Date à laquelle l''appareil a été rendu';
COMMENT ON COLUMN phieevreux.location_dossiers.appareil_rendu_op IS
  'OP / qui a enregistré le rendu appareil';
COMMENT ON COLUMN phieevreux.location_dossiers.facturation_ok_le IS
  'Date à laquelle la facturation a été validée';
COMMENT ON COLUMN phieevreux.location_dossiers.facturation_ok_op IS
  'OP / qui a validé la facturation';
