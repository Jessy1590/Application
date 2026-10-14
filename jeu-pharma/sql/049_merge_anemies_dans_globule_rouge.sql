-- 049 : Fusion leçon « Anémies » → « Pathologie du Globule Rouge » (parcours Cardio DEUST)
-- Puis suppression de la leçon Anémies.
-- Blocs anémies placés après les blocs existants de Pathologie GR.

DO $$
DECLARE
  gr uuid := 'c0a6acde-7d7a-45ae-99ea-d0337f7f969f'; -- Pathologie du Globule Rouge
  an uuid := 'fc7d0e3c-f2b9-42de-a253-5b4f3f7aa95c'; -- Anémies
  max_b int;
  max_p int;
  n_blocs int;
  n_pubs int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM jeupharma.modules_cours WHERE id = gr) THEN
    RAISE EXCEPTION 'Leçon Pathologie du Globule Rouge introuvable';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jeupharma.modules_cours WHERE id = an) THEN
    RAISE NOTICE 'Leçon Anémies déjà absente — rien à faire';
    RETURN;
  END IF;

  SELECT COALESCE(MAX(ordre), 0) INTO max_b FROM jeupharma.module_blocs WHERE module_id = gr;
  SELECT COALESCE(MAX(ordre), 0) INTO max_p FROM jeupharma.publications_connaissances WHERE module_id = gr;

  UPDATE jeupharma.module_blocs
  SET module_id = gr,
      ordre = ordre + max_b,
      updated_at = now()
  WHERE module_id = an;
  GET DIAGNOSTICS n_blocs = ROW_COUNT;

  -- Pubs déjà présentes sur GR : on ne déplace pas (évite unique violation)
  DELETE FROM jeupharma.publications_connaissances pc
  WHERE pc.module_id = an
    AND EXISTS (
      SELECT 1 FROM jeupharma.publications_connaissances g
      WHERE g.module_id = gr AND g.connaissance_id = pc.connaissance_id
    );

  UPDATE jeupharma.publications_connaissances
  SET module_id = gr,
      ordre = ordre + max_p
  WHERE module_id = an;
  GET DIAGNOSTICS n_pubs = ROW_COUNT;

  UPDATE jeupharma.modules_cours
  SET prerequis_module_id = gr
  WHERE prerequis_module_id = an;

  UPDATE jeupharma.modules_cours
  SET criteres_json = replace(criteres_json::text, an::text, gr::text)::jsonb
  WHERE criteres_json IS NOT NULL
    AND criteres_json::text LIKE '%' || an::text || '%';

  -- Jeux : remplacer Anémies par GR dans module_ids (dédup)
  UPDATE jeupharma.modeles_jeu mj
  SET module_ids = (
    SELECT ARRAY(
      SELECT DISTINCT u
      FROM unnest(array_replace(mj.module_ids, an, gr)) AS u
    )
  )
  WHERE an = ANY(module_ids);

  -- Progression : si déjà une ligne GR pour le user, drop Anémies ; sinon repointer
  DELETE FROM jeupharma.progression_modules p
  WHERE p.module_id = an
    AND EXISTS (
      SELECT 1 FROM jeupharma.progression_modules g
      WHERE g.module_id = gr AND g.user_id = p.user_id
    );
  UPDATE jeupharma.progression_modules
  SET module_id = gr
  WHERE module_id = an;

  DELETE FROM jeupharma.modules_cours WHERE id = an;

  RAISE NOTICE 'Fusion Anémies → Globule Rouge : % blocs, % pubs déplacés ; leçon Anémies supprimée',
    n_blocs, n_pubs;
END $$;
