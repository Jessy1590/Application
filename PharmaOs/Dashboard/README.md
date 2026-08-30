# PharmaOS — Dashboard Titulaire

Site web classique (React + Vite + Tailwind), séparé de l'app Electron comptoir
(dossier `app/` du même repo). Consultable depuis n'importe quel navigateur pour
suivre l'activité comptoir.

## Déploiement sur GitHub Pages (site statique, pas de serveur)

Ce dashboard est un build statique (`dist/`) — aucun serveur Node requis en
production, juste des fichiers HTML/CSS/JS servis tels quels. Le workflow
`.github/workflows/deploy-dashboard.yml` (à la racine du repo, à côté de
`app/` et `dashboard/`) automatise le build + déploiement à chaque push sur
`main` touchant `dashboard/`.

**Étapes une seule fois, côté GitHub :**

1. Repo → **Settings → Pages** → Source : **GitHub Actions** (pas "Deploy from
   a branch").
2. Repo → **Settings → Secrets and variables → Actions** → **New repository
   secret**, ajouter :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

   (mêmes valeurs que dans `dashboard/.env` — l'anon key Supabase est prévue
   pour être publique côté client, mais on évite quand même de la committer
   en clair dans l'historique git).
3. Vérifier que **`base` dans `vite.config.js`** correspond bien au nom exact
   du repo GitHub (`/PharmaOS/` par défaut — à adapter sinon, sans quoi les
   assets JS/CSS ne se chargeront pas une fois déployés).

Ensuite, chaque `git push` sur `main` qui touche `dashboard/` republie
automatiquement le site sur `https://<votre-user>.github.io/PharmaOS/`.

Pour déclencher un déploiement sans toucher au code : onglet **Actions** du
repo → workflow "Deploy Dashboard to GitHub Pages" → **Run workflow**.

## Installation (développement local)

```bash
npm install
```

## Lancer en développement

```bash
npm run dev
```

Ouvre sur `http://localhost:5174` (port différent de l'app Electron pour pouvoir
faire tourner les deux en parallèle).

## Build de production

```bash
npm run build   # génère dist/
npm run preview # sert dist/ localement pour vérifier avant déploiement
```

Déployable tel quel sur Vercel/Netlify/Cloudflare Pages (site statique standard).

## Configuration requise côté Supabase

1. **Tables + RLS de base** : déjà couvertes par `app/supabase/schema.sql`
   (schéma `PharmaOs`, tables `taskbar_logs` / `quality_events` / `advice_events`).
2. **Rôle Admin** : ce dashboard réutilise la table existante `portail.profiles`
   (colonne `role`, `'admin'` ou `'member'`) — aucune attribution SQL à faire si
   votre compte est déjà `admin` dedans.
3. **Policies supplémentaires pour ce dashboard** : exécuter
   `supabase/dashboard-rls.sql` — sans ça, un admin ne verrait que
   *ses propres* logs (comme n'importe quel utilisateur comptoir), pas ceux
   de toute l'équipe. Ce script active aussi RLS + une policy "lire sa propre
   ligne" sur `portail.profiles` si ce n'est pas déjà en place.
4. **Exposed schemas** : `PharmaOs` **et** `portail` doivent être dans
   Project Settings > Data API > Exposed schemas.

## Structure

- `src/core/AuthContext.jsx` — session Supabase + vérification du rôle
- `src/pages/Login.jsx` — connexion
- `src/pages/AccessDenied.jsx` — connecté mais rôle non autorisé
- `src/pages/Dashboard.jsx` — grille de cartes analytiques
- `src/components/` — `StatCard` (générique), `QualityStatsCard` (mock),
  `AdviceStatsCard` (mock), `TaskbarUsageCard` (données réelles)
- `src/services/statsService.js` — lecture des stats (réelles ou mockées)
- `src/services/supabaseClient.js` — client Supabase, schéma `PharmaOs`

## État des cartes

| Carte | Source |
|---|---|
| Stats de Qualité | **Mock** — en attente du module Quality (Phase 2 app) |
| Stats de Conseil | **Mock** — en attente du module Advice (Phase 2 app) |
| Utilisation barre comptoir | **Réel** — lit `PharmaOs.taskbar_logs` |
