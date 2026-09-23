---
name: pharmaos-ui
description: Conventions UI PharmaOS (Electron taskbar dense, Tailwind+Lucide, thèmes data-theme, Auth Portail).
---

# PharmaOS UI

## Stack visuelle
- **Tailwind** + **lucide-react** — pas de redesign marketing, pas de lib UI externe.
- Surfaces dense (comptoir / taskbar always-on-top) : cibles cliquables compactes, labels courts.
- Motions légères (hover/transition) uniquement — pas de glow / glassmorphism.

## Thèmes
- Appliquer via `document.documentElement.dataset.theme` (`clair` | `sombre` | `colore` | `bleu_dore`).
- Tokens CSS dans `src/styles/themes.css` (`--surface`, `--fg`, `--muted`, `--accent`, `--tb-bg`, `--danger`, `--chart-*`…).
- Préférer `bg-[var(--surface)]` / classes sémantiques aux `bg-slate-*` hardcodés sur shells et écrans principaux.
- Éviter palettes génériques AI (violet-on-white, cream+terracotta, broadsheet).
- Polices : `data-font-tb` / `data-font-dash` (`sm` | `md` | `lg`) via prefs.
- Dashboard : `html.dashboard-app` scale le `rem` racine selon `data-font-dash` (sinon `text-*` Tailwind n’évolue pas).

## Taskbar
- Densité : `compact` (logos seuls) | `normal` (sous-groupes + logos) | `detaillee` (+ noms modules) | `empilee` (logos sous sous-groupes).
- Placement : `haut` | `bas` | `gauche` | `droite` | `bas_gauche` | `bas_droite`.
- Bounds Electron via `window:setTaskbarLayout` — ne pas hardcoder la géométrie hors `electron/main.js`.
- Chevron latéral (gauche/droite) : collé au bord intérieur vers le bureau.
- Chevron coin (bas_gauche / bas_droite) : bande basse collée au bord écran.

## Auth / compte
- Connexion Electron = email + MDP existants uniquement.
- Création compte, reset MDP, OTP, invite, delete → **Portail Application** (`VITE_PORTAIL_URL` + `shell:openExternal`).
- Préférences UI (thème, taskbar) = `"PharmaOs".user_preferences` (own RLS), page **Mon compte**.

## Accessibilité
- Thème `bleu_dore` : palette bleu / or (éviter rouge↔vert seuls).
- Boutons taskbar : `title` + `aria-label` obligatoires (noms complets, pas seulement abréviations).
