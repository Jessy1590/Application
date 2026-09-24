-- Journal d'activité Phie Evreux (hub + apps)
-- Appliqué via Supabase — migration create_phieevreux_logs

CREATE TABLE IF NOT EXISTS phieevreux.logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_label text,
  app text NOT NULL DEFAULT 'hub',
  module text,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  path text,
  level text NOT NULL DEFAULT 'info'
    CHECK (level IN ('info', 'warn', 'error')),
  CONSTRAINT logs_action_nonempty CHECK (length(trim(action)) > 0)
);

CREATE INDEX IF NOT EXISTS logs_created_at_idx ON phieevreux.logs (created_at DESC);
CREATE INDEX IF NOT EXISTS logs_user_id_idx ON phieevreux.logs (user_id);
CREATE INDEX IF NOT EXISTS logs_app_action_idx ON phieevreux.logs (app, action);

COMMENT ON TABLE phieevreux.logs IS
  'Journal d''activité Phie Evreux (hub + apps). Lecture réservée admin portail.';

ALTER TABLE phieevreux.logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS logs_insert_auth ON phieevreux.logs;
CREATE POLICY logs_insert_auth ON phieevreux.logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS logs_select_portail_admin ON phieevreux.logs;
CREATE POLICY logs_select_portail_admin ON phieevreux.logs
  FOR SELECT TO authenticated
  USING (portail.is_admin());

DROP POLICY IF EXISTS logs_delete_portail_admin ON phieevreux.logs;
CREATE POLICY logs_delete_portail_admin ON phieevreux.logs
  FOR DELETE TO authenticated
  USING (portail.is_admin());

GRANT SELECT, INSERT, DELETE ON phieevreux.logs TO authenticated;
GRANT ALL ON phieevreux.logs TO service_role;
