-- =============================================================================
-- Tables — module perimes
-- Workflow : déclaration (12 mois) → décision admin à J-3 mois
-- Source module : src/modules/perimes/sql/tables.sql
-- =============================================================================
CREATE TABLE IF NOT EXISTS "PharmaOs".perimes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  medicament text NOT NULL,
  code text,
  cip text,
  lot text,
  date_peremption date NOT NULL,
  quantite integer DEFAULT 1 NOT NULL,
  source text DEFAULT 'reception'::text NOT NULL,
  status text DEFAULT 'declare'::text NOT NULL,
  notes text,
  decision_due_at date,
  decision_task_id uuid,
  mise_en_avant boolean DEFAULT false NOT NULL,
  mise_en_avant_debut date,
  mise_en_avant_fin date,
  promo boolean DEFAULT false NOT NULL,
  promo_debut date,
  promo_fin date,
  challenge_actif boolean DEFAULT false NOT NULL,
  challenge_titre text,
  challenge_objectif text,
  challenge_fin date,
  challenge_task_id uuid,
  destination text,
  dispute_id uuid,
  decided_at timestamptz,
  decided_by uuid,
  created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CHECK ((status = ANY (ARRAY[
    'declare'::text, 'a_decider'::text, 'valorise'::text,
    'laisser_perimer'::text, 'litige'::text, 'association'::text, 'clos'::text
  ]))),
  CHECK ((destination IS NULL OR destination = ANY (ARRAY['litige'::text, 'association'::text]))),
  FOREIGN KEY (created_by) REFERENCES auth.users(id),
  PRIMARY KEY ("id")
);
