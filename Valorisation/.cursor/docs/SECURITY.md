# 🔒 Sécurité et RLS (Row Level Security)

Ce document décrit les règles de sécurité (Policies) appliquées sur le schéma `valorisation` de la base Supabase[cite: 3]. Ces règles protègent les données métiers face aux requêtes du client.

## 1. Philosophie Générale
L'architecture de sécurité repose sur un modèle de propriété (ownership) et de délégation. L'accès aux données est strictement restreint au propriétaire du projet (`owner`) ou aux utilisateurs explicitement invités (`shared_with`)[cite: 3].

## 2. Table `projects`
- **Droits du propriétaire :** Les actions `SELECT`, `INSERT`, `UPDATE`, et `DELETE` sont contrôlées par des règles dédiées (ex: `projects_select_own`) qui exigent que la condition `owner = auth.uid()` soit respectée[cite: 3].
- **Accès partagé (Collaborateurs) :** Une règle globale nommée `Acces_Proprietaire_Et_Amis` autorise toutes les opérations (`ALL`) si l'utilisateur courant est le propriétaire (`auth.uid() = owner`) OU si son ID se trouve dans le tableau des collaborateurs (`auth.uid() = ANY (shared_with)`)[cite: 3].

## 3. Tables Enfant (`parametres` et `bilans`)
Ces tables ne possèdent pas de colonne `owner`. Elles héritent de la sécurité de la table parente `projects` grâce à une jointure de vérification[cite: 3].
- **Vérification du propriétaire :** Pour toute action basique (ex: `parametres_select_own` ou `bilans_update_own`), Supabase valide l'accès avec une requête `EXISTS` : il cherche dans `valorisation.projects` si la ligne correspondante (`p.id = project_id`) appartient bien à l'utilisateur (`p.owner = auth.uid()`)[cite: 3].
- **Vérification des accès partagés :** Les règles `Acces_Amis_Parametres` et `Acces_Amis_Bilans` accordent tous les droits (`ALL`) si le projet lié appartient à l'utilisateur, ou si ce dernier figure dans le tableau `p.shared_with` du projet parent[cite: 3].

## 4. Table `import_mappings`
- **Espace strictement privé :** Cette table n'est rattachée à aucun projet mais directement à l'utilisateur. 
- Les politiques `mappings_select_own`, `mappings_insert_own`, `mappings_update_own` et `mappings_delete_own` limitent chaque action à la condition stricte : `user_id = auth.uid()`[cite: 3]. 
- **Conséquence :** Les préférences d'import IA d'un utilisateur ne sont jamais partagées, même au sein d'un projet commun.