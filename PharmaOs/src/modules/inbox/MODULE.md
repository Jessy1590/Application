# Module inbox

## 1. Identité

| Champ | Valeur |
|-------|--------|
| id | `inbox` (alias access `tasks`) |
| label | À traiter / Mes saisies |
| dossier | `src/modules/inbox/` |

Post-unification (STATE.md) : **À traiter** = modèle `tasks/` ; ce module = **Mes saisies** (+ stubs).

## 2. Taskbar

| Élément | Valeur |
|---------|--------|
| Feature ids | `inbox` (+ alias `tasks`) |
| Ouverture | Taskbar ouvre `#inbox` → **`Tasks.jsx`** (module `tasks/`), pas `Inbox.jsx` |
| Composant local | `comptoir/Inbox.jsx` — mode `saisies` (autocorrection) ; mode hub legacy stub |

## 3. Dashboard

| Élément | Valeur |
|---------|--------|
| Page ids | `inbox` → `TasksManager` (À traiter) ; `inbox_saisies` → `InboxSaisiesManager` |
| `canAccess` | `inbox` / `tasks` (alias) ; `inbox_saisies` résolu en feature `inbox` ; préparateur : dashboard `inbox` = true |

## 4. Services

| Fichier | Rôle |
|---------|------|
| `inboxService.js` | Agrège / met à jour saisies corrigeables (tous modules fiche) règle B 72h |

## 5. Logs

Aucun `logEvent`.

## 6. Tâches

| Source | Types |
|--------|-------|
| Catalogue | — (file = assignations `tasks`) |
| Actions | via `tasks/shared/taskActions.js` sur la file À traiter |

## 7. SQL

Pas de tables dédiées. README : RLS Mes saisies — migrations `042`, `048`, `050` ; prefs `045`.

---

## 8. Fonctions exportées (services)

_Inventaire issu du code (2026-09-23). Colonnes Log / Tâches = état actuel, pas la cible._

### `services/inboxService.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `isWithinEditableWindow` | Helper pur | `createdAt` | — | non | non |
| `isUnmodifiedByOthers` | Helper pur | `row, userId` | — | non | non |
| `ownerIdOf` | Helper pur | `kind, row` | — | non | non |
| `isEditableSaisie` | Filtre règle B (aligné RLS) | `kind, row, userId` | — | non | non |
| `fetchInboxItems` | Lecture agrégée À traiter + saisies | `userId` | multi (voir §11) | non | non |
| `fetchMyEditableSaisies` | Lecture saisies seulement | `userId` | idem | non | non |
| `updateMyCall` / `updateMyIp` / `updateMyQuality` / `updateMyStock` | UPDATE own | `id, updates` | call_logs / act_ip_logs / quality_events / stock_errors | non | non |
| `updateMyDispute` / `updateMyPerime` / `updateMyMagistral` | UPDATE own | `id, updates` | supplier_disputes / perimes / magistral_orders | non | non |
| `updateMyLocationDossier` / `updateMyLocationContact` | UPDATE own | `id, updates` | location_dossiers / location_contacts | non | non |
| `updateMyHrAbsence` / `updateMyHrSchedule` | UPDATE own | `id, updates` | hr_absences / hr_schedule_changes | non | non |
| `updateMyCash` / `updateMyStupefiant` | UPDATE own | `id, updates` | cash_closures / stupefiant_releves | non | non |
| `updateMyPslUnit` / `updateMyPslMovement` | UPDATE own | `id, updates` | psl_units / psl_movements | non | non |
| `updateMyDocument` / `updateMyConseil` | UPDATE own | `id, updates` | documents / conseils | non | non |

## 9. Handlers / actions UI

### `comptoir/Inbox.jsx`

| Action / label (repère) | Handler | Appels service | Feedback |
|-------------------------|---------|----------------|----------|
| Corriger | `startEdit` | — | formulaire édition |
| Enregistrer | `saveEdit` | `updateMy*` selon kind | « Enregistré » / erreur |

## 10. Formulaires & données

Réutilise `DisputeForm` / `PerimeForm` quand présents ; sinon champs structurés labels FR.

**Règle B** : `isWithinEditableWindow` (~72 h) + `isUnmodifiedByOthers` / `isEditableSaisie`.

**Load** : `fetchInboxItems(userId)` — chips = modules avec au moins une ligne editable.

## 11. Données affichées

| Source | Tables |
|--------|--------|
| `fetchInboxItems` | call_logs, act_ip_logs, quality_events, stock_errors, supplier_disputes, perimes, magistral_orders, location_dossiers, location_contacts, hr_absences, hr_schedule_changes, cash_closures, stupefiant_releves, psl_units, psl_movements, documents, conseils (+ task_assignments pour À traiter legacy) |

## 12. Gap logs / tasks (propositions)

_Propositions uniquement — ne pas implémenter depuis cette checklist sans validation produit._

### Logs probablement manquants

- [ ] Mutations `updateMy*` sans `logEvent` (tables sources)

### Tâches — manques / câblage à vérifier

Mes saisies ne créent pas de tâches. Vérifier que les corrections d’une fiche ne laissent pas de tâches brouillon orphelines — responsabilité des modules sources.
