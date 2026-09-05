-- =============================================================================
-- Emplacements admin + détails MEA/promo/challenge + tâches d'exécution J-3
-- =============================================================================

CREATE TABLE IF NOT EXISTS "PharmaOs".perime_emplacements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  label text NOT NULL,
  actif boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE "PharmaOs".perime_emplacements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS perime_emplacements_staff_all ON "PharmaOs".perime_emplacements;
CREATE POLICY perime_emplacements_staff_all ON "PharmaOs".perime_emplacements
  FOR ALL TO authenticated
  USING ("PharmaOs".is_pharma_staff())
  WITH CHECK ("PharmaOs".is_pharma_staff());

GRANT ALL ON TABLE "PharmaOs".perime_emplacements TO authenticated;
GRANT ALL ON TABLE "PharmaOs".perime_emplacements TO service_role;

ALTER TABLE "PharmaOs".perimes ADD COLUMN IF NOT EXISTS mise_en_avant_emplacement text;
ALTER TABLE "PharmaOs".perimes ADD COLUMN IF NOT EXISTS mise_en_avant_montant numeric;
ALTER TABLE "PharmaOs".perimes ADD COLUMN IF NOT EXISTS mise_en_avant_message text;
ALTER TABLE "PharmaOs".perimes ADD COLUMN IF NOT EXISTS promo_emplacement text;
ALTER TABLE "PharmaOs".perimes ADD COLUMN IF NOT EXISTS promo_montant numeric;
ALTER TABLE "PharmaOs".perimes ADD COLUMN IF NOT EXISTS promo_message text;
ALTER TABLE "PharmaOs".perimes ADD COLUMN IF NOT EXISTS challenge_message text;
ALTER TABLE "PharmaOs".perimes ADD COLUMN IF NOT EXISTS mea_task_id uuid;
ALTER TABLE "PharmaOs".perimes ADD COLUMN IF NOT EXISTS promo_task_id uuid;

INSERT INTO "PharmaOs".perime_emplacements (label, sort_order)
SELECT * FROM (VALUES
  ('Comptoir', 1),
  ('Vitrine entrée', 2),
  ('Gondole centrale', 3),
  ('Tête de gondole', 4),
  ('Réserve / back', 5)
) AS v(label, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM "PharmaOs".perime_emplacements LIMIT 1);
