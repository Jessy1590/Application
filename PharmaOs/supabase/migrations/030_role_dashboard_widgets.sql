-- =============================================================================
-- 030 — matrice widgets d'accueil dashboard par rôle
-- =============================================================================

CREATE TABLE IF NOT EXISTS "PharmaOs".role_dashboard_widgets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  role text NOT NULL,
  widget_id text NOT NULL,
  visible boolean DEFAULT true NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  updated_by uuid,
  CHECK (role = ANY (ARRAY['pharmacien'::text, 'administrateur'::text, 'préparateur'::text])),
  UNIQUE (role, widget_id),
  PRIMARY KEY (id)
);

ALTER TABLE "PharmaOs".role_dashboard_widgets ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".role_dashboard_widgets TO authenticated;

DROP POLICY IF EXISTS "role_dashboard_widgets_select_staff" ON "PharmaOs".role_dashboard_widgets;
CREATE POLICY "role_dashboard_widgets_select_staff" ON "PharmaOs".role_dashboard_widgets
  FOR SELECT TO authenticated
  USING ("PharmaOs".is_pharma_staff());

DROP POLICY IF EXISTS "role_dashboard_widgets_admin_manage" ON "PharmaOs".role_dashboard_widgets;
CREATE POLICY "role_dashboard_widgets_admin_manage" ON "PharmaOs".role_dashboard_widgets
  FOR ALL TO authenticated
  USING ("PharmaOs".is_app_administrateur())
  WITH CHECK ("PharmaOs".is_app_administrateur());

-- Seeds : admin/pharmacien ≈ tout ; préparateur = tâches + appels + IP
INSERT INTO "PharmaOs".role_dashboard_widgets (role, widget_id, visible)
SELECT r.role, w.widget_id,
  CASE
    WHEN r.role = 'préparateur' AND w.widget_id IN ('tasks', 'calls', 'ip') THEN true
    WHEN r.role = 'préparateur' THEN false
    ELSE true
  END
FROM (VALUES ('pharmacien'), ('administrateur'), ('préparateur')) AS r(role)
CROSS JOIN (VALUES
  ('staff_efficiency'),
  ('recurring_issues'),
  ('ip'),
  ('calls'),
  ('tasks'),
  ('quality'),
  ('magistral'),
  ('taskbar_usage'),
  ('conseil')
) AS w(widget_id)
ON CONFLICT (role, widget_id) DO NOTHING;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE "PharmaOs".role_dashboard_widgets;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
