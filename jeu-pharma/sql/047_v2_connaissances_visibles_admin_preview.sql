-- =============================================================================
-- 047 : v2_connaissances_visibles — aperçu admin sur module_ids explicites
-- =============================================================================
-- Permet à un admin portail de résoudre les pubs d'une leçon ciblée même si
-- elle n'est pas encore `publie` / débloquée (studio preview + v2_fiche_resolue).
-- Les joueurs restent limités aux modules débloqués publiés.
-- Ne lit jamais la matrice complète : uniquement publications_connaissances.
-- =============================================================================

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
