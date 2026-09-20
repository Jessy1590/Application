# À traiter & mes saisies (ex-Dashboard équipe)

> **Statut :** implémenté via le module **`inbox`** (taskbar + dashboard), rôles canoniques actuels.
> Ancien cadrage « rôle `équipe` / dashboard séparé » — **obsolète**.

## Besoin

Permettre à chaque collaborateur (surtout **préparateur**) de :

1. Voir sa **file « À traiter »** (tâches du jour, appels à rappeler, IP en attente, NC, stock ouvert).
2. **Corriger ses propres saisies** non clôturées (appels, Act-IP, qualité, erreurs stock).

Sans accès supervision globale ni actions réservées (matrice Accès & rôles).

## Implémentation

| Surface | Feature | UI |
|---------|---------|-----|
| Taskbar | `inbox` | Module `#inbox` — [`Inbox.jsx`](../../src/modules/inbox/comptoir/Inbox.jsx) |
| Dashboard | `inbox` | [`InboxManager.jsx`](../../src/modules/inbox/dashboard/InboxManager.jsx) — défaut aussi pour préparateur |

Service : [`inboxService.js`](../../src/modules/inbox/services/inboxService.js).

RLS autocorrection : migration `042_mes_saisies_rls_own_update.sql` (UPDATE own sur `call_logs` / `quality_events` / `stock_errors` si non clôturé ; admin policies alignées sur `is_pharma_admin`).

## Verrouillage

- Appels : pas de correction si `cloture` / `annule`
- IP : pas si `Cloturee` / `Annulee`
- Qualité : pas si `cloture` / `annule`
- Stock : seulement `ouvert` / `pending` / `en_attente`

## Non-objectifs (inchangés)

- Stats globales, exports, clôture globale des tâches d’autrui
- CRUD annuaire / GED / RH validation pour un préparateur sans grant
- Suppression définitive des traces audit
- Remplacement du LGO

## Pont LGO

Hors scope de ce module. CIP / WinPharma : en attente d’infos techniques.
