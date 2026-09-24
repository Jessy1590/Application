-- Mail envoyé structuré sur chaque ligne contact (équivalent anciennelocation.mail_envoye)
-- Appliqué via Supabase (projet kpjflntnotftpzffjbud) — migration location_contacts_mail_envoye

ALTER TABLE phieevreux.location_contacts
  ADD COLUMN IF NOT EXISTS mail_envoye boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN phieevreux.location_contacts.mail_envoye IS
  'True si un mail a été envoyé (ou déjà envoyé) pour cette étape contact / appel';
