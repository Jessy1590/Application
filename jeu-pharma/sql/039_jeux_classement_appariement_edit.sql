-- =============================================================================
-- 039 : Jeux classement / appariement + édition post-publication
--  - modeles_jeu.type_jeu accepte 'classement' et 'appariement'
--  - RPC admin v2_update_modele_jeu (titre, mode, module_ids, configuration_json)
--    type_jeu / code_unique / parcours_id figés ; tentatives_jeu inchangées
-- =============================================================================

ALTER TABLE jeupharma.modeles_jeu
  DROP CONSTRAINT IF EXISTS modeles_jeu_type_jeu_check;

ALTER TABLE jeupharma.modeles_jeu
  ADD CONSTRAINT modeles_jeu_type_jeu_check
  CHECK (type_jeu = ANY (ARRAY[
    'quiz'::text,
    'trous'::text,
    'ordonnance'::text,
    'fiche_aleatoire'::text,
    'classement'::text,
    'appariement'::text
  ]));

CREATE OR REPLACE FUNCTION jeupharma.v2_update_modele_jeu(
  p_modele_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  row jeupharma.modeles_jeu%ROWTYPE;
  mods uuid[];
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;

  IF p_modele_id IS NULL THEN
    RAISE EXCEPTION 'modele_id requis';
  END IF;

  SELECT * INTO row FROM jeupharma.modeles_jeu WHERE id = p_modele_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Modèle introuvable';
  END IF;

  IF p_payload ? 'module_ids' THEN
    mods := COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(p_payload->'module_ids')::uuid),
      '{}'::uuid[]
    );
  ELSE
    mods := row.module_ids;
  END IF;

  UPDATE jeupharma.modeles_jeu
  SET
    titre = CASE
      WHEN p_payload ? 'titre' THEN trim(p_payload->>'titre')
      ELSE titre
    END,
    mode = CASE
      WHEN coalesce(nullif(trim(p_payload->>'mode'), ''), '') <> ''
        THEN p_payload->>'mode'
      ELSE mode
    END,
    module_ids = mods,
    configuration_json = CASE
      WHEN p_payload ? 'configuration_json'
        THEN COALESCE(p_payload->'configuration_json', '{}'::jsonb)
      ELSE configuration_json
    END,
    updated_at = now()
  WHERE id = p_modele_id
  RETURNING * INTO row;

  IF coalesce(trim(row.titre), '') = '' THEN
    RAISE EXCEPTION 'Titre requis';
  END IF;
  IF row.mode IS NULL OR row.mode <> ALL (ARRAY['entrainement'::text, 'evaluation'::text]) THEN
    RAISE EXCEPTION 'Mode invalide';
  END IF;

  RETURN to_jsonb(row);
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_update_modele_jeu(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_update_modele_jeu(uuid, jsonb) TO authenticated;
