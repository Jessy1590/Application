-- 047 — retire le thème contraste ; renomme daltonien → bleu_dore
-- Migre les préférences existantes avant de resserrer le CHECK.

ALTER TABLE "PharmaOs".user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_theme_check;

UPDATE "PharmaOs".user_preferences
SET theme = 'clair'
WHERE theme = 'contraste';

UPDATE "PharmaOs".user_preferences
SET theme = 'bleu_dore'
WHERE theme = 'daltonien';

ALTER TABLE "PharmaOs".user_preferences
  ADD CONSTRAINT user_preferences_theme_check CHECK (
    theme = ANY (ARRAY[
      'clair'::text,
      'sombre'::text,
      'colore'::text,
      'bleu_dore'::text
    ])
  );
