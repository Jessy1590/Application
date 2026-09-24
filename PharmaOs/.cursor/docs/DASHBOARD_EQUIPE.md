# À traiter & mes saisies (ex-Dashboard équipe)

> **Statut :** hub unifié — **À traiter** = modèle tasks ; **Mes saisies** = autocorrection 72h.
> Ancien cadrage « rôle `équipe` / dashboard séparé » et double UI Inbox agrégat + Mes tâches — **obsolète**.

## Besoin

Permettre à chaque collaborateur (surtout **préparateur**) de :

1. Voir sa **file « À traiter »** (assignations `en_cours`, clôture + suivi, actions typées).
2. **Corriger ses propres saisies** encore éditables (règle B 72h : tous modules métier avec fiche propriétaire — voir ci-dessous).

Sans accès supervision globale ni actions réservées (matrice Accès & rôles).

## Implémentation

| Surface | Feature | UI |
|---------|---------|-----|
| Taskbar | `inbox` (alias `tasks`) | Module `#inbox` / `#tasks` — [`Tasks.jsx`](../../src/modules/tasks/comptoir/Tasks.jsx) titre « À traiter » |
| Dashboard | `inbox` (alias `tasks` → page inbox) | [`TasksManager.jsx`](../../src/modules/tasks/dashboard/TasksManager.jsx) |
| Dashboard | `inbox_saisies` → accès `inbox` | [`InboxSaisiesManager`](../../src/modules/inbox/dashboard/InboxManager.jsx) + [`Inbox.jsx`](../../src/modules/inbox/comptoir/Inbox.jsx) mode `saisies` |

Actions hub : registre [`taskActions.js`](../../src/modules/tasks/shared/taskActions.js) — `close` | `dashboard` | `resume`.

Service saisies : [`inboxService.js`](../../src/modules/inbox/services/inboxService.js).

Nav Quotidien : **À traiter** | **Mes saisies** | Agenda — **pas** d’entrée « Mes tâches » séparée.

## Mes saisies — règle B (72h)

Éditable si **créateur** + **`created_at` &lt; 72h** + **non clôturé/annulé** + **`updated_by` null ou = soi**.

- Migration `042_mes_saisies_rls_own_update.sql` (base own UPDATE).
- Migration `048_mes_saisies_72h_updated.sql` : `call_logs`, `act_ip_logs`, `quality_events`, `stock_errors`.
- Migration `050_mes_saisies_all_modules.sql` : litiges, périmés, magistrales, location (dossiers + contacts), RH (absences / horaires en attente), caisse, stupéfiants, MDS (unités / mouvements), documents, conseils.

## Verrouillage (statuts) — aperçu

- Appels / IP / Qualité / Stock : inchangé (`048`)
- Litiges : pas si `clos` / `annule` · Périmés : pas si `clos` · Magistrales : pas si `cloture` / `dispense` / `refuse`
- Location dossiers : pas si `cloture` / `annule` · Contacts : pas si `resolu` / `annule`
- RH : seulement `en_attente` · Stupéfiants : hors statuts clos · MDS unités : `en_stock` · Caisse / docs / mouvements MDS : fenêtre 72h (+ `updated_by`)
- Conseils : actifs seulement

(+ fenêtre 72h et garde `updated_by`, alignées UI / RLS.)

## Non-objectifs (inchangés)

- Stats globales, exports, clôture globale des tâches d’autrui
- CRUD annuaire / GED / RH validation pour un préparateur sans grant
- Suppression définitive des traces audit
- Remplacement du LGO
- Backfill tâche pour chaque saisie historique sans assignation

## Pont LGO

Hors scope de ce module. CIP / WinPharma : en attente d’infos techniques.
