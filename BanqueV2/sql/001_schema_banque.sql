-- BanqueV2 · 001 · Schéma « banque » (création seule : ne modifie ni ne supprime rien dans public)
-- Principes :
--   * une ligne par fait (validation, mouvement de portefeuille) au lieu de gros JSON par mois
--     → plus d'écrasement quand deux appareils écrivent en même temps ;
--   * historique automatique de toutes les modifications (banque.history) + restauration ;
--   * version du schéma tracée (banque.schema_version) pour les évolutions futures.

create schema if not exists banque;

create table if not exists banque.schema_version (
  version     integer primary key,
  description text not null,
  applied_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- tables métier
create table banque.accounts (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  margin_percent numeric,
  hide_deposit   boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table banque.profiles (
  id              uuid primary key,              -- = auth.users.id
  display_name    text,
  main_account_id uuid references banque.accounts(id) on delete set null,
  account_order   jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table banque.account_members (
  account_id          uuid not null references banque.accounts(id) on delete cascade,
  user_id             uuid not null references banque.profiles(id) on delete cascade,
  role                text not null default 'editor' check (role in ('owner','editor')),
  contribution_target numeric,
  contribution_mode   text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (account_id, user_id)
);

create table banque.expenses (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references banque.accounts(id) on delete cascade,
  description text not null,
  category    text,
  day         integer check (day is null or day between 1 and 31),
  amount      numeric not null,
  end_date    date,
  payer_id    uuid references banque.profiles(id) on delete set null,
  is_wallet   boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table banque.incomes (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references banque.accounts(id) on delete cascade,
  description text not null,
  day         integer check (day is null or day between 1 and 31),
  amount      numeric not null,
  income_type text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Validation d'une saisie pour un mois (ex public.month_records.paid_expenses / paid_incomes)
-- item_id reste du texte : uuid de dépense/revenu, « apport_<uuid> » ou clé d'exceptionnelle.
create table banque.payments (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references banque.accounts(id) on delete cascade,
  month_key      text not null check (month_key ~ '^\d{4}-\d{2}$'),
  side           text not null check (side in ('expense','income')),
  item_id        text not null,
  amount         numeric not null,
  paid_at        timestamptz not null default now(),
  is_exceptional boolean not null default false,
  description    text,          -- exceptionnelles
  category       text,
  op_date        date,
  day            integer,
  refund_of      text,          -- revenus de remboursement
  extra          jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid default auth.uid(),
  unique (account_id, month_key, side, item_id)
);

-- Mouvement dans une enveloppe portefeuille (ex public.month_records.wallet_transactions)
-- amount > 0 = sortie, amount < 0 = remboursement / crédit
create table banque.wallet_transactions (
  id          text primary key,
  account_id  uuid not null references banque.accounts(id) on delete cascade,
  month_key   text not null check (month_key ~ '^\d{4}-\d{2}$'),
  wallet_id   uuid not null,     -- banque.expenses.id (is_wallet), sans FK : l'historique survit
  description text,
  amount      numeric not null,
  day         integer,
  op_date     date,
  kind        text,
  position    integer not null default 0,
  extra       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);

-- Photo du budget théorique d'un mois (reste en JSON : c'est un instantané figé)
create table banque.month_snapshots (
  account_id           uuid not null references banque.accounts(id) on delete cascade,
  month_key            text not null check (month_key ~ '^\d{4}-\d{2}$'),
  theoretical_expenses jsonb not null default '{}'::jsonb,
  theoretical_incomes  jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  primary key (account_id, month_key)
);

create table banque.bank_verifications (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  month_key         text not null,
  bank_account_id   uuid references banque.accounts(id) on delete set null,
  bank_date         date,
  bank_label        text,
  bank_amount       numeric not null default 0,
  fingerprint       text not null,
  status            text not null check (status in ('matched','ignored','wallet','refund')),
  linked_kind       text,
  linked_id         text,
  linked_account_id uuid references banque.accounts(id) on delete set null,
  bank_source       text,
  file_name         text,
  meta              jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, month_key, fingerprint)
);

create table banque.expense_change_log (
  id          uuid primary key default gen_random_uuid(),
  expense_id  uuid,
  account_id  uuid not null references banque.accounts(id) on delete cascade,
  change_type text not null,
  old_amount  numeric,
  new_amount  numeric,
  old_payload jsonb,
  new_payload jsonb,
  month_key   text,
  changed_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

-- Journal de toutes les modifications (alimenté uniquement par trigger)
create table banque.history (
  id         bigint generated always as identity primary key,
  table_name text not null,
  op         text not null check (op in ('INSERT','UPDATE','DELETE')),
  row_id     text,
  account_id uuid,
  old_row    jsonb,
  new_row    jsonb,
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now(),
  source     text
);

-- ---------------------------------------------------------------- index
create index on banque.account_members (user_id);
create index on banque.expenses (account_id);
create index on banque.incomes (account_id);
create index on banque.payments (account_id, month_key);
create index on banque.wallet_transactions (account_id, month_key, wallet_id);
create index on banque.bank_verifications (user_id, month_key);
create index on banque.bank_verifications (linked_kind, linked_id);
create index on banque.expense_change_log (account_id, created_at desc);
create index on banque.history (account_id, changed_at desc);
create index on banque.history (table_name, row_id, changed_at desc);

-- ---------------------------------------------------------------- fonctions
create or replace function banque.my_account_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select account_id from banque.account_members where user_id = auth.uid()
$$;

create or replace function banque.is_member(p_account uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from banque.account_members where account_id = p_account and user_id = auth.uid())
$$;

-- Profils visibles : le mien + ceux qui partagent un compte avec moi
create or replace function banque.can_see_profile(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user = auth.uid() or exists (
    select 1 from banque.account_members a
    join banque.account_members b on b.account_id = a.account_id
    where a.user_id = auth.uid() and b.user_id = p_user)
$$;

create or replace function banque.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- TG_ARGV[0] = colonnes de la clé (séparées par des virgules)
create or replace function banque.log_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  o jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  n jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  rid text;
  acc uuid;
begin
  if tg_op = 'UPDATE' and (o - 'updated_at') = (n - 'updated_at') then
    return new;
  end if;
  select string_agg(r ->> trim(c), ':') into rid from unnest(string_to_array(tg_argv[0], ',')) c;
  acc := case
    when tg_table_name = 'accounts' then (r ->> 'id')::uuid
    when r ? 'account_id' then (r ->> 'account_id')::uuid
    when r ? 'bank_account_id' then (r ->> 'bank_account_id')::uuid
  end;
  insert into banque.history (table_name, op, row_id, account_id, old_row, new_row, source)
  values (tg_table_name, tg_op, rid, acc, o, n, nullif(current_setting('banque.source', true), ''));
  return coalesce(new, old);
end $$;

-- Annule une modification enregistrée dans l'historique (RLS appliquée : security invoker)
create or replace function banque.history_restore(p_history_id bigint)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  h banque.history;
  pk text;
  cols text;
  upd text;
begin
  select * into h from banque.history where id = p_history_id;
  if not found then raise exception 'Historique introuvable ou non autorisé'; end if;
  if h.table_name not in ('accounts','profiles','account_members','expenses','incomes','payments',
                          'wallet_transactions','month_snapshots','bank_verifications') then
    raise exception 'Table non restaurable : %', h.table_name;
  end if;

  select string_agg(quote_ident(a.attname), ',' order by array_position(i.indkey::int2[], a.attnum))
    into pk
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
   where i.indrelid = format('banque.%I', h.table_name)::regclass and i.indisprimary;

  select string_agg(quote_ident(column_name), ',' order by ordinal_position),
         string_agg('excluded.' || quote_ident(column_name), ',' order by ordinal_position)
    into cols, upd
    from information_schema.columns
   where table_schema = 'banque' and table_name = h.table_name;

  if h.op = 'INSERT' then
    execute format('delete from banque.%I where (%s) = (select %s from jsonb_populate_record(null::banque.%I, $1))',
                   h.table_name, pk, pk, h.table_name) using h.new_row;
    return 'supprimé';
  end if;

  perform set_config('banque.source', 'restore:' || p_history_id, true);
  execute format('insert into banque.%I (%s) select %s from jsonb_populate_record(null::banque.%I, $1)
                  on conflict (%s) do update set (%s) = row(%s)',
                 h.table_name, cols, cols, h.table_name, pk, cols, upd) using h.old_row;
  return 'restauré';
end $$;

-- ---------------------------------------------------------------- triggers
do $$
declare t record;
begin
  for t in select * from (values
      ('accounts','id'), ('profiles','id'), ('account_members','account_id,user_id'),
      ('expenses','id'), ('incomes','id'), ('payments','id'), ('wallet_transactions','id'),
      ('month_snapshots','account_id,month_key'), ('bank_verifications','id')) v(tbl, pk)
  loop
    execute format('create trigger trg_touch before update on banque.%I for each row execute function banque.touch_updated_at()', t.tbl);
    execute format('create trigger trg_history after insert or update or delete on banque.%I for each row execute function banque.log_history(%L)', t.tbl, t.pk);
  end loop;
end $$;

-- ---------------------------------------------------------------- RLS
alter table banque.schema_version      enable row level security;
alter table banque.accounts            enable row level security;
alter table banque.profiles            enable row level security;
alter table banque.account_members     enable row level security;
alter table banque.expenses            enable row level security;
alter table banque.incomes             enable row level security;
alter table banque.payments            enable row level security;
alter table banque.wallet_transactions enable row level security;
alter table banque.month_snapshots     enable row level security;
alter table banque.bank_verifications  enable row level security;
alter table banque.expense_change_log  enable row level security;
alter table banque.history             enable row level security;

create policy schema_version_read on banque.schema_version for select to authenticated using (true);

create policy accounts_select on banque.accounts for select to authenticated
  using (id in (select banque.my_account_ids()));
create policy accounts_insert on banque.accounts for insert to authenticated with check (true);
create policy accounts_update on banque.accounts for update to authenticated
  using (banque.is_member(id)) with check (banque.is_member(id));
create policy accounts_delete on banque.accounts for delete to authenticated using (banque.is_member(id));

create policy profiles_select on banque.profiles for select to authenticated using (banque.can_see_profile(id));
create policy profiles_insert on banque.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update on banque.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy members_select on banque.account_members for select to authenticated
  using (account_id in (select banque.my_account_ids()));
create policy members_insert on banque.account_members for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy members_update on banque.account_members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy members_delete on banque.account_members for delete to authenticated
  using (banque.is_member(account_id));

do $$
declare t text;
begin
  foreach t in array array['expenses','incomes','payments','wallet_transactions','month_snapshots','expense_change_log']
  loop
    execute format('create policy %1$s_select on banque.%1$I for select to authenticated using (account_id in (select banque.my_account_ids()))', t);
    execute format('create policy %1$s_insert on banque.%1$I for insert to authenticated with check (account_id in (select banque.my_account_ids()))', t);
    execute format('create policy %1$s_update on banque.%1$I for update to authenticated using (account_id in (select banque.my_account_ids())) with check (account_id in (select banque.my_account_ids()))', t);
    execute format('create policy %1$s_delete on banque.%1$I for delete to authenticated using (account_id in (select banque.my_account_ids()))', t);
  end loop;
end $$;

create policy bank_verifications_all on banque.bank_verifications for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy history_select on banque.history for select to authenticated
  using (account_id in (select banque.my_account_ids())
         or changed_by = (select auth.uid())
         or (table_name = 'profiles' and row_id = (select auth.uid())::text));

-- ---------------------------------------------------------------- droits
grant usage on schema banque to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema banque to authenticated;
revoke insert, update, delete on banque.history, banque.schema_version from authenticated;
grant all on all tables in schema banque to service_role;
grant execute on function banque.my_account_ids(), banque.is_member(uuid), banque.can_see_profile(uuid),
  banque.history_restore(bigint) to authenticated;
revoke execute on function banque.log_history() from public, anon, authenticated;
alter default privileges in schema banque grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema banque grant all on tables to service_role;

insert into banque.schema_version (version, description)
values (1, 'Schéma initial BanqueV2 : tables normalisées, historique, RLS');
