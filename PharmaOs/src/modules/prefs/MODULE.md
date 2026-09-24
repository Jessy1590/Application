# Module prefs

## 1. Identité

| Champ | Valeur |
|-------|--------|
| id | `prefs` |
| label | Préférences utilisateur |
| dossier | `src/modules/prefs/` |

Infrastructure partagée (Auth / Mon compte) — pas de feature access dédiée.

## 2. Taskbar

Pas d’entrée module. Consommé par Taskbar (thème, densité, polices, placement).

## 3. Dashboard

Pas de page dédiée. UI : `account/AccountPage.jsx`.

## 4. Services

| Fichier | Rôle |
|---------|------|
| `prefsService.js` | Lecture / upsert `user_preferences` ; apply thème / fonts |

## 5. Logs

Aucun `logEvent`.

## 6. Tâches

Aucune.

## 7. SQL

| Table | Colonnes / enums | RLS |
|-------|------------------|-----|
| `user_preferences` | thème (`clair`/`sombre`/`colore`/`bleu_dore`), densités, placements, `font_size_*` | own CRUD |

Migrations `045`–`047`.

---

## 8. Fonctions exportées (services)

_Inventaire issu du code (2026-09-23). Colonnes Log / Tâches = état actuel, pas la cible._

### `services/prefsService.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `applyTheme` | Mise à jour / action métier | `theme` | — | non | non |
| `applyFontSizes` | Mise à jour / action métier | `{ font_size_taskbar: tb = DEFAULT_PREFERENCES.font_size_t…` | — | non | non |
| `fetchPreferences` | Lecture / recherche — tables: user_preferences | `userId` | user_preferences | non | non |
| `upsertPreferences` | Création / enregistrement — tables: user_preferences | `userId, patch = {}` | user_preferences | non | non |

Autres exports (constantes / ré-exports) : `THEME_OPTIONS`, `PLACEMENT_OPTIONS`, `DENSITY_OPTIONS`, `FONT_SIZE_OPTIONS`, `DEFAULT_PREFERENCES`.

## 9. Handlers / actions UI

_Pas de composants JSX comptoir/dashboard/shared._

## 10. Formulaires & données

Pas d’UI propre. Champs table `user_preferences` (via `DEFAULT_PREFERENCES` / upsert patch) :

| Clé | Valeurs autorisées (constantes service) |
|-----|----------------------------------------|
| theme | ids `THEME_OPTIONS` |
| taskbar_placement | ids `PLACEMENT_OPTIONS` |
| taskbar_density | ids `DENSITY_OPTIONS` |
| font_size_taskbar / font_size_dashboard | ids `FONT_SIZE_OPTIONS` |

UI : `account/AccountPage.jsx` + application live Taskbar (`applyTheme`, `applyFontSizes`).


## 11. Données affichées

| Source (fonction / requête) | Colonnes / usage UI |
|-----------------------------|---------------------|
| `prefsService.js::fetchPreferences` | tables/RPC : user_preferences |

## 12. Gap logs / tasks (propositions)

_Propositions uniquement — ne pas implémenter depuis cette checklist sans validation produit._

### Logs probablement manquants

- [ ] `upsertPreferences` — seul candidat sérieux (persist prefs). `applyTheme` / `applyFontSizes` = helpers DOM, pas prioritaires.


### Tâches — manques / câblage à vérifier

Aucune tâche à prévoir pour les préférences UI.
