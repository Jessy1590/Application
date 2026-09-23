-- Miroir migrations 045 + 046 — préférences UI utilisateur
-- Source de vérité : supabase/migrations/045_user_preferences.sql + 046_prefs_themes_density_fonts.sql

CREATE TABLE IF NOT EXISTS "PharmaOs".user_preferences (
  user_id uuid NOT NULL,
  theme text NOT NULL DEFAULT 'clair',
  taskbar_placement text NOT NULL DEFAULT 'haut',
  taskbar_density text NOT NULL DEFAULT 'normal',
  font_size_taskbar text NOT NULL DEFAULT 'md',
  font_size_dashboard text NOT NULL DEFAULT 'md',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_preferences_theme_check CHECK (
    theme = ANY (ARRAY[
      'clair'::text, 'sombre'::text, 'colore'::text, 'bleu_dore'::text
    ])
  ),
  CONSTRAINT user_preferences_placement_check CHECK (
    taskbar_placement = ANY (ARRAY[
      'haut'::text, 'bas'::text, 'gauche'::text, 'droite'::text,
      'bas_gauche'::text, 'bas_droite'::text
    ])
  ),
  CONSTRAINT user_preferences_density_check CHECK (
    taskbar_density = ANY (ARRAY[
      'compact'::text, 'normal'::text, 'detaillee'::text, 'empilee'::text
    ])
  ),
  CONSTRAINT user_preferences_font_tb_check CHECK (
    font_size_taskbar = ANY (ARRAY['sm'::text, 'md'::text, 'lg'::text])
  ),
  CONSTRAINT user_preferences_font_dash_check CHECK (
    font_size_dashboard = ANY (ARRAY['sm'::text, 'md'::text, 'lg'::text])
  ),
  CONSTRAINT user_preferences_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "PharmaOs".user_preferences ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".user_preferences TO authenticated;

DROP POLICY IF EXISTS "user_preferences_select_own" ON "PharmaOs".user_preferences;
CREATE POLICY "user_preferences_select_own" ON "PharmaOs".user_preferences
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_preferences_insert_own" ON "PharmaOs".user_preferences;
CREATE POLICY "user_preferences_insert_own" ON "PharmaOs".user_preferences
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_preferences_update_own" ON "PharmaOs".user_preferences;
CREATE POLICY "user_preferences_update_own" ON "PharmaOs".user_preferences
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_preferences_delete_own" ON "PharmaOs".user_preferences;
CREATE POLICY "user_preferences_delete_own" ON "PharmaOs".user_preferences
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
