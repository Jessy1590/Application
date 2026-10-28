# Phase 3b — Journal RCP densités faibles + assos 1 composant

**Date** : 2026-10-28T15:14:57.918Z → 2026-10-28T15:16:27.485Z
**Projet** : `kpjflntnotftpzffjbud`
**Parcours** : `cardiovasculaires_deust_2a`
**Règle** : Sources ONLY base-donnees-publique.medicaments.gouv.fr puis ema.europa.eu ; réutiliser entités ; pas d’invention

## Compteurs

| Statut | Nb |
|--------|----|
| OK enrichis | 4 |
| Skip documentés | 6 |
| Erreurs | 0 |
| Monos pending SQL | 0 |
| Monos non créés | 4 |

## OK enrichis (EMA / BDM)

- **Désirudine** — CIS `—` — source `ema_epar_pdf` — https://www.ema.europa.eu/fr/documents/product-information/revasc-epar-product-information_fr.pdf — reused 44/created 3 — _Revasc EPAR FR (AMM retirée) — densités CI/EI_
- **Lépirudine** — CIS `—` — source `ema_epar_pdf` — https://www.ema.europa.eu/fr/documents/product-information/refludan-epar-product-information_fr.pdf — reused 41/created 3 — _Refludan EPAR FR (AMM retirée) — densités CI/EI_
- **Rétéplase** — CIS `—` — source `ema_epar_pdf` — https://www.ema.europa.eu/fr/documents/product-information/rapilysin-epar-product-information_fr.pdf — reused 36/created 3 — _Rapilysin EPAR FR (AMM retirée 2024)_
- **Idarucizumab** — CIS `63555182` — source `ema_epar_pdf` — https://www.ema.europa.eu/fr/documents/product-information/praxbind-epar-product-information_fr.pdf — reused 23/created 3 — _Praxbind — re-apply CI (n_ci=0 après phase3)_

## Skips documentés

- **Streptokinase** — `no_cis_or_rcp_vide` — BDM FR vide ; pas d’EPAR EMA centralisé → skip
- **Ruscoside** — `no_cis_or_rcp_vide` — Cirkan absent ; hits Ruscus = homéopathie (rejeté)
- **Chlortalidone** — `no_cis_mono_fr_ema` — Partenaire Aténolol/Métoprolol+chlortalidone ; Tenoretic = asso seulement
- **Altizide** — `no_cis_mono_fr_ema` — Partenaire Spironolactone+altizide ; Aldactazine = asso seulement
- **Méthyclothiazide** — `no_cis_mono_fr_ema` — Partenaire Triamtérène+méthyclothiazide ; Prestol = triam+HCT (suspect)
- **Sacubitril** — `no_cis_mono_fr_ema` — Partenaire Sacubitril+valsartan ; Entresto = complexe (pas mono). Valsartan déjà lié.

## Monos composants assos

- **Chlortalidone** — not_created — no_cis_mono_fr_ema — 
- **Altizide** — not_created — no_cis_mono_fr_ema — 
- **Méthyclothiazide** — not_created — no_cis_mono_fr_ema — 
- **Sacubitril** — not_created — no_cis_mono_fr_ema — 

## Composants (liens)

- **Valsartan** sur asso `0415e982-3813-4b5c-8534-e93933343ce8` — Valsartan déjà en matrice_composants pour Sacubitril+valsartan

## Erreurs

*(aucune)*

## Vérification post-run (SQL)

| Métrique | Avant 3b | Après 3b |
|----------|----------|----------|
| Matrices liées parcours | 164 | **164** |
| Densité min OK (CI>0 ∧ EI>0) | 158 | **161** |
| Densités faibles | 6 | **3** |
| Assos ≥2 composants | 35 | **35** |
| Assos =1 composant | 5 | **5** |

### Densités faibles restantes

| DCI | Ind | CI | EI | Motif |
|-----|-----|----|----|-------|
| Idarucizumab | 2 | **0** | 3 | RCP Praxbind §4.3 = « **Aucune.** » — pas d’invention de CI |
| Ruscoside | 2 | 0 | 0 | Pas de CIS/RCP mono (Cirkan absent BDM ; Ruscus = homéopathie rejetée) |
| Streptokinase | 4 | 0 | 0 | Absent BDM FR ; pas d’EPAR EMA centralisé |

### Assos encore à 1 composant (monos non créables)

| Association | Composant lié | Mono manquant | Motif skip |
|-------------|---------------|---------------|------------|
| Aténolol + chlortalidone | Aténolol | Chlortalidone | Uniquement Tenoretic (asso) en BDM |
| Métoprolol + chlortalidone | Métoprolol | Chlortalidone | idem |
| Spironolactone + altizide | Spironolactone | Altizide | Uniquement Aldactazine (asso) |
| Triamtérène + méthyclothiazide | Triamtérène | Méthyclothiazide | Prestol = triam+HCT (CIS suspect) ; pas de méthyclothiazide FR |
| Sacubitril + valsartan | **Valsartan** (déjà lié) | Sacubitril | Entresto = complexe sacubitril/valsartan ; pas de mono |

## Hors scope

- Pas de pubs leçons / UI leçon-player.
- Pas de création mono sans CIS/RCP mono officiel.
