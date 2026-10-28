# Phase 3 — Journal RCP Cardio DEUST

Date : 2026-10-28T14:45:38.828Z
Sources : base-donnees-publique.medicaments.gouv.fr | ema.europa.eu

## Totaux

| Statut | N |
|--------|---|
| OK enrichis | 4 |
| Skip documentés | 13 |
| Proxy (pas de create) | 2 |
| Erreurs | 0 |
| Entités réutilisées | 121 |
| Entités créées | 12 |

## Composants backfill

- **Clopidogrel + aspirine** ← Acide acétylsalicylique (`de52a954-d5c1-434a-ab55-df2d6af685d3`) — aspirine → AAS
- **Acide ascorbique + sulfate ferreux** ← Sels ferreux (`d122d669-2f7c-48ed-a517-aa6e4bd765b8`) — sulfate ferreux → proxy sels ferreux

## Entrées

| DCI | CIS | Source | reused | created | status |
|-----|-----|--------|--------|---------|--------|
| Chlortalidone | — | — | 0 | 0 | skip (no_cis_mono_fr — uniquement en asso (Tenoretic CIS 62980497) ; pas de création m) |
| Altizide | — | — | 0 | 0 | skip (no_cis_mono_fr — uniquement en asso (Aldactazine CIS 69724251)) |
| Méthyclothiazide | — | — | 0 | 0 | skip (no_cis_fr — search_products vide ; Prestol = triamtérène+HCT (pas méthyclothiazi) |
| Sacubitril | — | — | 0 | 0 | skip (no_cis_mono_fr — uniquement complexe Entresto (sacubitril+valsartan)) |
| Sulfate ferreux | 61879666 | proxy_sels_ferreux | 1 | 0 | skip_create_proxy (proxy → fiche existante Sels ferreux (Tardyferon CIS 61879666) ; pas de 2e mono) |
| Aspirine | — | proxy_aas | 1 | 0 | skip_create_proxy (mapper → Acide acétylsalicylique existant (déjà densifié)) |
| Désirudine | — | — | 0 | 0 | skip (manual_absent_bdm — Revasc absent BDM FR ; pas d’invention) |
| Lépirudine | — | — | 0 | 0 | skip (manual_absent_bdm — Refludan absent BDM FR) |
| Éprosartan | — | — | 0 | 0 | skip (manual_absent_bdm — Teveten absent BDM FR) |
| Rétéplase | — | — | 0 | 0 | skip (manual_absent_bdm — Rapilysin/reteplase absent BDM FR) |
| Streptokinase | — | — | 0 | 0 | skip (manual_absent_bdm — Streptase absent BDM FR) |
| Ruscoside | — | — | 0 | 0 | skip (manual_absent_bdm — Cirkan/ruscoside absent ; hits Ruscus = homéopathie (rejeté)) |
| Alginate de calcium | 63517694 | — | 0 | 0 | skip (cis_suspect — CIS alginate/sodium 63517694 ≠ pansement calcique) |
| Nébivolol + hydrochlorothiazide | 67856966 | — | 0 | 0 | skip (cis_suspect + no_asso_cis_fr — 67856966 = nébivolol mono ; search asso HCT vide) |
| Triamtérène + méthyclothiazide | 63870751 | — | 0 | 0 | skip (cis_suspect — 63870751 Prestol = triamtérène+HCT (pas méthyclothiazide) ; pas de) |
| Amiloride + furosémide | 63824615 | ansm_html | 48 | 3 | ok |
| Idarucizumab | 63555182 | epar_pdf | 24 | 3 | ok |
| Naftazone | 60073451 | ansm_html | 15 | 3 | ok |
| Folinate de calcium | 60666074 | ansm_html | 34 | 3 | ok |

## Monos non créés (règle anti-invention)

Chlortalidone, Altizide, Méthyclothiazide, Sacubitril : **aucun CIS mono FR** → skip ; `matrice_composants` reste à 1 lien pour les assos concernées jusqu’à apparition d’un RCP mono officiel.

## Vérification post-run

| DCI | Ind | CI | EI | Comp | CIS | Note |
|-----|-----|----|----|------|-----|------|
| Amiloride + furosémide | 1 | 7 | 7 | 2 | 63824615 | Logirene (cis_suspect corrigé) |
| Idarucizumab | 2 | 0 | 3 | 0 | 63555182 | EPAR PDF |
| Naftazone | 1 | 2 | 1 | 0 | 60073451 | Etioven |
| Folinate de calcium | 1 | 4 | 7 | 0 | 60666074 | statut **publie** |

- Liens `matrice_composants` : **78**
- Assos encore &lt;2 composants : **5** (chlortalidone×2, altizide, méthyclothiazide, sacubitril)
- Monos créés cette phase : **0**
- Audit §4.2 : densités déjà majoritairement OK ; Phase 3 = restes + CIS Logirene + skips documentés

## Hors scope

- Pas de pubs leçon (Phase 2)
- Pas de jeux (Phase 4)
- Pas de QA E2E (Phase 5)
