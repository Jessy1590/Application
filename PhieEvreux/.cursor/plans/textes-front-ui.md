# Plan — Textes / hints / commentaires UI (PhieEvreux)

Inventaire des phrases d’aide, hints et commentaires **visibles à l’écran** (hub + Location + shared UI).  
Commentaires JS `//` techniques exclus (sauf s’ils sont injectés en UI).

**Légende propositions :** `supprimer` | `bandeau information` | `tooltip ?` | `garder`

**Statut :** Seuils (S1–S3) + Paramètres Location admin (**1–22**) + Création → Shared (**23–60**) appliqués.

**Style bandeau :** `.loc-info-banner` (libellé **Information**) + `.loc-help-tip` (popover « ? »).

---

## Déjà appliqué — onglet Seuils (`admin-location.js` → `renderParams`)

| # | Fichier | Texte actuel (extrait) | Proposition | Nouveau texte si rewrite | Statut |
|---|---------|------------------------|-------------|--------------------------|--------|
| S1 | `app/location/js/admin-location.js` | Enregistrement automatique à chaque modification. | `supprimer` | — | **fait** |
| S2 | `app/location/js/admin-location.js` | Visibilité / obligation des champs création : onglet Création dossier. | `supprimer` | — | **fait** |
| S3 | `app/location/js/admin-location.js` | Sans règle spécifique : mois depuis la fin de la dernière prolongation (< seuil → prolongation ; ≥ seuil → réclamer l’appareil). | `tooltip ?` à côté de « Seuil réclamer appareil (mois) » | Sans règle LGO spécifique : on compte les mois depuis la fin de la dernière prolongation. En dessous du seuil → prolongation ; au seuil ou au-delà → réclamer l’appareil. | **fait** (popover `.loc-help-tip` hover/focus/clic) |

---

## Appliqué — Paramètres Location (admin)

| # | Fichier | Texte actuel (extrait) | Proposition | Nouveau texte si rewrite | Statut |
|---|---------|------------------------|-------------|--------------------------|--------|
| 1 | `admin-location.js` (Accès) | L’UI Location suit cette matrice ; la RLS reste la source de vérité serveur. | `supprimer` | — | **fait** |
| 2 | `admin-location.js` (Accès) | Administrateur = rôle équipe `administrateur` ou profil portail `admin`. | `supprimer` | — | **fait** |
| 3 | `admin-location.js` (Accès) | Hub (équipe / invitations / bugs) : non piloté ici — reste `PhieEquipe` (admin uniquement). | `supprimer` | — | **fait** |
| 4 | `admin-location.js` (Accès) | Enregistrement automatique à chaque modification. | `supprimer` | — | **fait** |
| 5 | `admin-location.js` (Accès) | Lecture seule — seule un administrateur peut modifier les accès. | `supprimer` | — | **fait** |
| 6 | `admin-location.js` (Accès, `title` case) | Toujours autorisé pour l’administrateur (verrouillé) | `supprimer` (case sans title) | — | **fait** |
| 7 | `admin-location.js` (Accès, `title` case) | Géré par PhieEquipe sur le hub (hors matrice Location) | `supprimer` (case sans title) | — | **fait** |
| 8 | `admin-location.js` (Accès, `title` case) | Modification réservée aux administrateurs | `supprimer` (case sans title) | — | **fait** |
| 9 | `admin-location.js` (Accès) | (hub) — suffixe libellé fonctionnalité | `supprimer` | — | **fait** |
| 10 | `admin-location.js` (Création dossier) | Visibilité et obligation des champs du formulaire Création (hors spécificités par type d’appareil). | `bandeau information` | Ici : afficher ou rendre obligatoire chaque champ du formulaire Création (hors champs propres à un type d’appareil). | **fait** |
| 11 | `admin-location.js` (Création dossier) | Étape : … — enregistrement auto. | `supprimer` | — | **fait** |
| 12 | `admin-location.js` (Création dossier) | Ajouter une information à cette étape (texte libre à la création / suivi). | `tooltip ?` près de « ＋ Ajouter » | Ajoute un champ libre visible à la création et au suivi pour cette étape. | **fait** |
| 13 | `admin-location.js` (Prestataires) | Les prestataires existants s’enregistrent automatiquement. | `supprimer` | — | **fait** |
| 14 | `admin-location.js` (Règles) | Enregistrement automatique en changeant de règle. Priorité calculée automatiquement. Choisissez le template LGO sur chaque règle. | `supprimer` autosave ; `bandeau information` | Si besoin de créer une nouvelle règle alors déclarer une amélioration via le bouton bug. N'oubliez pas d'associer un template commentaire à chaque règle. | **fait** |
| 15 | `admin-location.js` (Templates) | Pour ajouter un template hors règle, signalez-le via le bouton Bug (ou « Nouveau… » depuis une règle). | `supprimer` bandeau information | — | **fait** |
| 16 | `admin-location.js` (Templates) | Motif sélectionné : … — enregistrement auto à chaque modification. | `supprimer` | — | **fait** |
| 17 | `admin-location.js` (Templates) | Placeholders dans le corps : `{date_min}` … `{type_appareil}` … | `bandeau information` (liste complète + explications) | Placer `{…}` dans le corps pour un affichage avec les données du suivi ; légende par placeholder. | **fait** |
| 18 | `admin-location.js` (Spécificité appareil) | Champs spécifiques par type d’appareil (table location_champs_creation). | `bandeau information` | Champs personnalisés à chaque type d’appareil, affichés à la création et au suivi | **fait** |
| 19 | `admin-location.js` (Spécificité appareil) | Type : … — enregistrement auto en changeant de champ. | `supprimer` | — | **fait** |
| 20 | `admin-location.js` (options champ liste) | Pas d’options pour ce type de champ. | `garder` | — | **fait** |
| 21 | `admin-location.js` (options champ liste) | Choix de la liste | `garder` | — | **fait** |
| 22 | `admin-location.js` (conditions règle) | Aucune condition. Ajoutez-en une ci-dessous. | `garder` | — | **fait** |

---

## Appliqué — Création

| # | Fichier | Texte actuel (extrait) | Proposition | Nouveau texte si rewrite | Statut |
|---|---------|------------------------|-------------|--------------------------|--------|
| 23 | `creation.js` | Fin calculée : … | `garder` | — | **fait** |
| 24 | `creation.js` | placeholder « Rechercher un patient existant (nom / prénom) » | `garder` | — | **fait** |
| 25 | `creation.js` | placeholder « texte libre » (Code OP) | `supprimer` | — | **fait** |
| 26 | `creation.js` | placeholder « si disponible » (Matricule) | `tooltip ?` près du libellé Matricule | Si le matricule est connu. | **fait** |
| 27 | `creation.js` | placeholder « Notes libres… » (Commentaire) | `supprimer` | — | **fait** |
| 28 | `creation.js` | Encarts « Attention » (libellés dynamiques admin) | `garder` | — | **fait** |

---

## Appliqué — Suivi / Clôture

| # | Fichier | Texte actuel (extrait) | Proposition | Nouveau texte si rewrite | Statut |
|---|---------|------------------------|-------------|--------------------------|--------|
| 29 | `suivi.js` | (désactivé à la création) — suffixe champs | `garder` | — | **fait** |
| 30 | `suivi.js` | Remet le dossier en file Commentaire (LGO à refaire). Les autres contacts ouverts du dossier sont annulés. | `tooltip ?` près de « Invalider le commentaire » | Remet le dossier en file Commentaire. | **fait** |
| 31 | `cloture.js` (modal) | Confirmez les éléments de clôture… | `bandeau information` | Pour chaque réponse « Oui », renseignez la date et l’opérateur. | **fait** |
| 32 | `suivi.js` | placeholder recherche « Recherche nom / prénom » | `garder` | — | **fait** |

---

## Appliqué — Contact

| # | Fichier | Texte actuel (extrait) | Proposition | Nouveau texte si rewrite | Statut |
|---|---------|------------------------|-------------|--------------------------|--------|
| 33 | `contact.js` | Puis choisissez le résultat (note vide par défaut). | rewrite sur place | Choisissez le résultat de l'appel | **fait** |
| 34 | `contact.js` | Puis choisissez le statut : | rewrite sur place | Choisissez le statut de l'appel | **fait** |
| 35 | `contact.js` | Titre encadré « Suivi appels déjà effectué » | `garder` | — | **fait** |
| 36 | `contact.js` | placeholder « Ex. a décroché, ton… » | `garder` | — | **fait** |
| 37 | `contact.js` | placeholder « Obligatoire » | `garder` | — | **fait** |

---

## Appliqué — Facture

| # | Fichier | Texte actuel (extrait) | Proposition | Nouveau texte si rewrite | Statut |
|---|---------|------------------------|-------------|--------------------------|--------|
| 38 | `facture.js` | Collez les matricules présents sur la facture… | `bandeau information` | Collez les matricules de la facture (ligne, virgule ou espace). Dossiers prestataire uniquement. Seuil du délai de clôture : N j. | **fait** |
| 39 | `facture.js` | Matricule sur la facture et dossier prestataire non clôturé. | `tooltip ?` près du titre « Normaux » | — | **fait** |
| 40 | `facture.js` | Matricule sur la facture et dossier prestataire clôturé depuis moins de N j. | `tooltip ?` près de « Sur facture mais clôturés » | — | **fait** |
| 41 | `facture.js` | Dossier prestataire non clôturé dont le matricule n’apparaît pas sur la facture. | `tooltip ?` près de « Ouverts absents… » | — | **fait** |
| 42 | `facture.js` | Matricule sur la facture sans dossier prestataire correspondant. | `tooltip ?` près de « Matricules sans dossier » | — | **fait** |

---

## Appliqué — Parc

| # | Fichier | Texte actuel (extrait) | Proposition | Nouveau texte si rewrite | Statut |
|---|---------|------------------------|-------------|--------------------------|--------|
| 43 | `parc.js` | Choisissez un prestataire pour voir les dossiers en cours. | `garder` | — | **fait** |
| 44 | `parc.js` | Déjà utilisés, pas en location actuellement | `garder` | — | **fait** |
| 45 | `parc.js` | Parc pharmacie actuellement loué | `garder` | — | **fait** |

---

## Appliqué — Impression

| # | Fichier | Texte actuel (extrait) | Proposition | Nouveau texte si rewrite | Statut |
|---|---------|------------------------|-------------|--------------------------|--------|
| 46 | `impression.js` | Joindre copie d’ordonnance. | `garder` | — | **fait** |

---

## Appliqué — Accueil Location (tuiles)

| # | Fichier | Texte actuel (extrait) | Proposition | Nouveau texte si rewrite | Statut |
|---|---------|------------------------|-------------|--------------------------|--------|
| 47 | `app/location/index.html` | Nouvelle fiche location | `garder` | — | **fait** |
| 48 | `app/location/index.html` | Fiches et prolongations | `garder` | — | **fait** |
| 49 | `app/location/index.html` | Patients à contacter | `garder` | — | **fait** |
| 50 | `app/location/index.html` | Vérification dossier prestataire | rewrite desc | Vérification dossier en cours du prestataire | **fait** |
| 51 | `app/location/index.html` | Prestataires et parc pharmacie | rewrite desc | Parc prestataires et interne pharmacie | **fait** |
| 52 | `app/location/index.html` | Règles, prestataires, seuils | `garder` | — | **fait** |

---

## Appliqué — Hub PhieEvreux

| # | Fichier | Texte actuel (extrait) | Proposition | Nouveau texte si rewrite | Statut |
|---|---------|------------------------|-------------|--------------------------|--------|
| 53 | `index.html` | Choisissez une application | `garder` | — | **fait** |
| 54 | `index.html` | Suivi locations existant (comptes, appels, fiches). | `garder` | — | **fait** |
| 55 | `index.html` | Création, suivi et contact — nouvelle application. | `garder` | — | **fait** |
| 56 | `index.html` | Gestion des signalements (admin). | `supprimer` | — | **fait** |

---

## Appliqué — Shared (FABs / bugs)

| # | Fichier | Texte actuel (extrait) | Proposition | Nouveau texte si rewrite | Statut |
|---|---------|------------------------|-------------|--------------------------|--------|
| 57 | `shared/fab.js` | title / aria « Accueil » | `garder` | — | **fait** |
| 58 | `shared/fab.js` | title / aria « Signaler un bug » | `garder` | — | **fait** |
| 59 | `shared/bugs.js` | placeholder « Résumé court » | `garder` | — | **fait** |
| 60 | `shared/bugs.js` | placeholder « Détails, étapes… » | `garder` | — | **fait** |

---

## Hors inventaire (volontairement)

- États vides / chargement (« Chargement… », « Aucune fiche. », « Sélectionnez… », toasts d’erreur/succès).
- Libellés de champs, boutons, onglets, chips.
- Commentaires code `//` non affichés.
- App Ancienne Location (hors périmètre demandé : hub + Location + shared visible).
- Tests LGO : ne pas supprimer.

---

## Rappel process

1. Seuils : **déjà corrigé** (S1–S3).
2. Paramètres Location admin (**1–22**) : **appliqué**.
3. Création → Shared (**23–60**) : **appliqué**.
