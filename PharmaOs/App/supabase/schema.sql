-- ============================================================
-- PharmaOS — Schéma "PharmaOs" (tables Phase 1 + prep Phase 2)
-- À exécuter dans Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Schéma dédié (règle stricte du CLAUDE.md : jamais 'public')
create schema if not exists "PharmaOs";

-- 2. Table taskbar_logs (tracking collapse/expand — Taskbar.jsx)
create table if not exists "PharmaOs".taskbar_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('collapse', 'expand')),
  created_at timestamptz not null default now()
);

-- 3. Table quality_events (préparation module Quality, Phase 2)
create table if not exists "PharmaOs".quality_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  data jsonb,
  created_at timestamptz not null default now()
);

-- 4. Table advice_events (préparation module Advice, Phase 2)
create table if not exists "PharmaOs".advice_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  status text not null,
  data jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 5. Row Level Security : chaque utilisateur ne voit/écrit que
--    ses propres lignes (user_id = auth.uid())
-- ============================================================
alter table "PharmaOs".taskbar_logs enable row level security;
alter table "PharmaOs".quality_events enable row level security;
alter table "PharmaOs".advice_events enable row level security;

create policy "insert own taskbar_logs" on "PharmaOs".taskbar_logs
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "select own taskbar_logs" on "PharmaOs".taskbar_logs
  for select to authenticated
  using (auth.uid() = user_id);

create policy "insert own quality_events" on "PharmaOs".quality_events
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "select own quality_events" on "PharmaOs".quality_events
  for select to authenticated
  using (auth.uid() = user_id);

create policy "insert own advice_events" on "PharmaOs".advice_events
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "select own advice_events" on "PharmaOs".advice_events
  for select to authenticated
  using (auth.uid() = user_id);

-- ============================================================
-- 6. Grants : indispensable car le schéma est hors 'public'.
--    PostgREST/Supabase n'accorde rien par défaut sur un schéma
--    custom, même avec RLS activé.
-- ============================================================
grant usage on schema "PharmaOs" to authenticated, anon;

grant select, insert on "PharmaOs".taskbar_logs to authenticated;
grant select, insert on "PharmaOs".quality_events to authenticated;
grant select, insert on "PharmaOs".advice_events to authenticated;
