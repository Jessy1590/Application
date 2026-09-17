# État PhieEvreux (handoff)

Dernière mise à jour : 2026-09-17.

## Périmètre
Hub vanilla + apps `anciennelocation` (historique) et `location` (métier actif). Schéma Supabase `phieevreux`, site UUID `9dd064a4-13ec-4cc2-9707-29210c3744ce`.

## Location — fait
- Modules tuiles : Création, Prolongation, Clôture, Suivi, Contact, Facture, Parc, Paramètres.
- Matrice `acces_roles` complète (`module_*`, `edition_suivi`, impression, suppression, paramètres) ; alias `cloture_dossier` → `module_cloture`.
- LGO : `template_id` sur règles + fallback seuil `seuil_reclame_mois` (`resolveLgo`) ; pas de contacts inventés.
- Création : mise en attente (`statut: en_attente`) + reprise.
- Prolongation : `date_fin` = fin courante + durée ; UI type Suivi.
- Clôture : module dédié + meta (`appareil_rendu_*`, `caution_rendue_*`, `cloture_op`…).
- Contact : files Commentaire / Appel / Attente / Perte.
- Textes UI (hints) : plan `.cursor/plans/textes-front-ui.md` — items appliqués.
- Impression fiche A4 (`LocationPrint.buildFicheHtml`) : haut Patient+Personnel | Appareil ; Suivi auto toutes lignes + blancs ; pied clôture manuscrite.

## Fichiers clés Location
- Data / droits : `js/data.js`, `js/access.js`
- LGO : `modules/rules-engine.js`
- Impression : `js/impression.js` → `LocationPrint`
- Pages métier : `creation|prolongation|cloture|suivi|contact|facture|parc.js`

## En cours / à valider
- [ ] Valider visuellement une impression A4 réelle (navigateur) vs quadrillage demandé.
- [ ] Ajustements fins mise en page print si overflow / densités dossiers riches.

## Ne pas
- Inventer UI / flux / templates LGO hors demande.
- Réappliquer `sql/*.sql` sans vérifier l’état Supabase.
- Utiliser `service_role` côté client.
- Nommer le global print `LocationImpression` (c’est `LocationPrint`).

## Règles Cursor
- `rules/architecture.mdc`, `security.mdc`, `ne-rien-inventer.mdc` (always)
- `rules/conventions.mdc`, `rules/location.mdc` (globs)
