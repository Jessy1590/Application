# Vaccins — RLS durcie (SELECT authenticated)
# Voir aussi PharmaOs/supabase/migrations/006_autres_vaccins.sql

ALTER TABLE autres.vaccins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture publique autorisée sur les vaccins" ON autres.vaccins;

CREATE POLICY "vaccins_select_authenticated"
  ON autres.vaccins FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Modification réservée aux administrateurs" ON autres.vaccins;
CREATE POLICY "vaccins_admin_write"
  ON autres.vaccins FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM portail.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM portail.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
