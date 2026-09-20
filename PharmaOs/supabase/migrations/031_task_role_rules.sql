-- =============================================================================
-- 031 — matrice d'assignation des tâches (catégorie × rôle)
-- =============================================================================

CREATE TABLE IF NOT EXISTS "PharmaOs".task_role_rules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  category text NOT NULL,
  role text NOT NULL,
  mode text NOT NULL DEFAULT 'never',
  delay_hours numeric DEFAULT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  updated_by uuid,
  CHECK (role = ANY (ARRAY['pharmacien'::text, 'administrateur'::text, 'préparateur'::text])),
  CHECK (mode = ANY (ARRAY['never'::text, 'immediate'::text, 'after_delay'::text])),
  CHECK (
    (mode = 'after_delay' AND delay_hours IS NOT NULL AND delay_hours > 0)
    OR (mode <> 'after_delay' AND (delay_hours IS NULL OR delay_hours >= 0))
  ),
  UNIQUE (category, role),
  PRIMARY KEY (id)
);

ALTER TABLE "PharmaOs".task_role_rules ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".task_role_rules TO authenticated;

DROP POLICY IF EXISTS "task_role_rules_select_staff" ON "PharmaOs".task_role_rules;
CREATE POLICY "task_role_rules_select_staff" ON "PharmaOs".task_role_rules
  FOR SELECT TO authenticated
  USING ("PharmaOs".is_pharma_staff());

DROP POLICY IF EXISTS "task_role_rules_admin_manage" ON "PharmaOs".task_role_rules;
CREATE POLICY "task_role_rules_admin_manage" ON "PharmaOs".task_role_rules
  FOR ALL TO authenticated
  USING ("PharmaOs".is_app_administrateur())
  WITH CHECK ("PharmaOs".is_app_administrateur());

-- Seeds alignés sur l'ancien comportement ADMIN_ROLES / STAFF_ROLES
-- Admin immédiat : appels pharmacien, RH demandes, stock admin, périmé décision
INSERT INTO "PharmaOs".task_role_rules (category, role, mode, delay_hours)
SELECT c.category, r.role,
  CASE
    WHEN r.role IN ('pharmacien', 'administrateur') THEN 'immediate'
    ELSE 'never'
  END,
  NULL
FROM (VALUES
  ('appel_attente_pharmacien'),
  ('hr_absence_demande'),
  ('hr_horaire_demande'),
  ('stock_error'),
  ('stock_recompte_result'),
  ('perime_decision')
) AS c(category)
CROSS JOIN (VALUES ('pharmacien'), ('administrateur'), ('préparateur')) AS r(role)
ON CONFLICT (category, role) DO NOTHING;

-- Staff immédiat : commandes, factures, lots, recomptage, MEA/promo/challenge
INSERT INTO "PharmaOs".task_role_rules (category, role, mode, delay_hours)
SELECT c.category, r.role, 'immediate', NULL
FROM (VALUES
  ('commande'),
  ('facturation'),
  ('retrait_lot'),
  ('stock_recompte'),
  ('perime_mea'),
  ('perime_promo'),
  ('perime_challenge')
) AS c(category)
CROSS JOIN (VALUES ('pharmacien'), ('administrateur'), ('préparateur')) AS r(role)
ON CONFLICT (category, role) DO NOTHING;

-- Réponses RH → destinataire explicite (créateur) ; matrice = never par défaut
INSERT INTO "PharmaOs".task_role_rules (category, role, mode, delay_hours)
SELECT c.category, r.role, 'never', NULL
FROM (VALUES
  ('hr_absence_reponse'),
  ('hr_horaire_reponse'),
  ('appel_brouillon'),
  ('nc_brouillon'),
  ('litige_brouillon'),
  ('ip_brouillon'),
  ('libre')
) AS c(category)
CROSS JOIN (VALUES ('pharmacien'), ('administrateur'), ('préparateur')) AS r(role)
ON CONFLICT (category, role) DO NOTHING;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE "PharmaOs".task_role_rules;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
