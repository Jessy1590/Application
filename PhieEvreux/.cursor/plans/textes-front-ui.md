# Plan — Textes / hints / commentaires UI (PhieEvreux)

Inventaire des phrases d’aide, hints et commentaires **visibles à l’écran** (hub + Location + shared UI).  
Commentaires JS `//` techniques exclus (sauf s’ils sont injectés en UI).

**Légende propositions :** `supprimer` | `bandeau information` | `tooltip ?` | `garder`

**Statut :** Seuils (S1–S3) + Paramètres Location admin (**1–22**) appliqués. Suite : confirmer **ligne par ligne** (23+) avant modification.

**Style bandeau (si retenu plus tard) :** encadré jaune libellé **Information**, proche `.loc-journal-box--suivi` / warn → créer `.loc-info-banner` réutilisable si besoin.

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
| 14 | `admin-location.js` (Règles) | Enregistrement automatique en changeant de règle. Priorité calculée automatiquement. Choisissez le template LGO sur chaque règle. | `supprimer` autosave ; `bandeau information` priorité + template | Priorité calculée automatiquement. Associez un template LGO à chaque règle. | **fait** |
| 15 | `admin-location.js` (Templates) | Pour ajouter un template hors règle, signalez-le via le bouton Bug (ou « Nouveau… » depuis une règle). | `bandeau information` | Pour un template hors règle --> signaler une Amélioration via le bouton bug. | **fait** |
| 16 | `admin-location.js` (Templates) | Motif sélectionné : … — enregistrement auto à chaque modification. | `supprimer` | — | **fait** |
| 17 | `admin-location.js` (Templates) | Placeholders dans le corps : `{date_min}` … `{type_appareil}` … | `bandeau information` (liste complète + explications) | Placer `{…}` dans le corps pour un affichage avec les données du suivi ; légende par placeholder. | **fait** |
| 18 | `admin-location.js` (Spécificité appareil) | Champs spécifiques par type d’appareil (table location_champs_creation). | `bandeau information` | Champs propres à chaque type d’appareil, affichés à la création et au suivi | **fait** |
| 19 | `admin-location.js` (Spécificité appareil) | Type : … — enregistrement auto en changeant de champ. | `supprimer` | — | **fait** |
| 20 | `admin-location.js` (options champ liste) | Pas d’options pour ce type de champ. | `garder` | — | **fait** |
| 21 | `admin-location.js` (options champ liste) | Choix de la liste | `garder` | — | **fait** |
| 22 | `admin-location.js` (conditions règle) | Aucune condition. Ajoutez-en une ci-dessous. | `garder` | — | **fait** |

---

## À confirmer — Création

| # | Fichier | Texte actuel (extrait) | Proposition | Nouveau texte si rewrite |
|---|---------|------------------------|-------------|--------------------------|
| 23 | `creation.js` | Fin calculée : … | `garder` (résultat dynamique, pas un pavé d’aide) | — |
| 24 | `creation.js` | placeholder « Rechercher un patient existant (nom / prénom) » | `garder` | — |
| 25 | `creation.js` | placeholder « texte libre » (Code OP) | `supprimer` (placeholder redondant) | — |
| 26 | `creation.js` | placeholder « si disponible » (Matricule) | `tooltip ?` près du libellé Matricule | Si le matricule est connu. |
| 27 | `creation.js` | placeholder « Notes libres… » (Commentaire) | `garder` | — |
| 28 | `creation.js` | Encarts « Attention » (libellés dynamiques admin) | `garder` | — |

---

## À confirmer — Suivi

| # | Fichier | Texte actuel (extrait) | Proposition | Nouveau texte si rewrite |
|---|---------|------------------------|-------------|--------------------------|
| 29 | `suivi.js` | (désactivé à la création) — suffixe champs | `tooltip ?` près du libellé concerné | Champ non proposé à la création ; modifiable ici. |
| 30 | `suivi.js` | Remet le dossier en file Commentaire (LGO à refaire). Les autres contacts ouverts du dossier sont annulés. | `tooltip ?` près de « Invalider le commentaire » | Remet le dossier en file Commentaire (LGO à refaire) et annule les autres contacts ouverts. |
| 31 | `suivi.js` | Confirmez les éléments de clôture. Pour chaque « Oui », indiquez la date et qui l’a fait. | `bandeau information` | Pour chaque réponse « Oui », renseignez la date et l’opérateur. |
| 32 | `suivi.js` | placeholder recherche « Recherche nom / prénom » | `garder` | — |

---

## À confirmer — Contact

| # | Fichier | Texte actuel (extrait) | Proposition | Nouveau texte si rewrite |
|---|---------|------------------------|-------------|--------------------------|
| 33 | `contact.js` | Puis choisissez le résultat (note vide par défaut). | `supprimer` | — |
| 34 | `contact.js` | Puis choisissez le statut : | `supprimer` | — |
| 35 | `contact.js` | Titre encadré « Suivi appels déjà effectué » | `garder` | — |
| 36 | `contact.js` | placeholder « Ex. a décroché, ton… » | `garder` | — |
| 37 | `contact.js` | placeholder « Obligatoire » | `garder` | — |

---

## À confirmer — Facture

| # | Fichier | Texte actuel (extrait) | Proposition | Nouveau texte si rewrite |
|---|---------|------------------------|-------------|--------------------------|
| 38 | `facture.js` | Collez les matricules présents sur la facture (un par ligne, ou séparés par virgule / espace). Uniquement les dossiers prestataire. Délai de clôture : N j. | `bandeau information` | Collez les matricules de la facture (ligne, virgule ou espace). Dossiers prestataire uniquement. Délai de clôture : N j. |
| 39 | `facture.js` | Matricule sur la facture et dossier prestataire non clôturé. | `tooltip ?` près du titre de section « Présents / ouverts » (ou équivalent UI) | — |
| 40 | `facture.js` | Matricule sur la facture et dossier prestataire clôturé depuis moins de N j. | `tooltip ?` près de la section correspondante | — |
| 41 | `facture.js` | Dossier prestataire non clôturé dont le matricule n’apparaît pas sur la facture. | `tooltip ?` près de la section correspondante | — |
| 42 | `facture.js` | Matricule sur la facture sans dossier prestataire correspondant. | `tooltip ?` près de la section correspondante | — |

---

## À confirmer — Parc

| # | Fichier | Texte actuel (extrait) | Proposition | Nouveau texte si rewrite |
|---|---------|------------------------|-------------|--------------------------|
| 43 | `parc.js` | Choisissez un prestataire pour voir les dossiers en cours. | `garder` | — |
| 44 | `parc.js` | Déjà utilisés, pas en location actuellement | `garder` | — |
| 45 | `parc.js` | Parc pharmacie actuellement loué | `garder` | — |

---

## À confirmer — Impression

| # | Fichier | Texte actuel (extrait) | Proposition | Nouveau texte si rewrite |
|---|---------|------------------------|-------------|--------------------------|
| 46 | `impression.js` | Joindre copie d’ordonnance. | `garder` | — |

---

## À confirmer — Accueil Location (tuiles)

| # | Fichier | Texte actuel (extrait) | Proposition | Nouveau texte si rewrite |
|---|---------|------------------------|-------------|--------------------------|
| 47 | `app/location/index.html` | Nouvelle fiche location | `garder` | — |
| 48 | `app/location/index.html` | Fiches et prolongations | `garder` | — |
| 49 | `app/location/index.html` | Patients à contacter | `garder` | — |
| 50 | `app/location/index.html` | Vérification dossier prestataire | `garder` | — |
| 51 | `app/location/index.html` | Prestataires et parc pharmacie | `garder` | — |
| 52 | `app/location/index.html` | Règles, prestataires, seuils | `garder` | — |

---

## À confirmer — Hub PhieEvreux

| # | Fichier | Texte actuel (extrait) | Proposition | Nouveau texte si rewrite |
|---|---------|------------------------|-------------|--------------------------|
| 53 | `index.html` | Choisissez une application | `garder` | — |
| 54 | `index.html` | Suivi locations existant (comptes, appels, fiches). | `garder` | — |
| 55 | `index.html` | Création, suivi et contact — nouvelle application. | `garder` | — |
| 56 | `index.html` | Gestion des signalements (admin). | `supprimer` (bouton déjà explicite) | — |

---

## À confirmer — Shared (FABs / bugs)

| # | Fichier | Texte actuel (extrait) | Proposition | Nouveau texte si rewrite |
|---|---------|------------------------|-------------|--------------------------|
| 57 | `shared/fab.js` | title / aria « Accueil » | `garder` | — |
| 58 | `shared/fab.js` | title / aria « Signaler un bug » | `garder` | — |
| 59 | `shared/bugs.js` | placeholder « Résumé court » | `garder` | — |
| 60 | `shared/bugs.js` | placeholder « Détails, étapes… » | `garder` | — |

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
3. Pour chaque ligne **23–60** : confirmer ou ajuster la proposition.
4. Ensuite seulement : appliquer les changements validés.
