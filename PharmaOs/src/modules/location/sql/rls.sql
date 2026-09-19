-- =============================================================================
-- RLS — module location
-- Lecture/écriture authentifiée (personnel pharmacie). Admin UI gated côté app.
-- =============================================================================

ALTER TABLE "PharmaOs".location_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PharmaOs".location_prestataires ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PharmaOs".location_templates_contact ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PharmaOs".location_parametres ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PharmaOs".location_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PharmaOs".location_appareils ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PharmaOs".location_prolongations ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PharmaOs".location_suivi_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PharmaOs".location_regles ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PharmaOs".location_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PharmaOs".location_champs_creation ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'location_patients',
    'location_prestataires',
    'location_templates_contact',
    'location_parametres',
    'location_dossiers',
    'location_appareils',
    'location_prolongations',
    'location_suivi_lignes',
    'location_regles',
    'location_contacts',
    'location_champs_creation'
  ]
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I_authenticated_all ON "PharmaOs".%I',
      t || '_auth', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON "PharmaOs".%I
         FOR ALL TO authenticated
         USING (auth.uid() IS NOT NULL)
         WITH CHECK (auth.uid() IS NOT NULL)',
      t || '_authenticated_all', t
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "PharmaOs" TO authenticated;
