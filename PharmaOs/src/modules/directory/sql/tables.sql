-- =============================================================================
-- Tables — module directory
-- DDL aligné projet Supabase live kpjflntnotftpzffjbud (2026-09-03)
-- Rôles canoniques app : admin | équipe (member = legacy CHECK seulement)
-- Source module : src/modules/directory/sql/tables.sql
-- =============================================================================
-- --- PharmaOs.directory_contacts ---
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
