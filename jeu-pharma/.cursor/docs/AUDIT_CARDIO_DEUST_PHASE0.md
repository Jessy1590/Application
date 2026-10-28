# Audit Phase 0 — Cardio DEUST 2A

**Date** : 2026-10-28  
**Parcours remote** : `cardiovasculaires_deust_2a` (projet Supabase `kpjflntnotftpzffjbud`)  
**Périmètre** : lecture seule (inventaire leçons, remap `sql/033`, gaps référentiel, associations, propositions jeux)  
**Gate** : validation utilisateur requise avant phases 1–5. **Ce document ne modifie pas le plan.**

---

## 1. Remap 033 → codes remote actuels

Sources locales complémentaires ([Mapping-033](8c97fb5c-1d6b-41eb-ac37-86fd0da1195c)) : `049_merge_anemies_dans_globule_rouge.sql`, `060_quiz_deblocage_composition_plaquettes.sql`, `073_parcours_cardiovasculaires_v2.sql`, `STATE.md`.

| Code 033 | Code remote proposé | Confiance | Notes |
|----------|---------------------|-----------|-------|
| `sang_rappel` | `rappel_sang` | haute | Titre remote « Composition Sang » ; seed_keys 035 encore `035:sang_rappel:*` ; `060`/`073` |
| `sang_anemies` | `pathologie_du_globule_rouge` | haute | `049` : leçon `sang_anemies` **supprimée** / fusion GR |
| `sang_antiagregants` | `m_dicaments_du_gr` | haute (fusion) | `073` blocs antiagrégants ← cette leçon |
| `sang_anticoagulants` | `m_dicaments_du_gr` | haute (fusion) | Même leçon ; titre remote trompeur « Médicaments plaquettes » |
| `sang_hemophilies` | `pathologie_plaquettes` | moyenne | seed_key `035:sang_hemophilies:*` ; `073` copie depuis pathologie plaquettes (pas de code `sang_hemophilies` remote) |
| `cv_angor` | `cv_angor` | haute | — |
| `cv_idm` | `cv_idm` | haute | — |
| `cv_arythmies` | `cv_arythmies` | haute | — |
| `cv_ic` | `cv_ic` | haute | — |
| `cv_veines` | **scindé** : `cv_arterite` + `cv_veines` | moyenne | Voir détail DCI ci-dessous ; **pas** de `cv_hemorroides` sur DEUST remote (hémorroïdes restent dans `cv_veines`) |
| `cv_urgences` | `cv_urgences` | haute | — |
| `hta_classes` | `hta_classes` | haute | — |
| `hta_associations` | `hta_associations` | haute | Lot 13 = requête dynamique `DCI LIKE '% + %'` |

### Détail lot `cv_veines` (033) → remote DEUST

| DCI 033 | Leçon remote proposée | Confiance |
|---------|----------------------|-----------|
| Naftidrofuryl · Piribédil | `cv_arterite` | moyenne |
| Trimétazidine | `cv_angor` **ou** `cv_arterite` | **basse** (anti-angoreux vs artérite) |
| Fraction flavonoïque · Diosmine · Ginkgo · Troxérutine · Ruscoside · Naftazone | `cv_veines` (veinotoniques + crises hémorroïdaires) | moyenne |

### Leçons remote hors lots 033 (pas de molécules planifiées dans 033)

| Code | Titre | Rôle |
|------|-------|------|
| `cv_definitions` | Athérome et artériosclérose | Physio / définitions |
| `cv_arterite` | Artérite | Scindée vs ancien `cv_veines` (033 n’avait pas ce code) |
| `hta_rappel_pa` | Rappel PA | Physio PA |
| `hta_raa` | Système RAA | Physio RAA |
| `hta_clinique` | HTA clinique | Clinique / seuils |
| `pathologie_du_globule_blanc` | Pathologie du Globule Blanc | Coquille vide (0 texte, 0 mol, 0 jeu) |
| `pathologie_plaquettes` | Pathologie Plaquettes | Physio hémostase **+** porte les molécules L5 033 |

### Ambiguïtés de remap (à trancher en gate)

1. **Fusion antiagrégants + anticoagulants** → une seule leçon `m_dicaments_du_gr` : lot 033 L3+L4 à republier ensemble ; titre/code remote à clarifier (typo `m_dicaments`, sens « plaquettes » inexact).
2. **`sang_rappel` → `rappel_sang`** : 033 publiait fer / ascorbate / colécalciférol / cyanocobalamine (identité) sur L1 ; **remote : 0 pubs** sur `rappel_sang` — les pubs fer/anémie sont sur `pathologie_du_globule_rouge`. Doublon pédagogique `sels ferreux` L1+L2 possible (`049_fix` / STATE).
3. **`cv_veines` vs `cv_arterite`** + **trimétazidine** (angor vs artérite). Note : un code `cv_hemorroides` apparaît dans le calque `073` V2 — **absent** du parcours DEUST remote actuel (hémorroïdes = section de `cv_veines`).
4. **β-bloquants** : lot 033 `cv_angor` (carvedilol, bisoprolol…) **et** `hta_classes` (acebutolol…) ; remote a déjà des β-bloquants HTA-like publiés sur `cv_angor` (aténolol, céliprolol, nadolol…) — chevauchement à arbitrer (première leçon vs duplication).
5. **`acide folinique` (033)** vs **`folinate de calcium` (remote, statut `brouillon`)** : pas de fiche `acide folinique` ; synonymie à valider. Aussi listé « ignore 034 » (`no_safe_candidate`).
6. **Lacidipine** : explicitement absente du cours / non publiée (033) — hors scope pubs.
7. **Codes seed 035** encore `sang_*` alors que modules remote renommés — risque d’idempotence SQL si rejoué sans remap ; UUID modules peuvent encore porter d’anciennes pubs.
8. **`cyanocobalamine`** : scission volontaire L1 (identité/secteur) vs L2 (reste) — à respecter au remap.

---

## 2. Tableau leçon par leçon (18 leçons non-groupe)

Légende jeux : **présent** = bloc `jeu` + modèle ; **absent** = pas de bloc ; **à améliorer** = présent mais banque / critères / type à revoir.

### Chapitre Sang

#### `rappel_sang` — Composition Sang

| Colonne | Contenu |
|---------|---------|
| **Molécules déjà liées** | Pubs : aucune. Blocs molécule : **aucun**. |
| **Molécules à ajouter (033 remap)** | Mono : sels ferreux, acide ascorbique, colécalciférol, cyanocobalamine *(champs limités identité+secteur selon 033)*. Assos : — |
| **Bloc molécule** | **Manquant** |
| **Champs « base » cours attendus** | Identité / contexte cas comptoir (fer, vit. C absorption, B12/D sur ordonnances) — **pas** classes anémie sur cyanocobalamine (règle 033) |
| **Type de jeu proposé** | `quiz` (garder) |
| **Exemple quiz** | Énoncé : « Quelle est la durée de vie approximative d’un globule rouge mature ? » — Réponse : **≈ 120 jours** (texte leçon / 035). |
| **Jeu actuel** | **Présent** — `JP-CSANG` « Composition Sang — Quiz connaissance » |
| **Assos + mode** | — |

#### `pathologie_du_globule_rouge` — Pathologie du Globule Rouge

| Colonne | Contenu |
|---------|---------|
| **Molécules déjà liées** | Pubs + blocs : Sels ferreux ; Sels ferreux + acide folique ; Acide ascorbique ; Acide ascorbique + sulfate ferreux ; Succinate ferreux ; Acide folique ; Cyanocobalamine ; Folinate de calcium *(brouillon)* ; Epoétine alfa/bêta ; Darbépoétine alfa |
| **Molécules à ajouter** | Mono : immunoglobulines anti-D ; acide folinique *(créer ou mapper folinate)* ; éventuellement colécalciférol si rester sur L1 uniquement. Assos déjà : sels ferreux + acide folique ; ascorbate + sulfate ferreux |
| **Bloc molécule** | Présent (3 lots remplis) — OK structure |
| **Champs « base » cours** | Indications anémie ferriprive / macrocytaire ; conseils intervalle fer ; EPO ; prévention Rh (Rhophylac) |
| **Type de jeu proposé** | `classement` (garder) + réaligner critères sur `trous` `JP-CVS2` **ou** retirer le modèle orphelin des critères |
| **Exemple quiz** *(si quiz ajouté)* | Énoncé : « L’anémie est définie chez l’homme par un taux d’hémoglobine inférieur à… » — Réponse : **13 g/dL** (texte leçon). |
| **Jeu actuel** | **À améliorer** — bloc `JP-HZDNM` classement « médicament Anémie » ; critères pointent vers `JP-CVS2` trous (**mismatch**) |
| **Assos + mode** | Sels ferreux + acide folique ; Acide ascorbique + sulfate ferreux → mode **`les_deux`** |

#### `pathologie_plaquettes` — Pathologie Plaquettes *(← sang_hemophilies)*

| Colonne | Contenu |
|---------|---------|
| **Molécules déjà liées** | Acide tranéxamique (bloc + pubs) |
| **Molécules à ajouter** | Mono : phytoménadione, alginate de calcium, peroxyde d’hydrogène |
| **Bloc molécule** | Présent mais **partiel** (1 id) |
| **Champs « base » cours** | Hémostatiques / hémophilies / thrombopénie (selon texte remote) |
| **Type de jeu proposé** | `quiz` (garder) |
| **Exemple quiz** | Énoncé : « L’hémostase primaire forme un clou plaquettaire… » — Réponse : **fragile** (conseil/texte leçon). |
| **Jeu actuel** | **Présent** — `JP-PPLAQ` |
| **Assos + mode** | — |

#### `m_dicaments_du_gr` — Médicaments plaquettes *(← sang_antiagregants + sang_anticoagulants)*

| Colonne | Contenu |
|---------|---------|
| **Molécules déjà liées** | Antiagrégants : AAS, clopidogrel, prasugrel, ticagrélor, clopidogrel + aspirine. Anticoagulants : HNF Ca/Na, HBPM (dalte/énoXa/tinza/nadro), fondaparinux, rivaroxaban, apixaban, dabigatran, warfarine, acénocoumarol, fluindione |
| **Molécules à ajouter** | Mono : dipyridamole ; danaparoïde ; idarucizumab ; désirudine ; lépirudine ; altéplase ; ténectéplase ; rétéplase ; streptokinase ; urokinase |
| **Bloc molécule** | Présent (4 lots remplis) |
| **Champs « base » cours** | Mécanismes COX / anti-P2Y12 ; héparines ; AOD ; AVK/INR ; relais ; CI hémorragiques (texte leçon) |
| **Type de jeu proposé** | `classement` + `quiz` (déjà 2) — enrichir banques |
| **Exemple quiz** | Énoncé : « Les anti-coagulants oraux directs de la famille des -xaban agissent en bloquant… » — Réponse : **un facteur activé (facteur Xa)** (texte leçon). |
| **Jeu actuel** | **À améliorer** — `JP-UNTF8` classement (critères) + `JP-MHSUM` quiz (bloc hors critères) |
| **Assos + mode** | Clopidogrel + aspirine → **`les_deux`** |

#### `pathologie_du_globule_blanc` — Pathologie du Globule Blanc

| Colonne | Contenu |
|---------|---------|
| **Molécules déjà liées** | Aucune |
| **Molécules à ajouter** | Aucune dans 033 — leçon hors plan molécules |
| **Bloc molécule** | **Manquant** (et 0 contenu texte) |
| **Champs « base » cours** | À définir si la leçon est gardée / peuplée |
| **Type de jeu proposé** | `quiz` **après** contenu — sinon skip |
| **Exemple quiz** | *Non proposé* (aucun texte remote) |
| **Jeu actuel** | **Absent** |
| **Assos + mode** | — |

---

### Chapitre Appareil cardiovasculaire

#### `cv_definitions` — Athérome et artériosclérose

| Colonne | Contenu |
|---------|---------|
| **Molécules déjà liées** | Aucune |
| **Molécules à ajouter** | Aucune (physio) |
| **Bloc molécule** | Non requis |
| **Champs « base » cours** | — |
| **Type de jeu proposé** | `appariement` (artère ↔ complication : carotides/AVC, coronaires/angor-IDM, etc.) |
| **Exemple quiz** | Énoncé : « Quelle forme prédominante d’artériosclérose se caractérise par des plaques d’athérome ? » — Réponse : **athérosclérose** |
| **Jeu actuel** | **Absent** |
| **Assos + mode** | — |

#### `cv_angor` — Angor (Angine de poitrine)

| Colonne | Contenu |
|---------|---------|
| **Molécules déjà liées** | Blocs/pubs : Ivabradine, Nicorandil, Molsidomine ; Vérapamil, Diltiazem ; β-bloquants (bisoprolol, métoprolol, nébivolol, aténolol, céliprolol, propranolol, nadolol, tertatolol). **2 blocs molécule vides** (ordres 100 et 450) |
| **Molécules à ajouter** | Mono 033 manquants : trinitrine, isosorbide dinitrate, nifédipine, nicardipine, nitrendipine, isradipine, amlodipine, félodipine, manidipine, lercanidipine, carvedilol |
| **Bloc molécule** | Présent **partiel** + **2 lots `matrice_ids` vides** |
| **Champs « base » cours** | Dérivés nitrés crise/fond ; donneurs NO ; INCA dihydropyridines vs non-DHP ; β-bloquants cardiosélectifs ; IKOREL/CORVASAL/PROCORALAN |
| **Type de jeu proposé** | `quiz` (garder) |
| **Exemple quiz** | Énoncé : « L’ivabradine (Procoralan®) agit principalement au niveau du… » — Réponse : **nœud sinusal** (texte leçon). |
| **Jeu actuel** | **Présent** — `JP-CVC1` « Angor — Quiz crise vs traitement de fond » |
| **Assos + mode** | — (assos HTA ailleurs) |

#### `cv_idm` — Infarctus du myocarde (IDM)

| Colonne | Contenu |
|---------|---------|
| **Molécules déjà liées** | Aucune (0 pubs, 0 bloc mol) |
| **Molécules à ajouter** | Mono 033 : atorvastatine, énalapril, ramipril, captopril, lisinopril, périndopril (+ rappel BASIC : β-bloquant / antiagrégant / statine / IEC / contrôle facteurs — lier aussi AAS/β-bloquants déjà connus) |
| **Bloc molécule** | **Manquant** |
| **Champs « base » cours** | Ordonnance BASIC ; prévention secondaire |
| **Type de jeu proposé** | `ordonnance` (sortie post-IDM BASIC) ou `classement` |
| **Exemple quiz** | Énoncé : « Dans l’acronyme BASIC de l’ordonnance de sortie post-infarctus, le « B » correspond à… » — Réponse : **bêtabloquant** (texte leçon). |
| **Jeu actuel** | **Absent** |
| **Assos + mode** | — |

#### `cv_arythmies` — Arythmies cardiaques

| Colonne | Contenu |
|---------|---------|
| **Molécules déjà liées** | Hydroquinidine, disopyramide, flécaïnide, propafénone, amiodarone, sotalol (blocs + pubs légères) |
| **Molécules à ajouter** | Compléter densités RCP ; éventuellement vérapamil/diltiazem déjà cités dans le texte (classe IV) si pubs souhaitées |
| **Bloc molécule** | Présent (2 lots) |
| **Champs « base » cours** | Classification Vaughan-Williams ; EI amiodarone (thyroïde, cornée, photosens.) |
| **Type de jeu proposé** | `appariement` (classe VW ↔ molécules) |
| **Exemple quiz** | Énoncé : « Les anti-arythmiques de classe 3 cités dans le cours sont… » — Réponse : **amiodarone (Cordarone®) et sotalol (Sotalex®)** |
| **Jeu actuel** | **Absent** |
| **Assos + mode** | — |

#### `cv_ic` — Insuffisance cardiaque

| Colonne | Contenu |
|---------|---------|
| **Molécules déjà liées** | Aucune |
| **Molécules à ajouter** | Mono : fosinopril, losartan, valsartan, candésartan, dapagliflozine, digoxine, furosémide, spironolactone, éplérénone (+ IEC déjà listés dans texte). Asso : **sacubitril + valsartan** |
| **Bloc molécule** | **Manquant** |
| **Champs « base » cours** | IEC/ARA2/ARNI ; SGLT2 ; digitaliques (3 R) ; diurétiques ; β-bloquants IC |
| **Type de jeu proposé** | `classement` (classe ↔ rôle IC) |
| **Exemple quiz** | Énoncé : « Sacubitril + valsartan (Entresto®) associe un ARA2 et un inhibiteur de… » — Réponse : **la néprilysine** (texte leçon). |
| **Jeu actuel** | **Absent** |
| **Assos + mode** | Sacubitril + valsartan → **`associe`** (unité ARNI) + **`separe`** pour valsartan mono |

#### `cv_arterite` — Artérite

| Colonne | Contenu |
|---------|---------|
| **Molécules déjà liées** | Aucune |
| **Molécules à ajouter** *(depuis lot 033 cv_veines — remap proposé)* | naftidrofuryl, piribédil ; **trimétazidine** (ou `cv_angor` — ambiguïté basse) |
| **Bloc molécule** | **Manquant** |
| **Champs « base » cours** | AOMI ; vasodilatateurs ; prévention CV (antiagrégants — renvoi) |
| **Type de jeu proposé** | `quiz` |
| **Exemple quiz** | Énoncé : « L’artérite entraîne une diminution de l’apport sanguin par dysfonctionnement des… » — Réponse : **artères** |
| **Jeu actuel** | **Absent** |
| **Assos + mode** | — |

#### `cv_veines` — Insuffisance veineuse et crises hémorroïdaires

| Colonne | Contenu |
|---------|---------|
| **Molécules déjà liées** | Aucune |
| **Molécules à ajouter** | fraction flavonoïque, diosmine, ginkgo biloba, troxérutine, ruscoside, naftazone *(veinotoniques + hémorroïdes ; pas de leçon `cv_hemorroides` sur DEUST remote)* |
| **Bloc molécule** | **Manquant** |
| **Champs « base » cours** | Veinotoniques oraux/locaux ; contention ; sclérosants cités en texte (pas forcément fiches) |
| **Type de jeu proposé** | `appariement` (symptôme / stade ↔ prise en charge) |
| **Exemple quiz** | Énoncé : « Quel est le traitement de base de l’insuffisance veineuse selon le cours ? » — Réponse : **contention veineuse** |
| **Jeu actuel** | **Absent** |
| **Assos + mode** | — |

#### `cv_urgences` — OAP et urgences cardiovasculaires

| Colonne | Contenu |
|---------|---------|
| **Molécules déjà liées** | Aucune |
| **Molécules à ajouter** | adrénaline *(033)* |
| **Bloc molécule** | **Manquant** |
| **Champs « base » cours** | OAP clinique ; médicaments d’urgence / usage hospitalier |
| **Type de jeu proposé** | `quiz` |
| **Exemple quiz** | Énoncé : « Parmi les indications citées pour l’adrénaline dans le cours : arrêt cardiaque et… » — Réponse : **choc anaphylactique** |
| **Jeu actuel** | **Absent** |
| **Assos + mode** | — |

---

### Chapitre HTA

#### `hta_rappel_pa` — Rappel PA

| Colonne | Contenu |
|---------|---------|
| **Molécules déjà liées** | Aucune (attendu) |
| **Molécules à ajouter** | — |
| **Bloc molécule** | Non requis |
| **Champs « base » cours** | — |
| **Type de jeu proposé** | `quiz` (garder) |
| **Exemple quiz** | Énoncé : « La pression sanguine est le produit du volume d’éjection systolique, de la fréquence cardiaque et de… » — Réponse : **la résistance périphérique** (texte leçon). |
| **Jeu actuel** | **Présent** — `JP-CVH1` |
| **Assos + mode** | — |

#### `hta_raa` — Système RAA

| Colonne | Contenu |
|---------|---------|
| **Molécules déjà liées** | Aucune (physio) |
| **Molécules à ajouter** | — |
| **Bloc molécule** | Non requis |
| **Type de jeu proposé** | `trous` (garder) |
| **Exemple quiz** | Énoncé : « L’angiotensinogène est produit… » — Réponse : **dans les cellules hépatiques** (QCM cours). |
| **Jeu actuel** | **Présent** — `JP-CVH2` « RAA — Tableau à trous IEC / sartans » *(titre un peu décalé vs contenu physio — à améliorer libellé)* |
| **Assos + mode** | — |

#### `hta_clinique` — HTA clinique

| Colonne | Contenu |
|---------|---------|
| **Molécules déjà liées** | Aucune |
| **Molécules à ajouter** | — |
| **Bloc molécule** | Non requis |
| **Type de jeu proposé** | `quiz` (garder) |
| **Exemple quiz** | Énoncé : « Une personne est hypertendue si sa PAS est égale ou supérieure à… » — Réponse : **selon seuils OMS du tableau de la leçon** (citer la catégorie du support ; ne pas inventer un chiffre hors texte affiché). |
| **Jeu actuel** | **Présent** — `JP-CVH3` |
| **Assos + mode** | — |

#### `hta_classes` — Antihypertenseurs par classe

| Colonne | Contenu |
|---------|---------|
| **Molécules déjà liées** | Pubs : **0**. Bloc molécule : **présent mais `matrice_ids` vides** |
| **Molécules à ajouter** | Lot 033 L16 complet : β-bloquants (acebutolol, aténolol, céliprolol, bétaxolol, propranolol, pindolol, nadolol, labétalol, timolol, tertatolol) ; diurétiques (pirétanide, bumétanide, HCTZ, indapamide, ciclétanine, amiloride, triamtérène) ; α1 (urapidil, prazosine, doxazosine) ; centraux (rilménidine, méthyldopa, moxonidine, clonidine) ; vasodilatateur (minoxidil) ; IEC (bénazépril, quinapril, trandolapril, zofénopril + ceux déjà vus) ; sartans (irbésartan, telmisartan, éprosartan, olmesartan + losartan/valsartan/candésartan) ; INCA déjà cités dans le texte |
| **Bloc molécule** | **`matrice_ids` vides** |
| **Champs « base » cours** | Cibles d’action ; EI/CI par classe (toux IEC, hyperK, œdèmes INCA, etc.) |
| **Type de jeu proposé** | `quiz` (garder) / complément `appariement` classe↔cible |
| **Exemple quiz** | Énoncé : « Quel effet secondaire typique des IEC est cité dans le cours ? » — Réponse : **toux sèche persistante** |
| **Jeu actuel** | **Présent** — `JP-CVH4` « Antihypertenseurs — Quiz cibles d'action » |
| **Assos + mode** | Voir leçon suivante ; ici surtout monos |

#### `hta_associations` — Associations fixes et dispensation

| Colonne | Contenu |
|---------|---------|
| **Molécules déjà liées** | Pubs : **0**. Bloc molécule : **présent, `matrice_ids` vides** (constaté plan) |
| **Molécules à ajouter** | Toutes assos « + » du référentiel citées dans le cours (IEC/ARA2/β-bloquant/INCA × diurétique ou INCA) — lot 033 dynamique `dci LIKE '% + %'` non encore publiées |
| **Bloc molécule** | **`matrice_ids` vides** |
| **Champs « base » cours** | Composition des spécialités nommées (Coaprovel, Exforge, Lodoz-like, etc.) ; conseils hypotension orthostatique / dispensation |
| **Type de jeu proposé** | `appariement` ou `quiz` avec modes asso |
| **Exemple quiz** | Énoncé : « Coaprovel® associe irbésartan et… » — Réponse : **hydrochlorothiazide** (texte leçon). |
| **Jeu actuel** | **À améliorer** — `JP-CVH5` titré « Révision finale du parcours » (pas spécifique associations) |
| **Assos + mode** | **`les_deux`** (composition séparée A/B + asso directe « Lodoz = ? ») |

---

## 3. Synthèse jeux (état remote)

| Leçon | Critères `jeux` | Bloc(s) jeu | Verdict |
|-------|-----------------|-------------|---------|
| rappel_sang | JP-CSANG | JP-CSANG quiz | OK |
| pathologie_du_globule_rouge | JP-CVS2 trous | JP-HZDNM classement | **Mismatch** |
| pathologie_plaquettes | JP-PPLAQ | JP-PPLAQ | OK |
| m_dicaments_du_gr | JP-UNTF8 | JP-UNTF8 + JP-MHSUM | Critères incomplets |
| pathologie_du_globule_blanc | [] | — | Absent |
| cv_definitions | — | — | Absent |
| cv_angor | JP-CVC1 | JP-CVC1 | OK |
| cv_idm / cv_arythmies / cv_ic / cv_arterite / cv_veines / cv_urgences | — | — | **Absents** |
| hta_rappel_pa / hta_raa / hta_clinique / hta_classes | OK alignés | OK | Présents |
| hta_associations | JP-CVH5 | JP-CVH5 | Titre/banque à recentrer |

---

## 4. Gaps référentiel (DCI du plan 033)

### 4.1 Absentes / synonymie

| DCI plan | Statut remote | Action proposée |
|----------|---------------|-----------------|
| **Acide folinique** | DCI sans matrice | Créer **ou** mapper vers **Folinate de calcium** (`brouillon`) |
| Lacidipine | Hors plan pubs (033) | Skip contenu |

### 4.2 Fiches présentes mais densités cliniques faibles (indicatif Ind/CI/EI = 0 ou quasi vides)

Priorité Phase 3 (liste non exhaustive des plus critiques pour le parcours) :

- **Angor / INCA / nitrés** : amlodipine, nifédipine, isosorbide dinitrate, trinitrine (faible), carvedilol, bisoprolol, nébivolol, vérapamil…
- **IDM / IC** : atorvastatine, ramipril, digoxine, spironolactone, dapagliflozine, fosinopril, sacubitril + valsartan (EI seul)…
- **Thrombolytiques / rares** : altéplase, ténectéplase, urokinase, idarucizumab, danaparoïde, dipyridamole…
- **Hémostatiques** : phytoménadione, alginate (1 conn), peroxyde…
- **Veinotoniques / artérite** : diosmine, ginkgo, naftidrofuryl, trimétazidine, piribédil, fraction flavonoïque, naftazone, ruscoside…
- **HTA classes** : nombreux β-bloquants / IEC / sartans avec Ind=0 ou CI=0
- **Assos HTA** : quasi toutes densités Ind/CI/EI ≈ 0 (sauf quelques EI isolés)

Densités **déjà correctes** (ex.) : nombreux AOD/HBPM/AVK/antiagrégants, sels ferreux, EPO, ivabradine/nicorandil/molsidomine (après retries).

### 4.3 Folinate / cyanocobalamine

- Folinate de calcium : pubs sur pathologie GR mais **statut matrice `brouillon`** → à publier après RCP.
- Cyanocobalamine : densités OK côté référentiel ; pubs GR présentes.

---

## 5. Skips RCP documentés (`sql/ops`)

Synthèse enrichie ([Assos-Existantes](51708b72-44be-4ff2-8ea4-d3e76a214334) + reports locaux). Bilan admin STATE : **~10 dossiers** restants (6 absents BDM + 4 CIS suspects).

### 5.1 Manual `no_cis` / absents BDM FR (ne pas inventer)

| DCI | Motif |
|-----|-------|
| Désirudine | `MANUAL` / `no_cis` — absent BDM FR |
| Lépirudine | idem |
| Éprosartan | idem |
| Rétéplase | idem |
| Ruscoside | idem |
| Streptokinase | idem |
| Alginate de calcium | `no_cis` puis **`cis_suspect`** (CIS alginate/sodium **63517694**, pas pansement calcique) |

→ Phase 3 : EMA si nº EU utilisable, sinon **skip documenté**.

### 5.2 CIS suspects (à revoir en wizard avant enrichissement)

| DCI | Problème | CIS tenté |
|-----|----------|-----------|
| Amiloride + furosémide | Match Moduretic (HCT) au lieu de Logirène | 68045361 |
| Nébivolol + hydrochlorothiazide | Match nébivolol mono | 67856966 |
| Triamtérène + méthyclothiazide | Match Prestol triam+HCT | 63870751 (r2) |
| Alginate de calcium | Voir 5.1 | 63517694 |

### 5.3 Skips initiaux récupérés (ne pas re-skip sans re-fetch)

`rcp_vide` historiques puis souvent OK : Apixaban, Dapagliflozine, EPO, Ivabradine, Rivaroxaban, Ténectéplase, Ginkgo, Idarucizumab, Filgrastim…  
`no_cis` puis OK : héparinates, Ig anti-D, isosorbide dinitrate, sels ferreux (± folique), clopidogrel + aspirine, ~30 asso HTA (allowlist marques `retry_skips_local.mjs`).

### 5.4 Erreurs ops (corrigées en r2_tech)

- Triamtérène + méthyclothiazide : HTTP 520 → puis OK technique (CIS à valider, §5.2)
- Valsartan + amlodipine : Gemini 429 → OK (CIS **60058008**)

### 5.5 Hors campagne retry / ignore 034

Acide folinique, urokinase, propranolol, timolol (mono), triamtérène (mono) — `no_safe_candidate` ou non enrichis auto.

---

## 6. Associations candidates (référentiel « + »)

**40** fiches association documentées pour le parcours (3 hors HTA + 37 HTA dont triple Moducren) — détail marques/monos : [Assos-Existantes](51708b72-44be-4ff2-8ea4-d3e76a214334) + `sql/011_cours_sang_cv_hta.sql` (`cours_assoc`).

### 6.1 Hors `hta_associations`

| Association | Leçon | Mode jeu | Notes |
|-------------|-------|----------|-------|
| Sels ferreux + acide folique | pathologie GR | `les_deux` | densités OK ; Tardyferon B9 |
| Clopidogrel + aspirine | `m_dicaments_du_gr` | `les_deux` | densités OK ; Duoplavin |
| Acide ascorbique + sulfate ferreux | pathologie GR | `separe` | déjà liée |
| Sacubitril + valsartan | `cv_ic` | `associe` (+ `separe` valsartan) | densités faibles ; Entresto ; sacubitril mono non mappé 011 |

### 6.2 `hta_associations` (mode jeu global **`les_deux`**)

Exemples cours : Lodoz (bisoprolol+HCT), Coaprovel, Exforge, Coveram, Preterax, Captea, Zanextra, Twynsta, Tarka, Natrixam, Tenoretic, Logimax, Moducren (triple), Aldactazine, Caduet…  
Densités Ind/CI/EI remote : **quasi vides** pour la plupart (compléter Phase 3 **via CIS spécialité** uniquement).

### 6.3 Monos composants manquants / proxies (STATE / 011)

| Composant | Problème |
|-----------|----------|
| Chlortalidone, altizide, méthyclothiazide | Cités cours ; **pas de fiche mono** |
| Atorvastatine | Mono plan IDM ; densités faibles |
| Triamtérène (mono) | Absent / proxy **amiloride** dans 011 pour Prestole |
| Sacubitril | Non mappé mono dans 011 |

`matrice_composants` (Phase 1) : exiger ≥2 composants réels avant UI couleurs / jeux.

---

## 7. Compteurs remote utiles

| Indicateur | Valeur |
|------------|--------|
| Leçons non-groupe | **18** |
| Avec pubs matrices | 4 (`pathologie_du_globule_rouge`, `m_dicaments_du_gr`, `cv_angor`, `cv_arythmies` + `pathologie_plaquettes` 1 matrice) |
| Blocs molécule vides | `cv_angor` ×2, `hta_classes`, `hta_associations` |
| Sans aucun bloc molécule | rappel_sang, cv_definitions, cv_idm, cv_ic, cv_arterite, cv_veines, cv_urgences, hta_* physio, pathologie GB |
| Jeux absents (critères) | cv_definitions, cv_idm, cv_arythmies, cv_ic, cv_arterite, cv_veines, cv_urgences, pathologie GB |

---

## 8. Décisions demandées au gate utilisateur

1. Valider le **remap** (fusion `m_dicaments_du_gr`, split veines/artérite, pubs fer L1 vs GR, **trimétazidine**).
2. Valider la liste **molécules à ajouter** par leçon ; skips `no_cis` + **CIS suspects** (§5.2).
3. Valider les **types de jeux** proposés + exemples quiz.
4. Trancher **acide folinique** vs folinate ; garder / peupler **pathologie_du_globule_blanc**.
5. Valider les **40 assos** + monos manquants (chlortalidone, altizide, méthyclothiazide, sacubitril…).
6. OK explicite pour ouvrir Phase 1 (schéma assos) puis 2∥3.

---

*Fin audit Phase 0 — aucune migration ni écriture destructive effectuée. Enrichi après retours [Mapping-033](8c97fb5c-1d6b-41eb-ac37-86fd0da1195c) et [Assos-Existantes](51708b72-44be-4ff2-8ea4-d3e76a214334).*
