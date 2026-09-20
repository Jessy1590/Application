-- =============================================================================
-- 039 — Stupéfiants : statut en_attente + BL nullable
-- =============================================================================

ALTER TABLE "PharmaOs".stupefiant_releves DROP CONSTRAINT IF EXISTS stupefiant_releves_status_check;
ALTER TABLE "PharmaOs".stupefiant_releves ADD CONSTRAINT stupefiant_releves_status_check CHECK (status = ANY (ARRAY[
  'en_attente'::text,
  'a_verifier'::text,
  'recompter'::text,
  'ras'::text,
  'ras_recompte'::text,
  'analyse'::text,
  'corrige_compris'::text,
  'corrige_sans'::text,
  'erreur_reception'::text
]));

ALTER TABLE "PharmaOs".stupefiant_releves ALTER COLUMN bl_numero DROP NOT NULL;

NOTIFY pgrst, 'reload schema';
