-- =============================================================================
-- Ops post-regen : nettoyer pubs molécules parcours + soft-désactiver orphelines
-- verbeuses (non liées à une fiche active). Ne touche pas inscriptions / modules.
-- =============================================================================

-- 1) Désactiver publications liées à des connaissances de molécules (matrice_id)
UPDATE jeupharma.publications_connaissances pc
SET actif = false
WHERE pc.actif = true
  AND EXISTS (
    SELECT 1 FROM jeupharma.connaissances c
    WHERE c.id = pc.connaissance_id
      AND c.matrice_id IS NOT NULL
  );

-- 2) Soft-désactiver entités actives orphelines et trop longues (>160)
--    (non référencées par une jonction d’une fiche non-archive)
DO $$
DECLARE
  rec record;
  n int;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('indications', 'matrice_indications', 'indication_id'),
      ('contre_indications', 'matrice_contre_indications', 'contre_indication_id'),
      ('effets_indesirables', 'matrice_effets_indesirables', 'effet_indesirable_id'),
      ('precautions_emploi', 'matrice_precautions_emploi', 'precaution_emploi_id'),
      ('interactions', 'matrice_interactions', 'interaction_id'),
      ('surveillances', 'matrice_surveillances', 'surveillance_id')
    ) AS t(ent, jt, fk)
  LOOP
    EXECUTE format($q$
      UPDATE jeupharma.%1$I e
      SET actif = false, updated_at = now()
      WHERE e.actif
        AND length(e.valeur) > 160
        AND NOT EXISTS (
          SELECT 1
          FROM jeupharma.%2$I j
          JOIN jeupharma.matrice_medicaments m ON m.id = j.matrice_id
          WHERE j.%3$I = e.id
            AND m.statut IS DISTINCT FROM 'archive'
        )
    $q$, rec.ent, rec.jt, rec.fk);
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'soft-orphan % : %', rec.ent, n;
  END LOOP;
END $$;
