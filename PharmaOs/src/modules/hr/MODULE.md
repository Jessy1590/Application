# Module hr

## 1. Identité

| Champ | Valeur |
|-------|--------|
| id | `hr` |
| label | RH |
| dossier | `src/modules/hr/` |

## 2. Taskbar

| Élément | Valeur |
|---------|--------|
| Feature id | `hr` |
| Vue | `#hr` → `Hr.jsx` |
| Composant | `comptoir/Hr.jsx` |

## 3. Dashboard

| Élément | Valeur |
|---------|--------|
| Page id | `hr` |
| Composants | `HrManager.jsx`, `HrPlanningCalendar.jsx` |
| `canAccess` | `canAccess(..., 'hr')` |

## 4. Services

| Fichier | Rôle |
|---------|------|
| `hrService.js` | Planning, absences, changements horaire, présence (`taskbar_logs`), tâches RH |

## 5. Logs

Aucun `logEvent`. Lecture `taskbar_logs` pour présence.

## 6. Tâches

| Source | Types |
|--------|-------|
| Catalogue (`rh`) | `hr_absence_demande`, `hr_absence_reponse`, `hr_horaire_demande`, `hr_horaire_reponse` |
| Créés | workflow validation absences / horaires |
| `taskActions.js` | demandes → **dashboard** `hr` ; réponses → **close** inline |

## 7. SQL

| Table | Rôle | RLS |
|-------|------|-----|
| `work_schedules` | planning + patterns A/B | migrations 016–018 |
| `hr_special_weeks` | semaines nommées | |
| `hr_absences` | congés / absences | |
| `hr_schedule_changes` | retards / changements horaire | |
| `app_settings` | clé `hr_min_staff` | |

---

## 8. Fonctions exportées (services)

_Inventaire issu du code (2026-09-23). Colonnes Log / Tâches = état actuel, pas la cible._

### `services/hrService.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `labelAbsenceType` | Helper pur / formatage | `type` | — | non | non |
| `labelAbsenceStatut` | Helper pur / formatage | `statut` | — | non | non |
| `labelChangeType` | Helper pur / formatage | `type` | — | non | non |
| `labelWeekPattern` | Helper pur / formatage | `pattern` | — | non | non |
| `mondayOfISOWeek` | Helper pur / formatage | `dateStr` | — | non | non |
| `getISOWeekNumber` | Lecture / recherche | `dateStr` | — | non | non |
| `isoWeekParity` | Helper pur / formatage | `dateStr` | — | non | non |
| `weekMeta` | Helper pur / formatage | `dateStr` | — | non | non |
| `effectiveSchedulesForDate` | Helper pur / formatage | `schedules, userId, dateStr, { fallbackPharmacy = true } = {}` | — | non | non |
| `effectiveSchedulesForUser` | Helper pur / formatage | `schedules, userId, { dateStr = null } = {}` | — | non | non |
| `buildWeekGrid` | Helper pur / formatage | `schedules, profiles, { weekDate = null } = {}` | — | non | non |
| `fetchTeamProfiles` | Lecture / recherche — tables: profiles | `—` | profiles | non | non |
| `labelJobTitle` | Helper pur / formatage | `job` | — | non | non |
| `updateProfileJobTitle` | Mise à jour / action métier — tables: profiles | `profileId, jobTitle` | profiles | non | non |
| `fetchWorkSchedules` | Lecture / recherche — tables: work_schedules | `{ includeInactive = false } = {}` | work_schedules | non | non |
| `upsertWorkSchedule` | Création / enregistrement — tables: work_schedules | `payload, id = null` | work_schedules | non | non |
| `createScheduleSlots` | Création / enregistrement | `{ user_id = null, daysOfWeek = [], start_time, end_time, …` | — | non | non |
| `sundayOfISOWeek` | Helper pur / formatage | `mondayStr` | — | non | non |
| `mondaysInDateRange` | Helper pur / formatage | `from, to` | — | non | non |
| `fetchSpecialWeeks` | Lecture / recherche — tables: hr_special_weeks | `—` | hr_special_weeks | non | non |
| `createSpecialWeek` | Création / enregistrement — tables: hr_special_weeks | `createdBy, { label, week_start, week_end, note = null }` | hr_special_weeks | non | non |
| `deleteSpecialWeek` | Mise à jour / action métier — tables: hr_special_weeks | `id` | hr_special_weeks | non | non |
| `specialWeeksForMonday` | Fonction exportée | `specialWeeks, monday` | — | non | non |
| `minutesToTime` | Helper pur / formatage | `totalMin` | — | non | non |
| `timeToMinutes` | Helper pur / formatage | `timeStr` | — | non | non |
| `snapMinutes` | Helper pur / formatage | `min, step = PLANNING_SLOT_MIN` | — | non | non |
| `colorForUser` | Helper pur / formatage | `userId, profiles = []` | — | non | non |
| `deactivateWorkSchedule` | Mise à jour / action métier — tables: work_schedules | `id` | work_schedules | non | non |
| `fetchAbsences` | Lecture / recherche — tables: hr_absences | `{ from, to, userId, statut } = {}` | hr_absences | non | non |
| `createAbsence` | Création / enregistrement — tables: hr_absences | `createdBy, payload, { mode = 'admin' } = {}` | hr_absences | non | non |
| `updateAbsence` | Mise à jour / action métier — tables: hr_absences | `id, updates` | hr_absences | non | non |
| `reviewAbsence` | Mise à jour / action métier — tables: hr_absences | `id, reviewerId, { statut, review_note = null } = {}` | hr_absences | non | non |
| `deleteAbsence` | Mise à jour / action métier — tables: hr_absences | `id` | hr_absences | non | non |
| `createAbsenceRequestTask` | Création / enregistrement (+ crée tâche) | `absenceRow, createdBy` | — | oui | non |
| `createAbsenceResponseTask` | Création / enregistrement (+ crée tâche) — tables: tasks | `absenceRow, createdBy` | tasks | oui | non |
| `fetchScheduleChanges` | Lecture / recherche — tables: hr_schedule_changes | `{ userId, statut, changeType } = {}` | hr_schedule_changes | non | non |
| `createScheduleChange` | Création / enregistrement — tables: hr_schedule_changes | `createdBy, payload, { mode = 'admin' } = {}` | hr_schedule_changes | non | non |
| `reviewScheduleChange` | Mise à jour / action métier — tables: hr_schedule_changes | `id, reviewerId, { statut, review_note = null } = {}` | hr_schedule_changes | non | non |
| `deleteScheduleChange` | Mise à jour / action métier — tables: hr_schedule_changes | `id` | hr_schedule_changes | non | non |
| `createScheduleChangeRequestTask` | Création / enregistrement (+ crée tâche) | `changeRow, createdBy` | — | oui | non |
| `createScheduleChangeResponseTask` | Création / enregistrement (+ crée tâche) — tables: tasks | `changeRow, createdBy` | tasks | oui | non |
| `normalizeMinStaff` | Helper pur / formatage | `value` | — | non | non |
| `isStaffingShortage` | Helper pur / formatage | `counts, thresholds` | — | non | non |
| `staffingShortageDetails` | Fonction exportée | `counts, thresholds` | — | non | non |
| `fetchMinStaff` | Lecture / recherche — tables: app_settings | `—` | app_settings | non | non |
| `saveMinStaff` | Création / enregistrement — tables: app_settings | `thresholds` | app_settings | non | non |
| `fetchStaffingShortages` | Lecture / recherche | `{ from, to, minStaff = null } = {}` | — | non | non |
| `fetchPresenceForDay` | Lecture / recherche — tables: taskbar_logs | `dateStr, { schedules = null, profiles = null } = {}` | taskbar_logs | non | non |
| `fetchMonthlyHoursRecap` | Lecture / recherche — tables: taskbar_logs | `year, month` | taskbar_logs | non | non |
| `fetchMonthDailyPresence` | Lecture / recherche — tables: taskbar_logs | `year, month` | taskbar_logs | non | non |
| `plannedStartForDay` | Fonction exportée | `schedules, userId, dateStr` | — | non | non |

Autres exports (constantes / ré-exports) : `ABSENCE_TYPE_LABELS`, `ABSENCE_STATUT_LABELS`, `CHANGE_TYPE_LABELS`, `WEEK_PATTERN_LABELS`, `JOB_TITLE_LABELS`, `PLANNING_HOUR_START`, `PLANNING_HOUR_END`, `PLANNING_SLOT_MIN`, `DEFAULT_MIN_STAFF`, `DAY_LABELS`.

## 9. Handlers / actions UI

### `dashboard/HrPlanningCalendar.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handlePrintMonth` | `saveMinStaff`, `setSettingsOpen`, `setModal` | — |

Libellés boutons repérés dans le JSX : « Enregistrer », « Annuler ».

## 10. Formulaires & données

_Pas de formulaire partagé détecté ; champs éventuels dans les composants comptoir/dashboard (voir §9)._

## 11. Données affichées

| Source (fonction / requête) | Colonnes / usage UI |
|-----------------------------|---------------------|
| `hrService.js::getISOWeekNumber` | tables/RPC : — |
| `hrService.js::fetchTeamProfiles` | tables/RPC : profiles |
| `hrService.js::fetchWorkSchedules` | tables/RPC : work_schedules |
| `hrService.js::fetchSpecialWeeks` | tables/RPC : hr_special_weeks |
| `hrService.js::fetchAbsences` | tables/RPC : hr_absences |
| `hrService.js::fetchScheduleChanges` | tables/RPC : hr_schedule_changes |
| `hrService.js::fetchMinStaff` | tables/RPC : app_settings |
| `hrService.js::fetchStaffingShortages` | tables/RPC : — |
| `hrService.js::fetchPresenceForDay` | tables/RPC : taskbar_logs |
| `hrService.js::fetchMonthlyHoursRecap` | tables/RPC : taskbar_logs |
| `hrService.js::fetchMonthDailyPresence` | tables/RPC : taskbar_logs |

## 12. Gap logs / tasks (propositions)

_Propositions uniquement — ne pas implémenter depuis cette checklist sans validation produit._

### Logs probablement manquants

- [ ] `hrService.js::updateProfileJobTitle` — mutation sans `logEvent` (tables: profiles)
- [ ] `hrService.js::upsertWorkSchedule` — mutation sans `logEvent` (tables: work_schedules)
- [ ] `hrService.js::createScheduleSlots` — mutation sans `logEvent` (tables: —)
- [ ] `hrService.js::createSpecialWeek` — mutation sans `logEvent` (tables: hr_special_weeks)
- [ ] `hrService.js::deleteSpecialWeek` — mutation sans `logEvent` (tables: hr_special_weeks)
- [ ] `hrService.js::deactivateWorkSchedule` — mutation sans `logEvent` (tables: work_schedules)
- [ ] `hrService.js::createAbsence` — mutation sans `logEvent` (tables: hr_absences)
- [ ] `hrService.js::updateAbsence` — mutation sans `logEvent` (tables: hr_absences)
- [ ] `hrService.js::reviewAbsence` — mutation sans `logEvent` (tables: hr_absences)
- [ ] `hrService.js::deleteAbsence` — mutation sans `logEvent` (tables: hr_absences)
- [ ] `hrService.js::createAbsenceRequestTask` — mutation sans `logEvent` (tables: —)
- [ ] `hrService.js::createAbsenceResponseTask` — mutation sans `logEvent` (tables: tasks)
- [ ] `hrService.js::createScheduleChange` — mutation sans `logEvent` (tables: hr_schedule_changes)
- [ ] `hrService.js::reviewScheduleChange` — mutation sans `logEvent` (tables: hr_schedule_changes)
- [ ] `hrService.js::deleteScheduleChange` — mutation sans `logEvent` (tables: hr_schedule_changes)
- [ ] `hrService.js::createScheduleChangeRequestTask` — mutation sans `logEvent` (tables: —)
- [ ] `hrService.js::createScheduleChangeResponseTask` — mutation sans `logEvent` (tables: tasks)
- [ ] `hrService.js::saveMinStaff` — mutation sans `logEvent` (tables: app_settings)

### Tâches — manques / câblage à vérifier

Créations détectées : `hrService.js::createAbsenceRequestTask`, `hrService.js::createAbsenceResponseTask`, `hrService.js::createScheduleChangeRequestTask`, `hrService.js::createScheduleChangeResponseTask`. Vérifier alignement catalogue `taskCatalog.js` + actions `taskActions.js`.

