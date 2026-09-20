-- =============================================================================
-- 038 — Stupéfiants : statut erreur_reception + refresh cache API
-- =============================================================================

ALTER TABLE "PharmaOs".stupefiant_releves DROP CONSTRAINT IF EXISTS stupefiant_releves_status_check;
ALTER TABLE "PharmaOs".stupefiant_releves ADD CONSTRAINT stupefiant_releves_status_check CHECK (status = ANY (ARRAY[
  'a_verifier'::text,
  'recompter'::text,
  'ras'::text,
  'ras_recompte'::text,
  'analyse'::text,
  'corrige_compris'::text,
  'corrige_sans'::text,
  'erreur_reception'::text
]));

NOTIFY pgrst, 'reload schema';
