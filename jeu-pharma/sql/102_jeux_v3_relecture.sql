-- =============================================================================
-- 102 : Jeux V3 — relecture admin + lignes_mode manuel (trous)
-- =============================================================================

ALTER TABLE jeupharma.jeux_trous
  DROP CONSTRAINT IF EXISTS jeux_trous_lignes_mode_check;
ALTER TABLE jeupharma.jeux_trous
  ADD CONSTRAINT jeux_trous_lignes_mode_check
  CHECK (lignes_mode = ANY (ARRAY['aleatoire'::text, 'groupe'::text, 'manuel'::text]));

CREATE OR REPLACE FUNCTION jeupharma.jeu_lister_relectures(
  p_limite int DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  lim int := greatest(1, least(coalesce(p_limite, 50), 200));
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.termine_at DESC NULLS LAST)
    FROM (
      SELECT
        t.id,
        t.jeu_id,
        j.code_unique,
        j.titre,
        j.type_jeu,
        t.utilisateur_id,
        coalesce(pr.display_name, pr.email, t.utilisateur_id::text) AS joueur,
        t.contexte,
        t.relecture,
        t.score_provisoire,
        t.score_obtenu,
        t.score_officiel,
        t.score_max,
        t.snapshot_json,
        t.reponses_json,
        t.details_json,
        t.termine_at,
        t.created_at
      FROM jeupharma.jeux_tentatives t
      JOIN jeupharma.jeux j ON j.id = t.jeu_id
      LEFT JOIN portail.profiles pr ON pr.id = t.utilisateur_id
      WHERE t.relecture = 'en_attente'
        AND j.type_jeu IN ('trous', 'fiche_aleatoire', 'ordonnance')
      ORDER BY t.termine_at DESC NULLS LAST
      LIMIT lim
    ) x
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.jeu_valider_relecture(
  p_tentative_id uuid,
  p_score_officiel numeric,
  p_details jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  t jeupharma.jeux_tentatives%ROWTYPE;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  SELECT * INTO t FROM jeupharma.jeux_tentatives WHERE id = p_tentative_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tentative introuvable'; END IF;
  IF t.relecture <> 'en_attente' THEN
    RAISE EXCEPTION 'Pas en attente de relecture';
  END IF;
  UPDATE jeupharma.jeux_tentatives SET
    score_officiel = p_score_officiel,
    score_obtenu = p_score_officiel,
    details_json = coalesce(p_details, details_json),
    relecture = 'faite'
  WHERE id = t.id
  RETURNING * INTO t;
  RETURN jsonb_build_object(
    'tentative_id', t.id,
    'score_officiel', t.score_officiel,
    'score_obtenu', t.score_obtenu,
    'score_max', t.score_max,
    'relecture', t.relecture
  );
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.jeu_lister_relectures(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.jeu_valider_relecture(uuid, numeric, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.jeu_lister_relectures(int) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.jeu_valider_relecture(uuid, numeric, jsonb) TO authenticated;
