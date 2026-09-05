-- =============================================================================
-- 004 — directory / agenda / calls / IP
-- DDL aligné projet Supabase live kpjflntnotftpzffjbud (2026-09-03)
-- Rôles canoniques app : admin | équipe (member = legacy CHECK seulement)
-- Source module : src/modules/directory/sql/
-- Source module : src/modules/agenda/sql/
-- Source module : src/modules/calls/sql/
-- Source module : src/modules/ip/sql/
-- =============================================================================

-- >>> src/modules/directory/sql :: PharmaOs.directory_contacts
CREATE TABLE IF NOT EXISTS "PharmaOs".directory_contacts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  type text NOT NULL,
  nom text NOT NULL,
  prenom text,
  telephone text,
  telephone_prive text,
  infos_contact text,
  mail_prive text,
  mail_mssante text,
  mode_commande text,
  remise_commande text,
  franco text,
  nom_service_client text,
  created_at timestamptz DEFAULT now(),
  specialite text,
  switch_rupture text,
  commentaires text,
  site_web text,
  tel_service_client text,
  email_service_client text,
  CHECK ((type = ANY (ARRAY['health_professional'::text, 'commercial_partner'::text]))),
  PRIMARY KEY ("id")
);

-- >>> src/modules/agenda/sql :: PharmaOs.agenda_events
CREATE TABLE IF NOT EXISTS "PharmaOs".agenda_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  type text,
  date_evenement timestamptz NOT NULL,
  details jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  CHECK ((type = ANY (ARRAY['commande_med'::text, 'facturation'::text, 'changement_horaire'::text]))),
  PRIMARY KEY ("id")
);

-- >>> src/modules/calls/sql :: PharmaOs.call_logs
CREATE TABLE IF NOT EXISTS "PharmaOs".call_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  contact_id uuid,
  contact_nom text,
  numero text NOT NULL,
  duree_secondes integer DEFAULT 0,
  motif text,
  statut_traitement text DEFAULT 'cloture'::text,
  notes_appel text,
  CHECK ((motif = ANY (ARRAY['information_medicale'::text, 'commande_labo'::text, 'reclamation_patient'::text, 'renseignement_patient'::text, 'autre'::text]))),
  CHECK ((statut_traitement = ANY (ARRAY['cloture'::text, 'a_rappeler'::text, 'transmis_pharmacien'::text, 'en_attente'::text]))),
  CHECK ((type = ANY (ARRAY['in'::text, 'out'::text, 'missed'::text]))),
  FOREIGN KEY (contact_id) REFERENCES "PharmaOs".directory_contacts(id) ON DELETE SET NULL,
  PRIMARY KEY ("id")
);

-- >>> src/modules/ip/sql :: PharmaOs.act_ip_logs
CREATE TABLE IF NOT EXISTS "PharmaOs".act_ip_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
  user_id uuid NOT NULL,
  patient_initiales text NOT NULL,
  patient_age integer,
  patient_sexe text,
  medecin_nom text,
  medicament_en_cause text NOT NULL,
  probleme_identifie text NOT NULL,
  type_intervention text NOT NULL,
  avis_prescripteur text,
  statut_ip text,
  commentaires text,
  medecin_id uuid,
  mode_transmission text,
  devenir_intervention text,
  CHECK ((avis_prescripteur = ANY (ARRAY['Accepte'::text, 'Refuse'::text, 'Non joignable'::text, 'Non contacte'::text]))),
  CHECK ((patient_sexe = ANY (ARRAY['M'::text, 'F'::text]))),
  CHECK ((statut_ip = ANY (ARRAY['En attente'::text, 'Cloturee'::text, 'Déclaré'::text]))),
  FOREIGN KEY (medecin_id) REFERENCES "PharmaOs".directory_contacts(id) ON DELETE SET NULL,
  PRIMARY KEY ("id")
);

ALTER TABLE "PharmaOs".directory_contacts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".directory_contacts TO authenticated;
DROP POLICY IF EXISTS "directory_contacts_authenticated_all" ON "PharmaOs".directory_contacts;
CREATE POLICY "directory_contacts_authenticated_all" ON "PharmaOs".directory_contacts
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);


ALTER TABLE "PharmaOs".agenda_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".agenda_events TO authenticated;
DROP POLICY IF EXISTS "agenda_events_authenticated_all" ON "PharmaOs".agenda_events;
CREATE POLICY "agenda_events_authenticated_all" ON "PharmaOs".agenda_events
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);


ALTER TABLE "PharmaOs".call_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".call_logs TO authenticated;
DROP POLICY IF EXISTS "call_logs_insert_own" ON "PharmaOs".call_logs;
CREATE POLICY "call_logs_insert_own" ON "PharmaOs".call_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "call_logs_select_own" ON "PharmaOs".call_logs;
CREATE POLICY "call_logs_select_own" ON "PharmaOs".call_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "call_logs_admin_select" ON "PharmaOs".call_logs;
CREATE POLICY "call_logs_admin_select" ON "PharmaOs".call_logs
  FOR SELECT TO authenticated
  USING ("PharmaOs".is_pharma_admin());

DROP POLICY IF EXISTS "call_logs_admin_update" ON "PharmaOs".call_logs;
CREATE POLICY "call_logs_admin_update" ON "PharmaOs".call_logs
  FOR UPDATE TO authenticated
  USING ("PharmaOs".is_pharma_admin());


ALTER TABLE "PharmaOs".act_ip_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".act_ip_logs TO authenticated;
DROP POLICY IF EXISTS "act_ip_logs_insert_own" ON "PharmaOs".act_ip_logs;
CREATE POLICY "act_ip_logs_insert_own" ON "PharmaOs".act_ip_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "act_ip_logs_select_own" ON "PharmaOs".act_ip_logs;
CREATE POLICY "act_ip_logs_select_own" ON "PharmaOs".act_ip_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "act_ip_logs_admin_select" ON "PharmaOs".act_ip_logs;
CREATE POLICY "act_ip_logs_admin_select" ON "PharmaOs".act_ip_logs
  FOR SELECT TO authenticated
  USING ("PharmaOs".is_pharma_admin());

DROP POLICY IF EXISTS "act_ip_logs_update_own" ON "PharmaOs".act_ip_logs;
CREATE POLICY "act_ip_logs_update_own" ON "PharmaOs".act_ip_logs
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "act_ip_logs_admin_update" ON "PharmaOs".act_ip_logs;
CREATE POLICY "act_ip_logs_admin_update" ON "PharmaOs".act_ip_logs
  FOR UPDATE TO authenticated
  USING ("PharmaOs".is_pharma_admin());

