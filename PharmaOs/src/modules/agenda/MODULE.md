# Module agenda

## 1. Identité

| Champ | Valeur |
|-------|--------|
| id | `agenda` |
| label | Agenda |
| dossier | `src/modules/agenda/` |

## 2. Taskbar

| Élément | Valeur |
|---------|--------|
| Feature ids | — (dashboard-only) |
| Vues / comptoir | — |

## 3. Dashboard

| Élément | Valeur |
|---------|--------|
| Page id | `agenda` |
| Composant | `dashboard/AgendaManager.jsx` |
| `canAccess` | `canAccess('dashboard', 'agenda')` |

## 4. Services

| Fichier | Rôle |
|---------|------|
| `agendaService.js` | CRUD `agenda_events` ; crée tâches liées commande/facturation |

## 5. Logs

Aucun `logEvent` dans le module.

## 6. Tâches

| Source | Types |
|--------|-------|
| Catalogue (`module: taches`) | `commande`, `facturation` (créées aussi via taskbar QuickAction / `taskService`) |
| Créés ici | `createTask` avec `details` JSON agenda (pas toujours `details.type` normalisé côté agenda legacy) |
| `taskActions.js` | `commande` → close/inline ; `facturation` → close/inline |

## 7. SQL

D’après `sql/README.md`.

| Table | Colonnes clés | RLS |
|-------|---------------|-----|
| `PharmaOs.agenda_events` | `type` (`commande_med` \| `facturation` \| `changement_horaire`), `date_evenement`, `details` jsonb | ALL authenticated |

---

## 8. Fonctions exportées (services)

_Inventaire issu du code (2026-09-23). Colonnes Log / Tâches = état actuel, pas la cible._

### `services/agendaService.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `fetchAgendaEvents` | Lecture / recherche — tables: agenda_events | `—` | agenda_events | non | non |
| `createAgendaEvent` | Création / enregistrement (+ crée tâche) — tables: agenda_events | `type, startDate, details, assignees, createdBy` | agenda_events | oui | non |
| `deleteAgendaEvent` | Mise à jour / action métier — tables: agenda_events, tasks | `id, groupId = null, deleteFuture = false, dateEvenement =…` | agenda_events, tasks | non | non |
| `updateAgendaEvent` | Mise à jour / action métier | `eventId, groupId, oldDate, newData, updateFuture, assigne…` | — | non | non |

Autres exports (constantes / ré-exports) : `fetchProfiles`.

## 9. Handlers / actions UI

### `dashboard/AgendaManager.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleSubmit` | `updateAgendaEvent`, `createAgendaEvent`, `setModalType`, `setIsEditing`, `setFormData`, `deleteAgendaEvent` | — |
| — | `handleDelete` | `deleteAgendaEvent`, `setSelectedEvent`, `setModalType`, `setIsEditing`, `setFormData` | — |

Libellés boutons repérés dans le JSX : « Annuler ».

## 10. Formulaires & données

### Création / édition événement

Réutilise `PatientOrderForm` (`type` order|billing) + date événement + assignés.

Types agenda : `commande_med` | `facturation` (| `changement_horaire` filtré hors calendrier UI).

**Save** : `createAgendaEvent` → `agenda_events` + `createTask` (commande/facturation).
**Edit** : `updateAgendaEvent` (option `updateFuture`) ; **Delete** : `deleteAgendaEvent` (+ tasks liées).


## 11. Données affichées

| Source (fonction / requête) | Colonnes / usage UI |
|-----------------------------|---------------------|
| `agendaService.js::fetchAgendaEvents` | tables/RPC : agenda_events |

## 12. Gap logs / tasks (propositions)

_Propositions uniquement — ne pas implémenter depuis cette checklist sans validation produit._

### Logs probablement manquants

- [ ] `agendaService.js::createAgendaEvent` — mutation sans `logEvent` (tables: agenda_events)
- [ ] `agendaService.js::deleteAgendaEvent` — mutation sans `logEvent` (tables: agenda_events, tasks)
- [ ] `agendaService.js::updateAgendaEvent` — mutation sans `logEvent` (tables: —)

### Tâches — manques / câblage à vérifier

Créations détectées : `agendaService.js::createAgendaEvent`. Vérifier alignement catalogue `taskCatalog.js` + actions `taskActions.js`.

