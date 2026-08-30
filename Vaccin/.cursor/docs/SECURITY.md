# 🔒 Sécurité et RLS (Row Level Security) - Vaccins & Fromage

Ce document décrit les règles de sécurité (Policies) appliquées actuellement sur les tables `vaccins` et `fromage` dans Supabase[cite: 7].

## 1. Table `vaccins` (Schéma `autres`)
Le modèle de sécurité de cette table est basé sur le RBAC (Role-Based Access Control), s'appuyant sur une table de profils externe sécurisée[cite: 4, 7].
- **Lecture Publique (`SELECT`) :** La politique "Lecture publique autorisée sur les vaccins" possède une condition de lecture définie sur `true` pour le rôle `{public}`[cite: 7]. Cela signifie que n'importe quel visiteur, même non authentifié, est autorisé à lire le tableau des vaccins[cite: 7].
- **Écriture Restreinte (`ALL`) :** La politique "Modification réservée aux administrateurs" bloque les actions d'insertion, de modification et de suppression. Elle exige que l'utilisateur actuel existe dans la table `portail.profiles` et qu'il possède spécifiquement le rôle `admin`[cite: 7]. 
  - *Condition SQL exécutée :* `(EXISTS ( SELECT 1 FROM portail.profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))`[cite: 7].

## 2. Table `fromage`
- **Espace Collaboratif Ouvert :** La règle "Acces libre pour le carnet" accorde tous les droits d'interaction (`ALL`) au rôle `{public}`[cite: 7].
- **Conditions :** La politique retourne `true` en condition de lecture et `true` en condition d'écriture[cite: 7].
- **Attention (Point de vigilance) :** Cela signifie que n'importe qui accédant à la base ou à l'API Supabase peut potentiellement lire, modifier ou supprimer les données de cette table de fromages sans aucune restriction d'authentification[cite: 7].