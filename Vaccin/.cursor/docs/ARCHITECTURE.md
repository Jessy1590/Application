# 🏛️ Architecture & Spécifications — Portail Vaccins

## 1. Stack Technique
- **Frontend :** Vanilla HTML5, CSS3, JavaScript (ES6+)[cite: 5, 6].
- **BaaS / BDD :** Supabase (PostgreSQL) via CDN[cite: 4, 6].
- **Éditeur de texte enrichi :** Quill.js (WYSIWYG) importé via CDN[cite: 4, 6].
- **Structure de fichiers :** Séparation en `index.html`, `style.css` et `script.js`[cite: 6]. Sécurisation front-end globale via le fichier `protect.js`[cite: 6].

## 2. Carte Mentale du code (`script.js`)
- **Configuration Supabase :** Deux clients distincts sont instanciés. `sbAuth` pointe sur le schéma `portail` (pour l'authentification et les droits), et `sbVaccin` pointe sur le schéma `autres` (pour les données métiers des vaccins)[cite: 4].
- **Initialisation (`init`) :** Vérifie si l'utilisateur connecté possède le rôle `admin` dans la table `profiles` afin de débloquer l'interface et les boutons d'édition[cite: 4].
- **Gestion des paramètres :** L'application utilise une ligne "fantôme" (astuce NoSQL-like) dans la table `vaccins` où la colonne `pathologie` vaut `__PARAMETRES__`. Cela permet de stocker les réglages dynamiques de l'interface (date de mise à jour, légende, listes de filtres) au lieu de créer une table de configuration dédiée[cite: 4].
- **UI & Filtrage :** Intégration d'un système de recherche textuelle globale et d'un tri par colonnes dynamiques (`filterTable`, `applySortAndRender`)[cite: 4]. Les correspondances de recherche sont visuellement surlignées grâce à la fonction `highlight()`[cite: 4].

## 3. Modèle de Données (Schémas `autres` et `portail`)
Le projet interagit avec différentes tables réparties sur plusieurs schémas Supabase :
- **Schéma `autres` - Table `vaccins` :** Stocke l'ensemble des données des vaccins (pathologie, noms commerciaux, calendrier, détails HTML, et cas particuliers de rattrapage)[cite: 4].
- **Schéma `portail` - Table `profiles` :** Stocke les rôles utilisateurs (notamment le rôle `admin` vérifié de manière asynchrone au chargement de la page)[cite: 4].
- **Table `fromage` :** Mentionnée dans les règles de sécurité comme étant une table ouverte et partagée (potentiellement dans le schéma `public` ou `autres`)[cite: 7].

## 4. Règles de Gestion Métier
- **Couleur dynamique :** Chaque pathologie vaccinale peut posséder une couleur personnalisée en base. Si elle est absente, un helper de secours (`getFallbackColor`) attribue une couleur par défaut en fonction de mots-clés contenus dans le nom[cite: 4].
- **WYSIWYG & HTML :** Les champs complexes (Détails, Rattrapage) sont gérés et sauvegardés en HTML pur généré par l'éditeur Quill[cite: 4].
- **Mode Impression (Print) :** L'interface CSS intègre des règles `@media print` pour masquer la barre d'outils et l'interface d'administration (`.no-print`) afin de reformater proprement le tableau pour l'export PDF ou papier natif du navigateur[cite: 5].