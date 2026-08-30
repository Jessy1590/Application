-- ============================================================
-- Policies additionnelles pour le Dashboard Titulaire
--
-- Le rôle vient de portail.profiles.role ('admin' | 'member' —
-- contrainte déjà en place sur cette table existante), plus besoin
-- de app_metadata. Un compte admin doit voir les données de TOUTE
-- l'équipe comptoir, pas seulement les siennes.
--
-- La policy de app/supabase/schema.sql limite chaque utilisateur à
-- ses propres lignes (auth.uid() = user_id) : correcte pour l'app
-- comptoir, insuffisante pour ce dashboard.
-- ============================================================

-- 1. S'assurer que portail.profiles a RLS actif et qu'un utilisateur
--    peut lire SA PROPRE ligne (nécessaire pour que le dashboard
--    puisse déterminer le rôle au login). Ne fait rien si déjà en place.
alter table portail.profiles enable row level security;

drop policy if exists "select own profile" on portail.profiles;
create policy "select own profile" on portail.profiles
  for select
  to authenticated
  using (auth.uid() = id);

-- 2. Lecture élargie pour les admins sur les tables PharmaOs, basée sur
--    une sous-requête vers portail.profiles (pas de JWT custom claim requis).
create policy "portail admin view all taskbar_logs"
  on "PharmaOs".taskbar_logs
  for select
  to authenticated
  using (
    exists (
      select 1 from portail.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Même chose en prévision des futures cartes réelles (Quality / Advice, Phase 2)
create policy "portail admin view all quality_events"
  on "PharmaOs".quality_events
  for select
  to authenticated
  using (
    exists (
      select 1 from portail.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "portail admin view all advice_events"
  on "PharmaOs".advice_events
  for select
  to authenticated
  using (
    exists (
      select 1 from portail.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
