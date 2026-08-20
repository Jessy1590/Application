# 🏛️ Architecture & Spécifications — Outil Expert Valorisation Pharmacie

## 1. Stack Technique
- **Frontend :** HTML5, CSS3 (Vanilla), JavaScript (ES6+). Un seul fichier `index.html` pour simplifier le déploiement et la maintenance.
- **Backend / BDD :** Supabase (PostgreSQL).
- **Authentification :** Supabase Auth (Email/Mot de passe).
- **Export :** Librairie `html2pdf.js` intégrée par CDN.

## 2. Carte Mentale du fichier `index.html`
Le fichier `index.html` est long (~1700 lignes). Voici où trouver chaque fonctionnalité pour naviguer rapidement (repères `/* === X. ... === */`) :

- **Lignes 1 - 250 :** CSS (Styles, Grilles, Modales, Design PDF).
- **Lignes 250 - 350 :** Structure HTML de base (Topbar, Onglets, Conteneurs).
- **`/* 1. CATALOGUE DES CHAMPS BILANS */` :** Définition de `BILAN_SECTIONS` et `INFO_FIELDS`. C'est ici que l'on ajoute ou renomme une ligne du bilan (Achats, Ventes, etc.).
- **`/* 2. PARAMÈTRES HYPOTHÈSES */` :** Définition de `EMPTY_PARAMS` (valeurs par défaut) et `PARAM_GROUPS_SIMPLE` (structure du formulaire de l'onglet "Hypothèses").
- **`/* FONCTIONS UTILITAIRES & AUTH */` :** `toast()`, `fmtEUR()`, `copyToClipboard()`, Supabase Auth (`signInWithPassword`).
- **`/* ONGLETS (RENDERING) */` :**
  - `renderInfosTab()` : Onglet 1 (Projet).
  - `renderBilansTab()` : Onglet 2 (Saisie des bilans N, N-1, N-2).
  - `renderParametresTab()` : Onglet 3 (Saisie des hypothèses et financements).
- **`/* COMPUTATION ENGINE (LE COEUR FINANCIER) */` :**
  - `computeBilanAggregate()` : Calcule CA Total, Achats Consommés, etc.
  - `computeEvaluation()` : Calcule l'EBE Retraité, Marge, Ratios (Onglet 4).
  - `calcGenericLoan()` & `pmtAnnuite()` : Calcule les tableaux d'amortissement de tous les prêts (In fine ou constants).
  - `computeValorisation()` : Calcule les multiples, frais d'acquisitions, plan de financement (Onglet 5).
  - `calcIS()` : Calcul de l'IS (Barème progressif).
  - `computePrevisionnel()` : Génère le tableau sur 12 ans (Onglet 6).
- **`/* ONGLETS D'AFFICHAGE FINAUX */` :**
  - `renderEvaluationTab()` : Génère la vue HTML de l'onglet 4.
  - `renderValorisationTab()` : Génère la vue HTML de l'onglet 5.
  - `renderPrevisionnelTab()` : Génère la vue HTML de l'onglet 6 et gère les Modales d'ajustement (Croissance, Salaires, Charges).
- **`/* EXPORT PDF PROFESSIONNEL */` :** Écouteur du bouton `#btn-export-pdf`, mise en page HTML pour le PDF et conclusion IA.
- **`/* IMPORT IA */` :** `buildImportPrompt()`, `handleParseJson()`, `applyImport()`. Apprentissage des clés non reconnues.

## 3. Modèle de Données (Schéma `valorisation`)
Le projet utilise une base de données NoSQL-like pour une flexibilité totale, évitant de créer 150 colonnes.
- **Table `projects`** : 
  - `id` (UUID, PK), `owner` (UUID, FK auth.users), `nom` (Text), `infos` (JSONB : ville, adresse...), `unavailable` (Array : champs N/A), `created_at`.
- **Table `parametres`** : 
  - `project_id` (UUID, PK/FK).
  - `params` (JSONB) : Contient toutes les hypothèses (taux, durées, montants). Contient aussi un objet imbriqué `previ_state` qui sauvegarde les ajustements du prévisionnel (`chargesExt`, `salaries`, `customCharges`, `growth`).
- **Table `bilans`** : 
  - `project_id` (UUID, PK/FK), `annee_offset` (Int : 0, -1, -2, PK).
  - `data` (JSONB) : Paires clé/valeur des montants comptables (ex: `{"ventes_21": 150000}`).
- **Table `import_mappings`** : 
  - `user_id`, `source_label` (Clé inventée par l'IA), `target_field` (Clé officielle du système). Permet d'apprendre des erreurs de l'IA.

## 4. Règles de Gestion Financière
- **L'EBE Retraité** est la base absolue de valorisation (EBE Comptable + Rémunérations + Retraitements divers).
- **Le Prévisionnel :** 
  - L'évolution de marge n'est pas incrémentale, elle est définie de manière **fixe** par une `marge_cible_previsionnel` dès l'Année 1.
  - L'évolution du CA se fait année par année (1 à 5). De l'année 6 à 12, on fige le taux de croissance sur la valeur de l'Année 5.
- **Le Crédit Vendeur :** Son remboursement ne figure pas dans le calcul du cash-flow


