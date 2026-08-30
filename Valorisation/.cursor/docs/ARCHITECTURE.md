# 🏛️ Architecture & Spécifications — Outil Expert Valorisation Pharmacie

## 1. Stack Technique
- **Frontend / Backend :** Monolithe HTML5, CSS3, JavaScript (ES6+). Fichier unique `index.html`[cite: 1].
- **BaaS / BDD :** Supabase (PostgreSQL) via CDN[cite: 1].
- **Authentification :** Supabase Auth (Email/Mot de passe)[cite: 1].
- **Librairies externes (CDN) :** `html2pdf.js` (Export), `Chart.js` (Graphiques prévisionnels)[cite: 1, 2].

## 2. Carte Mentale du fichier `index.html`
Le fichier fait ~1700 lignes. Voici son ordonnancement[cite: 1] :
- **Lignes 1 - 250 :** CSS (Styles, Grilles, Modales, Design PDF)[cite: 1].
- **Lignes 250 - 350 :** Structure HTML de base (Topbar, Onglets, Conteneurs)[cite: 1].
- `/* 1. CATALOGUE DES CHAMPS BILANS */` : Définition de `BILAN_SECTIONS` et `INFO_FIELDS`. C'est le dictionnaire de données[cite: 1].
- `/* 2. PARAMÈTRES HYPOTHÈSES */` : Définition de `EMPTY_PARAMS` et `PARAM_GROUPS_SIMPLE`[cite: 1].
- `/* FONCTIONS UTILITAIRES & AUTH */` : Helpers (`toast`, `fmtEUR`) et logique de connexion[cite: 1].
- `/* ONGLETS (RENDERING) */` : Fonctions `renderInfosTab`, `renderBilansTab`, `renderParametresTab`[cite: 1].
- `/* COMPUTATION ENGINE (LE COEUR FINANCIER) */` : Logique métier (calculs EBE, Ratios, Amortissements, IS, TFT)[cite: 1].
- `/* ONGLETS D'AFFICHAGE FINAUX */` : `renderEvaluationTab`, `renderValorisationTab`, `renderPrevisionnelTab`[cite: 1].
- `/* EXPORT PDF PROFESSIONNEL */` : Génération du rapport via `html2pdf` et IA analytique[cite: 1].
- `/* IMPORT IA */` : Extraction de la liasse fiscale via JSON et matching dynamique[cite: 1].

## 3. Modèle de Données Exact (Schéma `valorisation`)
Le projet utilise une approche hybride SQL/NoSQL (colonnes JSONB) pour une flexibilité totale. Voici la structure exacte de la base de données :

- **Table `projects`**[cite: 3] : 
  - `id` : uuid (PK, généré par `gen_random_uuid()`)[cite: 3].
  - `owner` : uuid (FK vers le système d'authentification)[cite: 3].
  - `nom` : text[cite: 3].
  - `infos` : jsonb (par défaut `{}`)[cite: 3].
  - `unavailable` : jsonb (par défaut `[]`)[cite: 3].
  - `created_at` et `updated_at` : timestamp with time zone (par défaut `now()`)[cite: 3].
  - `shared_with` : ARRAY de type uuid (par défaut vide, gère les accès partagés avec d'autres utilisateurs)[cite: 3].

- **Table `parametres`**[cite: 3] : 
  - `project_id` : uuid (PK/FK liée à la table `projects` sur la colonne `id`)[cite: 3].
  - `params` : jsonb (par défaut `{}`)[cite: 3]. Contient toutes les hypothèses (taux, durées, montants) et l'objet `previ_state`.
  - `updated_at` : timestamp with time zone (par défaut `now()`)[cite: 3].

- **Table `bilans`**[cite: 3] : 
  - `id` : uuid (PK, généré par `gen_random_uuid()`)[cite: 3].
  - `project_id` : uuid (FK liée à la table `projects` sur la colonne `id`)[cite: 3].
  - `annee_offset` : smallint (0, -1, -2)[cite: 3].
  - `annee_label` : text (nullable)[cite: 3].
  - `data` : jsonb (par défaut `{}`)[cite: 3]. Paires clé/valeur des montants comptables.
  - `unavailable` : jsonb (par défaut `[]`)[cite: 3].
  - `updated_at` : timestamp with time zone (par défaut `now()`)[cite: 3].

- **Table `import_mappings`**[cite: 3] : 
  - `id` : uuid (PK, généré par `gen_random_uuid()`)[cite: 3].
  - `user_id` : uuid[cite: 3].
  - `source_label` : text (Clé inventée par l'IA)[cite: 3].
  - `target_field` : text (Clé officielle du système)[cite: 3].
  - `created_at` : timestamp with time zone[cite: 3].

## 4. Règles de Gestion Financière (M&A)
- **L'EBE Retraité** est la base absolue de valorisation (EBE Comptable + Rémunérations + Retraitements divers)[cite: 1].
- **Valorisation Croisée :** Calculée sur 3 axes (CA, EBE, Marge) avec application de coefficients selon un seuil de marge globale[cite: 2].
- **Fonds vs Titres :** La valorisation des titres déduit la dette nette. L'achat de fonds inclut le financement du stock et des frais d'enregistrement classiques[cite: 2].
- **Le Prévisionnel :** Évolution de marge fixe définie par `marge_cible_previsionnel` dès l'Année 1. Croissance du CA gelée après l'année 5. Le remboursement du crédit vendeur (sur le fonds) est déduit du Cash-Flow libre (FCF) mais pas du résultat net[cite: 1, 2].