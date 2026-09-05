# PharmaOS

Application Electron unifiée pour la gestion de pharmacie : **taskbar always-on-top**, **fenêtre module comptoir** (900×600) et **fenêtre Dashboard admin** (1280×800).

## Prérequis

- Node.js ≥ 18
- npm ≥ 9

## Installation

```bash
npm install
```

## Configuration

```bash
cp .env.example .env
```

Renseigner les deux variables Supabase (clé **anon** uniquement — jamais `service_role`) :

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

## Scripts

| Commande | Description |
|---|---|
| `npm run dev` | Serveur Vite (hot-reload) |
| `npm run electron:dev` | Vite + Electron en parallèle (dev complet) |
| `npm run build` | Build Vite → `dist/` |
| `npm run dist` | Build Vite + packaging Electron → `release/` (NSIS + portable `.exe`) |

## Packaging `.exe`

```bash
npm run dist
```

Artefacts générés dans **`release/`** :

- `PharmaOS-0.1.0-x64-Setup.exe` — installateur NSIS
- `PharmaOS-0.1.0-x64-portable.exe` — exécutable portable

> Le build Windows ne signe pas le binaire (`signAndEditExecutable: false`). Pour la distribution publique, ajouter un certificat code-signing et retirer cette option.

## Rôles

| Rôle | Accès |
|---|---|
| **admin** | Taskbar + tous les modules comptoir + **bouton Dashboard** → fenêtre admin complète |
| **équipe** | Taskbar + modules comptoir uniquement (pas de bouton Dashboard) |

Le rôle est lu depuis `portail.profiles.role` à la connexion.

## Legacy

L'ancienne base de code (App + Dashboard séparés) est préservée dans **`../PharmaOs-legacy/`**. Ne pas supprimer sans validation manuelle.

## Architecture

Voir [`.cursor/docs/ARCHITECTURE.md`](.cursor/docs/ARCHITECTURE.md) pour le détail technique.
