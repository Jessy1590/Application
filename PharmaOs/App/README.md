# PharmaOS — Phase 1 : la coquille

Surcouche Windows (widget bureau) pour pharmacies. Electron + React (Vite) + Tailwind + Supabase.

## Installation

```bash
npm install
```

## Lancer en développement

Deux processus : le serveur Vite (renderer) et Electron (main).

```bash
npm run electron:dev
```

Cette commande lance Vite sur `http://localhost:5173`, attend qu'il soit prêt, puis démarre Electron
en pointant dessus (`NODE_ENV=development`).

## Build de production

```bash
npm run build   # génère dist/ (renderer)
npm run electron  # lance Electron en chargeant dist/index.html
```

## Ce qui existe en Phase 1

- Fenêtre Electron 100% largeur d'écran, 60px de haut, en haut de l'écran, sans bordure,
  toujours au premier plan, fond transparent (`electron/main.js`).
- Canal IPC `window:setMode` (`expanded` 60px / `reduced` 20px), exposé au renderer via
  `electron/preload.cjs` → `window.electronAPI.setWindowMode(mode)`.
- Structure modulaire `src/core`, `src/services`, `src/components`, `src/modules`
  (voir `CLAUDE.md` du projet).
- Aucune logique métier (Qualité, Conseil, Annuaire) : boutons factices / données mockées,
  comme prévu pour la Phase 1.

## Variables d'environnement

Copier `.env.example` en `.env` et renseigner les clés Supabase (déjà pré-remplies dans `.env`
pour ce prototype — à ne jamais committer).
