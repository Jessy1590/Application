-- =============================================================================
-- 035 — catalogue tâches étendu (modules magistral / location / caisse / divers)
-- Seeds never/immediate alignés sur le catalogue UI taskCatalog.js
-- =============================================================================

-- Préparations : staff immédiat pour files opérationnelles ; NC → admin
INSERT INTO "PharmaOs".task_role_rules (category, role, mode, delay_hours)
SELECT c.category, r.role, 'immediate', NULL
FROM (VALUES
  ('magistral_devis'),
  ('magistral_a_controler'),
  ('magistral_a_rappeler'),
  ('magistral_a_dispenser')
) AS c(category)
CROSS JOIN (VALUES ('pharmacien'), ('administrateur'), ('préparateur')) AS r(role)
ON CONFLICT (category, role) DO NOTHING;

INSERT INTO "PharmaOs".task_role_rules (category, role, mode, delay_hours)
SELECT c.category, r.role,
  CASE
    WHEN r.role IN ('pharmacien', 'administrateur') THEN 'immediate'
    ELSE 'never'
  END,
  NULL
FROM (VALUES ('magistral_non_conforme')) AS c(category)
CROSS JOIN (VALUES ('pharmacien'), ('administrateur'), ('préparateur')) AS r(role)
ON CONFLICT (category, role) DO NOTHING;

-- Location : équipe pour rappels ; attente suite → staff
INSERT INTO "PharmaOs".task_role_rules (category, role, mode, delay_hours)
SELECT c.category, r.role, 'immediate', NULL
FROM (VALUES
  ('location_a_rappeler'),
  ('location_attente_suite')
) AS c(category)
CROSS JOIN (VALUES ('pharmacien'), ('administrateur'), ('préparateur')) AS r(role)
ON CONFLICT (category, role) DO NOTHING;

-- Caisse : écart → pharmacien / admin
INSERT INTO "PharmaOs".task_role_rules (category, role, mode, delay_hours)
SELECT c.category, r.role,
  CASE
    WHEN r.role IN ('pharmacien', 'administrateur') THEN 'immediate'
    ELSE 'never'
  END,
  NULL
FROM (VALUES ('cash_ecart')) AS c(category)
CROSS JOIN (VALUES ('pharmacien'), ('administrateur'), ('préparateur')) AS r(role)
ON CONFLICT (category, role) DO NOTHING;

-- Legacy étalonnage : never (affichage seulement)
INSERT INTO "PharmaOs".task_role_rules (category, role, mode, delay_hours)
SELECT c.category, r.role, 'never', NULL
FROM (VALUES ('etalonnage_rdv')) AS c(category)
CROSS JOIN (VALUES ('pharmacien'), ('administrateur'), ('préparateur')) AS r(role)
ON CONFLICT (category, role) DO NOTHING;
