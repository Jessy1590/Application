-- =============================================================================
-- Tables — module ip
-- DDL aligné projet Supabase live kpjflntnotftpzffjbud (2026-09-03)
-- Rôles canoniques app : admin | équipe (member = legacy CHECK seulement)
-- Source module : src/modules/ip/sql/tables.sql
-- =============================================================================
-- --- PharmaOs.act_ip_logs ---
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
  CHECK ((statut_ip = ANY (ARRAY['En attente'::text, 'Cloturee'::text, 'Déclaré'::text, 'Annulee'::text]))),
  FOREIGN KEY (medecin_id) REFERENCES "PharmaOs".directory_contacts(id) ON DELETE SET NULL,
  PRIMARY KEY ("id")
);
