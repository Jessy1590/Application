# Budget Partagé

Application web de budget partagé (comptes, dépenses, revenus, portefeuilles, vérification de relevé bancaire), authentifiée via le portail du dépôt et synchronisée avec Supabase (schéma `banque`).

## Structure

| Chemin | Rôle |
|--------|------|
| `index.html` | Shell UI, CSP, chargement portail + scripts |
| `css/app.css` | Styles |
| `js/core.js` | Supabase, `BH`, `withRetry`, formatage |
| `js/stats.js` | Statistiques et graphiques |
| `js/data.js` | Données mois, validations, portefeuilles |
| `js/today.js` | Vue « Aujourd’hui » |
| `js/accounts.js` | Vue « Comptes » |
| `js/wallets.js` | Enveloppes portefeuille |
| `js/entries.js` | Saisies et édition budget |
| `js/verif.js` | Import / rapprochement relevé |
| `js/print.js` | Exports CSV / impression |
| `js/settings.js` | Réglages et sauvegarde JSON |
| `sql/` | Migrations schéma `banque` (non déployées sur Pages) |
| `dev/` | Serveur et outils **locaux uniquement** (exclus du build Pages) |

Détails base : [docs/DATABASE.md](docs/DATABASE.md). Règles agents : [AGENTS.md](AGENTS.md).

## Lancement local

Depuis la racine du dépôt `Application/` :

```bash
python3 Banque/dev/serve.py
```

Puis ouvrir **http://localhost:8765/Banque/** (port par défaut `8765`, surcharge possible via `PORT`).

Le serveur injecte la config Supabase depuis `dev/.env.local` (non versionné), remplace `/protect.js` par une connexion locale, et réécrit les jetons CSP comme en CI.

## Déploiement

GitHub Actions exécute `node scripts/build-pages.js`, qui copie les fichiers statiques vers `dist/`, exclut entre autres `.cursor`, `dev/`, `*.sql`, `*.md`, et injecte `SUPABASE_URL` / `SUPABASE_ANON_KEY` dans `shared/supabase-config.js` plus les jetons `__SUPABASE_HTTP__` / `__SUPABASE_WSS__` dans les HTML/JS.

L’URL publique du site reste **`/Banque/`** sur GitHub Pages.
