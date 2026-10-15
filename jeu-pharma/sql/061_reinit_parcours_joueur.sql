-- =============================================================================
-- 061 : Réinitialiser la progression d’un joueur sur un parcours (admin)
--
-- RPC `v2_reinit_parcours_joueur(p_inscription_id)` :
--   - admin portail uniquement (`jeupharma.is_portail_admin`)
--   - conserve inscription acceptée + niveau_parcours ★
--   - efface progression_modules des modules du parcours
--   - efface tentatives_jeu des modeles_jeu liés au parcours
--   - efface scores_fiche_aleatoire sur matrices publiées dans le parcours
-- =============================================================================

CREATE OR REPLACE FUNCTION jeupharma.v2_reinit_parcours_joueur(p_inscription_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  ins jeupharma.inscriptions_parcours%ROWTYPE;
  n_prog int := 0;
  n_tent int := 0;
  n_scores int := 0;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF p_inscription_id IS NULL THEN
    RAISE EXCEPTION 'Inscription requise';
  END IF;

  SELECT * INTO ins
  FROM jeupharma.inscriptions_parcours
  WHERE id = p_inscription_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inscription introuvable';
  END IF;
  IF ins.statut IS DISTINCT FROM 'accepte' OR NOT ins.actif THEN
    RAISE EXCEPTION 'Inscription acceptée requise';
  END IF;

  -- Lectures / miroir de déblocage sur les modules du parcours
  DELETE FROM jeupharma.progression_modules pm
  USING jeupharma.modules_cours m
  WHERE pm.user_id = ins.user_id
    AND pm.module_id = m.id
    AND m.parcours_id = ins.parcours_id;
  GET DIAGNOSTICS n_prog = ROW_COUNT;

  -- Tentatives / scores des jeux rattachés au parcours (actifs ou non)
  DELETE FROM jeupharma.tentatives_jeu t
  USING jeupharma.modeles_jeu mj
  WHERE t.utilisateur_id = ins.user_id
    AND t.modele_id = mj.id
    AND mj.parcours_id = ins.parcours_id;
  GET DIAGNOSTICS n_tent = ROW_COUNT;

  -- Notes fiche aléatoire sur molécules publiées dans ce parcours
  DELETE FROM jeupharma.scores_fiche_aleatoire s
  WHERE s.utilisateur_id = ins.user_id
    AND EXISTS (
      SELECT 1
      FROM jeupharma.publications_connaissances pc
      JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
      JOIN jeupharma.modules_cours m ON m.id = pc.module_id
      WHERE m.parcours_id = ins.parcours_id
        AND c.matrice_id = s.matrice_id
    );
  GET DIAGNOSTICS n_scores = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'inscription_id', ins.id,
    'user_id', ins.user_id,
    'parcours_id', ins.parcours_id,
    'niveau_parcours', ins.niveau_parcours,
    'progression_supprimee', n_prog,
    'tentatives_supprimees', n_tent,
    'scores_fiche_supprimes', n_scores
  );
END;
$$;

COMMENT ON FUNCTION jeupharma.v2_reinit_parcours_joueur(uuid) IS
  'Admin : remet à zéro progression + scores jeux d’un joueur sur un parcours (garde inscription et ★).';

REVOKE ALL ON FUNCTION jeupharma.v2_reinit_parcours_joueur(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_reinit_parcours_joueur(uuid) TO authenticated;
