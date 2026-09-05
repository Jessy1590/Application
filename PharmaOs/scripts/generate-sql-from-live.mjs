/**
 * Genere supabase/migrations et src/modules/.../sql (tables + rls).
 * DDL = schema live projet kpjflntnotftpzffjbud (2026-09-03).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const constraints = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'supabase/_dumps/constraints.json'), 'utf8'),
);

/** @type {Record<string, { col_defs: string, pk: string[] }>} */
const TABLES = {
  'portail.profiles': {
    pk: ['id'],
    col_defs: `id uuid NOT NULL,
  email text,
  display_name text,
  role text DEFAULT 'équipe'::text NOT NULL,
  created_at timestamptz DEFAULT now()`,
  },
  'portail.sites': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  description text,
  url text NOT NULL,
  icon text DEFAULT '🔗'::text,
  color text DEFAULT '#4FD1C5'::text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now()`,
  },
  'portail.site_access': {
    pk: ['user_id', 'site_id'],
    col_defs: `user_id uuid NOT NULL,
  site_id uuid NOT NULL,
  granted_at timestamptz DEFAULT now()`,
  },
  'portail.access_requests': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  site_id uuid NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  requested_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid`,
  },
  'PharmaOs.tasks': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  titre text NOT NULL,
  description text,
  created_by uuid,
  created_at timestamptz DEFAULT now()`,
  },
  'PharmaOs.task_assignments': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  task_id uuid,
  user_id uuid,
  statut text DEFAULT 'en_cours'::text,
  completed_at timestamptz,
  completion_time_seconds integer,
  commentaire text`,
  },
  'PharmaOs.taskbar_logs': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  action text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL`,
  },
  'PharmaOs.advice_events': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  status text NOT NULL,
  data jsonb,
  created_at timestamptz DEFAULT now() NOT NULL`,
  },
  'PharmaOs.directory_contacts': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
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
  email_service_client text`,
  },
  'PharmaOs.agenda_events': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  type text,
  date_evenement timestamptz NOT NULL,
  details jsonb NOT NULL,
  created_at timestamptz DEFAULT now()`,
  },
  'PharmaOs.call_logs': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  contact_id uuid,
  contact_nom text,
  numero text NOT NULL,
  duree_secondes integer DEFAULT 0,
  motif text,
  statut_traitement text DEFAULT 'cloture'::text,
  notes_appel text`,
  },
  'PharmaOs.act_ip_logs': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
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
  devenir_intervention text`,
  },
  'PharmaOs.quality_events': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  data jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  status text DEFAULT 'ouvert'::text NOT NULL,
  severity text DEFAULT 'mineure'::text NOT NULL,
  capa_action text,
  capa_status text DEFAULT 'en_attente'::text,
  resolved_at timestamptz,
  resolved_by uuid`,
  },
  'PharmaOs.documents': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  content text DEFAULT ''::text NOT NULL,
  version text DEFAULT '1.0'::text NOT NULL,
  category text DEFAULT 'procedure'::text NOT NULL,
  requires_signature boolean DEFAULT true NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL`,
  },
  'PharmaOs.document_signatures': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  document_id uuid NOT NULL,
  user_id uuid NOT NULL,
  document_version text NOT NULL,
  signed_at timestamptz DEFAULT now() NOT NULL`,
  },
  'PharmaOs.perimes': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  medicament text NOT NULL,
  cip text,
  lot text,
  date_peremption date NOT NULL,
  quantite integer DEFAULT 1 NOT NULL,
  source text DEFAULT 'reception'::text NOT NULL,
  status text DEFAULT 'actif'::text NOT NULL,
  notes text,
  created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL`,
  },
  'PharmaOs.stock_errors': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  medicament text NOT NULL,
  cip text,
  quantite_theorique integer,
  quantite_constatee integer,
  description text,
  status text DEFAULT 'ouvert'::text NOT NULL,
  admin_decision text,
  admin_notes text,
  task_id uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL`,
  },
  'PharmaOs.rental_assets': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  asset_type text NOT NULL,
  label text,
  origine text DEFAULT 'interne'::text NOT NULL,
  numero_interne text,
  numero_serie_prestataire text,
  prestataire_id uuid,
  requires_coverage_check boolean DEFAULT false NOT NULL,
  status text DEFAULT 'disponible'::text NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL`,
  },
  'PharmaOs.rental_contracts': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  asset_id uuid,
  patient_nom text NOT NULL,
  patient_prenom text NOT NULL,
  patient_dob date,
  addons jsonb DEFAULT '{}'::jsonb NOT NULL,
  date_sortie timestamptz DEFAULT now(),
  date_retour timestamptz,
  caution_type text,
  caution_montant numeric,
  caution_restituee boolean DEFAULT false,
  statut text DEFAULT 'en_cours'::text NOT NULL,
  checklist_iso jsonb DEFAULT '{}'::jsonb NOT NULL,
  coverage_checked boolean DEFAULT false,
  created_by uuid,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  asset_type_requested text,
  prescription_scanned boolean DEFAULT false NOT NULL,
  prescription_valid_until date,
  billing_status text DEFAULT 'en_attente'::text NOT NULL,
  billing_weeks jsonb DEFAULT '[]'::jsonb NOT NULL,
  billing_notes text,
  source_type text,
  numero_serie text,
  caution_encaissee boolean DEFAULT false NOT NULL,
  retour_etat text,
  ordonnance_a_jour boolean,
  desinfection_faite boolean DEFAULT false NOT NULL,
  retour_prestataire boolean DEFAULT false NOT NULL`,
  },
  'PharmaOs.rental_events': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  contract_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  user_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL`,
  },
  'PharmaOs.magistral_providers': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  delai_jours integer DEFAULT 5,
  actif boolean DEFAULT true NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL`,
  },
  'PharmaOs.magistral_price_rules': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  forme text,
  base_price numeric DEFAULT 0 NOT NULL,
  coefficient numeric DEFAULT 1 NOT NULL,
  unit text DEFAULT 'unité'::text,
  params jsonb DEFAULT '{}'::jsonb NOT NULL,
  actif boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL`,
  },
  'PharmaOs.magistral_settings': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  pharmacy_name text,
  pharmacy_address text,
  pharmacy_email text,
  pharmacy_interlocuteur text,
  provider_name text,
  provider_email text,
  frais_port numeric DEFAULT 0 NOT NULL,
  coefficient numeric DEFAULT 1 NOT NULL,
  tva_rate numeric DEFAULT 5.5 NOT NULL,
  internal_prep_enabled boolean DEFAULT false NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL`,
  },
  'PharmaOs.magistral_orders': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  provider_id uuid,
  price_rule_id uuid,
  formule text NOT NULL,
  patient_initiales text,
  quantite numeric DEFAULT 1,
  forme text,
  prix_calcule numeric,
  statut text DEFAULT 'devis'::text NOT NULL,
  email_sent_at timestamptz,
  received_at timestamptz,
  created_by uuid,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  form_data jsonb DEFAULT '{}'::jsonb NOT NULL,
  prix_ht_net numeric,
  patient_email text,
  ordonnance_path text,
  preparation_interne boolean DEFAULT false NOT NULL,
  closed_at timestamptz,
  closed_reason text,
  tva_rate numeric`,
  },
  'PharmaOs.psl_units': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  code_produit text NOT NULL,
  numero_unite text NOT NULL,
  groupe_abo text,
  rh text,
  date_peremption date,
  fournisseur text,
  statut text DEFAULT 'en_stock'::text NOT NULL,
  created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  denomination text,
  datamatrix_raw text,
  lot text,
  gtin text`,
  },
  'PharmaOs.psl_movements': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  unit_id uuid NOT NULL,
  movement_type text NOT NULL,
  patient_initiales text,
  patient_ipp text,
  user_id uuid,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  registry_number integer,
  prescripteur_nom text,
  prescripteur_adresse text,
  patient_nom text,
  patient_prenom text,
  patient_adresse text,
  patient_dob date,
  date_delivrance date,
  denomination text,
  quantite numeric DEFAULT 1,
  etiquette_tracabilite text,
  datamatrix_raw text`,
  },
  'PharmaOs.cash_closures': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  closure_date date NOT NULL,
  author_id uuid NOT NULL,
  author_name text,
  fond_reel numeric DEFAULT 0 NOT NULL,
  fond_logiciel numeric DEFAULT 0 NOT NULL,
  montant_cb numeric DEFAULT 0 NOT NULL,
  argent_lieu_sur numeric DEFAULT 0 NOT NULL,
  nb_cheques integer DEFAULT 0 NOT NULL,
  montant_cheques numeric DEFAULT 0 NOT NULL,
  garde boolean DEFAULT false NOT NULL,
  sortie_particuliere boolean DEFAULT false NOT NULL,
  sortie_montant numeric DEFAULT 0,
  sortie_motif text,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL`,
  },
  'PharmaOs.app_settings': {
    pk: ['key'],
    col_defs: `key text NOT NULL,
  value jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL`,
  },
  'PharmaOs.lot_alerts': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  alert_number text NOT NULL,
  declarant_id uuid,
  medicament text NOT NULL,
  lot text NOT NULL,
  laboratoire text,
  motif text,
  source text DEFAULT 'manuel'::text NOT NULL,
  external_ref text,
  steps_done text,
  reception_validated_at timestamptz,
  requires_return boolean DEFAULT false NOT NULL,
  return_location text,
  task_id uuid,
  status text DEFAULT 'ouvert'::text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL`,
  },
  'PharmaOs.lot_alert_acks': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  alert_id uuid NOT NULL,
  user_id uuid NOT NULL,
  read_at timestamptz DEFAULT now() NOT NULL`,
  },
  'PharmaOs.supplier_disputes': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  dispute_type text NOT NULL,
  fournisseur_id uuid,
  fournisseur_nom text,
  montant numeric,
  statut text DEFAULT 'ouvert'::text NOT NULL,
  pieces text,
  description text,
  lot_alert_id uuid,
  stock_error_id uuid,
  created_by uuid,
  closed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL`,
  },
  'PharmaOs.work_schedules': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  day_of_week integer NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  label text,
  actif boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL`,
  },
  'PharmaOs.hr_absences': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  absence_type text NOT NULL,
  date_debut date NOT NULL,
  date_fin date NOT NULL,
  motif text,
  created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL`,
  },
  'PharmaOs.hr_schedule_changes': {
    pk: ['id'],
    col_defs: `id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  motif text NOT NULL,
  date_debut date NOT NULL,
  heure_debut time,
  date_fin date,
  heure_fin time,
  commentaire text,
  created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  heure_prevue time,
  heure_arrivee time`,
  },
};

function qIdent(full) {
  const [schema, table] = full.split('.');
  return schema === 'PharmaOs' ? `"PharmaOs".${table}` : `${schema}.${table}`;
}

function buildCreate(full) {
  const [schema, table] = full.split('.');
  const t = TABLES[full];
  if (!t) throw new Error('missing ' + full);
  const cons = constraints.filter((c) => c.schema === schema && c.table_name === table);
  const parts = [t.col_defs.trim()];
  for (const c of cons.filter((x) => x.contype === 'u')) parts.push(c.def);
  for (const c of cons.filter((x) => x.contype === 'c')) {
    // Canonique: profiles.role — documenter équipe ; garder member en CHECK pour compat live
    if (c.conname === 'profiles_role_check') {
      parts.push("CHECK ((role = ANY (ARRAY['admin'::text, 'équipe'::text, 'member'::text])))");
      continue;
    }
    parts.push(c.def);
  }
  for (const c of cons.filter((x) => x.contype === 'f')) parts.push(c.def);
  parts.push(`PRIMARY KEY (${t.pk.map((p) => `"${p}"`).join(', ')})`);
  return `CREATE TABLE IF NOT EXISTS ${qIdent(full)} (\n  ${parts.join(',\n  ')}\n);`;
}

function hdr(title, sources = []) {
  return [
    '-- =============================================================================',
    `-- ${title}`,
    '-- DDL aligné projet Supabase live kpjflntnotftpzffjbud (2026-09-03)',
    '-- Rôles canoniques app : admin | équipe (member = legacy CHECK seulement)',
    ...sources.map((s) => `-- Source module : ${s}`),
    '-- =============================================================================',
    '',
  ].join('\n');
}

function pol(ref, name, cmd, usingExpr, withCheck) {
  let s = `DROP POLICY IF EXISTS "${name}" ON ${ref};\nCREATE POLICY "${name}" ON ${ref}\n  FOR ${cmd} TO authenticated`;
  if (usingExpr) s += `\n  USING (${usingExpr})`;
  if (withCheck) s += `\n  WITH CHECK (${withCheck})`;
  return s + ';\n';
}

function grantEnable(full) {
  const ref = qIdent(full);
  return `ALTER TABLE ${ref} ENABLE ROW LEVEL SECURITY;\nGRANT SELECT, INSERT, UPDATE, DELETE ON ${ref} TO authenticated;`;
}

function staffAll(full) {
  const table = full.split('.')[1];
  const ref = qIdent(full);
  return `${grantEnable(full)}\n${pol(ref, `${table}_staff_all`, 'ALL', '"PharmaOs".is_pharma_staff()', '"PharmaOs".is_pharma_staff()')}`;
}

function ownAdmin(full, userCol = 'user_id') {
  const table = full.split('.')[1];
  const ref = qIdent(full);
  return [
    grantEnable(full),
    pol(ref, `${table}_insert_own`, 'INSERT', null, `${userCol} = auth.uid()`),
    pol(ref, `${table}_select_own`, 'SELECT', `${userCol} = auth.uid()`),
    pol(ref, `${table}_admin_select`, 'SELECT', '"PharmaOs".is_pharma_admin()'),
  ].join('\n');
}

const MODULES = {
  tasks: ['PharmaOs.tasks', 'PharmaOs.task_assignments'],
  home: ['PharmaOs.taskbar_logs', 'PharmaOs.advice_events'],
  directory: ['PharmaOs.directory_contacts'],
  agenda: ['PharmaOs.agenda_events'],
  calls: ['PharmaOs.call_logs'],
  ip: ['PharmaOs.act_ip_logs'],
  quality: ['PharmaOs.quality_events'],
  documents: ['PharmaOs.documents', 'PharmaOs.document_signatures'],
  perimes: ['PharmaOs.perimes'],
  stock: ['PharmaOs.stock_errors'],
  rental: ['PharmaOs.rental_assets', 'PharmaOs.rental_contracts', 'PharmaOs.rental_events'],
  magistral: [
    'PharmaOs.magistral_providers',
    'PharmaOs.magistral_price_rules',
    'PharmaOs.magistral_settings',
    'PharmaOs.magistral_orders',
  ],
  psl: ['PharmaOs.psl_units', 'PharmaOs.psl_movements'],
  cash: ['PharmaOs.cash_closures', 'PharmaOs.app_settings'],
  'lot-alerts': ['PharmaOs.lot_alerts', 'PharmaOs.lot_alert_acks'],
  disputes: ['PharmaOs.supplier_disputes'],
  hr: ['PharmaOs.work_schedules', 'PharmaOs.hr_absences', 'PharmaOs.hr_schedule_changes'],
};

function moduleTablesSql(mod, tables) {
  return (
    hdr(`Tables — module ${mod}`, [`src/modules/${mod}/sql/tables.sql`]) +
    tables.map((f) => `-- --- ${f} ---\n${buildCreate(f)}`).join('\n\n') +
    '\n'
  );
}

function writeModule(mod, tables, rlsNote) {
  const dir = path.join(ROOT, 'src/modules', mod, 'sql');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'tables.sql'), moduleTablesSql(mod, tables), 'utf8');
  fs.writeFileSync(
    path.join(dir, 'rls.sql'),
    hdr(`RLS — module ${mod}`) + rlsNote + '\n',
    'utf8',
  );
}

const migDir = path.join(ROOT, 'supabase/migrations');
fs.mkdirSync(migDir, { recursive: true });

// --- 001 portail ---
{
  const sql = [
    hdr('001 — portail.profiles + sites / accès'),
    'CREATE SCHEMA IF NOT EXISTS portail;',
    'GRANT USAGE ON SCHEMA portail TO authenticated, anon;',
    '',
    `CREATE OR REPLACE FUNCTION portail.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = portail
AS $$
  SELECT EXISTS (
    SELECT 1 FROM portail.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;`,
    'REVOKE ALL ON FUNCTION portail.is_admin() FROM PUBLIC;',
    'GRANT EXECUTE ON FUNCTION portail.is_admin() TO authenticated;',
    '',
    '-- >>> portail.profiles (DEFAULT role = équipe — canonique app)',
    buildCreate('portail.profiles'),
    '',
    buildCreate('portail.sites'),
    '',
    buildCreate('portail.site_access'),
    '',
    buildCreate('portail.access_requests'),
    '',
    grantEnable('portail.profiles'),
    grantEnable('portail.sites'),
    grantEnable('portail.site_access'),
    grantEnable('portail.access_requests'),
    '',
    pol('portail.profiles', 'profiles_select_authenticated', 'SELECT', 'true'),
    pol('portail.profiles', 'profiles_insert_own', 'INSERT', null, 'id = auth.uid()'),
    pol('portail.profiles', 'profiles_update_own', 'UPDATE', 'id = auth.uid() OR portail.is_admin()', 'id = auth.uid() OR portail.is_admin()'),
    '',
    pol('portail.sites', 'sites_select_authenticated', 'SELECT', 'true'),
    pol('portail.sites', 'sites_admin_all', 'ALL', "EXISTS (SELECT 1 FROM portail.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')", "EXISTS (SELECT 1 FROM portail.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')"),
    '',
    pol('portail.site_access', 'site_access_select_own_or_admin', 'SELECT', "user_id = auth.uid() OR EXISTS (SELECT 1 FROM portail.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')"),
    pol('portail.site_access', 'site_access_admin_manage', 'ALL', "EXISTS (SELECT 1 FROM portail.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')", "EXISTS (SELECT 1 FROM portail.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')"),
    '',
    pol('portail.access_requests', 'access_requests_select_own_or_admin', 'SELECT', "user_id = auth.uid() OR EXISTS (SELECT 1 FROM portail.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')"),
    pol('portail.access_requests', 'access_requests_insert_own', 'INSERT', null, 'user_id = auth.uid()'),
    pol('portail.access_requests', 'access_requests_admin_manage', 'ALL', "EXISTS (SELECT 1 FROM portail.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')", "EXISTS (SELECT 1 FROM portail.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')"),
  ].join('\n');
  fs.writeFileSync(path.join(migDir, '001_portail_profiles_site_access.sql'), sql + '\n', 'utf8');
}

// --- 002 helpers ---
{
  const sql = [
    hdr('002 — schéma PharmaOs + helpers RLS'),
    'CREATE SCHEMA IF NOT EXISTS "PharmaOs";',
    'GRANT USAGE ON SCHEMA "PharmaOs" TO authenticated, anon;',
    '',
    `CREATE OR REPLACE FUNCTION "PharmaOs".is_pharma_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = portail, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM portail.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  );
$$;`,
    '',
    `CREATE OR REPLACE FUNCTION "PharmaOs".is_pharma_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = portail, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM portail.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'équipe')
  );
$$;`,
    '',
    'REVOKE ALL ON FUNCTION "PharmaOs".is_pharma_admin() FROM PUBLIC;',
    'REVOKE ALL ON FUNCTION "PharmaOs".is_pharma_staff() FROM PUBLIC;',
    'GRANT EXECUTE ON FUNCTION "PharmaOs".is_pharma_admin() TO authenticated;',
    'GRANT EXECUTE ON FUNCTION "PharmaOs".is_pharma_staff() TO authenticated;',
  ].join('\n');
  fs.writeFileSync(path.join(migDir, '002_pharmaos_helpers_rls.sql'), sql + '\n', 'utf8');
}

function agg(mod, tables) {
  return tables
    .map((f) => `-- >>> src/modules/${mod}/sql :: ${f}\n${buildCreate(f)}`)
    .join('\n\n');
}

// --- 003 ---
{
  const sql = [
    hdr('003 — tasks / logs', ['src/modules/tasks/sql/', 'src/modules/home/sql/']),
    agg('tasks', MODULES.tasks),
    '',
    agg('home', MODULES.home),
    '',
    grantEnable('PharmaOs.tasks'),
    pol('"PharmaOs".tasks', 'tasks_select_authenticated', 'SELECT', 'true'),
    pol('"PharmaOs".tasks', 'tasks_insert_creator', 'INSERT', null, 'created_by = auth.uid()'),
    pol('"PharmaOs".tasks', 'tasks_update_creator', 'UPDATE', 'created_by = auth.uid()'),
    pol('"PharmaOs".tasks', 'tasks_admin_all', 'ALL', '"PharmaOs".is_pharma_admin()', '"PharmaOs".is_pharma_admin()'),
    '',
    grantEnable('PharmaOs.task_assignments'),
    pol('"PharmaOs".task_assignments', 'task_assignments_select_authenticated', 'SELECT', 'true'),
    pol('"PharmaOs".task_assignments', 'task_assignments_insert_authenticated', 'INSERT', null, 'true'),
    pol('"PharmaOs".task_assignments', 'task_assignments_update_own', 'UPDATE', 'user_id = auth.uid()'),
    pol('"PharmaOs".task_assignments', 'task_assignments_admin_update', 'UPDATE', '"PharmaOs".is_pharma_admin()'),
    '',
    '-- Clôture globale (completeTaskGlobal) : UPDATE admin sur TOUTES les assignations d\'une task_id',
    '',
    ownAdmin('PharmaOs.taskbar_logs'),
    '',
    ownAdmin('PharmaOs.advice_events'),
  ].join('\n');
  fs.writeFileSync(path.join(migDir, '003_pharmaos_tasks_logs.sql'), sql + '\n', 'utf8');
}

// --- 004 ---
{
  const sql = [
    hdr('004 — directory / agenda / calls / IP', [
      'src/modules/directory/sql/',
      'src/modules/agenda/sql/',
      'src/modules/calls/sql/',
      'src/modules/ip/sql/',
    ]),
    agg('directory', MODULES.directory),
    '',
    agg('agenda', MODULES.agenda),
    '',
    agg('calls', MODULES.calls),
    '',
    agg('ip', MODULES.ip),
    '',
    grantEnable('PharmaOs.directory_contacts'),
    pol('"PharmaOs".directory_contacts', 'directory_contacts_authenticated_all', 'ALL', 'true', 'true'),
    '',
    grantEnable('PharmaOs.agenda_events'),
    pol('"PharmaOs".agenda_events', 'agenda_events_authenticated_all', 'ALL', 'true', 'true'),
    '',
    ownAdmin('PharmaOs.call_logs'),
    pol('"PharmaOs".call_logs', 'call_logs_admin_update', 'UPDATE', '"PharmaOs".is_pharma_admin()'),
    '',
    ownAdmin('PharmaOs.act_ip_logs'),
    pol('"PharmaOs".act_ip_logs', 'act_ip_logs_update_own', 'UPDATE', 'user_id = auth.uid()'),
    pol('"PharmaOs".act_ip_logs', 'act_ip_logs_admin_update', 'UPDATE', '"PharmaOs".is_pharma_admin()'),
  ].join('\n');
  fs.writeFileSync(path.join(migDir, '004_pharmaos_directory_agenda_calls_ip.sql'), sql + '\n', 'utf8');
}

// --- 005 ---
{
  const sql = [
    hdr('005 — qualité / docs / périmés / stock', [
      'src/modules/quality/sql/',
      'src/modules/documents/sql/',
      'src/modules/perimes/sql/',
      'src/modules/stock/sql/',
    ]),
    agg('quality', MODULES.quality),
    '',
    agg('documents', MODULES.documents),
    '',
    agg('perimes', MODULES.perimes),
    '',
    agg('stock', MODULES.stock),
    '',
    ownAdmin('PharmaOs.quality_events'),
    pol('"PharmaOs".quality_events', 'quality_events_update_admin', 'UPDATE', '"PharmaOs".is_pharma_admin()', '"PharmaOs".is_pharma_admin()'),
    '',
    staffAll('PharmaOs.documents'),
    staffAll('PharmaOs.perimes'),
    '',
    grantEnable('PharmaOs.document_signatures'),
    pol('"PharmaOs".document_signatures', 'document_signatures_select_team', 'SELECT', '"PharmaOs".is_pharma_staff()'),
    pol('"PharmaOs".document_signatures', 'document_signatures_insert_own', 'INSERT', null, 'user_id = auth.uid()'),
    '',
    grantEnable('PharmaOs.stock_errors'),
    pol('"PharmaOs".stock_errors', 'stock_errors_insert_own', 'INSERT', null, 'user_id = auth.uid()'),
    pol('"PharmaOs".stock_errors', 'stock_errors_select_team', 'SELECT', 'user_id = auth.uid() OR "PharmaOs".is_pharma_staff()'),
    pol('"PharmaOs".stock_errors', 'stock_errors_update_admin', 'UPDATE', '"PharmaOs".is_pharma_admin()', '"PharmaOs".is_pharma_admin()'),
  ].join('\n');
  fs.writeFileSync(path.join(migDir, '005_pharmaos_quality_controls_docs_stock.sql'), sql + '\n', 'utf8');
}

// --- 006 ---
{
  const keys = ['rental', 'magistral', 'psl', 'cash', 'lot-alerts', 'disputes', 'hr'];
  const bodies = keys.map((k) => agg(k, MODULES[k])).join('\n\n');
  const staff = keys.flatMap((k) => MODULES[k]).map(staffAll).join('\n');
  const sql = [
    hdr('006 — modules métier', keys.map((k) => `src/modules/${k}/sql/`)),
    bodies,
    '',
    staff,
  ].join('\n');
  fs.writeFileSync(path.join(migDir, '006_pharmaos_modules_metier.sql'), sql + '\n', 'utf8');
}

const rlsNotes = {
  tasks: `-- SELECT authentifié ; INSERT tasks.created_by = auth.uid() ;
-- UPDATE task_assignments : own OR admin (completeTaskGlobal / uncompleteTaskGlobal).
-- Détail : supabase/migrations/003_pharmaos_tasks_logs.sql`,
  home: `-- taskbar_logs + advice_events : isolation user_id + admin SELECT.
-- Détail : supabase/migrations/003_pharmaos_tasks_logs.sql`,
  directory: `-- ALL authenticated (données d'équipe). migrations/004`,
  agenda: `-- ALL authenticated. migrations/004`,
  calls: `-- own + admin SELECT/UPDATE. migrations/004`,
  ip: `-- own + admin SELECT/UPDATE. migrations/004`,
  quality: `-- insert own + admin select/update. migrations/005`,
  documents: `-- documents staff ALL ; signatures insert own. migrations/005`,
  perimes: `-- is_pharma_staff() ALL. migrations/005`,
  stock: `-- insert own ; select team ; update admin. migrations/005`,
  rental: `-- is_pharma_staff() ALL. migrations/006`,
  magistral: `-- is_pharma_staff() ALL. migrations/006`,
  psl: `-- is_pharma_staff() ALL. migrations/006`,
  cash: `-- is_pharma_staff() ALL. migrations/006`,
  'lot-alerts': `-- is_pharma_staff() ALL. migrations/006`,
  disputes: `-- is_pharma_staff() ALL. migrations/006`,
  hr: `-- is_pharma_staff() ALL. migrations/006`,
};

for (const [mod, tables] of Object.entries(MODULES)) {
  writeModule(mod, tables, rlsNotes[mod] || '-- voir migrations');
}

// Nettoyage stubs HR séparés
for (const f of ['work_schedules.sql', 'hr_absences.sql', 'hr_schedule_changes.sql']) {
  const p = path.join(ROOT, 'src/modules/hr/sql', f);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

fs.writeFileSync(
  path.join(migDir, 'README.md'),
  `# Migrations PharmaOs

Ordre :

1. \`001_portail_profiles_site_access.sql\`
2. \`002_pharmaos_helpers_rls.sql\`
3. \`003_pharmaos_tasks_logs.sql\`
4. \`004_pharmaos_directory_agenda_calls_ip.sql\`
5. \`005_pharmaos_quality_controls_docs_stock.sql\`
6. \`006_pharmaos_modules_metier.sql\`
7. \`007_call_logs_communication_enums.sql\`
8. \`008_act_ip_logs_annulee.sql\`
9. \`009_drop_controls_module_tables.sql\`

Source de vérité : \`src/modules/<domaine>/sql/\`. Agrégat ici avec en-têtes \`-- >>> module\`.

Inventaire : 29 tables métier PharmaOs + 4 portail (+ helpers). Voir \`.cursor/docs/SECURITY.md\`.

Hors scope : Banque / Valorisation / Vaccin / Fromage (\`Application/supabase/SETUP.md\`).
`,
  'utf8',
);

console.log('OK migrations + modules sql');
