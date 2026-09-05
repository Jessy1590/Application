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

### PharmaOs (app unifiée — source de vérité)

Exécuter dans l'ordre sous `Application/PharmaOs/supabase/migrations/` :

1. `001_portail_profiles_site_access.sql`
2. `002_pharmaos_helpers_rls.sql`
3. `003_pharmaos_tasks_logs.sql`
4. `004_pharmaos_directory_agenda_calls_ip.sql`
5. `005_pharmaos_quality_controls_docs_stock.sql`
6. `006_pharmaos_modules_metier.sql` (location, magistrales, PSL, caisse, RH, alertes lot, litiges)

DDL + RLS par domaine aussi dans `PharmaOs/src/modules/*/sql/`. Détail policies : `PharmaOs/.cursor/docs/SECURITY.md`.

### Autres apps du monorepo (hors PharmaOs)

Conserver / appliquer séparément si besoin (fichiers historiques, non versionnés dans le nouveau monorepo PharmaOs) :

- Banque, Valorisation, Vaccin (`autres`), Fromage — RLS dédiées (voir dossiers app respectifs / historique git).

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

## 5b. E-mail transactionnel

1. Les tables métier v2/v3 (location, magistrales, MDS, RH…) sont couvertes par `PharmaOs/supabase/migrations/006_pharmaos_modules_metier.sql` (déjà appliqué sur le projet live).
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

Si une délivrance MDS apparaît dans `psl_units` (statut `delivre`) mais pas au registre : vérifier / backfiller manuellement les lignes `psl_movements` (`movement_type = 'delivrance'`) — l’ancienne migration 009 n’est plus un fichier séparé (schéma inclus dans `006`).
## 6. Rotation clé anon (après RLS verrouillée)

1. Settings → API → Regenerate anon key
2. Mettre à jour le secret GitHub `SUPABASE_ANON_KEY`
3. Redéployer GitHub Pages
