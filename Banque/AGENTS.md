# Guide pour les agents — Budget Partagé (`Banque/`)

## Stack

- **Vanilla JS** : pas de Node/npm/React/Vite pour l’app. Pas d’installation de toolchain front.
- **Fichiers** : `index.html`, `css/app.css`, scripts `js/*.js` chargés **dans cet ordre** (voir `index.html`) :
  1. `js/core.js` — client Supabase (`db.schema = 'banque'`), `withRetry`, objet `BH` de base, `BH.fmt`, `BH.esc`, `BH.monthKey`
  2. `js/stats.js` — stats, graphiques (`BH.pieChart`)
  3. `js/data.js` — lecture/écriture mois, validations, portefeuilles
  4. `js/today.js` — onglet Aujourd’hui
  5. `js/accounts.js` — onglet Comptes
  6. `js/wallets.js` — enveloppes portefeuille
  7. `js/entries.js` — onglet Saisies
  8. `js/verif.js` — vérification relevé bancaire
  9. `js/print.js` — exports / impression
  10. `js/settings.js` — réglages, sauvegarde
- Chaque module étend `BH` via `Object.assign(BH, { … })`.
- **Supabase** : SDK v2 (CDN). Schéma Postgres **`banque` uniquement** pour les écritures. Le schéma **`public`** (V1) est une sauvegarde lecture seule : **ne jamais y écrire** depuis cette app.
- **Styles** : CSS dans `css/app.css` (variables `:root`).
- **PWA** : `manifest.webmanifest`.
- **Portail** : en prod, `../protect.js` + `initialiserSite("0d673966-f8d8-42fb-8811-c1fba278c76b")` ; config dans `../shared/supabase-config.js` (injectée par `scripts/build-pages.js`).

## Helpers à réutiliser

- `withRetry(fn, label)` — appels réseau / Supabase, toast + réessai (défini dans `js/core.js`).
- `BH.fmt(n)`, `BH.esc(s)`, `BH.monthKey(date)` — formatage, XSS, clé `YYYY-MM` (`js/core.js`).
- `BH.pieChart(items, opts)` — camemberts SVG (`js/stats.js`).

## Écritures métier

Point d’entrée unique pour validations et portefeuilles : **`js/data.js`**

- `upsertMonthRecord(accId, mKey, patch)` — agrégat mois (snapshots théoriques, etc.)
- `setPaid`, `clearPaid`, `setPaidMany` — paiements / encaissements
- `appendWalletTx`, `removeWalletTx` — mouvements portefeuille
- `commit(label, fn, okMsg)` — enchaîne une action avec `withRetry`

Ne dupliquer pas ces écritures ailleurs sauf nécessité explicite déjà présente dans le code.

## Règles projet (`.cursor/rules/convention.mdc`)

- Manipulation DOM directe (`getElementById`, `innerHTML`) avec **`BH.esc`** pour les données utilisateur.
- Portefeuilles : dépense `is_wallet` = enveloppe avec transactions mensuelles (voir `js/wallets.js` + `js/data.js`).
- Distinction **reste théorique** vs **reste à date** (onglet Aujourd’hui / Comptes).
- Réponses concises côté agent lorsque l’utilisateur ne demande pas d’explication détaillée.
- Ergonomie mobile et signet iOS : `.cursor/rules/mobile-ios.mdc` (`viewport-fit=cover`, safe areas, plancher 59/34 px si `env()` vaut 0 en signet, `dvh`, champs 16 px, cibles 44 px).

## Interdits

- Ne **pas** modifier **`Banque-legacy/`** (V1 conservée).
- Ne **pas** supprimer le portail (`protect.js`, racine Application).
- Ne **pas** supprimer de schéma, table ou données Postgres sans accord **explicite** de l’utilisateur.
- Ne **pas** ouvrir / committer `dev/.env.local` (secrets locaux).
- Toujours répondre en **français**.
- Après modification d’un fichier `js/*.js`, lancer **`node --check`** sur ce fichier.
