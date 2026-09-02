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
9. `PharmaOs/supabase/migrations/008_modules_v3_enhancements.sql` (magistrales v3, MDS registre, location facturation, RH horaires)
10. `PharmaOs/supabase/migrations/009_modules_v3_fixes.sql` (location attente réception, backfill MDS, RH heure d'arrivée)
11. `PharmaOs/supabase/migrations/010_magistral_tva_per_order.sql` (TVA saisie à la réception de chaque préparation)

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

1. Exécuter dans le SQL Editor (après `modules_metier_v2.sql`) :
   - `PharmaOs/supabase/migrations/008_modules_v3_enhancements.sql`
   - `PharmaOs/supabase/migrations/009_modules_v3_fixes.sql` (obligatoire pour location « attente réception », backfill délivrances MDS manquantes, colonnes RH arrivée)
2. Déployer l’Edge Function d’envoi (magistrales ; caisse plus tard) :

```bash
supabase functions deploy send-transactional-email
# Recommandé — Resend
supabase secrets set RESEND_API_KEY=re_xxx
# Domaine vérifié obligatoire — PAS de @gmail.com en from
supabase secrets set SMTP_FROM="Pharmacie <noreply@votredomaine.fr>"
# Test temporaire uniquement :
# supabase secrets set SMTP_FROM="onboarding@resend.dev"
```

`SMTP_FROM` avec `@gmail.com` est **refusé** par Resend (403 « Domain not verified »). L’envoi auto caisse → comptable est **désactivé** dans le Dashboard (PDF/CSV restent disponibles).

Alternative : `SMTP_HTTP_URL` + `SMTP_PASS` + `SMTP_FROM` (voir `supabase/functions/send-transactional-email/README.md`).

Si une délivrance MDS apparaît dans `psl_units` (statut `delivre`) mais pas au registre : relancer la migration **009** (backfill des mouvements `delivrance`).
## 6. Rotation clé anon (après RLS verrouillée)

1. Settings → API → Regenerate anon key
2. Mettre à jour le secret GitHub `SUPABASE_ANON_KEY`
3. Redéployer GitHub Pages
