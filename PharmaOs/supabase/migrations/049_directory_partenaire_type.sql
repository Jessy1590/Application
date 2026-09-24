-- =============================================================================
-- 049 — Annuaire : type de partenaire commercial
-- partenaire_type : laboratoire | grossiste | plateforme | generiqueur | autre
-- partenaire_type_autre : libellé libre si type = autre
-- =============================================================================

ALTER TABLE "PharmaOs".directory_contacts
  ADD COLUMN IF NOT EXISTS partenaire_type text,
  ADD COLUMN IF NOT EXISTS partenaire_type_autre text;

ALTER TABLE "PharmaOs".directory_contacts
  DROP CONSTRAINT IF EXISTS directory_contacts_partenaire_type_check;

ALTER TABLE "PharmaOs".directory_contacts
  ADD CONSTRAINT directory_contacts_partenaire_type_check CHECK (
    partenaire_type IS NULL
    OR partenaire_type = ANY (ARRAY[
      'laboratoire'::text,
      'grossiste'::text,
      'plateforme'::text,
      'generiqueur'::text,
      'autre'::text
    ])
  );

ALTER TABLE "PharmaOs".directory_contacts
  DROP CONSTRAINT IF EXISTS directory_contacts_partenaire_type_scope_check;

ALTER TABLE "PharmaOs".directory_contacts
  ADD CONSTRAINT directory_contacts_partenaire_type_scope_check CHECK (
    type = 'commercial_partner'
    OR (partenaire_type IS NULL AND partenaire_type_autre IS NULL)
  );

-- Backfill seed contacts (commentaires / noms évidents)
UPDATE "PharmaOs".directory_contacts
SET partenaire_type = 'grossiste'
WHERE type = 'commercial_partner'
  AND partenaire_type IS NULL
  AND (
    commentaires ILIKE '%grossiste%'
    OR nom ILIKE '%répartiteur%'
    OR nom ILIKE '%repartiteur%'
  );

UPDATE "PharmaOs".directory_contacts
SET partenaire_type = 'laboratoire'
WHERE type = 'commercial_partner'
  AND partenaire_type IS NULL
  AND (
    commentaires ILIKE '%labo%'
    OR nom ILIKE '%labo%'
  );

NOTIFY pgrst, 'reload schema';
