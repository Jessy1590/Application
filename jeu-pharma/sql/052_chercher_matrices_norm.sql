-- 052 : v2_chercher_matrices — recherche insensible aux accents
-- Projet : kpjflntnotftpzffjbud
--
-- Problème :
--   La RPC comparait valeur_norm (déjà sans accents, via normaliser_valeur)
--   avec lower(trim(p_q)) qui conserve les diacritiques.
--   Ex. saisie « Tardyféron » → '%tardyféron%' ne matche pas 'tardyferon'.
--   Les marques sans accent (Ascofer, Fumafer…) restaient trouvables.
--
-- Fix :
--   Utiliser jeupharma.normaliser_valeur(p_q) pour le motif de recherche.
--   Nettoyage : liaison orpheline Tardyféron → matrice archive ; désactiver
--   le nom commercial « TARDYFERON 50 mg » non lié (artefact RCP).

CREATE OR REPLACE FUNCTION jeupharma.v2_chercher_matrices(
  p_q text DEFAULT NULL,
  p_secteur_norm text DEFAULT NULL,
  p_indication_norm text DEFAULT NULL,
  p_classe_ther_norm text DEFAULT NULL,
  p_classe_pharma_norm text DEFAULT NULL,
  p_limit int DEFAULT 40
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  lim int := GREATEST(1, LEAST(coalesce(p_limit, 40), 100));
  q_norm text := NULL;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;

  IF p_q IS NOT NULL AND trim(p_q) <> '' THEN
    q_norm := jeupharma.normaliser_valeur(p_q);
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', x.id,
      'dci', x.dci,
      'noms', x.noms
    ))
    FROM (
      SELECT DISTINCT ON (m.id)
        m.id,
        coalesce(dci.valeur, '') AS dci,
        (
          SELECT string_agg(nc.valeur, ', ' ORDER BY mnc.ordre)
          FROM jeupharma.matrice_noms_commerciaux mnc
          JOIN jeupharma.noms_commerciaux nc ON nc.id = mnc.nom_commercial_id AND nc.actif
          WHERE mnc.matrice_id = m.id
        ) AS noms
      FROM jeupharma.matrice_medicaments m
      LEFT JOIN jeupharma.dcis dci ON dci.id = m.dci_id AND dci.actif
      WHERE m.statut IS DISTINCT FROM 'archive'
        AND (
          q_norm IS NULL
          OR dci.valeur_norm ILIKE '%' || q_norm || '%'
          OR EXISTS (
            SELECT 1 FROM jeupharma.matrice_noms_commerciaux mnc
            JOIN jeupharma.noms_commerciaux nc ON nc.id = mnc.nom_commercial_id
            WHERE mnc.matrice_id = m.id AND nc.valeur_norm ILIKE '%' || q_norm || '%'
          )
        )
        AND (
          p_secteur_norm IS NULL OR trim(p_secteur_norm) = ''
          OR EXISTS (
            SELECT 1 FROM jeupharma.connaissances c
            JOIN jeupharma.secteurs_therapeutiques s ON s.id = c.entite_id
            WHERE c.matrice_id = m.id AND c.champ_code = 'secteur_therapeutique'
              AND c.statut = 'valide' AND s.valeur_norm = lower(trim(p_secteur_norm))
          )
        )
        AND (
          p_indication_norm IS NULL OR trim(p_indication_norm) = ''
          OR EXISTS (
            SELECT 1 FROM jeupharma.connaissances c
            JOIN jeupharma.indications ind ON ind.id = c.entite_id
            WHERE c.matrice_id = m.id AND c.champ_code = 'indications'
              AND c.statut = 'valide' AND ind.valeur_norm = lower(trim(p_indication_norm))
          )
        )
        AND (
          p_classe_ther_norm IS NULL OR trim(p_classe_ther_norm) = ''
          OR EXISTS (
            SELECT 1 FROM jeupharma.connaissances c
            JOIN jeupharma.classes_therapeutiques ct ON ct.id = c.entite_id
            WHERE c.matrice_id = m.id AND c.champ_code = 'classe_therapeutique'
              AND c.statut = 'valide' AND ct.valeur_norm = lower(trim(p_classe_ther_norm))
          )
        )
        AND (
          p_classe_pharma_norm IS NULL OR trim(p_classe_pharma_norm) = ''
          OR EXISTS (
            SELECT 1 FROM jeupharma.connaissances c
            JOIN jeupharma.classes_pharmacologiques cp ON cp.id = c.entite_id
            WHERE c.matrice_id = m.id AND c.champ_code = 'classe_pharmacologique'
              AND c.statut = 'valide' AND cp.valeur_norm = lower(trim(p_classe_pharma_norm))
          )
        )
      ORDER BY m.id
      LIMIT lim
    ) x
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_chercher_matrices(text, text, text, text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_chercher_matrices(text, text, text, text, text, int) TO authenticated;

-- Liaison résiduelle Tardyféron → fiche archive (sans DCI) post-cleanup 004
DELETE FROM jeupharma.matrice_noms_commerciaux
WHERE matrice_id = '8e98cc9d-6578-4250-8e61-91378e2208f2'
  AND nom_commercial_id = '54b3c6b9-ee7d-437b-86d1-e738ee9dd21e';

-- Artefact RCP « TARDYFERON 50 mg » sans fiche matrice
UPDATE jeupharma.noms_commerciaux
SET actif = false, updated_at = now()
WHERE id = '8239c4b9-1617-4ae1-bcc0-fa5ff8d6735d'
  AND actif
  AND NOT EXISTS (
    SELECT 1 FROM jeupharma.matrice_noms_commerciaux mnc
    WHERE mnc.nom_commercial_id = '8239c4b9-1617-4ae1-bcc0-fa5ff8d6735d'
  );
