-- =============================================================================
-- 003 — Aligner normaliser_valeur sur le client JS (NFD + strip diacritiques)
-- Cause bug : unaccent non installé → fallback lower() seul → valeur_norm
-- accentuée en base, alors que JpEntites.normaliser() strip → miss + INSERT
-- → duplicate key noms_commerciaux_valeur_norm_actif_uidx (et autres tables).
-- =============================================================================

CREATE OR REPLACE FUNCTION jeupharma.normaliser_valeur(p_valeur text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text;
BEGIN
  IF p_valeur IS NULL THEN
    RETURN NULL;
  END IF;
  v := lower(trim(both FROM p_valeur));
  -- NFD + suppression des marques combinantes (équivalent JS normalize('NFD'))
  v := regexp_replace(normalize(v, NFD), '[\u0300-\u036f]', '', 'g');
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.normaliser_valeur(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.normaliser_valeur(text) TO authenticated;

-- Recalcule valeur_norm sur toutes les tables d’entités (pas de collision post-NFD
-- constatée au 2026-10-07 ; unique partiel actif reste la garde-fou).
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'noms_commerciaux', 'dcis', 'secteurs_therapeutiques', 'classes_therapeutiques',
    'classes_pharmacologiques', 'details_pharmacologie', 'indications',
    'contre_indications', 'effets_indesirables', 'precautions_emploi',
    'posologies_generales', 'interactions', 'surveillances',
    'grossesse_allaitement', 'voies_administration'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'UPDATE jeupharma.%I SET valeur_norm = jeupharma.normaliser_valeur(valeur)
       WHERE valeur_norm IS DISTINCT FROM jeupharma.normaliser_valeur(valeur)',
      t
    );
  END LOOP;
END $$;
