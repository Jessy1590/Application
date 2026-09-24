# Module conseil

## 1. Identité

| Champ | Valeur |
|-------|--------|
| id | `conseil` |
| label | Conseil |
| dossier | `src/modules/conseil/` |

## 2. Taskbar

| Élément | Valeur |
|---------|--------|
| Feature id | — (pas dans `TASKBAR_FEATURES`) |
| UI | `ConseilPanel.jsx` embarqué dans `Taskbar.jsx` (match live contexte) |
| Vue module | — |

## 3. Dashboard

| Élément | Valeur |
|---------|--------|
| Page id | `conseil` |
| Composant | `dashboard/ConseilManager.jsx` |
| `canAccess` | `canAccess('dashboard', 'conseil')` |

## 4. Services

| Fichier | Rôle |
|---------|------|
| `conseilService.js` | CRUD conseils + `conseil_events` + stats |
| `conseilMatch.js` | Matching texte contexte → conseil actif |

## 5. Logs

Aucun `logEvent`. Journal métier : `conseil_events`.

## 6. Tâches

Aucune.

## 7. SQL

| Table | Notes | RLS |
|-------|-------|-----|
| `conseils` | référentiel conseils associés | staff CRUD |
| `conseil_events` | accepté / refusé (taskbar) | insert own ; select own + admin |

Migration `022_conseils.sql`.

---

## 8. Fonctions exportées (services)

_Inventaire issu du code (2026-09-23). Colonnes Log / Tâches = état actuel, pas la cible._

### `services/conseilMatch.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `normalizeForMatch` | Helper pur / formatage | `value` | — | non | non |
| `matchConseil` | Fonction exportée | `text, conseils, opts = {}` | — | non | non |

### `services/conseilService.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `fetchActiveConseils` | Lecture / recherche — tables: conseils | `—` | conseils | non | non |
| `fetchConseils` | Lecture / recherche — tables: conseils | `{ includeInactive = true } = {}` | conseils | non | non |
| `createConseil` | Création / enregistrement — tables: conseils | `payload, userId` | conseils | non | non |
| `updateConseil` | Mise à jour / action métier — tables: conseils | `id, patch` | conseils | non | non |
| `setConseilActive` | Mise à jour / action métier | `id, isActive` | — | non | non |
| `insertConseilEvent` | Création / enregistrement — tables: conseil_events | `event` | conseil_events | non | non |
| `fetchConseilEvents` | Lecture / recherche — tables: conseil_events | `{ status = null, userId = null, since = null, until = nul…` | conseil_events | non | non |
| `fetchConseilStats` | Lecture / recherche — tables: conseil_events | `{ days = 30 } = {}` | conseil_events | non | non |
| `fetchTeamProfiles` | Lecture / recherche — tables: profiles | `—` | profiles | non | non |

## 9. Handlers / actions UI

### `comptoir/ConseilPanel.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|

Boutons `title` : « Validé — conseil accepté » → `() => resolve('accepte')` ; « Refuser » → `() => resolve('refuse')`.

### `dashboard/ConseilManager.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleSuggestSelect` | `setErr` | erreur UI, succès / feedback |
| — | `handleSubmit` | `setErr`, `updateConseil`, `createConseil`, `setTab` | erreur UI, succès / feedback |

Boutons `title` : « Modifier » → `() => openEdit(c)`.

## 10. Formulaires & données

### Dashboard CRUD conseil (`ConseilManager`)

Champs typiques conseil : titre, contenu / conseils associés, mots-clés match, actif (`is_active`). Lire le manager pour labels exacts.

**Save** : `createConseil` / `updateConseil` / `setConseilActive`.

### Panel taskbar

Pas de form création : match live + boutons accepter / refuser → `insertConseilEvent` (`conseil_events`).


## 11. Données affichées

| Source (fonction / requête) | Colonnes / usage UI |
|-----------------------------|---------------------|
| `conseilService.js::fetchActiveConseils` | tables/RPC : conseils |
| `conseilService.js::fetchConseils` | tables/RPC : conseils |
| `conseilService.js::fetchConseilEvents` | tables/RPC : conseil_events |
| `conseilService.js::fetchConseilStats` | tables/RPC : conseil_events |
| `conseilService.js::fetchTeamProfiles` | tables/RPC : profiles |

## 12. Gap logs / tasks (propositions)

_Propositions uniquement — ne pas implémenter depuis cette checklist sans validation produit._

### Logs probablement manquants

- [ ] `conseilService.js::createConseil` — mutation sans `logEvent` (tables: conseils)
- [ ] `conseilService.js::updateConseil` — mutation sans `logEvent` (tables: conseils)
- [ ] `conseilService.js::setConseilActive` — mutation sans `logEvent` (tables: —)
- [ ] `conseilService.js::insertConseilEvent` — mutation sans `logEvent` (tables: conseil_events)

### Tâches — manques / câblage à vérifier

- [ ] Module sans création de tâche détectée — confirmer si des événements métier devraient en produire.

