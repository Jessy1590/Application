# Phase 3 — Journal RCP Cardio DEUST

Date : 2026-10-28  
Sources : `base-donnees-publique.medicaments.gouv.fr` | `ema.europa.eu`  
Journal machine : [`sql/ops/phase3_rcp_journal.json`](../../sql/ops/phase3_rcp_journal.json)

## Totaux

| Statut | N |
|--------|---|
| OK enrichis | **4** |
| Skip documentés | **13** |
| Proxy (pas de create) | **2** |
| Erreurs | **0** |
| Entités réutilisées | 121 |
| Entités créées | 12 |
| Monos créés | **0** |

## Enrichis (OK)

| DCI | CIS | Source | reused | created |
|-----|-----|--------|--------|---------|
| Amiloride + furosémide | 63824615 (Logirene) | ansm_html | 48 | 3 |
| Idarucizumab | 63555182 (Praxbind) | epar_pdf | 24 | 3 |
| Naftazone | 60073451 (Etioven) | ansm_html | 15 | 3 |
| Folinate de calcium | 60666074 | ansm_html | 34 | 3 → **publie** |

## Composants backfill

- Clopidogrel + aspirine ← Acide acétylsalicylique
- Acide ascorbique + sulfate ferreux ← Sels ferreux (proxy)
- Amiloride + furosémide ← Amiloride + Furosémide (n_comp=2)

Liens totaux : **78**. Assos encore &lt;2 composants : **5** (monos chlortalidone / altizide / méthyclothiazide / sacubitril absents BDM mono).

## Skips / proxies (anti-invention)

Chlortalidone, Altizide, Méthyclothiazide, Sacubitril (pas de CIS mono FR) ; Aspirine→AAS ; Sulfate ferreux→Sels ferreux ; Désirudine, Lépirudine, Éprosartan, Rétéplase, Streptokinase, Ruscoside (absent BDM) ; Alginate Ca / Nébivolol+HCT / Triamtérène+méthyclothiazide (cis_suspect).

## Note audit §4.2

Densités angor/INCA/IDM/HTA/assos déjà majoritairement remplies par la campagne regen antérieure. Phase 3 a fermé les restes actionnables + journal CIS/source.

## Hors scope

Phase 2 (pubs leçon), Phase 4 (jeux), Phase 5 (QA E2E) — non faits.
