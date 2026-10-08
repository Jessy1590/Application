-- 014 : validation admin des fiches catalogue
ALTER TABLE jeupharma.matrice_medicaments
  ADD COLUMN IF NOT EXISTS fiche_validee boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN jeupharma.matrice_medicaments.fiche_validee IS
  'Validation admin catalogue : true = fiche revue OK.';

-- Vue : voir migration MCP fiche_validee (recréer v_medicaments_complet avec m.fiche_validee).
