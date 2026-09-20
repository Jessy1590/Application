-- Magistrales : champs obligatoires paramétrables à la création
ALTER TABLE "PharmaOs".magistral_settings
  ADD COLUMN IF NOT EXISTS creation_champs jsonb DEFAULT '{}'::jsonb NOT NULL;

COMMENT ON COLUMN "PharmaOs".magistral_settings.creation_champs IS
  'Map code champ → { actif, obligatoire } pour le formulaire de création';
