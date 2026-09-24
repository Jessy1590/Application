# Module account

## 1. Identité

| Champ | Valeur |
|-------|--------|
| id | `account` |
| label | Mon compte |
| dossier | `src/modules/account/` |

## 2. Taskbar

| Élément | Valeur |
|---------|--------|
| Feature ids (`access.js`) | — (pas de feature taskbar) |
| Vues `module-main` | — |
| Composants comptoir | — |

## 3. Dashboard

| Élément | Valeur |
|---------|--------|
| Page ids (`navConfig` / `DashboardShell`) | `account` |
| Composants | `dashboard/AccountPage.jsx` |
| `canAccess` | `canAccess('dashboard', 'account')` — défaut : tous les rôles staff |

## 4. Services

| Fichier | Rôle |
|---------|------|
| — | Pas de `*Service.js` dédié (préférences via `prefs/prefsService.js` + `AuthContext.updatePreferences`) |

## 5. Logs

Aucun `logEvent` dans ce module. Surfaces shell : `ui` / `navigate` hors module.

## 6. Tâches

| Source | Types |
|--------|-------|
| `taskCatalog.js` (`module`) | — |
| Créés par services | — |
| `taskActions.js` | — |

## 7. SQL

Pas de dossier `sql/`. Prefs utilisateur : voir module `prefs/`.

---

## 8. Fonctions exportées (services)

_Aucun service local. Consommation :_

| Source | Fonction | Rôle | Tables | Tâches ? | Log ? |
|--------|----------|------|--------|----------|-------|
| `prefs/prefsService.js` | `upsertPreferences` (via `AuthContext.updatePreferences`) | Persiste patch prefs | `user_preferences` | non | non |
| `prefs/prefsService.js` | constantes `THEME_OPTIONS`, `PLACEMENT_OPTIONS`, `DENSITY_OPTIONS`, `FONT_SIZE_OPTIONS` | Options UI | — | non | non |
| `shared/windowService.js` | `openExternal` | Ouvre Portail Application | — | non | non |

## 9. Handlers / actions UI

### `dashboard/AccountPage.jsx`

| Action / label | Handler | Appels | Feedback |
|----------------|---------|--------|----------|
| Select Thème | `save({ theme })` | `updatePreferences` | « Préférences enregistrées » / erreur |
| Select Placement | `save({ taskbar_placement })` | idem | idem |
| Select Densité | `save({ taskbar_density })` | idem | idem |
| Select police Taskbar | `save({ font_size_taskbar })` | idem | idem |
| Select police Dashboard | `save({ font_size_dashboard })` | idem | idem |
| « Ouvrir le Portail » | `openPortail('/')` | `openExternal(VITE_PORTAIL_URL)` | erreur si URL absente |
| « Changer le mot de passe » | `openPortail('/#mot-de-passe')` | `openExternal` | idem |

Affichage lecture : `profile.display_name` / `user.email` (pas d’édition Auth ici).

## 10. Formulaires & données

Pas de formulaire métier. Champs prefs (select) :

| Clé | Label UI | Type | Requis | Valeurs (`prefsService`) |
|-----|----------|------|--------|--------------------------|
| theme | Thème | select | oui (défaut) | ids de `THEME_OPTIONS` |
| taskbar_placement | Placement | select | oui | ids de `PLACEMENT_OPTIONS` |
| taskbar_density | Densité | select | oui | ids de `DENSITY_OPTIONS` |
| font_size_taskbar | Barre d’outils | select | oui | ids de `FONT_SIZE_OPTIONS` |
| font_size_dashboard | Dashboard | select | oui | ids de `FONT_SIZE_OPTIONS` |

**Save** : patch immédiat à chaque change → `upsertPreferences`.  
**Load** : prefs depuis `AuthContext` (hydratées au login via `fetchPreferences`).

## 11. Données affichées

| Source | Colonnes / usage |
|--------|------------------|
| `profile` / `user` | display_name, email |
| `preferences` | thème, placement, densités, font sizes |

## 12. Gap logs / tasks (propositions)

_Propositions uniquement._

### Logs

- [ ] `prefsService.upsertPreferences` (appelé depuis cette page) — pas de `logEvent` (faible bruit : optionnel category `prefs` / `ui`).
- [ ] Pas de log à l’ouverture Portail (optionnel `ui` / `external_link`).

### Tâches

Aucune tâche pertinente pour Mon compte.
