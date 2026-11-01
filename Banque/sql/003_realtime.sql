-- Banque · 003 · Temps réel (synchro PC / téléphone). Ajout seulement, aucun autre schéma touché.
alter publication supabase_realtime add table banque.accounts, banque.account_members, banque.expenses,
  banque.incomes, banque.payments, banque.wallet_transactions, banque.month_snapshots;

insert into banque.schema_version (version, description)
values (3, 'Temps réel sur les tables banque (synchro PC / téléphone)')
on conflict (version) do nothing;
