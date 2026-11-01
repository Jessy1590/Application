# 🔒 Sécurité et RLS (Row Level Security) - Budget Partagé

Ce document décrit les règles de sécurité (Policies) appliquées sur le schéma public du projet Budget Partagé. 

## 1. Philosophie Générale (Multi-Tenancy)
L'architecture de sécurité garantit l'étanchéité des données entre les différents comptes partagés. Elle s'appuie sur deux fonctions PostgreSQL personnalisées pour valider les droits de l'utilisateur de manière dynamique :
- `get_my_accounts()` : Renvoie la liste des UUID des comptes auxquels l'utilisateur courant participe.
- `is_account_member(account_id)` : Vérifie si l'utilisateur possède les droits sur un compte spécifique.

## 2. Table `profiles`
Les profils servent d'annuaire interne pour attribuer les prélèvements et calculer les proratas.
- **Lecture (`SELECT`) :** Ouverte à tout utilisateur connecté (`auth.role() = 'authenticated'`). Nécessaire pour afficher les noms des collaborateurs d'un compte joint.
- **Écriture (`INSERT`, `UPDATE`) :** Strictement limitée au propriétaire du profil (`id = auth.uid()`).

## 3. Tables `accounts` et `account_members`
- **Création d'un compte (`INSERT`) :** Tout utilisateur authentifié peut créer un nouveau compte.
- **Ajout/Modif d'un membre (`INSERT`, `UPDATE`) :** Restreint à l'utilisateur lui-même (`user_id = auth.uid()`), lui permettant de rejoindre un compte avec un code ou de modifier son mode de contribution.
- **Lecture (`SELECT`) :** Restreinte aux comptes renvoyés par la fonction `get_my_accounts()`.
- **Suppression (`DELETE`) :** Bloquée par la fonction `is_account_member(id)`.

## 4. Tables Financières (`expenses`, `incomes`, `month_records`)
Les données sensibles héritent toutes de la même logique d'isolation stricte basée sur l'`account_id`.
- **Lecture et Modification (`SELECT`, `UPDATE`) :** Validées par la condition `account_id IN (SELECT get_my_accounts())`. Un utilisateur ne voit et ne modifie que les flux des comptes auxquels il appartient.
- **Création (`INSERT`) :** Autorisée uniquement si l'`account_id` cible fait partie des comptes de l'utilisateur (`account_id IN (SELECT get_my_accounts())`).
- **Suppression (`DELETE`) :** Autorisée uniquement si la fonction `is_account_member(account_id)` retourne `true`.