-- Lien règle → template Contact + seuil âge pour arbre LGO générique
ALTER TABLE phieevreux.location_regles
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES phieevreux.location_templates_contact(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS location_regles_template_id_idx
  ON phieevreux.location_regles (template_id);

UPDATE phieevreux.location_templates_contact
SET corps = 'Réclamer ordo de prolongation depuis le {date_min}',
    updated_at = now()
WHERE motif IN ('prolongation', 'prolongation_tire_lait');

UPDATE phieevreux.location_regles r
SET template_id = t.id,
    updated_at = now()
FROM phieevreux.location_templates_contact t
WHERE r.code = 'tens_max'
  AND t.motif = 'reclame_appareil_tens'
  AND r.template_id IS NULL;

UPDATE phieevreux.location_regles r
SET template_id = t.id,
    updated_at = now()
FROM phieevreux.location_templates_contact t
WHERE r.code = 'tire_lait_prolong_max'
  AND t.motif = 'prolongation_tire_lait'
  AND r.template_id IS NULL;

INSERT INTO phieevreux.location_parametres (cle, valeur)
SELECT 'seuil_reclame_mois', '6'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM phieevreux.location_parametres WHERE cle = 'seuil_reclame_mois'
);
