-- 105 : Jeux V3 — classement en examen : ne pas renvoyer la clé item→zone au client.

CREATE OR REPLACE FUNCTION jeupharma.jeu_demarrer_classement(
  p_jeu_id uuid, p_contexte text DEFAULT 'classique', p_passage_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'jeupharma', 'portail', 'pg_temp' AS $$
DECLARE
  j jeupharma.jeux%ROWTYPE; c jeupharma.jeux_classement%ROWTYPE; tid uuid; snap jsonb; pub jsonb; ctx text;
BEGIN
  IF auth.uid() IS NULL OR NOT jeupharma.has_jeupharma_access() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  ctx := coalesce(nullif(p_contexte, ''), 'classique');
  SELECT * INTO j FROM jeupharma.jeux WHERE id = p_jeu_id AND type_jeu = 'classement' AND statut = 'actif';
  IF NOT FOUND THEN RAISE EXCEPTION 'Jeu introuvable'; END IF;
  IF EXISTS (SELECT 1 FROM jeupharma.parcours_apprentissage pa WHERE pa.id = j.parcours_id AND pa.est_laboratoire)
     AND NOT jeupharma.is_portail_admin() THEN RAISE EXCEPTION 'Réservé admin'; END IF;
  SELECT * INTO c FROM jeupharma.jeux_classement WHERE jeu_id = j.id;
  snap := jsonb_build_object('consigne', c.consigne, 'items', c.items_json, 'zones', c.zones_json);
  INSERT INTO jeupharma.jeux_tentatives (jeu_id, utilisateur_id, contexte, passage_id, snapshot_json, notation)
  VALUES (j.id, auth.uid(), ctx, p_passage_id, snap, 'serveur') RETURNING id INTO tid;
  IF ctx = 'examen' THEN
    pub := jsonb_set(snap, '{zones}', coalesce((
      SELECT jsonb_agg(z - 'item_ids') FROM jsonb_array_elements(coalesce(c.zones_json, '[]'::jsonb)) z
    ), '[]'::jsonb));
  ELSE
    pub := snap;
  END IF;
  RETURN jsonb_build_object('tentative_id', tid, 'snapshot', pub, 'contexte', ctx);
END; $$;
