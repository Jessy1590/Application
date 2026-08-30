-- Durcissement RLS table fromage (schéma autres)
-- Site Fromage : 01fae4ee-2c95-4caf-b600-43980b7e22b3
-- À exécuter dans Supabase SQL Editor

ALTER TABLE autres.fromage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acces libre pour le carnet" ON autres.fromage;

-- Lecture : utilisateurs authentifiés uniquement
CREATE POLICY "fromage_select_authenticated"
  ON autres.fromage FOR SELECT
  TO authenticated
  USING (true);

-- Écriture : admin ou membre avec accès au site Fromage
CREATE POLICY "fromage_insert_authorized"
  ON autres.fromage FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM portail.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR EXISTS (
      SELECT 1 FROM portail.site_access sa
      WHERE sa.user_id = auth.uid()
        AND sa.site_id = '01fae4ee-2c95-4caf-b600-43980b7e22b3'::uuid
    )
  );

CREATE POLICY "fromage_update_authorized"
  ON autres.fromage FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM portail.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR EXISTS (
      SELECT 1 FROM portail.site_access sa
      WHERE sa.user_id = auth.uid()
        AND sa.site_id = '01fae4ee-2c95-4caf-b600-43980b7e22b3'::uuid
    )
  );

CREATE POLICY "fromage_delete_authorized"
  ON autres.fromage FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM portail.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR EXISTS (
      SELECT 1 FROM portail.site_access sa
      WHERE sa.user_id = auth.uid()
        AND sa.site_id = '01fae4ee-2c95-4caf-b600-43980b7e22b3'::uuid
    )
  );
