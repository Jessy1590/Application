-- Parc ancienne location — matricules dernière facture
-- Appliqué via Supabase — migration anciennelocation_parc

CREATE TABLE IF NOT EXISTS phieevreux.anciennelocation_parc (
  cle text PRIMARY KEY,
  contenu text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE phieevreux.anciennelocation_parc IS
  'Sauvegarde Parc ancienne location (cle derniere_facture = matricules facture).';

ALTER TABLE phieevreux.anciennelocation_parc ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anciennelocation_parc_select_authenticated ON phieevreux.anciennelocation_parc;
CREATE POLICY anciennelocation_parc_select_authenticated ON phieevreux.anciennelocation_parc
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS anciennelocation_parc_insert_authorized ON phieevreux.anciennelocation_parc;
CREATE POLICY anciennelocation_parc_insert_authorized ON phieevreux.anciennelocation_parc
  FOR INSERT TO authenticated
  WITH CHECK (phieevreux.has_site_access());

DROP POLICY IF EXISTS anciennelocation_parc_update_authorized ON phieevreux.anciennelocation_parc;
CREATE POLICY anciennelocation_parc_update_authorized ON phieevreux.anciennelocation_parc
  FOR UPDATE TO authenticated
  USING (phieevreux.has_site_access())
  WITH CHECK (phieevreux.has_site_access());

DROP POLICY IF EXISTS anciennelocation_parc_delete_authorized ON phieevreux.anciennelocation_parc;
CREATE POLICY anciennelocation_parc_delete_authorized ON phieevreux.anciennelocation_parc
  FOR DELETE TO authenticated
  USING (phieevreux.has_site_access());

GRANT SELECT, INSERT, UPDATE, DELETE ON phieevreux.anciennelocation_parc TO authenticated;
GRANT ALL ON phieevreux.anciennelocation_parc TO service_role;
