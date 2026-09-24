-- Phases Contact Location : commentaire compte puis appel
-- Appliqué via Supabase (projet kpjflntnotftpzffjbud) — migration location_contacts_phase

ALTER TABLE phieevreux.location_contacts
  ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'commentaire',
  ADD COLUMN IF NOT EXISTS phase_date_fin date,
  ADD COLUMN IF NOT EXISTS commentaire_fait_at timestamptz;

ALTER TABLE phieevreux.location_contacts
  DROP CONSTRAINT IF EXISTS location_contacts_phase_check;

ALTER TABLE phieevreux.location_contacts
  ADD CONSTRAINT location_contacts_phase_check
  CHECK (phase = ANY (ARRAY['commentaire'::text, 'appel'::text]));

COMMENT ON COLUMN phieevreux.location_contacts.phase IS
  'commentaire = commentaire compte à écrire ; appel = phase appel';
COMMENT ON COLUMN phieevreux.location_contacts.phase_date_fin IS
  'date_fin du dossier au moment du cycle / entrée en phase appel — sert au reset si prolongation ultérieure';
COMMENT ON COLUMN phieevreux.location_contacts.commentaire_fait_at IS
  'Horodatage validation phase commentaire (équivalent ECRIS)';
