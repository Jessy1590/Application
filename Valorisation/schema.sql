-- ============================================================================
-- SCHEMA "valorisation" — App Évaluation / Valorisation / Prévisionnel Pharmacie
-- À exécuter intégralement dans Supabase (SQL Editor) sur un projet neuf.
-- ============================================================================

create schema if not exists valorisation;

-- ----------------------------------------------------------------------------
-- 1. PROJECTS — un projet = un dossier de pharmacie à évaluer
-- ----------------------------------------------------------------------------
create table valorisation.projects (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null references auth.users(id) on delete cascade,
  nom          text not null,
  infos        jsonb not null default '{}'::jsonb,   -- infos libres du projet (voir liste côté app)
  unavailable  jsonb not null default '[]'::jsonb,    -- clés cochées "non disponible"
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table valorisation.projects is 'Un projet = un dossier de valorisation de pharmacie';
comment on column valorisation.projects.infos is 'Champs libres du projet: nom pharmacie, adresse, ville, vendeur, acheteur, notaire, date signature envisagée, etc.';
comment on column valorisation.projects.unavailable is 'Tableau des clés d''infos.* cochées "information non disponible"';

-- ----------------------------------------------------------------------------
-- 2. PARAMETRES — normes nationales + réglages, par projet (défauts modifiables)
-- ----------------------------------------------------------------------------
create table valorisation.parametres (
  project_id  uuid primary key references valorisation.projects(id) on delete cascade,
  params      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

comment on table valorisation.parametres is 'Paramètres nationaux / valorisation, valeurs par défaut à la création du projet, éditables ensuite';

-- ----------------------------------------------------------------------------
-- 3. BILANS — saisie brute comptable, une ligne par année (0 = N, -1 = N-1, -2 = N-2)
-- ----------------------------------------------------------------------------
create table valorisation.bilans (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references valorisation.projects(id) on delete cascade,
  annee_offset  smallint not null check (annee_offset in (0, -1, -2)),
  annee_label   text,                      -- ex "2025", saisi par l'utilisateur, facultatif
  data          jsonb not null default '{}'::jsonb,
  unavailable   jsonb not null default '[]'::jsonb,  -- clés cochées "non disponible" pour ce bilan
  updated_at    timestamptz not null default now(),
  unique (project_id, annee_offset)
);

comment on table valorisation.bilans is 'Données brutes extraites des bilans comptables, par année';

-- ----------------------------------------------------------------------------
-- 4. IMPORT MAPPINGS — mémoire du dispatch manuel IA -> champ cible (par utilisateur)
-- ----------------------------------------------------------------------------
create table valorisation.import_mappings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  source_label  text not null,      -- libellé tel que sorti par l'IA depuis le bilan
  target_field  text not null,      -- clé du champ cible dans bilans.data
  created_at    timestamptz not null default now(),
  unique (user_id, source_label)
);

comment on table valorisation.import_mappings is 'Mémorise le choix de dispatch de l''utilisateur pour un libellé de bilan donné, réutilisé aux imports suivants';

-- ----------------------------------------------------------------------------
-- Triggers updated_at
-- ----------------------------------------------------------------------------
create or replace function valorisation.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_projects_touch before update on valorisation.projects
  for each row execute function valorisation.touch_updated_at();

create trigger trg_parametres_touch before update on valorisation.parametres
  for each row execute function valorisation.touch_updated_at();

create trigger trg_bilans_touch before update on valorisation.bilans
  for each row execute function valorisation.touch_updated_at();

-- ----------------------------------------------------------------------------
-- RLS — chaque utilisateur ne voit / modifie que ses propres projets
-- ----------------------------------------------------------------------------
alter table valorisation.projects        enable row level security;
alter table valorisation.parametres      enable row level security;
alter table valorisation.bilans          enable row level security;
alter table valorisation.import_mappings enable row level security;

-- projects
create policy "projects_select_own" on valorisation.projects
  for select using (owner = auth.uid());
create policy "projects_insert_own" on valorisation.projects
  for insert with check (owner = auth.uid());
create policy "projects_update_own" on valorisation.projects
  for update using (owner = auth.uid());
create policy "projects_delete_own" on valorisation.projects
  for delete using (owner = auth.uid());

-- parametres (accès via appartenance du projet)
create policy "parametres_select_own" on valorisation.parametres
  for select using (
    exists (select 1 from valorisation.projects p where p.id = project_id and p.owner = auth.uid())
  );
create policy "parametres_insert_own" on valorisation.parametres
  for insert with check (
    exists (select 1 from valorisation.projects p where p.id = project_id and p.owner = auth.uid())
  );
create policy "parametres_update_own" on valorisation.parametres
  for update using (
    exists (select 1 from valorisation.projects p where p.id = project_id and p.owner = auth.uid())
  );
create policy "parametres_delete_own" on valorisation.parametres
  for delete using (
    exists (select 1 from valorisation.projects p where p.id = project_id and p.owner = auth.uid())
  );

-- bilans (accès via appartenance du projet)
create policy "bilans_select_own" on valorisation.bilans
  for select using (
    exists (select 1 from valorisation.projects p where p.id = project_id and p.owner = auth.uid())
  );
create policy "bilans_insert_own" on valorisation.bilans
  for insert with check (
    exists (select 1 from valorisation.projects p where p.id = project_id and p.owner = auth.uid())
  );
create policy "bilans_update_own" on valorisation.bilans
  for update using (
    exists (select 1 from valorisation.projects p where p.id = project_id and p.owner = auth.uid())
  );
create policy "bilans_delete_own" on valorisation.bilans
  for delete using (
    exists (select 1 from valorisation.projects p where p.id = project_id and p.owner = auth.uid())
  );

-- import_mappings (strictement par utilisateur)
create policy "mappings_select_own" on valorisation.import_mappings
  for select using (user_id = auth.uid());
create policy "mappings_insert_own" on valorisation.import_mappings
  for insert with check (user_id = auth.uid());
create policy "mappings_update_own" on valorisation.import_mappings
  for update using (user_id = auth.uid());
create policy "mappings_delete_own" on valorisation.import_mappings
  for delete using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Exposer le schéma à l'API PostgREST (Supabase)
-- Dans Supabase : Project Settings > API > "Exposed schemas" -> ajouter "valorisation"
-- (ne peut pas être fait en SQL, c'est un réglage du dashboard)
-- ----------------------------------------------------------------------------
grant usage on schema valorisation to authenticated;
grant all on all tables in schema valorisation to authenticated;
grant all on all sequences in schema valorisation to authenticated;
alter default privileges in schema valorisation grant all on tables to authenticated;
