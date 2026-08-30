# 🔒 Sécurité et RLS (Row Level Security) - Carnet de Fromages

Ce document compile les règles de sécurité (Policies) appliquées actuellement sur la table `fromage` dans Supabase, en se basant sur la dernière extraction de la base de données.

## 1. Table `fromage`
D'après l'export des règles (policies) :
- **Politique appliquée :** `Acces libre pour le carnet`
- **Action autorisée :** `ALL` (Lecture, Insertion, Mise à jour, Suppression)
- **Rôles concernés :** `{public}`
- **Condition de lecture :** `true`
- **Condition d'écriture :** `true`

## 2. Analyse et Vulnérabilités
- **Ouverture totale :** Le carnet de fromages est actuellement **totalement ouvert au public**. N'importe quel utilisateur ou bot possédant la clé anonyme Supabase (qui est exposée dans le code source JS) peut lire l'intégralité du carnet, ou pire, modifier/supprimer tous les fromages via des requêtes API directes.
- **Contraste avec l'environnement :** Contrairement au projet "Vaccins" qui exige une vérification d'identité via la table `profiles` pour les opérations en écriture, le carnet de fromages ne possède absolument aucun filtrage au niveau de la base de données.
- **Sécurité de surface :** Actuellement, le script `protect.js` dans le HTML gère une sécurité "visuelle" en masquant le `<body>`, mais il est inefficace contre les attaques directes sur l'API Supabase.

## 3. Recommandations (TODO)
- **Activer la sécurité réelle :** Si le carnet est censé être personnel ou limité, il est impératif d'activer le RLS (Row Level Security) sur la table `fromage` pour exiger un `auth.uid()` ou un droit spécifique pour les modifications (actions `INSERT`, `UPDATE`, `DELETE`).