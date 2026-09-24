# Module admin

## 1. Identité

| Champ | Valeur |
|-------|--------|
| id | `admin` (pages : `logs`, `bugs`, `access`, `parametres`) |
| label | Administration |
| dossier | `src/modules/admin/` |

## 2. Taskbar

| Élément | Valeur |
|---------|--------|
| Feature ids | — |
| Vues `module-main` | — |
| Composants comptoir | — |

## 3. Dashboard

| Élément | Valeur |
|---------|--------|
| Page ids | `logs`, `bugs`, `access`, `parametres` (+ alias legacy `location_parametres`, `magistral_parametres` → Paramètres) |
| Composants | `LogsManager`, `BugsManager`, `AccessManager`, `SettingsManager`, `GeneralSettingsPanel`, `MailTemplatesSettings`, `LogsCharts` |
| `canAccess` | `logs` / `bugs` / `parametres` : pharmacien + administrateur (défaut) ; `access` : administrateur seul ; `parametres` aussi si accès à un module de `SETTINGS_MODULE_FEATURES` (`location`, `magistral`, `perimes`, `cash`) |

## 4. Services

| Fichier | Rôle |
|---------|------|
| `accessService.js` | Matrice `role_access`, rôles profils, widgets, `task_role_rules` |
| `adminLogService.js` | Lecture / agrégats `app_logs` |
| `bugService.js` | CRUD signalements `bugs` |
| `casquetteService.js` | Casquettes + grants features |
| `pharmacySettingsService.js` | `app_settings` clé `pharmacy` |
| `mailTemplatesService.js` / `mailTemplatesCatalog.js` | Templates mail transactionnels |
| `settingsNav.js` | Sous-onglets Paramètres |

## 5. Logs (`app_logs`)

| category | action(s) |
|----------|-----------|
| `access` | `grant` / `revoke`, `change_role`, `show_widget` / `hide_widget`, `set_task_rule`, `create_casquette`, `update_casquette`, `set_casquette_features`, `set_profile_casquettes` |
| `bug` | `submit`, `update_statut` |
| `settings` | `save_pharmacy`, `save_mail_templates` |

Tables journal / admin : `PharmaOs.app_logs`, `PharmaOs.bugs`.

## 6. Tâches

| Source | Types |
|--------|-------|
| Catalogue | — (admin gère `task_role_rules`, pas de création métier) |
| `taskActions.js` | — |

## 7. SQL

Source : `sql/README.md` + migrations `024_roles_logs_bugs.sql`, `025_roles_logs_harden.sql`.

| Table | Colonnes / notes clés | RLS |
|-------|----------------------|-----|
| `app_logs` | journal applicatif | admin lecture |
| `bugs` | signalements | policies staff / admin |
| `role_access` | matrice rôle × surface × feature | admin |
| `casquettes` / `casquette_features` / `profile_casquettes` | grants | admin |
| `role_dashboard_widgets` | widgets home | admin |
| `task_role_rules` | assignation tâches | admin |

---

## 8. Fonctions exportées (services)

_Inventaire issu du code (2026-09-23). Colonnes Log / Tâches = état actuel, pas la cible._

### `services/accessService.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `fetchRoleAccess` | Lecture / recherche — tables: role_access | `—` | role_access | non | non |
| `upsertRoleAccess` | Création / enregistrement — tables: role_access | `role, surface, featureId, allowed, userId` | role_access | non | oui (`access`) |
| `fetchAllProfiles` | Lecture / recherche — tables: profiles | `—` | profiles | non | non |
| `updateProfileRole` | Mise à jour / action métier — tables: profiles | `profileId, role, actorName, { actorId } = {}` | profiles | non | oui (`access`) |
| `fetchRoleDashboardWidgets` | Lecture / recherche — tables: role_dashboard_widgets | `—` | role_dashboard_widgets | non | non |
| `upsertRoleDashboardWidget` | Création / enregistrement — tables: role_dashboard_widgets | `role, widgetId, visible, userId` | role_dashboard_widgets | non | oui (`access`) |
| `fetchTaskRoleRules` | Lecture / recherche — tables: task_role_rules | `—` | task_role_rules | non | non |
| `upsertTaskRoleRule` | Création / enregistrement — tables: task_role_rules | `category, role, mode, delayHours, userId` | task_role_rules | non | oui (`access`) |

### `services/adminLogService.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `fetchAppLogs` | Lecture / recherche — tables: app_logs | `{ level = 'all', category = 'all', search = '', sinceHour…` | app_logs | non | non |
| `fetchLogCategories` | Lecture / recherche — tables: app_logs | `—` | app_logs | non | non |
| `fetchAppLogStats` | Lecture / recherche — tables: app_logs | `{ sinceHours = 48 } = {}` | app_logs | non | non |
| `aggregateLogStats` | Lecture / recherche | `rows, sinceHours = 48` | — | non | non |

### `services/bugService.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `createBug` | Création / enregistrement — tables: bugs | `{ userId, userName, information }` | bugs | non | oui (`bug`) |
| `fetchBugs` | Lecture / recherche — tables: bugs | `{ statut = 'all' } = {}` | bugs | non | non |
| `fetchBugStats` | Lecture / recherche — tables: bugs | `{ days = 30 } = {}` | bugs | non | non |
| `updateBugStatut` | Mise à jour / action métier — tables: bugs | `id, statut, { userId, userName }` | bugs | non | oui (`bug`) |

Autres exports (constantes / ré-exports) : `BUG_STATUTS`, `BUG_STATUT_LABELS`.

### `services/casquetteService.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `fetchCasquettes` | Lecture / recherche — tables: casquettes | `{ activeOnly = false } = {}` | casquettes | non | non |
| `fetchCasquetteFeatures` | Lecture / recherche — tables: casquette_features | `casquetteId = null` | casquette_features | non | non |
| `fetchAllProfileCasquettes` | Lecture / recherche — tables: profile_casquettes | `—` | profile_casquettes | non | non |
| `fetchMyCasquetteGrants` | Lecture / recherche — tables: profile_casquettes, casquettes, casquette_features | `profileId` | profile_casquettes, casquettes, casquette_features | non | non |
| `createCasquette` | Création / enregistrement — tables: casquettes | `{ slug, label, description }, userId` | casquettes | non | oui (`access`) |
| `updateCasquette` | Mise à jour / action métier — tables: casquettes | `id, patch, userId` | casquettes | non | oui (`access`) |
| `setCasquetteFeatures` | Mise à jour / action métier — tables: casquette_features, casquettes | `casquetteId, featureRows, userId` | casquette_features, casquettes | non | oui (`access`) |
| `setProfileCasquettes` | Mise à jour / action métier — tables: profile_casquettes | `profileId, casquetteIds, actorName` | profile_casquettes | non | oui (`access`) |

### `services/mailTemplatesCatalog.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `asTemplateObj` | Helper pur / formatage | `raw, def = { subject: '', body: '' }` | — | non | non |
| `getDefaultTemplate` | Lecture / recherche | `moduleId, key` | — | non | non |
| `renderPlaceholders` | Helper pur / formatage | `text, ctx` | — | non | non |

Autres exports (constantes / ré-exports) : `MAIL_MODULES`, `MAIL_PLACEHOLDERS_BY_MODULE`, `MAIL_TEMPLATE_DEFS`, `DEFAULT_MAIL_TEMPLATES`.

### `services/mailTemplatesService.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `fetchMailTemplates` | Lecture / recherche — tables: app_settings | `{ force = false } = {}` | app_settings | non | non |
| `invalidateMailTemplatesCache` | Helper pur / formatage | `—` | — | non | non |
| `getMailTemplatesForEdit` | Lecture / recherche | `—` | — | non | non |
| `saveMailTemplates` | Création / enregistrement — tables: app_settings | `tree` | app_settings | non | oui (`settings`) |
| `resolveMailTemplate` | Mise à jour / action métier | `moduleId, key, legacyModuleSettings = null` | — | non | non |
| `renderAppMail` | Helper pur / formatage | `moduleId, key, ctx = {}, legacyModuleSettings = null` | — | non | non |

Autres exports (constantes / ré-exports) : `getDefaultTemplate`, `renderPlaceholders`.

### `services/pharmacySettingsService.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `invalidatePharmacyCache` | Helper pur / formatage | `—` | — | non | non |
| `fetchPharmacySettings` | Lecture / recherche — tables: app_settings | `{ force = false } = {}` | app_settings | non | non |
| `getPharmacySettingsForEdit` | Lecture / recherche — tables: magistral_settings | `—` | magistral_settings | non | non |
| `savePharmacySettings` | Création / enregistrement — tables: app_settings | `input` | app_settings | non | oui (`settings`) |
| `pharmacyToMailFields` | Helper pur / formatage | `pharmacy` | — | non | non |
| `mergePharmacyIntoSettings` | Helper pur / formatage | `settings, pharmacy` | — | non | non |
| `loadSettingsWithPharmacy` | Lecture / recherche | `settings` | — | non | non |

Autres exports (constantes / ré-exports) : `EMPTY_PHARMACY`.

### `services/settingsNav.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `resolveSettingsTab` | Mise à jour / action métier | `raw` | — | non | non |

Autres exports (constantes / ré-exports) : `SETTINGS_TABS`.

## 9. Handlers / actions UI

### `dashboard/AccessManager.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleRole` | `setErr`, `updateProfileRole`, `upsertRoleAccess`, `fetchRoleAccess`, `setOverrides` | erreur UI, succès / feedback |
| — | `handleToggle` | `setErr`, `upsertRoleAccess`, `fetchRoleAccess`, `setOverrides`, `delete`, `setProfileCasquettes`, `setProfileCasquettesState`, `fetchAllProfileCasquettes` | erreur UI, succès / feedback |
| — | `handleProfileCasquettes` | `setErr`, `delete`, `setProfileCasquettes`, `setProfileCasquettesState`, `fetchAllProfileCasquettes`, `createCasquette`, `setNewCasq` | erreur UI, succès / feedback |
| — | `handleCreateCasquette` | `setErr`, `createCasquette`, `setNewCasq`, `setSelectedCasquetteId`, `updateCasquette` | erreur UI, succès / feedback |
| — | `handleToggleCasquetteActive` | `updateCasquette`, `setErr`, `delete`, `setCasquetteFeatures`, `setCasquetteFeaturesState`, `fetchCasquetteFeatures` | erreur UI |
| — | `handleToggleCasquetteFeature` | `setErr`, `delete`, `setCasquetteFeatures`, `setCasquetteFeaturesState`, `fetchCasquetteFeatures` | erreur UI |
| — | `handleWidgetToggle` | `setErr`, `upsertRoleDashboardWidget`, `setWidgets`, `fetchRoleDashboardWidgets`, `upsertTaskRoleRule`, `setTaskRules`, `fetchTaskRoleRules` | erreur UI |
| — | `handleTaskRule` | `setErr`, `upsertTaskRoleRule`, `setTaskRules`, `fetchTaskRoleRules` | erreur UI |

### `dashboard/BugsManager.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleStatut` | `updateBugStatut`, `setErr`, `setStatut` | erreur UI |

## 10. Formulaires & données

_Pas de formulaire partagé détecté ; champs éventuels dans les composants comptoir/dashboard (voir §9)._

## 11. Données affichées

| Source (fonction / requête) | Colonnes / usage UI |
|-----------------------------|---------------------|
| `accessService.js::fetchRoleAccess` | tables/RPC : role_access |
| `accessService.js::fetchAllProfiles` | tables/RPC : profiles |
| `accessService.js::fetchRoleDashboardWidgets` | tables/RPC : role_dashboard_widgets |
| `accessService.js::fetchTaskRoleRules` | tables/RPC : task_role_rules |
| `adminLogService.js::fetchAppLogs` | tables/RPC : app_logs |
| `adminLogService.js::fetchLogCategories` | tables/RPC : app_logs |
| `adminLogService.js::fetchAppLogStats` | tables/RPC : app_logs |
| `adminLogService.js::aggregateLogStats` | tables/RPC : — |
| `bugService.js::fetchBugs` | tables/RPC : bugs |
| `bugService.js::fetchBugStats` | tables/RPC : bugs |
| `casquetteService.js::fetchCasquettes` | tables/RPC : casquettes |
| `casquetteService.js::fetchCasquetteFeatures` | tables/RPC : casquette_features |
| `casquetteService.js::fetchAllProfileCasquettes` | tables/RPC : profile_casquettes |
| `casquetteService.js::fetchMyCasquetteGrants` | tables/RPC : profile_casquettes, casquettes, casquette_features |
| `mailTemplatesCatalog.js::getDefaultTemplate` | tables/RPC : — |
| `mailTemplatesService.js::fetchMailTemplates` | tables/RPC : app_settings |
| `mailTemplatesService.js::getMailTemplatesForEdit` | tables/RPC : — |
| `pharmacySettingsService.js::fetchPharmacySettings` | tables/RPC : app_settings |
| `pharmacySettingsService.js::getPharmacySettingsForEdit` | tables/RPC : magistral_settings |
| `pharmacySettingsService.js::loadSettingsWithPharmacy` | tables/RPC : — |

## 12. Gap logs / tasks (propositions)

_Propositions uniquement — ne pas implémenter depuis cette checklist sans validation produit._

### Logs probablement manquants

- [ ] `mailTemplatesService.js::resolveMailTemplate` — mutation sans `logEvent` (tables: —)
- [ ] `settingsNav.js::resolveSettingsTab` — mutation sans `logEvent` (tables: —)

### Tâches — manques / câblage à vérifier

- [ ] Module sans création de tâche détectée — confirmer si des événements métier devraient en produire.

