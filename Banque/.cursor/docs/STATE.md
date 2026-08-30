# 📍 État actuel du projet (STATE) - Budget Partagé

## Fonctionnalités actives et terminées
- **Core Budgeting :** Gestion complète du CRUD pour les dépenses, les revenus, et les comptes partagés.
- **Concept de Portefeuilles (Enveloppes) :** Possibilité de transformer une dépense fixe en un "Portefeuille" mensuel dans lequel on ajoute de multiples petites transactions manuelles.
- **Gestion Avancée du Partage :** 
  - Définition des modes d'apport : Montant Fixe, Pourcentage, ou Prorata des revenus croisés.
  - Calcul intelligent des dettes croisées ("Qui doit quoi") pour régulariser les avances personnelles.
- **Suivi Mensuel (Time-Travel) :** Validation des dépenses mois par mois stockée dans `month_records` via JSONB. Possibilité de remonter dans le temps.
- **Flexibilité de Saisie :** Fonctionnalité "Montant différent" permettant de valider une facture avec un montant ponctuel (uniquement pour le mois) ou durable (mise à jour du budget).
- **Statistiques et Visualisation :** 
  - Graphiques en camembert (SVG natifs générés par JS).
  - Évolution des dépenses sur 12 mois.
  - Comparatif précis mois en cours vs mois précédent (MoM).
  - Calcul de la capacité d'épargne globale.
- **Outils Avancés :**
  - Export CSV et PDF.
  - Système de Backup local / Restauration (JSON complet).
  - Notifications locales pour alerter sur les échéances proches (à j-2).
- **Interface Mobile-First (PWA) :** App visuellement proche d'une application native iOS/Android, avec barre de navigation flottante et "bottom sheets" (tiroirs) pour les modales.

## Prochaines étapes de développement (TODO)
*(Liste à mettre à jour lors de nos prochaines sessions de développement)*
- [ ] Mettre en place un système de relances widget sur iphone pour validé facilement les données.
- [ ] Mettre en place un systeme de lecture du compte bancaire en directe ou via un systeme tierce pour validé ou modifier les montants avec mon accord
