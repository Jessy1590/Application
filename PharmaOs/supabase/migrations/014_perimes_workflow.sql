-- =============================================================================
-- Périmés : workflow déclaration → décision admin (valoriser / laisser périmer)
-- + perime_id sur supplier_disputes
-- =============================================================================

-- Colonnes nouvelles
ALTER TABLE "PharmaOs".perimes ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE "PharmaOs".perimes ADD COLUMN IF NOT EXISTS decision_due_at date;
ALTER TABLE "PharmaOs".perimes ADD COLUMN IF NOT EXISTS decision_task_id uuid;
ALTER TABLE "PharmaOs".perimes ADD COLUMN IF NOT EXISTS mise_en_avant boolean DEFAULT false NOT NULL;
ALTER TABLE "PharmaOs".perimes ADD COLUMN IF NOT EXISTS mise_en_avant_debut date;
ALTER TABLE "PharmaOs".perimes ADD COLUMN IF NOT EXISTS mise_en_avant_fin date;
ALTER TABLE "PharmaOs".perimes ADD COLUMN IF NOT EXISTS promo boolean DEFAULT false NOT NULL;
ALTER TABLE "PharmaOs".perimes ADD COLUMN IF NOT EXISTS promo_debut date;
ALTER TABLE "PharmaOs".perimes ADD COLUMN IF NOT EXISTS promo_fin date;
ALTER TABLE "PharmaOs".perimes ADD COLUMN IF NOT EXISTS challenge_actif boolean DEFAULT false NOT NULL;
ALTER TABLE "PharmaOs".perimes ADD COLUMN IF NOT EXISTS challenge_titre text;
ALTER TABLE "PharmaOs".perimes ADD COLUMN IF NOT EXISTS challenge_objectif text;
ALTER TABLE "PharmaOs".perimes ADD COLUMN IF NOT EXISTS challenge_fin date;
ALTER TABLE "PharmaOs".perimes ADD COLUMN IF NOT EXISTS challenge_task_id uuid;
ALTER TABLE "PharmaOs".perimes ADD COLUMN IF NOT EXISTS destination text;
ALTER TABLE "PharmaOs".perimes ADD COLUMN IF NOT EXISTS dispute_id uuid;
ALTER TABLE "PharmaOs".perimes ADD COLUMN IF NOT EXISTS decided_at timestamptz;
ALTER TABLE "PharmaOs".perimes ADD COLUMN IF NOT EXISTS decided_by uuid;

-- Migration données legacy
UPDATE "PharmaOs".perimes
SET
  mise_en_avant = CASE WHEN status = 'mis_en_avant' THEN true ELSE mise_en_avant END,
  promo = CASE WHEN status = 'promo' THEN true ELSE promo END,
  status = CASE
    WHEN status = 'actif' THEN 'declare'
    WHEN status IN ('mis_en_avant', 'promo') THEN 'valorise'
    WHEN status = 'retire' THEN 'clos'
    ELSE status
  END
WHERE status IN ('actif', 'mis_en_avant', 'promo', 'retire');

-- decision_due_at pour lignes sans valeur
UPDATE "PharmaOs".perimes
SET decision_due_at = (date_peremption - INTERVAL '3 months')::date
WHERE decision_due_at IS NULL;

-- CHECK status
ALTER TABLE "PharmaOs".perimes DROP CONSTRAINT IF EXISTS perimes_status_check;
ALTER TABLE "PharmaOs".perimes
  ADD CONSTRAINT perimes_status_check
  CHECK (status = ANY (ARRAY[
    'declare'::text,
    'a_decider'::text,
    'valorise'::text,
    'laisser_perimer'::text,
    'litige'::text,
    'association'::text,
    'clos'::text
  ]));

ALTER TABLE "PharmaOs".perimes DROP CONSTRAINT IF EXISTS perimes_destination_check;
ALTER TABLE "PharmaOs".perimes
  ADD CONSTRAINT perimes_destination_check
  CHECK (destination IS NULL OR destination = ANY (ARRAY['litige'::text, 'association'::text]));

-- Défaut status
ALTER TABLE "PharmaOs".perimes ALTER COLUMN status SET DEFAULT 'declare'::text;

-- Litiges : lien perime
ALTER TABLE "PharmaOs".supplier_disputes ADD COLUMN IF NOT EXISTS perime_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'supplier_disputes_perime_id_fkey'
  ) THEN
    ALTER TABLE "PharmaOs".supplier_disputes
      ADD CONSTRAINT supplier_disputes_perime_id_fkey
      FOREIGN KEY (perime_id) REFERENCES "PharmaOs".perimes(id) ON DELETE SET NULL;
  END IF;
END $$;
