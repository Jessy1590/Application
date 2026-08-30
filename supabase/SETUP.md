# Configuration Supabase — étapes manuelles

Ces actions doivent être effectuées dans le [Dashboard Supabase](https://supabase.com/dashboard) (projet `kpjflntnotftpzffjbud`).

## 1. Désactiver l'inscription publique

1. **Authentication** → **Providers** → **Email**
2. Désactiver **Enable sign ups**
3. (Recommandé) Activer **Confirm email** pour les comptes créés par un admin

Les comptes sont créés via :
- Dashboard : Authentication → Users → **Add user**
- Edge Function `invite-user` (réservée aux admins authentifiés)

## 2. Appliquer les migrations RLS

Exécuter les fichiers SQL dans l'ordre (SQL Editor) :

1. `PharmaOs/supabase/migrations/001_portail_profiles_site_access.sql`
2. `PharmaOs/supabase/migrations/002_pharmaos_tasks_logs.sql`
3. `PharmaOs/supabase/migrations/003_pharmaos_directory_agenda.sql`
4. `PharmaOs/supabase/migrations/004_banque_rls.sql`
5. `PharmaOs/supabase/migrations/005_valorisation_rls.sql`
6. `PharmaOs/supabase/migrations/006_autres_vaccins.sql`
7. `PharmaOs/supabase/migrations/007_fromage_rls.sql`
8. `PharmaOs/supabase/modules_metier_v2.sql` (location, magistrales, PSL, caisse, RH, alertes lot, litiges)

## 3. Schémas exposés (Data API)

Vérifier que **Exposed schemas** inclut : `portail`, `PharmaOs`, `autres`, `valorisation`, `public`.

## 4. Secrets GitHub Actions

Dans le repo GitHub → Settings → Secrets → Actions :

| Secret | Valeur |
|--------|--------|
| `SUPABASE_URL` | `https://kpjflntnotftpzffjbud.supabase.co` |
| `SUPABASE_ANON_KEY` | Clé anon du dashboard |

## 5. Edge Function invite-user

```bash
supabase functions deploy invite-user
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
```

Ne jamais committer la clé `service_role`.

## 5b. Modules métier v2 + e-mail transactionnel

1. Exécuter `PharmaOs/supabase/modules_metier_v2.sql` dans le SQL Editor.
2. Déployer l’Edge Function d’envoi (préparations magistrales) :

```bash
supabase functions deploy send-transactional-email
# Recommandé — Resend
supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set SMTP_FROM="Pharmacie <noreply@votredomaine.fr>"
```

Alternative : `SMTP_HTTP_URL` + `SMTP_PASS` + `SMTP_FROM` (voir `supabase/functions/send-transactional-email/README.md`).

## 6. Rotation clé anon (après RLS verrouillée)

1. Settings → API → Regenerate anon key
2. Mettre à jour le secret GitHub `SUPABASE_ANON_KEY`
3. Redéployer GitHub Pages
