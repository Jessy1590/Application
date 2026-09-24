# 📍 État actuel du projet (STATE) - Portail Vaccins

## Fonctionnalités actives et terminées
- **Architecture de Base :** Séparation propre HTML / CSS / JS avec protection globale par un script externe (`protect.js`)[cite: 5, 6].
- **Affichage et UI :** Tableau dynamique avec surlignage des termes de recherche (`highlight`), tri ascendant/descendant par colonne, et filtrage combiné (texte + situations particulières)[cite: 4].
- **Mode Responsive & Impression :** Adaptation des tableaux en cartes sur mobile (`@media (max-width: 768px)`) et interface épurée pour l'impression PDF (`@media print`)[cite: 5].
- **Gestion du Rôle Admin :** Vérification asynchrone du rôle `admin` dans `portail.profiles` pour déverrouiller l'édition, l'ajout et la suppression des lignes[cite: 4].
- **Édition Avancée :** 
  - Formulaire d'ajout/modification fonctionnel avec intégration de **Quill.js** pour la saisie de texte enrichi (HTML) sur les détails et modalités de rattrapage[cite: 4].
  - Gestion des couleurs personnalisées par vaccin (avec fallback automatique `getFallbackColor` si vide)[cite: 4].
- **Configuration Globale :** Panneau d'administration permettant de forcer la date de mise à jour, la légende et les filtres, le tout sauvegardé dans une ligne système (`__PARAMETRES__`) de la table `vaccins`[cite: 4].
- **Import / Export :** Fonctions implémentées pour exporter la base en JSON et importer de nouvelles données en masse[cite: 4].

## Données métier
- **Source :** Calendrier vaccinal 2026 (Ministère de la Santé, avril 2026) + Vaccination Info Service.
- **Fichier miroir local :** `data/vaccins-calendrier-2026.json` (34 valences + paramètres).
- **Contenu :** schémas thérapeutiques concis, correspondances valences ↔ noms commerciaux, arrêts de commercialisation (Revaxis, NeisVac, HBVaxPro 10 µg, etc.), rattrapages et situations particulières.

## UI (refonte)
- Filtres par **famille** (chips) + situations + recherche globale (y compris détails/rattrapage).
- **Badges** automatiques (Obligatoire, Grossesse, Senior, Voyage, Pro, Officine, Transition…).
- Modale enrichie (calendrier mis en avant, badges, lien VIS, mention pharmacien).
- En-tête source Calendrier 2026 / VIS, compteur de fiches, légende repliable, sticky header tableau.
- **Admin corrigé :** Quill lazy-init, sync session Auth → client `autres`, boutons Éditer toujours visibles si admin, sauvegarde avec `.select()` + messages d’erreur RLS, édition depuis la modale. 