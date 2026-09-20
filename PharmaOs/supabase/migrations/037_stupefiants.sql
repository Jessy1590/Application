-- =============================================================================
-- 037 — Module stupéfiants : livreurs, relevés réception / contrôle hors LGO
-- =============================================================================

CREATE TABLE IF NOT EXISTS "PharmaOs".stupefiant_livreurs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  label text NOT NULL,
  type text NOT NULL DEFAULT 'grossiste',
  actif boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL,
  CHECK (type = ANY (ARRAY['grossiste'::text, 'generiqueur'::text, 'plateforme'::text])),
  PRIMARY KEY (id)
);

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
  bl_numero text NOT NULL,
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
  CHECK (status = ANY (ARRAY[
    'a_verifier'::text,
    'recompter'::text,
    'ras'::text,
    'ras_recompte'::text,
    'analyse'::text,
    'corrige_compris'::text,
    'corrige_sans'::text
  ])),
  CHECK (nb_boites_recues >= 0),
  FOREIGN KEY (livreur_id) REFERENCES "PharmaOs".stupefiant_livreurs(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES auth.users(id),
  FOREIGN KEY (verified_by) REFERENCES auth.users(id),
  FOREIGN KEY (responsable_erreur_id) REFERENCES auth.users(id),
  FOREIGN KEY (task_id) REFERENCES "PharmaOs".tasks(id) ON DELETE SET NULL,
  FOREIGN KEY (recompte_task_id) REFERENCES "PharmaOs".tasks(id) ON DELETE SET NULL,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS stupefiant_releves_status_idx
  ON "PharmaOs".stupefiant_releves (status, created_at DESC);
CREATE INDEX IF NOT EXISTS stupefiant_releves_created_by_idx
  ON "PharmaOs".stupefiant_releves (created_by);
CREATE INDEX IF NOT EXISTS stupefiant_releves_cip_idx
  ON "PharmaOs".stupefiant_releves (cip);

DROP TRIGGER IF EXISTS stupefiant_releves_set_updated_at ON "PharmaOs".stupefiant_releves;
CREATE TRIGGER stupefiant_releves_set_updated_at
  BEFORE UPDATE ON "PharmaOs".stupefiant_releves
  FOR EACH ROW EXECUTE FUNCTION "PharmaOs".set_updated_at();

ALTER TABLE "PharmaOs".stupefiant_livreurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PharmaOs".stupefiant_releves ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".stupefiant_livreurs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".stupefiant_releves TO authenticated;

DROP POLICY IF EXISTS "stupefiant_livreurs_staff_all" ON "PharmaOs".stupefiant_livreurs;
CREATE POLICY "stupefiant_livreurs_staff_all" ON "PharmaOs".stupefiant_livreurs
  FOR ALL TO authenticated
  USING ("PharmaOs".is_pharma_staff())
  WITH CHECK ("PharmaOs".is_pharma_staff());

DROP POLICY IF EXISTS "stupefiant_releves_insert_staff" ON "PharmaOs".stupefiant_releves;
CREATE POLICY "stupefiant_releves_insert_staff" ON "PharmaOs".stupefiant_releves
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND "PharmaOs".is_pharma_staff());

DROP POLICY IF EXISTS "stupefiant_releves_select_staff" ON "PharmaOs".stupefiant_releves;
CREATE POLICY "stupefiant_releves_select_staff" ON "PharmaOs".stupefiant_releves
  FOR SELECT TO authenticated
  USING ("PharmaOs".is_pharma_staff());

DROP POLICY IF EXISTS "stupefiant_releves_update_staff" ON "PharmaOs".stupefiant_releves;
CREATE POLICY "stupefiant_releves_update_staff" ON "PharmaOs".stupefiant_releves
  FOR UPDATE TO authenticated
  USING ("PharmaOs".is_pharma_staff())
  WITH CHECK ("PharmaOs".is_pharma_staff());

DROP POLICY IF EXISTS "stupefiant_releves_delete_admin" ON "PharmaOs".stupefiant_releves;
CREATE POLICY "stupefiant_releves_delete_admin" ON "PharmaOs".stupefiant_releves
  FOR DELETE TO authenticated
  USING ("PharmaOs".is_pharma_admin());

-- Storage BL
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'stupefiants-bl',
  'stupefiants-bl',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "stupefiants_bl_staff_select" ON storage.objects;
CREATE POLICY "stupefiants_bl_staff_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'stupefiants-bl' AND "PharmaOs".is_pharma_staff());

DROP POLICY IF EXISTS "stupefiants_bl_staff_insert" ON storage.objects;
CREATE POLICY "stupefiants_bl_staff_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'stupefiants-bl' AND "PharmaOs".is_pharma_staff());

DROP POLICY IF EXISTS "stupefiants_bl_staff_update" ON storage.objects;
CREATE POLICY "stupefiants_bl_staff_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'stupefiants-bl' AND "PharmaOs".is_pharma_staff())
  WITH CHECK (bucket_id = 'stupefiants-bl' AND "PharmaOs".is_pharma_staff());

DROP POLICY IF EXISTS "stupefiants_bl_staff_delete" ON storage.objects;
CREATE POLICY "stupefiants_bl_staff_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'stupefiants-bl' AND "PharmaOs".is_pharma_staff());

-- Seeds task_role_rules : vérif / recompte → pharmacien + administrateur
INSERT INTO "PharmaOs".task_role_rules (category, role, mode, delay_hours)
SELECT c.category, r.role,
  CASE
    WHEN r.role IN ('pharmacien', 'administrateur') THEN 'immediate'
    ELSE 'never'
  END,
  NULL
FROM (VALUES
  ('stupefiant_verification'),
  ('stupefiant_recompte')
) AS c(category)
CROSS JOIN (VALUES ('pharmacien'), ('administrateur'), ('préparateur')) AS r(role)
ON CONFLICT (category, role) DO NOTHING;

-- Livreurs de départ (désactivables)
INSERT INTO "PharmaOs".stupefiant_livreurs (label, type, sort_order)
SELECT v.label, v.type, v.sort_order
FROM (VALUES
  ('OCP', 'grossiste', 10),
  ('Alliance Healthcare', 'grossiste', 20),
  ('Phoenix', 'grossiste', 30),
  ('CERP', 'grossiste', 40),
  ('Autre grossiste', 'grossiste', 90),
  ('Plateforme labo', 'plateforme', 100)
) AS v(label, type, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM "PharmaOs".stupefiant_livreurs l WHERE l.label = v.label
);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE "PharmaOs".stupefiant_releves;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE "PharmaOs".stupefiant_livreurs;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
