-- Banque · 002 · Import public → banque (LECTURE SEULE sur public, rejouable)
-- Usage (SQL editor / service role) : select banque.import_from_public();
-- Rejouer = met à jour banque avec l'état actuel de la V1 (upsert par identifiant).
-- Les lignes supprimées entre-temps dans la V1 ne sont pas supprimées dans banque.

create or replace function banque.import_from_public()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  res jsonb := '{}'::jsonb;
  n int;
begin
  perform set_config('banque.source', 'import_v1', true);

  insert into banque.accounts (id, name, margin_percent, hide_deposit, created_at)
  select id, name, margin_percent, coalesce(hide_deposit, false), coalesce(created_at, now())
    from public.accounts
  on conflict (id) do update set name = excluded.name, margin_percent = excluded.margin_percent,
    hide_deposit = excluded.hide_deposit;
  get diagnostics n = row_count; res := res || jsonb_build_object('accounts', n);

  insert into banque.profiles (id, display_name, main_account_id, account_order, updated_at)
  select p.id, p.display_name,
         case when exists (select 1 from banque.accounts a where a.id = p.main_account_id) then p.main_account_id end,
         coalesce(p.account_order, '[]'::jsonb), coalesce(p.updated_at, now())
    from public.profiles p
  on conflict (id) do update set display_name = excluded.display_name,
    main_account_id = excluded.main_account_id, account_order = excluded.account_order;
  get diagnostics n = row_count; res := res || jsonb_build_object('profiles', n);

  insert into banque.account_members (account_id, user_id, role, contribution_target, contribution_mode)
  select account_id, user_id, case when role in ('owner','editor') then role else 'editor' end,
         contribution_target, contribution_mode
    from public.account_members
  on conflict (account_id, user_id) do update set role = excluded.role,
    contribution_target = excluded.contribution_target, contribution_mode = excluded.contribution_mode;
  get diagnostics n = row_count; res := res || jsonb_build_object('account_members', n);

  insert into banque.expenses (id, account_id, description, category, day, amount, end_date, payer_id,
                               is_wallet, active, created_at)
  select e.id, e.account_id, e.description, e.category, e.day, e.amount, e.end_date,
         case when exists (select 1 from banque.profiles p where p.id = e.payer_id) then e.payer_id end,
         coalesce(e.is_wallet, false), coalesce(e.active, true), coalesce(e.created_at, now())
    from public.expenses e where e.account_id is not null
  on conflict (id) do update set account_id = excluded.account_id, description = excluded.description,
    category = excluded.category, day = excluded.day, amount = excluded.amount, end_date = excluded.end_date,
    payer_id = excluded.payer_id, is_wallet = excluded.is_wallet, active = excluded.active;
  get diagnostics n = row_count; res := res || jsonb_build_object('expenses', n);

  insert into banque.incomes (id, account_id, description, day, amount, income_type, created_at)
  select id, account_id, description, day, amount, income_type, coalesce(created_at, now())
    from public.incomes where account_id is not null
  on conflict (id) do update set account_id = excluded.account_id, description = excluded.description,
    day = excluded.day, amount = excluded.amount, income_type = excluded.income_type;
  get diagnostics n = row_count; res := res || jsonb_build_object('incomes', n);

  -- Validations (paid_expenses + paid_incomes)
  insert into banque.payments (account_id, month_key, side, item_id, amount, paid_at, is_exceptional,
                               description, category, op_date, day, refund_of, extra, updated_by)
  select mr.account_id, mr.month_key, s.side, e.key,
         coalesce((e.value ->> 'amount')::numeric, 0),
         coalesce((e.value ->> 'on')::timestamptz, now()),
         coalesce((e.value ->> 'exceptional')::boolean, false),
         e.value ->> 'description', e.value ->> 'category',
         nullif(e.value ->> 'date', '')::date, (e.value ->> 'day')::int,
         e.value ->> 'refund_of',
         e.value - array['amount','on','exceptional','description','category','date','day','refund_of'],
         null
    from public.month_records mr
    cross join lateral (values ('expense', mr.paid_expenses), ('income', mr.paid_incomes)) s(side, recs)
    cross join lateral jsonb_each(case when jsonb_typeof(s.recs) = 'object' then s.recs else '{}'::jsonb end) e
   where mr.account_id is not null and jsonb_typeof(e.value) = 'object'
  on conflict (account_id, month_key, side, item_id) do update set amount = excluded.amount,
    paid_at = excluded.paid_at, is_exceptional = excluded.is_exceptional, description = excluded.description,
    category = excluded.category, op_date = excluded.op_date, day = excluded.day,
    refund_of = excluded.refund_of, extra = excluded.extra;
  get diagnostics n = row_count; res := res || jsonb_build_object('payments', n);

  -- Mouvements de portefeuille
  insert into banque.wallet_transactions (id, account_id, month_key, wallet_id, description, amount, day,
                                          op_date, kind, position, extra, created_by)
  select t.value ->> 'id', mr.account_id, mr.month_key, w.key::uuid, t.value ->> 'description',
         coalesce((t.value ->> 'amount')::numeric, 0), (t.value ->> 'day')::int,
         nullif(t.value ->> 'date', '')::date, t.value ->> 'kind', t.ord::int,
         t.value - array['id','description','amount','day','date','kind'], null
    from public.month_records mr
    cross join lateral jsonb_each(coalesce(mr.wallet_transactions, '{}'::jsonb)) w
    cross join lateral jsonb_array_elements(case when jsonb_typeof(w.value) = 'array' then w.value else '[]'::jsonb end)
         with ordinality t(value, ord)
   where mr.account_id is not null and t.value ? 'id'
  on conflict (id) do update set account_id = excluded.account_id, month_key = excluded.month_key,
    wallet_id = excluded.wallet_id, description = excluded.description, amount = excluded.amount,
    day = excluded.day, op_date = excluded.op_date, kind = excluded.kind, position = excluded.position,
    extra = excluded.extra;
  get diagnostics n = row_count; res := res || jsonb_build_object('wallet_transactions', n);

  insert into banque.month_snapshots (account_id, month_key, theoretical_expenses, theoretical_incomes)
  select account_id, month_key, coalesce(theoretical_expenses, '{}'::jsonb), coalesce(theoretical_incomes, '{}'::jsonb)
    from public.month_records where account_id is not null
  on conflict (account_id, month_key) do update set theoretical_expenses = excluded.theoretical_expenses,
    theoretical_incomes = excluded.theoretical_incomes;
  get diagnostics n = row_count; res := res || jsonb_build_object('month_snapshots', n);

  insert into banque.bank_verifications (id, user_id, month_key, bank_account_id, bank_date, bank_label, bank_amount,
         fingerprint, status, linked_kind, linked_id, linked_account_id, bank_source, file_name, meta,
         created_at, updated_at)
  select id, user_id, month_key, bank_account_id, bank_date, bank_label, bank_amount, fingerprint, status,
         linked_kind, linked_id, linked_account_id, bank_source, file_name, coalesce(meta, '{}'::jsonb),
         created_at, updated_at
    from public.bank_verifications
  on conflict (user_id, month_key, fingerprint) do update set bank_account_id = excluded.bank_account_id,
    bank_date = excluded.bank_date, bank_label = excluded.bank_label, bank_amount = excluded.bank_amount,
    status = excluded.status, linked_kind = excluded.linked_kind, linked_id = excluded.linked_id,
    linked_account_id = excluded.linked_account_id, bank_source = excluded.bank_source,
    file_name = excluded.file_name, meta = excluded.meta;
  get diagnostics n = row_count; res := res || jsonb_build_object('bank_verifications', n);

  insert into banque.expense_change_log (id, expense_id, account_id, change_type, old_amount, new_amount,
         old_payload, new_payload, month_key, changed_by, created_at)
  select id, expense_id, account_id, change_type, old_amount, new_amount, old_payload, new_payload,
         month_key, changed_by, created_at
    from public.expense_change_log
  on conflict (id) do nothing;
  get diagnostics n = row_count; res := res || jsonb_build_object('expense_change_log', n);

  return res;
end $$;

revoke execute on function banque.import_from_public() from public, anon, authenticated;

-- Contrôle : compare volumes et sommes V1 / V2
create or replace function banque.import_check()
returns table (item text, v1 numeric, v2 numeric, ok boolean)
language sql stable security definer set search_path = '' as $$
  with c(item, v1, v2) as (
    select 'accounts', (select count(*) from public.accounts)::numeric, (select count(*) from banque.accounts)::numeric
    union all select 'expenses', (select count(*) from public.expenses), (select count(*) from banque.expenses)
    union all select 'incomes', (select count(*) from public.incomes), (select count(*) from banque.incomes)
    union all select 'members', (select count(*) from public.account_members), (select count(*) from banque.account_members)
    union all select 'profiles', (select count(*) from public.profiles), (select count(*) from banque.profiles)
    union all select 'paid_count', (select count(*) from public.month_records mr,
                 lateral (select jsonb_object_keys(coalesce(mr.paid_expenses,'{}')) union all
                          select jsonb_object_keys(coalesce(mr.paid_incomes,'{}'))) k),
              (select count(*) from banque.payments)
    union all select 'paid_sum', (select coalesce(sum((e.value->>'amount')::numeric),0) from public.month_records mr,
                 lateral (select * from jsonb_each(coalesce(mr.paid_expenses,'{}')) union all
                          select * from jsonb_each(coalesce(mr.paid_incomes,'{}'))) e),
              (select coalesce(sum(amount),0) from banque.payments)
    union all select 'wallet_count', (select count(*) from public.month_records mr, jsonb_each(coalesce(mr.wallet_transactions,'{}')) w,
                 jsonb_array_elements(w.value) t), (select count(*) from banque.wallet_transactions)
    union all select 'wallet_sum', (select coalesce(sum((t->>'amount')::numeric),0) from public.month_records mr,
                 jsonb_each(coalesce(mr.wallet_transactions,'{}')) w, jsonb_array_elements(w.value) t),
              (select coalesce(sum(amount),0) from banque.wallet_transactions)
    union all select 'month_records', (select count(*) from public.month_records), (select count(*) from banque.month_snapshots)
    union all select 'bank_verifications', (select count(*) from public.bank_verifications), (select count(*) from banque.bank_verifications)
    union all select 'expense_change_log', (select count(*) from public.expense_change_log), (select count(*) from banque.expense_change_log)
  )
  select item, v1, v2, v1 = v2 from c
$$;

revoke execute on function banque.import_check() from public, anon, authenticated;

insert into banque.schema_version (version, description)
values (2, 'Import rejouable public → banque + contrôle')
on conflict (version) do nothing;
