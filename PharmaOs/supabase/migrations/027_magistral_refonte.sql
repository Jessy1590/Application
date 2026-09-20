-- =============================================================================
-- Refonte Magistrales (donneur d’ordre / sous-traitance)
-- Statuts élargis, traçabilité ST/réception/dispensation, appel patient, Storage
-- =============================================================================

-- --- Settings : métadonnées prestataire / contrat / templates ---
ALTER TABLE "PharmaOs".magistral_settings
  ADD COLUMN IF NOT EXISTS provider_ars_auth text,
  ADD COLUMN IF NOT EXISTS contract_ref text,
  ADD COLUMN IF NOT EXISTS contract_valid_until date,
  ADD COLUMN IF NOT EXISTS provider_forms text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS provider_delai_jours integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS mail_templates jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS docs_retention_days integer DEFAULT 365;

-- --- Orders : traçabilité + appel patient ---
ALTER TABLE "PharmaOs".magistral_orders
  ADD COLUMN IF NOT EXISTS patient_phone text,
  ADD COLUMN IF NOT EXISTS patient_call jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS analyse_validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS analyse_validated_by uuid REFERENCES portail.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider_ref text,
  ADD COLUMN IF NOT EXISTS provider_lot text,
  ADD COLUMN IF NOT EXISTS date_fabrication date,
  ADD COLUMN IF NOT EXISTS date_peremption date,
  ADD COLUMN IF NOT EXISTS liberation_path text,
  ADD COLUMN IF NOT EXISTS liberation_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS reception_checklist jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS reception_validated_by uuid REFERENCES portail.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ordonnancier_number text,
  ADD COLUMN IF NOT EXISTS dispensed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispensed_by uuid REFERENCES portail.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider_ordonnancier text,
  ADD COLUMN IF NOT EXISTS nc_reason text,
  ADD COLUMN IF NOT EXISTS status_history jsonb DEFAULT '[]'::jsonb NOT NULL;

-- DEFAULT statut : aligner live (était 'brouillon') sur 'devis' ; brouillon reste autorisé
ALTER TABLE "PharmaOs".magistral_orders
  ALTER COLUMN statut SET DEFAULT 'devis'::text;

ALTER TABLE "PharmaOs".magistral_orders
  DROP CONSTRAINT IF EXISTS magistral_orders_statut_check;

ALTER TABLE "PharmaOs".magistral_orders
  ADD CONSTRAINT magistral_orders_statut_check CHECK (
    statut = ANY (ARRAY[
      'brouillon'::text,
      'analyse_ok'::text,
      'devis'::text,
      'commande'::text,
      'en_transit'::text,
      'a_controler'::text,
      'receptionne'::text,
      'a_rappeler'::text,
      'non_conforme'::text,
      'refuse'::text,
      'dispense'::text,
      'cloture'::text
    ])
  );

-- Storage : ordonnances + certificats de libération
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'magistral-ordonnances',
  'magistral-ordonnances',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "magistral_ordonnances_staff_select" ON storage.objects;
CREATE POLICY "magistral_ordonnances_staff_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'magistral-ordonnances' AND "PharmaOs".is_pharma_staff());

DROP POLICY IF EXISTS "magistral_ordonnances_staff_insert" ON storage.objects;
CREATE POLICY "magistral_ordonnances_staff_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'magistral-ordonnances' AND "PharmaOs".is_pharma_staff());

DROP POLICY IF EXISTS "magistral_ordonnances_staff_update" ON storage.objects;
CREATE POLICY "magistral_ordonnances_staff_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'magistral-ordonnances' AND "PharmaOs".is_pharma_staff())
  WITH CHECK (bucket_id = 'magistral-ordonnances' AND "PharmaOs".is_pharma_staff());

DROP POLICY IF EXISTS "magistral_ordonnances_staff_delete" ON storage.objects;
CREATE POLICY "magistral_ordonnances_staff_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'magistral-ordonnances' AND "PharmaOs".is_pharma_staff());
