# 🏛️ Architecture & Spécifications — Budget Partagé

## 1. Stack Technique
- **Frontend :** Vanilla HTML5, CSS3, JavaScript (ES6+). Fichier unique `index.html`.
- **PWA :** Présence d'un `manifest.webmanifest` pour installation sur mobile.
- **BaaS / BDD :** Supabase (PostgreSQL) via CDN.
- **Protection globale :** Utilisation du script `protect.js` pour bloquer le rendu avant validation.

## 2. Carte Mentale du code (`index.html`)
- **CSS :** Variables de thèmes (`:root`), design system propre (boutons `.bh-btn`, cartes `.bh-card`, modales/sheets `.bh-sheet`), et layout responsive avec une barre de navigation en bas (`.bh-tabbar`).
- **Objets JS principaux :**
  - `AppAuth` : Gestion de la connexion, inscription et reset de mot de passe Supabase.
  - `BH` (Budget Handler) : Cœur de l'application contenant l'état local et la logique de rendu.
- **Gestion de l'État (`BH.state`) :** Charge en une seule passe `accounts`, `members`, `expenses`, `incomes`, `month_records` et `profile` au démarrage. L'application se rafraîchit en temps réel grâce au canal realtime Supabase `public-db`.
- **Vues (Tabs) :**
  - **Aujourd'hui :** Vue tactique. Affiche les échéances en retard, du jour, à venir, et permet de valider les dépenses ou gérer les portefeuilles (enveloppes).
  - **Comptes :** Vue stratégique. Affiche le bilan, les répartitions ("qui doit quoi"), et les restes à vivre (théorique et en date).
  - **Saisies :** Vue de gestion CRUD pour lister, filtrer, créer, modifier ou supprimer les dépenses régulières et les revenus.
  - **Stats :** Graphiques générés en SVG natif (`BH.pieChart`), évolution sur 12 mois, capacité d'épargne et fonctions d'export (CSV/PDF).

## 3. Modèle de Données (Supabase)
Le modèle relationnel est structuré autour du partage de comptes :
- **`accounts`** : Les comptes bancaires virtuels ou réels partagés (`id`, `name`).
- **`profiles`** : Les utilisateurs (`id`, `display_name`, `main_account_id` pour le calcul de l'épargne, `account_order` en JSONB).
- **`account_members`** : La table de liaison qui définit qui a accès à quel compte et comment il y contribue (`role`, `contribution_target`, `contribution_mode` : fixed, percent, ou prorata).
- **`expenses`** : Les dépenses budgétisées. Colonne clé : `is_wallet` (booléen) pour définir si c'est une dépense fixe ou un budget enveloppe.
- **`incomes`** : Les revenus et remboursements associés à un compte.
- **`month_records`** : Le journal de bord mensuel. Contient des colonnes JSONB (`paid_expenses`, `wallet_transactions`) stockant les validations effectives mois par mois.

## 4. Règles de Gestion Financière
- **Apports et Répartition :** Lorsqu'un compte est partagé, l'apport d'un membre peut être fixe (€), proportionnel (%) ou calculé au prorata des revenus déclarés par chaque membre.
- **Dettes croisées (Settlements) :** Si un membre avance une dépense avec sa carte personnelle (via `payer_id`), l'application calcule automatiquement les virements de régularisation nécessaires entre les membres (`BH.computeSettlements`).
- **Capacité d'épargne :** Calculée en prenant les revenus du compte principal, moins *toutes* ses dépenses et apports versés aux autres comptes, en rajoutant les dépenses catégorisées "Épargne" (considérées comme de l'argent mis de côté, pas perdu).
- **Montant Différent :** Possibilité de valider une facture avec un montant différent (ponctuellement pour un mois, ou durablement pour mettre à jour le budget).