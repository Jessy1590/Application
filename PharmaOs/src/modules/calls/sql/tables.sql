-- =============================================================================
-- Tables — module calls
-- Contrats Communication (2026-09-03)
-- type : recu | envoye
-- motif : intervention_pharmaceutique | commande_labo | reclamation_patient | reception_du | litige_fournisseur | autre
-- statut_traitement : resolu | a_rappeler | attente_pharmacien | cloture | brouillon | annule
-- =============================================================================
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
  statut_traitement text DEFAULT 'resolu'::text,
  notes_appel text,
  CHECK ((motif IS NULL OR motif = ANY (ARRAY['intervention_pharmaceutique'::text, 'commande_labo'::text, 'reclamation_patient'::text, 'reception_du'::text, 'litige_fournisseur'::text, 'autre'::text]))),
  CHECK ((statut_traitement = ANY (ARRAY['resolu'::text, 'a_rappeler'::text, 'attente_pharmacien'::text, 'cloture'::text, 'brouillon'::text, 'annule'::text]))),
  CHECK ((type = ANY (ARRAY['recu'::text, 'envoye'::text]))),
  FOREIGN KEY (contact_id) REFERENCES "PharmaOs".directory_contacts(id) ON DELETE SET NULL,
  PRIMARY KEY ("id")
);

-- Mise à jour d'une table existante :
--   supabase/migrations/007_call_logs_communication_enums.sql
--   supabase/migrations/010_call_logs_motif_litige_fournisseur.sql
