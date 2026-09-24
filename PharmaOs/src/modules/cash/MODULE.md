# Module cash

## 1. Identité

| Champ | Valeur |
|-------|--------|
| id | `cash` |
| label | Clôture de caisse / Caisse |
| dossier | `src/modules/cash/` |

## 2. Taskbar

| Élément | Valeur |
|---------|--------|
| Feature id | `cash` |
| Vue | `#cash` → `CashClosure.jsx` |
| Composant | `comptoir/CashClosure.jsx` |

## 3. Dashboard

| Élément | Valeur |
|---------|--------|
| Page id | `cash` |
| Composants | `CashManager.jsx`, `CashSettingsPanel.jsx` (Paramètres) |
| `canAccess` | taskbar + dashboard `cash` ; préparateur : taskbar `cash` = false par défaut ; settings via `SETTINGS_MODULE_FEATURES` |

## 4. Services

| Fichier | Rôle |
|---------|------|
| `cashService.js` | Clôtures, export CSV/PDF, e-mail mensuel, e-mail comptable |

## 5. Logs

| category | action |
|----------|--------|
| `cash` | `closure_submit` ; soft-fail `cash_ecart_task` |
| `settings` | `save_cash_accountant_email` |
| `mail` | `send` / `send_failed` (rapport mensuel) |

## 6. Tâches

| Source | Types |
|--------|-------|
| Catalogue (`caisse`) | `cash_ecart` |
| Créés | `submitCashClosure` si écart ≠ 0 |
| `taskActions.js` | **dashboard** → page `cash` (`closureId`) |

## 7. SQL

| Table | Colonnes clés | RLS |
|-------|---------------|-----|
| `cash_closures` | `closure_date`, fonds, CB, chèques, sorties, notes, `author_*` | phase sql |
| `app_settings` | clés `cash_accountant_email`, `pharmacy`, `mail_templates` | partagée |

---

## 8. Fonctions exportées (services)

_Inventaire issu du code (2026-09-23). Colonnes Log / Tâches = état actuel, pas la cible._

### `services/cashService.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `submitCashClosure` | Création / enregistrement (+ crée tâche) — tables: cash_closures | `userId, authorName, payload` | cash_closures | oui | oui (`cash`) |
| `fetchMyClosures` | Lecture / recherche — tables: cash_closures | `userId` | cash_closures | non | non |
| `calcEcart` | Helper pur / formatage | `c` | — | non | non |
| `fetchCashClosures` | Lecture / recherche — tables: cash_closures | `{ from, to } = {}` | cash_closures | non | non |
| `exportMonthlyCsv` | Export fichier | `closures, yearMonth` | — | non | non |
| `exportMonthlyPdf` | Export fichier | `closures, yearMonth` | — | non | non |
| `getAccountantEmail` | Lecture / recherche — tables: app_settings | `—` | app_settings | non | non |
| `setAccountantEmail` | Mise à jour / action métier — tables: app_settings | `email` | app_settings | non | oui (`settings`) |
| `emailMonthlyReport` | Envoi / déclenchement | `closures, yearMonth, toEmail` | — | non | non |

## 9. Handlers / actions UI

### `comptoir/CashClosure.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleSubmit` | `setErr`, `submitCashClosure` | erreur UI, succès / feedback |

## 10. Formulaires & données

### Clôture de caisse (`comptoir/CashClosure.jsx`)

| Champ | Label UI | Type | Requis | Notes |
|-------|----------|------|--------|-------|
| closure_date | Date | date | oui | défaut aujourd’hui |
| fond_reel | Fond réel | number | oui | — |
| fond_logiciel | Fond logiciel | number | oui | écart calculé `calcEcart` |
| montant_cb | Montant CB | number | non | — |
| argent_lieu_sur | Argent lieu sûr | number | non | — |
| nb_cheques | Nb chèques | number | non | défaut 0 |
| montant_cheques | Montant chèques | number | non | — |
| garde | Garde | checkbox | non | — |
| sortie_particuliere | Sortie particulière | checkbox | non | révèle montant/motif |
| sortie_montant / sortie_motif | Montant / Motif | number/text | si sortie | — |
| notes | Notes | textarea | non | — |

**Save** : `submitCashClosure` → `cash_closures` + `logEvent`.
**Load historique** : `fetchMyClosures` (date, fonds, CB, écart).


## 11. Données affichées

| Source (fonction / requête) | Colonnes / usage UI |
|-----------------------------|---------------------|
| `cashService.js::fetchMyClosures` | tables/RPC : cash_closures |
| `cashService.js::fetchCashClosures` | tables/RPC : cash_closures |
| `cashService.js::getAccountantEmail` | tables/RPC : app_settings |

## 12. Gap logs / tasks (propositions)

_Propositions uniquement — ne pas implémenter depuis cette checklist sans validation produit._

### Logs probablement manquants

- [ ] `cashService.js::emailMonthlyReport` — mutation sans `logEvent` (tables: —)

### Tâches — manques / câblage à vérifier

Créations détectées : `cashService.js::submitCashClosure`. Vérifier alignement catalogue `taskCatalog.js` + actions `taskActions.js`.

