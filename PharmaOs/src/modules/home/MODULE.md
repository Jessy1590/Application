# Module home

## 1. Identité

| Champ | Valeur |
|-------|--------|
| id | `dashboard` (feature + page) |
| label | Tableau de bord / Accueil |
| dossier | `src/modules/home/` |

## 2. Taskbar

| Élément | Valeur |
|---------|--------|
| Feature | bouton Dashboard si `canAccess('dashboard', 'dashboard')` (pas d’ouverture module) |
| Vues / comptoir | — |

## 3. Dashboard

| Élément | Valeur |
|---------|--------|
| Page id | `dashboard` |
| Composants | `HomeDashboard.jsx`, `dashboard/components/*` (charts) |
| `canAccess` | `canAccess('dashboard', 'dashboard')` |

## 4. Services

| Fichier | Rôle |
|---------|------|
| `statsService.js` | Stats taskbar, insights / charts agrégés multi-modules |

## 5. Logs

Aucun `logEvent` écrit depuis ce module. Lit `app_logs`, `taskbar_logs` pour graphiques.

Table domaine : `PharmaOs.taskbar_logs` (`login` \| `expand` \| `collapse`) — écriture shell Taskbar (double écriture volontaire, voir STATE.md).

## 6. Tâches

Aucune création.

## 7. SQL

| Table | Notes | RLS |
|-------|-------|-----|
| `taskbar_logs` | télémétrie barre | isolation user + admin SELECT |

`advice_events` retiré → `conseil_events`.

---

## 8. Fonctions exportées (services)

_Inventaire issu du code (2026-09-23). Colonnes Log / Tâches = état actuel, pas la cible._

### `services/statsService.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `fetchTaskbarUsageStats` | Lecture / recherche — tables: taskbar_logs, profiles | `days = 7` | taskbar_logs, profiles | non | non |
| `getMockAdviceStats` | Lecture / recherche | `—` | — | non | non |
| `fetchDashboardInsights` | Lecture / recherche — tables: profiles, task_assignments, act_ip_logs, quality_events, stock_errors, supplier_disputes, hr_absences, hr_schedule_changes, taskbar_logs | `days = 30` | profiles, task_assignments, act_ip_logs, quality_events, stock_errors, supplier_disputes, hr_absences, hr_schedule_changes, taskbar_logs | non | non |
| `fetchDashboardCharts` | Lecture / recherche — tables: call_logs, act_ip_logs, task_assignments, quality_events, stock_errors, supplier_disputes, magistral_orders, conseil_events, hr_absences, hr_schedule_changes, cash_closures, location_dossiers | `days = 30` | call_logs, act_ip_logs, task_assignments, quality_events, stock_errors, supplier_disputes, magistral_orders, conseil_events, hr_absences, hr_schedule_changes, cash_closures, location_dossiers | non | non |

## 9. Handlers / actions UI

### `dashboard/components/AdviceStatsCard.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|

Boutons `title` : « Stats de Conseil » → `onNavigate ? () => onNavigate('conseil') : undefined`.

### `dashboard/components/MagistralAlertsCard.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|

Boutons `title` : « Magistrales » → `() => onNavigate?.('magistral_suivi')` ; « Magistrales » → `() => onNavigate?.('magistral_suivi')`.

### `dashboard/components/QualityStatsCard.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|

Boutons `title` : « Qualité ISO 9001 » → `() => onNavigate?.('quality')`.

### `dashboard/components/StupefiantsOpsCard.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|

Boutons `title` : « Stupéfiants » → `onNavigate ? () => onNavigate('stupefiants', { tab: 'verifier' `.

## 10. Formulaires & données

Pas de formulaire d’écriture. Filtres dashboard (`DashboardFilters`) : période / jours → `fetchDashboardInsights` / `fetchDashboardCharts` / `fetchTaskbarUsageStats`.


## 11. Données affichées

| Source (fonction / requête) | Colonnes / usage UI |
|-----------------------------|---------------------|
| `statsService.js::fetchTaskbarUsageStats` | tables/RPC : taskbar_logs, profiles |
| `statsService.js::getMockAdviceStats` | tables/RPC : — |
| `statsService.js::fetchDashboardInsights` | tables/RPC : profiles, task_assignments, act_ip_logs, quality_events, stock_errors, supplier_disputes, hr_absences, hr_schedule_changes, taskbar_logs |
| `statsService.js::fetchDashboardCharts` | tables/RPC : call_logs, act_ip_logs, task_assignments, quality_events, stock_errors, supplier_disputes, magistral_orders, conseil_events, hr_absences, hr_schedule_changes, cash_closures, location_dossiers |

## 12. Gap logs / tasks (propositions)

_Propositions uniquement — ne pas implémenter depuis cette checklist sans validation produit._

### Logs probablement manquants

_Aucune mutation évidente sans log, ou module sans services mutatifs._

### Tâches — manques / câblage à vérifier

- [ ] Module sans création de tâche détectée — confirmer si des événements métier devraient en produire.

