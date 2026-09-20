# PharmaOS

Application Electron unifiée : **taskbar always-on-top**, **fenêtre module comptoir** (900×600) et **fenêtre Dashboard** (1280×800). Complément du LGO (pas un LGO).

## Prérequis

- Node.js ≥ 18
- npm ≥ 9

## Installation

```bash
npm install
cp .env.example .env
```

Renseigner (clé **anon** uniquement — jamais `service_role`) :

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

## Scripts

| Commande | Description |
|---|---|
| `npm run dev` | Serveur Vite |
| `npm run electron:dev` | Vite + Electron |
| `npm run build` | Build → `dist/` |
| `npm run dist` | Packaging → `release/` (NSIS + portable) |

## Rôles

| Rôle | Accès typique |
|---|---|
| **pharmacien** | Taskbar + dashboard (matrice) ; supervision métier |
| **administrateur** | Tout + Administration (logs, bugs, Accès & rôles, paramètres) |
| **préparateur** | Taskbar ; dashboard selon matrice / casquettes ; **inbox** (À traiter / mes saisies) par défaut |
| **désactivé** | Connexion refusée |

Legacy `admin` / `équipe` / `member` / `gestionnaire` mappés automatiquement. Accès fins : Administration → **Accès & rôles** + **casquettes**.

## Legacy

Ancienne base : **`../PharmaOs-legacy/`**. Ne pas supprimer sans validation.

## Docs

- [Architecture](.cursor/docs/ARCHITECTURE.md)
- [Sécurité](.cursor/docs/SECURITY.md)
- [État projet](.cursor/docs/STATE.md)
