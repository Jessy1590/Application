-- =============================================================================
-- Tables — module stupéfiants (miroir 037 + 038 + 039 + 051)
-- Livreurs = directory_contacts (partenaire_type grossiste|generiqueur|plateforme)
-- =============================================================================

CREATE TABLE IF NOT EXISTS "PharmaOs".stupefiant_releves (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  medicament text NOT NULL,
  cip text,
  produit_hors_bdm boolean NOT NULL DEFAULT false,
  nb_boites_recues integer NOT NULL DEFAULT 0,
  livreur_id uuid,
  is_du boolean NOT NULL DEFAULT false,
  du_patient_label text,
  du_unites_promisees integer,
  armoire_boites integer,
  armoire_unites integer,
  bl_numero text,
  bl_path text,
  created_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'a_verifier',
  stock_visuel_boites integer,
  stock_visuel_unites integer,
  stock_lgo_boites integer,
  stock_lgo_unites integer,
  recompte_boites integer,
  recompte_unites integer,
  verified_by uuid,
  verified_at timestamptz,
  commentaire_analyse text,
  responsable_erreur_id uuid,
  responsable_erreur_label text,
  stock_corrige_boites integer,
  stock_corrige_unites integer,
  task_id uuid,
  recompte_task_id uuid,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  closed_at timestamptz,
  PRIMARY KEY (id),
  CHECK (status = ANY (ARRAY[
    'en_attente'::text,
    'a_verifier'::text,
    'recompter'::text,
    'ras'::text,
    'ras_recompte'::text,
    'analyse'::text,
    'corrige_compris'::text,
    'corrige_sans'::text,
    'erreur_reception'::text
  ])),
  FOREIGN KEY (livreur_id) REFERENCES "PharmaOs".directory_contacts(id) ON DELETE SET NULL
);

-- Note : bl_numero nullable (039). Accès UI via canAccess (matrice Accès & rôles).
-- stupefiant_livreurs droppée (051) — livreurs via annuaire.
