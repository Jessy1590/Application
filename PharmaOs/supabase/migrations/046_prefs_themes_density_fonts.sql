-- 046 — thèmes contraste/daltonien, densités, tailles de police
-- Migre l’ancien thème daltonien (high-contrast) → contraste
-- Migre densités auto→normal, stack→empilee
-- Ajoute font_size_taskbar / font_size_dashboard

-- 1) Thème : drop CHECK, migrer données, nouveau CHECK
ALTER TABLE "PharmaOs".user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_theme_check;

UPDATE "PharmaOs".user_preferences
SET theme = 'contraste'
WHERE theme = 'daltonien';

ALTER TABLE "PharmaOs".user_preferences
  ADD CONSTRAINT user_preferences_theme_check CHECK (
    theme = ANY (ARRAY[
      'clair'::text,
      'sombre'::text,
      'colore'::text,
      'contraste'::text,
      'daltonien'::text
    ])
  );

-- 2) Densité : drop CHECK, migrer données, défaut, nouveau CHECK
ALTER TABLE "PharmaOs".user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_density_check;

UPDATE "PharmaOs".user_preferences
SET taskbar_density = 'normal'
WHERE taskbar_density = 'auto';

UPDATE "PharmaOs".user_preferences
SET taskbar_density = 'empilee'
WHERE taskbar_density = 'stack';

ALTER TABLE "PharmaOs".user_preferences
  ALTER COLUMN taskbar_density SET DEFAULT 'normal';

ALTER TABLE "PharmaOs".user_preferences
  ADD CONSTRAINT user_preferences_density_check CHECK (
    taskbar_density = ANY (ARRAY[
      'compact'::text,
      'normal'::text,
      'detaillee'::text,
      'empilee'::text
    ])
  );

-- 3) Colonnes tailles de police
ALTER TABLE "PharmaOs".user_preferences
  ADD COLUMN IF NOT EXISTS font_size_taskbar text NOT NULL DEFAULT 'md';

ALTER TABLE "PharmaOs".user_preferences
  ADD COLUMN IF NOT EXISTS font_size_dashboard text NOT NULL DEFAULT 'md';

ALTER TABLE "PharmaOs".user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_font_tb_check;

ALTER TABLE "PharmaOs".user_preferences
  ADD CONSTRAINT user_preferences_font_tb_check CHECK (
    font_size_taskbar = ANY (ARRAY['sm'::text, 'md'::text, 'lg'::text])
  );

ALTER TABLE "PharmaOs".user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_font_dash_check;

ALTER TABLE "PharmaOs".user_preferences
  ADD CONSTRAINT user_preferences_font_dash_check CHECK (
    font_size_dashboard = ANY (ARRAY['sm'::text, 'md'::text, 'lg'::text])
  );
