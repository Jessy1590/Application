# Phase 5 QA — Cardio DEUST enrichissement

**Date** : 2026-10-28  
**Projet** : `kpjflntnotftpzffjbud`  
**Parcours** : `cardiovasculaires_deust_2a`  
**Réf.** : plan `cardio_deust_enrichissement` · audit `AUDIT_CARDIO_DEUST_PHASE0.md` · livraisons `077` / `078` / phase3 / `079`

## Verdict global

**PASS** — aucun bug bloquant (critère orphelin, bloc molécule vide visible, jeu 079 manquant). Exceptions assos &lt;2 composants = skips Phase 3 documentés (monos absents BDM). Pas de correction SQL minimale requise.

| # | Contrôle | Verdict |
|---|----------|---------|
| 1 | Leçons prévues ≥1 mol (sauf physio) | **PASS** |
| 2 | 0 bloc `molecule` visible avec `matrice_ids=[]` | **PASS** |
| 3 | Critères `jeux` + bloc jeu alignés (sauf GB) | **PASS** |
| 4 | Assos parcours : composants ≥2 vs =1 | **PASS** *(5 skips doc)* |
| 5 | Pubs base surtout dci / nom_commercial | **PASS** *(note legacy)* |
| 6 | Jeux 079 présents et actifs | **PASS** |

---

## 1. Molécules par leçon (hors physio)

Exclusions attendues (§2) : `rappel_sang`, `pathologie_du_globule_blanc`, `cv_definitions`, `hta_rappel_pa`, `hta_raa`, `hta_clinique` → 0 mol OK.

| Code | Blocs mol | Σ `matrice_ids` | Verdict |
|------|-----------|-----------------|---------|
| pathologie_du_globule_rouge | 3 | 12 | PASS |
| pathologie_plaquettes | 1 | 4 | PASS |
| m_dicaments_du_gr | 5 | 28 | PASS |
| cv_angor | 5 | 25 | PASS |
| cv_idm | 1 | 8 | PASS |
| cv_arythmies | 3 | 8 | PASS |
| cv_ic | 1 | 10 | PASS |
| cv_arterite | 1 | 2 | PASS |
| cv_veines | 1 | 6 | PASS |
| cv_urgences | 1 | 1 | PASS |
| hta_classes | 1 | 54 | PASS |
| hta_associations | 1 | 36 | PASS |
| *(6 excl. physio)* | 0 | 0 | excl_physio |

**Résultat** : 12/12 leçons prévues **PASS** ; 6/6 exclusions OK.

---

## 2. Blocs molecule vides visibles

Requête : `type_bloc = 'molecule'` AND `visible` AND `matrice_ids` longueur 0.

**Résultat** : **0 ligne** → **PASS**.  
(Les anciens lots vides `cv_angor` / `hta_*` ont été remplis en Phase 2.)

---

## 3. Critères jeux ↔ blocs

Règle : chaque leçon sauf `pathologie_du_globule_blanc` a `criteres_json.jeux` non vide ; chaque `modele_id` critère apparaît dans un bloc `jeu` de la leçon.

| Leçon | Critères (codes) | Blocs | Verdict |
|-------|------------------|-------|---------|
| rappel_sang | JP-CSANG | JP-CSANG | PASS |
| pathologie_du_globule_rouge | JP-HZDNM | JP-HZDNM | PASS *(mismatch JP-CVS2 corrigé 079)* |
| pathologie_plaquettes | JP-PPLAQ | JP-PPLAQ | PASS |
| m_dicaments_du_gr | JP-MHSUM, JP-UNTF8 | JP-UNTF8, JP-MHSUM | PASS |
| pathologie_du_globule_blanc | [] | — | excl_GB |
| cv_definitions | JP-CVDF1 | JP-CVDF1 | PASS |
| cv_angor | JP-CVC1 | JP-CVC1 | PASS |
| cv_idm | JP-CVIDM | JP-CVIDM | PASS |
| cv_arythmies | JP-CVVW1 | JP-CVVW1 | PASS |
| cv_ic | JP-CVIC1 | JP-CVIC1 | PASS |
| cv_arterite | JP-CVART | JP-CVART | PASS |
| cv_veines | JP-CVVEI | JP-CVVEI | PASS |
| cv_urgences | JP-CVURG | JP-CVURG | PASS |
| hta_rappel_pa … hta_associations | JP-CVH1…5 | alignés | PASS |

**Résultat** : 17/17 leçons concernées **PASS** ; GB exclus OK. Aucun critère orphelin.

---

## 4. Associations / `matrice_composants`

Périmètre : DCI `% + %` liées au parcours (blocs molecule ∪ pubs actives).

| Métrique | Valeur |
|----------|--------|
| Liens `matrice_composants` (global) | **78** |
| Assos parcours total | **40** |
| ≥2 composants | **35** |
| =1 composant | **5** |
| =0 composant | **0** |

### Exceptions =1 (skips Phase 3 documentés)

| DCI | Motif (journal phase3) |
|-----|------------------------|
| Aténolol + chlortalidone | mono chlortalidone `no_cis_mono_fr` |
| Métoprolol + chlortalidone | idem |
| Spironolactone + altizide | mono altizide `no_cis_mono_fr` |
| Triamtérène + méthyclothiazide | mono méthyclothiazide + CIS suspect Prestol |
| Sacubitril + valsartan | mono sacubitril `no_cis_mono_fr` (Entresto seul) |

**Verdict** : **PASS** avec exceptions documentées (anti-invention — pas de mono inventé). UI couleurs / jeux asso : ces 5 restent partiels côté composants.

---

## 5. Spot-check pubs « base » (pas d’explosion RCP leçon)

**Global parcours** (pubs actives, connaissances non `retire`) : **747** pubs.

| champ_code | n | % |
|------------|---|---|
| nom_commercial | 204 | 27,3 |
| dci | 194 | 26,0 |
| *identité sous-total* | **398** | **53,3** |
| indications | 80 | 10,7 |
| effets_indesirables | 66 | 8,8 |
| autres cliniques / classes | … | reste |

### Par leçon — % identité (dci + nom_commercial)

| Leçon | % identité | Note |
|-------|------------|------|
| pathologie_du_globule_rouge | 23,5 | Legacy densités cliniques (pré-Phase 2) |
| m_dicaments_du_gr | 23,6 | idem (antiagrégants / ACO) |
| pathologie_plaquettes | 60,0 | léger hors identité |
| cv_angor | 72,6 | mix identité + quelques EI/CI |
| cv_idm, cv_ic, cv_arterite, cv_veines, cv_urgences, cv_arythmies, hta_classes, hta_associations | **100** | Sync Phase 2 = dci/nom uniquement |

**Verdict** : **PASS** pour l’objectif Phase 2/5 (« pas d’explosion RCP sur leçons ») : les leçons nouvellement liées sont 100 % identité. Les pubs cliniques concentrées sur GR / médicaments plaquettes / angor sont du **legacy cours** (hors lot 078 identité) — hors scope de purge massive Phase 5.

---

## 6. Jeux 079

18 codes attendus (`079_jeux_deust.sql`) : tous **présents**, `actif=true`, `en_pause=false`.

| Code | Type | Titre (extrait) |
|------|------|-----------------|
| JP-CSANG | quiz | Composition Sang |
| JP-HZDNM | classement | Pathologie GR — anémies |
| JP-PPLAQ | quiz | Pathologie Plaquettes |
| JP-UNTF8 | classement | Médicaments plaquettes — classes |
| JP-MHSUM | quiz | Médicaments plaquettes — mécanismes |
| JP-CVDF1 | appariement | Athérome |
| JP-CVC1 | quiz | Angor |
| JP-CVIDM | classement | IDM BASIC |
| JP-CVVW1 | appariement | Vaughan-Williams |
| JP-CVIC1 | classement | IC |
| JP-CVART | quiz | Artérite |
| JP-CVVEI | appariement | Veines |
| JP-CVURG | quiz | Urgences |
| JP-CVH1…JP-CVH5 | quiz/trous | HTA |

**Résultat** : **18/18 PASS**.

---

## Phase 3 (rappel journal — hors re-fetch)

Voir `PHASE3_RCP_JOURNAL.md` / `sql/ops/phase3_rcp_journal.json` : **4 OK**, **13 skip**, **2 proxy**, **0 erreur**. Aligné avec les 5 assos à 1 composant ci-dessus.

---

## Corrections Phase 5

**Aucune** — pas de bug bloquant évident (critère orphelin, molécule vide, jeu manquant).

## Suivi optionnel (hors scope)

- Compléter les 5 assos à 1 composant si un CIS mono FR/EMA devient disponible.
- Audit pédagogique des pubs cliniques legacy GR / plaquettes (alléger si trop « RCP ») — pas requis pour clôturer le plan.
- Smoke E2E joueur authentifié (lecture leçon + jouer un jeu 079).
`}