# 📍 État actuel du projet (STATE) - Carnet de Fromages

## Fonctionnalités actives et terminées
- **Architecture Single-File :** Application 100% client side fonctionnant sous React 18 avec transpilation Babel en direct dans le navigateur (aucune commande build nécessaire).
- **UI/UX Moderne et Réactive :** 
  - Dashboard statistique interactif (compteur total, note moyenne, et famille favorite mis à jour en temps réel).
  - Organisation des fromages en tiroirs accordéons par animal (`vache`, `chevre`, `brebis`) puis par pâte.
- **Système Expert Local :** Fonctionnalité d'auto-classification intelligente (`autoClassifyCheese`) capable d'assigner automatiquement la bonne catégorie d'après le nom saisi (ex: un "Camembert" sera directement rangé dans Vache > Croûte Fleurie).
- **Gestion Complète du Carnet (CRUD) :**
  - **Ajout guidé :** "Wizard" (Assistant modal) permettant l'ajout étape par étape avec confirmation des prédictions de l'IA locale.
  - **Édition rapide :** Possibilité de renommer un fromage ou d'ajouter une note directement dans la liste sans passer par un lourd formulaire ("inline editing").
  - **Suppression intégrée :** Action de suppression sur chaque ligne de fromage.
- **Outils Avancés :** Moteur de recherche textuelle combiné à 4 méthodes de tri : "Par famille", "Meilleures notes (Top)", "Pires notes (Flop)", et "Alphabétique (A-Z)".

## Prochaines étapes de développement (TODO)
*(Liste à mettre à jour lors de nos prochaines sessions de développement)*
- [ ] **Sécurisation des données :** Définir et appliquer des règles RLS restrictives sur la table `fromage` dans Supabase pour bloquer l'écriture publique.