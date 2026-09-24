# 🏛️ Architecture & Spécifications — Carnet de Fromages

## 1. Stack Technique
- **Frontend :** HTML5, CSS3, React 18, Babel (Standalone). Tout est contenu dans un unique fichier `index.html`.
- **BaaS / BDD :** Supabase (PostgreSQL) via CDN.
- **Protection globale :** Le script externe `protect.js` est appelé dans le `<head>` pour masquer l'interface de l'application avant la validation de l'authentification.

## 2. Carte Mentale du code (`index.html`)
- **Section `<style>` :** Variables globales (`:root`), reset CSS, typographie (Fraunces/Inter), classes utilitaires et layout de la grille.
- **Section JS (Babel) :**
  - **1. Config :** Initialisation du client Supabase sur le schéma `autres`. Définition de la taxonomie métier (`MAIN_CATS`, `SUBCATS`).
  - **2. Utilitaires & API :** Helpers de calcul/formatage (`fmt`, `avg`, `uid`), algorithme de classification `autoClassifyCheese` (Système expert local) et méthodes CRUD (`api`).
  - **3. Composants UI :** 
    - `Icon` : Collection d'icônes SVG paramétrables.
    - `CheeseRow` : Ligne affichant un fromage avec "inline editing" (modification rapide du nom, ajout facile de nouvelles notes).
    - `AddCheeseWizard` : Assistant modale en plusieurs étapes fluides (Nom > Note > Classification IA > Confirmation).
  - **4. App :** Composant racine gérant les appels API, le dashboard statistique, le tri et la boucle de rendu imbriquée (Familles > Sous-familles > Fromages).

## 3. Modèle de Données (Supabase - Schéma `autres`)
L'application interagit avec la table `fromage`. Bien que le schéma SQL exact ne soit pas détaillé, le code React induit cette structure de données :
- `id` : Chaîne (Générée localement via la fonction `uid()` ou identifiant Supabase).
- `name` : Texte (Nom complet du fromage).
- `main` : Texte (Famille principale, ex: `vache`, `chevre`, `brebis`).
- `sub` : Texte (Sous-catégorie, ex: `Pâtes Molles à Croûte Fleurie`).
- `notes` : Tableau d'objets ou JSONB (Stocke l'historique des notes sous la forme `[{id: "xyz", value: 8.5}]`).

## 4. Règles de Gestion Métier
- **Auto-Classification (IA basique) :** L'ajout d'un nom de fromage déclenche une fonction qui identifie des mots-clés (ex: "Roquefort", "Comté") afin de pré-sélectionner l'animal et la pâte.
- **Calcul des Notes :** Chaque fromage peut avoir plusieurs notes d'enregistrées (dégustations multiples). La note affichée à l'écran et utilisée pour le tri global est la moyenne stricte de toutes ses notes stockées.