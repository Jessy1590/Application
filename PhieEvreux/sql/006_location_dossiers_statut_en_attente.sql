-- Statut dossier « en_attente » (brouillon création, reprise ultérieure)
-- Appliqué via Supabase (projet kpjflntnotftpzffjbud) — migration location_dossiers_statut_en_attente

ALTER TABLE phieevreux.location_dossiers
  DROP CONSTRAINT IF EXISTS location_dossiers_statut_check;

ALTER TABLE phieevreux.location_dossiers
  ADD CONSTRAINT location_dossiers_statut_check
  CHECK (statut = ANY (ARRAY['actif'::text, 'cloture'::text, 'annule'::text, 'en_attente'::text]));

COMMENT ON CONSTRAINT location_dossiers_statut_check ON phieevreux.location_dossiers IS
  'actif | cloture | annule | en_attente (brouillon création)';
