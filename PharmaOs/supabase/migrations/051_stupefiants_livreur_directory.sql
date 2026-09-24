-- =============================================================================
-- 051 — Stupéfiants : livreur = partenaire annuaire (grossiste / génériqueur / plateforme)
-- Remplace PharmaOs.stupefiant_livreurs ; stupefiant_releves.livreur_id → directory_contacts
-- =============================================================================

-- 1) Seed annuaire depuis l’ancien référentiel (évite doublons si nom déjà présent / préfixe)
INSERT INTO "PharmaOs".directory_contacts (type, nom, partenaire_type)
SELECT 'commercial_partner', l.label, l.type
FROM "PharmaOs".stupefiant_livreurs l
WHERE NOT EXISTS (
  SELECT 1
  FROM "PharmaOs".directory_contacts c
  WHERE c.type = 'commercial_partner'
    AND c.partenaire_type IN ('grossiste', 'generiqueur', 'plateforme')
    AND (
      lower(trim(c.nom)) = lower(trim(l.label))
      OR lower(trim(c.nom)) LIKE lower(trim(l.label)) || '%'
    )
);

-- 2) Couper la FK vers stupefiant_livreurs
ALTER TABLE "PharmaOs".stupefiant_releves
  DROP CONSTRAINT IF EXISTS stupefiant_releves_livreur_id_fkey;

-- 3) Remapper les relevés vers directory_contacts (exact puis préfixe, ex. OCP → OCP Répartiteur)
UPDATE "PharmaOs".stupefiant_releves r
SET livreur_id = m.new_id
FROM (
  SELECT l.id AS old_id, c.id AS new_id
  FROM "PharmaOs".stupefiant_livreurs l
  JOIN LATERAL (
    SELECT dc.id
    FROM "PharmaOs".directory_contacts dc
    WHERE dc.type = 'commercial_partner'
      AND dc.partenaire_type IN ('grossiste', 'generiqueur', 'plateforme')
      AND (
        lower(trim(dc.nom)) = lower(trim(l.label))
        OR lower(trim(dc.nom)) LIKE lower(trim(l.label)) || '%'
      )
    ORDER BY
      CASE WHEN lower(trim(dc.nom)) = lower(trim(l.label)) THEN 0 ELSE 1 END,
      length(dc.nom)
    LIMIT 1
  ) c ON true
) m
WHERE r.livreur_id = m.old_id;

-- 4) Orphelins (plus de contact annuaire) → NULL
UPDATE "PharmaOs".stupefiant_releves r
SET livreur_id = NULL
WHERE r.livreur_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "PharmaOs".directory_contacts c WHERE c.id = r.livreur_id
  );

-- 5) Nouvelle FK
ALTER TABLE "PharmaOs".stupefiant_releves
  ADD CONSTRAINT stupefiant_releves_livreur_id_fkey
  FOREIGN KEY (livreur_id) REFERENCES "PharmaOs".directory_contacts(id) ON DELETE SET NULL;

-- 6) Retirer de Realtime puis drop table + policies
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE "PharmaOs".stupefiant_livreurs;
  EXCEPTION
    WHEN undefined_object THEN NULL;
    WHEN undefined_table THEN NULL;
  END;
END $$;

DROP POLICY IF EXISTS "stupefiant_livreurs_staff_all" ON "PharmaOs".stupefiant_livreurs;
DROP TABLE IF EXISTS "PharmaOs".stupefiant_livreurs;
