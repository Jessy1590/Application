-- =============================================================================
-- Ops 049 : Sels ferreux — écart référentiel admin vs leçon Pathologie Globule Rouge
-- Projet : kpjflntnotftpzffjbud
-- Ne republie PAS tout le parcours ; ne republie PAS les connaissances RCP.
-- =============================================================================
-- SUPERSEDÉ (pubs) : 050 a soft-off les pubs B1/B2 + retire les conn cours Sels
-- ferreux. Conservé : A (bloc molecule matrice_ids) + C (bypass admin visibles).
-- =============================================================================
-- Cause :
--   1) Bloc molecule e209f89f : choix Sels ferreux seulement dans _brouillon,
--      matrice_ids publié = [], visible=false
--   2) Cleanup 048 : pubs molécules actif=false (0 pubs actives)
--   3) Aucune pub sur pathologie_du_globule_rouge pour d122d669
--   4) v2_connaissances_visibles ignore les modules non publiés → aperçu admin
--      affiche le carrousel mais v2_fiche_resolue renvoie NULL
-- Fix :
--   A) Publier le bloc molecule (matrice_id Sels ferreux)
--   B) Réactiver pubs cours sur sang_rappel + publier les mêmes sur Pathologie
--   C) Bypass admin pour module_ids explicites dans v2_connaissances_visibles
-- =============================================================================

-- A) Bloc molecule Pathologie Globule Rouge
UPDATE jeupharma.module_blocs
SET
  titre = 'Médicaments',
  visible = true,
  payload_json = jsonb_build_object(
    'mode', 'fiche',
    'matrice_id', 'd122d669-2f7c-48ed-a517-aa6e4bd765b8',
    'matrice_ids', jsonb_build_array('d122d669-2f7c-48ed-a517-aa6e4bd765b8')
  ),
  updated_at = now()
WHERE id = 'e209f89f-313a-4b98-808e-28b9aae49336'
  AND module_id = 'c0a6acde-7d7a-45ae-99ea-d0337f7f969f';

-- B1) Réactiver pubs cours sur sang_rappel (Sels ferreux)
UPDATE jeupharma.publications_connaissances pc
SET actif = true
FROM jeupharma.connaissances c
JOIN jeupharma.sources_contenu s ON s.id = c.source_id
WHERE pc.connaissance_id = c.id
  AND pc.module_id = 'e9adf9b0-090e-4d11-bfb4-ce6d01066cf3'
  AND c.matrice_id = 'd122d669-2f7c-48ed-a517-aa6e4bd765b8'
  AND c.statut = 'valide'
  AND s.code = 'cours_cardio_deust_2a'
  AND pc.actif IS DISTINCT FROM true;

-- B2) Publier les connaissances cours sur Pathologie Globule Rouge
INSERT INTO jeupharma.publications_connaissances (
  module_id, connaissance_id, ordre, actif, niveau_min, niveau_max
)
SELECT
  'c0a6acde-7d7a-45ae-99ea-d0337f7f969f'::uuid,
  c.id,
  c.ordre,
  true,
  1,
  5
FROM jeupharma.connaissances c
JOIN jeupharma.sources_contenu s ON s.id = c.source_id
WHERE c.matrice_id = 'd122d669-2f7c-48ed-a517-aa6e4bd765b8'
  AND c.statut = 'valide'
  AND s.code = 'cours_cardio_deust_2a'
ON CONFLICT (module_id, connaissance_id) DO UPDATE
SET actif = true,
    niveau_min = EXCLUDED.niveau_min,
    niveau_max = EXCLUDED.niveau_max;

-- C) Admin : module_ids explicites visibles même si leçon non publiée / non débloquée
--    (aperçu studio). Joueurs : inchangé (pubs + modules publiés + déblocage).
CREATE OR REPLACE FUNCTION jeupharma.v2_connaissances_visibles(
  p_user uuid DEFAULT auth.uid(),
  p_parcours uuid DEFAULT NULL,
  p_module_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  connaissance_id uuid,
  matrice_id uuid,
  champ_code text,
  entite_id uuid,
  texte text,
  texte_norm text,
  ordre int,
  module_id uuid,
  libelle_pedagogique text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
BEGIN
  IF p_user IS NULL THEN
    RETURN;
  END IF;
  IF NOT jeupharma.has_jeupharma_access() AND NOT jeupharma.is_portail_admin() THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH parcours_scope AS (
    SELECT i.parcours_id, i.niveau_parcours
    FROM jeupharma.inscriptions_parcours i
    JOIN jeupharma.parcours_apprentissage pa ON pa.id = i.parcours_id AND pa.actif
    WHERE i.user_id = p_user
      AND i.statut = 'accepte'
      AND i.actif
      AND (p_parcours IS NULL OR i.parcours_id = p_parcours)
  ),
  unlocked AS (
    SELECT d.module_id, ps.niveau_parcours
    FROM parcours_scope ps
    CROSS JOIN LATERAL jeupharma.v2_modules_debloques(p_user, ps.parcours_id) d
    WHERE p_module_ids IS NULL OR d.module_id = ANY (p_module_ids)
  ),
  -- Aperçu admin : pubs du/des module(s) demandé(s), même brouillon / non débloqué
  admin_requested AS (
    SELECT m.id AS module_id,
           COALESCE(
             (
               SELECT i.niveau_parcours
               FROM jeupharma.inscriptions_parcours i
               WHERE i.user_id = p_user
                 AND i.parcours_id = m.parcours_id
                 AND i.statut = 'accepte'
                 AND i.actif
               LIMIT 1
             ),
             1
           ) AS niveau_parcours
    FROM jeupharma.modules_cours m
    WHERE jeupharma.is_portail_admin()
      AND p_module_ids IS NOT NULL
      AND cardinality(p_module_ids) > 0
      AND m.id = ANY (p_module_ids)
      AND (p_parcours IS NULL OR m.parcours_id = p_parcours)
  ),
  combined AS (
    SELECT module_id, niveau_parcours FROM unlocked
    UNION
    SELECT module_id, niveau_parcours FROM admin_requested
  ),
  scope AS (
    SELECT DISTINCT s.module_id, u.niveau_parcours
    FROM combined u
    CROSS JOIN LATERAL jeupharma.v2_module_ancetres(u.module_id) s
  )
  SELECT c.id, c.matrice_id, c.champ_code, c.entite_id,
         COALESCE(pub.libelle_pedagogique, c.texte) AS texte,
         c.texte_norm, pub.ordre, pub.module_id, pub.libelle_pedagogique
  FROM jeupharma.publications_connaissances pub
  JOIN scope sc ON sc.module_id = pub.module_id
  JOIN jeupharma.connaissances c ON c.id = pub.connaissance_id AND c.statut = 'valide'
  JOIN jeupharma.matrice_medicaments m ON m.id = c.matrice_id AND m.statut = 'publie'
  WHERE pub.actif
    AND jeupharma.v2__dans_plage(sc.niveau_parcours, pub.niveau_min, pub.niveau_max)
  ORDER BY c.matrice_id, c.champ_code, pub.ordre;
END;
$$;

GRANT EXECUTE ON FUNCTION jeupharma.v2_connaissances_visibles(uuid, uuid, uuid[]) TO authenticated;
