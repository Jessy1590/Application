# Projet : App Valorisation Pharmacie (Supabase + HTML)

## Statut : EN COURS - Phase 1 : Analyse du classeur Excel

## Consignes utilisateur clés
- 1 seul fichier HTML (avec JS dedans) pour faciliter relecture — pas un JS par section
- Auth = Supabase Auth (simple)
- Schema Postgres dédié : `valorisation`
- Hébergement : GitHub Pages (donc pas de build step compliqué, HTML statique + supabase-js via CDN)
- Flow : Login -> Page projet pharmacie (saisie infos, case "non disponible" si manque) -> Paramètres (normes modifiables : coefficients valo, % marge théorique etc.) -> 3 onglets : Évaluation / Valorisation et prêt / Prévisionnel
- Distinction 3 types de champs (code couleur Excel) :
  - JAUNE (FFFFF2CC) = doit être écrit (input obligatoire utilisateur)
  - ORANGE (FFFCE5CD) = peut être modifié (valeur par défaut param national, éditable)
  - BLANC/aucun = ne doit pas être modifié (calculé, lecture seule)
- Import IA : bouton "Import" dans Paramètres -> ouvre modal avec un PROMPT généré (à copier-coller dans une IA externe avec les bilans en pièce jointe) -> IA retourne un JSON -> on colle le JSON -> parsing + pour les lignes ambigües (ex: "achats exonérés") on demande à l'utilisateur de choisir la case de destination -> auto-append règle prochaine fois (mapping mémorisé)
- Utilisateur = expert-comptable/pharmacien, veut logique fidèle au classeur

## Structure classeur Excel source
Fichier: Evaluation_Pharmacie_Sotteville.xlsx
Onglets :
1. Consignes (légende couleurs)
2. Données nationales et valorisat (= PARAMÈTRES nationaux/valorisation, modifiables) A2:M31
3. Données Vierge Bilan (= template pour saisie des données comptables brutes, gros tableau A1:Z999)
4. Evaluation pharmacie A1:K66
5. Valorisation et prêt A1:AA1004 (gros, avec tableau amortissement prêt)
6. Prévisionnel A1:U103

## Analyse détaillée

### Onglet "Données nationales et valorisat" (= table `parametres`)
Colonnes A-D : Barèmes multiples de valorisation (CA>, CA<, Marge>, Marge<, EBE>, EBE<) calculés comme moyenne (national/quartier/normandie), éditable (orange). C9 = "Marge pour valorisation" input orange (400 k€ dans exemple), sert de seuil pour choisir quel multiple utiliser (> ou < C9).
Colonnes F-H : Ratios nationaux (Ratio Clients jours, Trésorerie jours, Fournisseurs jours, Stock jours, Evolution CA %, Charges Externes %, Charges Personnel %, Production théorique €, Marge Brute commerciale %, Produits 150-1930€ ratio, Disponibilité BFR initial %, Taux EBE/CA %, Taux EBE/Marge %) -- tous éditables (orange), valeurs par défaut nationales
F18-25 : paramètres prévisionnel (évolution CA/charges/salaires estimé %, charges sociales exploitant %, rémunération souhaitée exploitant €, impôts théorique €, nbre années amortissement travaux) -- éditables (orange)
Colonnes J-K : Frais transaction (Honoraire transaction % + TVA, honoraire comptable €, honoraire juridique €, frais acquisition %, travaux €, taux bancaire %, durée prêt ans, taux booster %, durée booster ans, in fine ?, stock financement mode, besoin BFR ?) -- MIX jaune (obligatoire, saisie précise dossier) et orange (défauts modifiables)
J18-22 : Apports (capital perso, CC perso, associé exécutant, associé investisseur, booster) -- JAUNE obligatoire
J25-27+ : Barème IS (tranches, seuils, taux, différentiel calculé) -- reste à lire suite (tronqué à ligne 27, à vérifier s'il y a plus)

TODO reste à analyser :
- [ ] fin tableau IS (Données nationales) au-delà ligne 27
- [ ] Données Vierge Bilan (structure complète)
- [ ] Evaluation pharmacie (formules complètes)
- [ ] Valorisation et prêt (formules complètes, tableau amortissement)
- [ ] Prévisionnel (formules complètes)
- [ ] Mapping exact des couleurs par cellule de chaque onglet (pour input/editable/readonly UI)

## Architecture technique décidée
(à compléter une fois analyse terminée)

## Décisions en attente / questions pour Jessy
(à compléter)

### Onglet "Données Vierge Bilan" (= saisie brute comptable, 3 années N/N-1/N-2 en colonnes A-E / G-K / M-Q)
Structure répétée 3x (une fois par année, mêmes lignes, colonnes décalées de 6 : A-E puis G-K puis M-Q) :

**Bloc CA VENTES (lignes 5-12)** table Excel "CA_VENTES" cols: Nom | Valeur HT (JAUNE input) | % TVA (orange/blanc) | Valeur TVA (=HT*%TVA, calc) | Valeur TTC (=HT+TVA, calc)
Lignes: Ventes 0%, Ventes 2,1%, Ventes 5,5%, Ventes 10%, Ventes 20%, Hono. Dispensation totaux (2.1%) | TOTAL (SUM)

**Bloc CA PRESTATIONS (15-22)** table "CA_PRESTA": Activités 0%, Locations, Préparations, Préparations 5.5%, Autres 2.1%, ROSP 0%, Gardes 0% | TOTAL
(HT = jaune input, %TVA = orange éditable ici contrairement au bloc ventes où c'est éditable aussi en fait -- N-1/N-2 ont %TVA en blanc readonly car copié de N)

**Bloc ACHATS (25-32)** table "ACHATS": Achats 0%/2.1%/5.5%/10%/20%, Mat Location 20% | HT jaune input, %TVA readonly(blanc, fixe par taux), Valeur TVA calc, TTC calc | TOTAL

**Bloc Remises/RFA/Escompte + récap CA (35-39)**
Gauche (A-B): Remise commercial (jaune, négatif), RFA (jaune), Escompte (jaune) -> TOTAL = SUM (= "Achats_remisé")
Droite (D-E): récap CA VENTES total HT / CA PRESTA total HT / TOTAL HT (= CA_TOTAL_HT, calculé, référence aux tables du dessus)

**Bloc Stock (42-45)**
Gauche : Stock initial (jaune), Stock Final (jaune) -> Total = Stock initial - Stock final (orange, formule mais catégorisée modifiable ds excel -- en réalité calculée, à traiter comme calculé)
Droite : récap CA TTC (Ventes TTC, Presta TTC, Total TTC) -- calculé

**Bloc Achats total + conso (48-51)**
Gauche : Achats total remisé (calc = ACHATS total - remises total), Variation Stock (calc), Total Achats Conso (calc = SUM)
Droite : Charges externes détail partiel démarre ici (Eau/Énergie, Carburant, Prod entretien, Fournitures bureau, Emballages...) tous JAUNE input -- suite bloc plus bas

**Bloc Bilan / Soldes (54-65 col A-B)** -- tous JAUNE (saisie bilan) sauf notés:
Créances Clients TTC, Dettes fournisseurs, Compte Grossiste, Disponibilité, Salaires personnel, Charges personnel, Rémunération gérance, Charges gérance, Avantage en nature (formule =E50+E60+E65 mais classé jaune -> en fait override possible), Impots et Taxes (hors IS), Effectif temps plein

**Bloc Charges Externes détail complet (col D-E, lignes 49-81)** -- table "Charges_Externe", tout JAUNE (saisie manuelle bilan), ~30 lignes:
Eau/Énergie, Carburant, Prod entretien/petit outillage, Fournitures bureau, Emballages, Frais généraux grossiste, Loyers, Locations mobilières, Charges locatives, Entretien immeuble, Entretien mat/mob, Entretien véhicules, Maintenance ordinateur, Maintenance carte vitale, Assurances, Assurance prêt, Assurance véhicule, Timbres/téléphone, Travaux externes divers, Pourboires/dons, Voyages et déplacements, Frais séminaires, Honoraires, Cadeaux clientèle, Missions et réceptions, Frais internet, Frais CB, Cotisations, Documentation générale, Frais actes et contentieux, Transports sur achats, Frais bancaires TVA
-> TOTAL = SUM(Charges_Externe)

**Bloc CA HT Bilan / Marge / EBE Bilan (68-80 col A-B)** JAUNE (valeurs du bilan officiel, pour recoupement/contrôle):
CA HT Bilan, Retrocessions, Honoraires Coop, Maison Retraite/MAS/EHPAD (orange), Vaccination (orange), Marge Brute globale Bilan, EBE Bilan, CSG déductible, Autres retraitements (orange), Tiers payant, Fonds Eléments incorporels, Fonds Eléments corporels

**Bloc répartition CA par tranche prix (84-89)** table col D-E: "0€ à 1,91€", "1,92€ à 22,90€", "22,91€ à 150€", "150€ à 1930€", "> 1930€" -> % du CA, JAUNE input (uniquement année N il semble, pas dupliqué x3 -- à vérifier, vu que je n'ai lu que le bloc de gauche, pas sûr si dupliqué à droite; d'après le dump ça n'apparait qu'une fois en D84:E89, donc uniquement 1 seule fois, probablement pour année N seulement)

NOTE IMPORTANTE: ce sheet sert de SAISIE BRUTE (input) des données comptables de bilan par année (N, N-1, N-2) -> table SQL `bilans_annuels` avec colonne "annee_offset" (0,-1,-2) ou année réelle, et toutes ces ~90 valeurs en colonnes JSON ou colonnes dédiées.
C'est CE tableau qui est la cible de l'import IA (bouton "Import" -> JSON -> dispatch vers ces champs).

TODO reste :
- [ ] Evaluation pharmacie (à faire)
- [ ] Valorisation et prêt (à faire)
- [ ] Prévisionnel (à faire)

### Onglet "Evaluation pharmacie" (100% CALCULÉ, aucune saisie manuelle — lecture seule)
Toutes les cellules sont des formules tirant de "Données Vierge Bilan" et "Données nationales et valorisat". Comparaison N vs N-1 (et N-2 pour CA).
Sections :
1. Ratios financiers (N et N-1) : Ratio Clients =(créances clients TTC*360)/CA TTC ; Ratio Trésorerie =((compte grossiste+disponibilité)*360)/achats totaux TTC ; Ratio Fournisseurs =(dettes fournisseurs*360)/achats totaux TTC ; Ratio Stock =(stock final*360)/achats consommés HT
2. Ratios exploitation : Evolution CA % = (CA_N - CA_N-1)/CA_N-1*100 ; Ratio Charges Externe % = charges externes/CA_N-1*100 ; Marge Brute sans 0% = (CA_HT - CA_0%) - (Achats_conso_HT - Achats_0%) ; Ratio Charges Personnels % = (salaires+charges personnel)/marge*100
3. Taux de marge commerciale : Marge_brute_commerciale = CA_Total_HT - Achats_Conso_HT ; Taux marge % = marge/CA_TTC_ventes*100 ; Production théorique = CA_ventes_HT.../ nombre paramètre G10 national -> ratio
4. EBE retraité : EBE = CA_ventes_HT + CA_presta_HT - achats_conso - charges_externes - impots_taxes - (salaires+charges+rémunération+charges gérance) ; EBE Retraité = EBE + Rémunération dirigeant + Activité exceptionnelle (input orange) ; Taux EBE/CA %, Taux EBE/Marge %
5. Tableau récap comparatif (graphique) : ligne par ratio, colonnes 2025(N)/2024(N-1)/Moyenne nationale (référence Données nationales et valorisat) — pour visualisation genre radar/bar chart comparant pharmacie vs moyenne nationale

=> Dans l'app : onglet "Évaluation" = dashboard 100% calculé (cards + graphique comparatif barres pharmacie vs moyenne nationale), avec 2 seuls champs éditables : "Activité exceptionnelle" (E44/K44, orange) par année.

### Onglet "Valorisation et prêt" (100% calculé sauf quelques inputs financement)
**Bloc VALORISATION (A4:E20)**
- Valorisation par CA = (CA HT Réf + Rétrocessions + Honoraires Coop - Maison retraite - Différence produits chers) * Coefficient CA (coef national selon seuil marge C9, cf param)
- Valorisation par EBE = SUM(EBE Bilan + CSG déductible + Autres retraitements + Tiers payant + Fonds incorp + Fonds corp) * Coefficient EBE (idem seuil)
- Valorisation par Marge = (Marge Brute Bilan + Vaccination) * Coefficient Marge (idem seuil)
- "Différence nationales/produits chers" = si (tranche 150-1930€ + tranche >1930€) > paramètre national G12(0.4) alors (dépassement)*CA_HT_bilan sinon 0
- Coefficient retenu (CA/EBE/Marge) = IF(marge_reference >= seuil C9*1000, coef ">", coef "<") -- seuil = paramètre C9 "Marge pour valorisation" en k€, comparé à Marge Brute Bilan (E17)
- **Valorisation théorique retenue = MOYENNE(Valo CA, Valo EBE, Valo Marge)** = ligne B19 "Valorisation théorique" (SUM/3)

**Bloc FINANCEMENT (G4:H31)** -- inputs mixtes:
- Frais transaction : Honoraire Transaction = %(J3 param)*Valorisation_théorique*120% ; Honoraire Comptable = param fixe ; Honoraire Juridique = param fixe ; Frais Acquisition = %param*Valorisation ; Travaux = param fixe ; TOTAL Besoins Financiers = somme lignes 7-14 (Valorisation+Frais transaction+Stock BFR si actif+Créances-Dettes fournisseurs = "BFR" table)
- BFR (table J24:K28): Stock=ratio_stock_national*achats_annuels/360 ; Créances clients=ratio_clients_national*ventes_ttc/360 ; Délai fournisseur=ratio_fournisseur_national*achats_ttc/360 ; Total BFR=Stock+Créances-Fournisseur
- "A Financer minimum apports" (H24, rose) = SUM(H8:H11)+H14+H6 (frais transaction+BFR+rétrocessions)
- "A Financer minimum emprunts" (H26) = Valorisation_théorique + EBE(conditionnel si financement="Prêt")
- Financement Stock (mode choix: "Prêt vendeur 12 fois" / "Apports directe" / "Emprunts bancaire") -- INPUT JAUNE (paramètre K13 national, mais peut être outrepassé par projet)
- Financement travaux (choix Apports/Prêt) -- INPUT G29 (orange, éditable projet)
- **"Reste à financer" (H31)** = grand total besoins - apports - emprunt banque -> doit tendre vers 0 (équilibre plan de financement)
- Emprunt banque montant (H25, INPUT éditable ex 800000) -- l'utilisateur ajuste ce montant pour équilibrer H31≈0

**Tableau amortissement PRÊT BANCAIRE (J4:N21)** -- 12 lignes (durée = param K9), formule mensuelle/annuelle PMT :
Annuité = PMT(taux_bancaire, durée_ans, -montant_prêt) [formule financière standard]
Intérêts an N = taux * capital restant dû fin année N-1
Capital remboursé = Annuité - Intérêts
Reste à rembourser = Reste précédent - Capital remboursé
=> nécessite implémentation JS de PMT (annuité constante) : PMT(rate, nper, pv) = -pv*rate/(1-(1+rate)^-nper) si in_fine=false. Note param K12 "In fine ?" TRUE dans exemple -> à vérifier si ça change la formule (si in fine, on ne rembourse que les intérêts chaque année sauf dernière où capital remboursé intégralement). Le classeur actuel semble utiliser PMT standard amortissable indépendamment du flag "in fine" (flag non branché dans la formule actuelle -- à signaler à Jessy, possible incohérence dans son fichier source, ou "in fine" sert ailleurs/pas encore implémenté par lui).

**Bloc APPORTS BOOSTER (M24:N29)** -- prêt "booster" in fine (remboursé en une fois, intérêts seuls chaque année) : Intérêts/an = Apport_booster*Taux_booster ; pas d'amortissement annuel affiché (remboursement total en fin de période, durée = param K11)


### Onglet "Prévisionnel" (calculé + quelques inputs "what-if")
**Bloc "Paramètre complémentaire prévi" (B4:E37) = Charges externes prévisionnelles**
Liste triée des ~31 charges externes (reprises de Charges_Externe du bilan) avec pour chacune :
- Checkbox "Gardé ?" (éditable, orange) : garder cette charge dans le prévisionnel ?
- "Autre Montant" (éditable, orange, optionnel) : si renseigné, remplace le montant du bilan
- "Valeur final" (calculé) = SI Autre Montant renseigné -> Autre Montant, SINON SI Gardé=VRAI -> montant venant du bilan (Charges_Externe), SINON 0
=> Total Charges Externes prévisionnelles = somme

**Bloc Salariés futurs (B40:D49)**
Salariés actuels repris du bilan (Pharmacienne C600, Préparatrice C300, Secrétaire C175, Femme de ménage C100) avec checkbox "Gardé ?" + montant fixe (chargé)
+ Lignes "nouvelles embauches" hypothétiques avec calcul conventionnel : Montant = coefficient_horaire * (151.67 - éventuel abattement) * 140% * 12 mois (140% = charges patronales approx, 151.67 = heures mensuelles temps plein) -- coefficient + checkbox éditables
Total = somme des lignes gardées (D49)

**Bloc PRÉVISIONNEL 12 ans (G4:U25)** — colonnes Année 0 à Année 12, calculé automatiquement (aucune saisie sauf ligne 12 Rémunération exploitants qui a des valeurs par défaut modifiables an par an, ici 42000 fixe) :
- CA HT : Année0 = CA HT bilan réf, années suivantes = précédent*(1+evolution_CA_estimé%)
- Taux marge brute = constant (bilan) reconduit chaque année
- Marge commerciale K€ = CA*taux_marge
- Charges externes : Année0 = Total charges externes prévisionnelles (bloc ci-dessus), suivantes = précédent*(1+evolution_charges_estimé%)
- Impôts et taxes = constant (ratio national reconduit)
- Salaires et charges personnel : Année0 = total salariés futurs, suivantes = précédent*(1+evolution_salaires_estimé%)
- **EBE retraité** = Marge commerciale - Charges externes - Impôts/taxes - Salaires (à partir Année1, Année0 non calculée dans le modèle original — sert de base)
- Rémunération exploitants = param national par défaut (42000€), éditable par année (what-if)
- Cotisations sociales exploitants = Rémunération * %charges_sociales_exploitant national
- EBE comptable = EBE retraité - Rémunération - Cotisations
- Dotation amortissement travaux = Travaux(param)/durée_amortissement(param), Année0 = montant travaux, ensuite constant
- Droits et frais d'installation HT = Honoraires juridique*80% + Honoraire comptable + Honoraire transaction*Valorisation (une seule fois Année0-1, puis 0)
- Crédit Vendeur Stock = Stock Final bilan si financement stock = "Prêt vendeur 12 fois" sinon 0 (une fois Année0-1, puis 0)
- Résultat d'exploitation après gérance = EBE comptable - Dotation amort - Frais installation - Crédit vendeur stock
- Charges financières (intérêts booster) = constant (N28 Valorisation et prêt)
- Charges financières (emprunt banque) = ligne "Intérêts" (col L) du tableau amortissement prêt banque, année correspondante
- Résultat courant après gérance = Résultat exploitation - charges fi. booster - charges fi. banque
- **Impôt société (IS)** = barème progressif (Calcul_IS 2 paliers: 0-42500€ =15%, au-delà=25%) appliqué au résultat courant CUMULÉ avec report du négatif de l'année précédente (SUMPRODUCT formule complexe -> à réimplémenter en JS fonction calcIS(résultatAnnée, résultatAnnéePrécédenteSiNégatif))
- Résultat net après IS = Résultat courant - IS
- Paiement Capital = ligne "Montant prêt réglé" (col M) tableau amortissement, année correspondante
- Résultat avant redistribution = Résultat net - Paiement Capital
- TOTAL (col U) = somme sur les 12 ans pour lignes Charges fi. banque / IS / Paiement capital / Résultat avant redistribution

=> Ce tableau est LE plus complexe, dépend du prêt bancaire (onglet Valorisation), des paramètres nationaux ET des choix "gardé/autre montant" du prévisionnel. Toutes les colonnes Année 1-12 sont calculées automatiquement (aucune saisie), sauf ligne Rémunération exploitants modifiable par année et les 2 blocs "gardé/montant" en haut de page.

## DÉCISIONS D'ARCHITECTURE TECHNIQUE (validées avec Jessy)
- 1 seul fichier HTML (CSS+JS inline), pas de build step -> hébergement GitHub Pages
- Connexion : Supabase Auth (email/password, table auth.users standard)
- Schéma Postgres dédié : `valorisation` (toutes les tables custom dedans, pas dans public)
- RLS strict : chaque table a project_id -> policy "owner only" via auth.uid()
- Stockage des données bilan / paramètres en JSONB (flexible, évite 90+ colonnes SQL rigides, facilite import IA qui produit un JSON avec des clés = noms de champs)
- Tables prévues :
  - valorisation.projects (id, owner uuid, nom, infos jsonb [infos projet + flags "non disponible"], created_at)
  - valorisation.parametres (project_id PK/FK, params jsonb) — init avec les valeurs nationales par défaut, éditables
  - valorisation.bilans (id, project_id, annee_offset int [0,-1,-2], data jsonb, updated_at) — saisie brute comptable par année
  - valorisation.import_mappings (id, user_id, source_label text, target_field text, created_at) — mémorise le dispatch manuel de l'utilisateur pour les prochains imports IA (ex: "achats exonérés" -> "achats_0")
- Calculs : tous en JS côté client, dans une lib de fonctions pures reproduisant fidèlement les formules Excel (mapping documenté ci-dessus), recalcul réactif à chaque saisie
- Import IA : bouton "Importer depuis bilan (IA)" dans Paramètres -> modal avec :
  1. Un PROMPT généré dynamiquement (liste tous les champs attendus avec libellés + format JSON attendu) à copier-coller dans une IA externe (Claude/ChatGPT) avec les bilans en pièce jointe
  2. Zone de collage du JSON retourné par l'IA
  3. Parsing + pour chaque clé du JSON qui ne matche pas exactement un champ connu (ni un mapping déjà appris), affichage d'une ligne "Nom trouvé dans le bilan: X, Montant: Y€ -> [menu déroulant pour choisir le champ cible]"
  4. Une fois choisi, sauvegarde du mapping dans import_mappings pour la prochaine fois + application à la valeur

## FICHIERS LIVRÉS
- /mnt/user-data/outputs/schema.sql -- schéma Postgres Supabase complet (à exécuter dans SQL editor Supabase EN PREMIER)
- /mnt/user-data/outputs/app.html -- application complète

## PROCHAINES ÉTAPES (pour la suite, session suivante)
(à mettre à jour à la fin de la session)

## ÉTAT AU 19/08/2026 — livré cette session

Fichiers livrés :
- schema.sql (dans outputs) — à exécuter dans Supabase SQL Editor, PUIS activer le schéma "valorisation" dans Project Settings > API > Exposed schemas (ne peut pas se faire en SQL).
- app.html (dans outputs) — app complète 1 fichier, ~1470 lignes. Syntaxe JS vérifiée (node --check OK).

Avant de tester : Jessy doit remplacer SUPABASE_URL et SUPABASE_ANON_KEY en haut du <script> par les vraies valeurs de son projet Supabase (Project Settings > API).

Fonctionnel dans cette v1 :
- Auth Supabase (login/signup email+mdp)
- CRUD projets (liste, création, suppression)
- Onglet Informations projet (champs libres + case "non disponible" par champ)
- Onglet Paramètres (tous les paramètres nationaux/valorisation du classeur, éditables, groupés par thème) + bouton Import IA
- Modal Import IA : génère un prompt exhaustif listant tous les champs attendus (avec clés exactes), zone de collage JSON, détection auto des champs reconnus, dispatch manuel pour les lignes non reconnues avec menu déroulant, mémorisation du choix (table import_mappings) pour les imports suivants, fusion dans les bilans des 3 années
- Onglet Données bilans : formulaire complet (toutes sections du classeur "Données Vierge Bilan"), 3 années (N/N-1/N-2), code couleur jaune/orange/gris respecté, case "non disponible" par champ
- Onglet Évaluation : 100% calculé (ratios financiers, ratios exploitation, EBE retraité, comparaison barres vs moyennes nationales)
- Onglet Valorisation et prêt : valorisation CA/EBE/Marge + coefficients seuil, plan de financement, tableau d'amortissement du prêt bancaire (PMT), apport booster
- Onglet Prévisionnel : charges externes prévisionnelles (gardé/autre montant), masse salariale prévisionnelle (éditable, ajout de lignes), tableau 12 ans complet avec IS progressif à 2 paliers et report du déficit

## POINTS À VÉRIFIER / CLARIFIER AVEC JESSY (prochaine session)
1. **Flag "In fine ?" (K12 param)** : présent dans le classeur mais je n'ai trouvé AUCUNE formule qui l'utilise réellement (le tableau d'amortissement du prêt banque est TOUJOURS en annuités constantes PMT classiques dans le fichier source). Dans l'app, le paramètre existe mais n'est pas encore branché sur le calcul — à décider : le prêt banque doit-il pouvoir être in fine (capital remboursé en une fois) ?
2. **"Production théorique" (Evaluation!E38)** formule source ambiguë (référence table qui semble s'auto-référencer). J'ai implémenté : CA Ventes TTC / paramètre national "Production théorique" (€) = ratio. À valider que c'est bien l'intention.
3. **Ligne "Stock (valeur bilan)" dans le total des besoins financiers** (Valorisation!H7/H15) : le classeur l'additionne telle quelle au total, en plus du BFR qui contient déjà une composante stock (K25). Ça ressemble à un double comptage mais j'ai reproduit fidèlement la formule du classeur. À confirmer si c'est voulu ou une erreur à corriger.
4. **"À financer — travaux" (H30 = H12 = Valorisation par EBE)** : référence directe et non évidente dans le classeur (H30 pointe vers la valorisation EBE, pas vers le montant des travaux). Reproduit fidèlement mais sémantiquement surprenant — à vérifier avec Jessy si c'est une erreur du classeur d'origine.
5. **Ratio Charges Externe (Evaluation)** : le classeur original semble diviser par le CA de l'année N (pas N-1 comme on pourrait s'y attendre pour un ratio "année N-1"). Reproduit tel quel.
6. **Impôts et taxes dans le Prévisionnel** : le classeur applique en réalité le ratio national (param G24, lui-même = ratio_charges_externe national actuel!) mais j'ai simplifié en reconduisant le montant du bilan tel quel dans la v1 JS — À CORRIGER prochaine session pour coller exactement à la formule H9 = 'Données nationales et valorisat'!G24 (qui elle-même = Ratio_Charges_Externe[[#TOTALS]] de l'onglet Evaluation, donc en fait = r.ratioChargesExterne de l'évaluation, pas un paramètre saisi). **BUG connu, à corriger.**
7. Le prévisionnel actuel ne recharge pas l'état "charges externes gardées / salariés" depuis la base (previsionnelState vit en mémoire seulement, perdu au rechargement de page). À ajouter : persistance de ces choix (nouvelle table ou colonne JSONB dans projects/parametres).
8. Aucun déploiement réel testé (pas d'accès réseau dans mon environnement) — Jessy doit tester en conditions réelles avec son propre projet Supabase et remonter les bugs.
9. Design volontairement sobre/dense (palette encre/papier/vert pharma) plutôt que "marketing" — à ajuster si le rendu ne plaît pas visuellement.

## PROCHAINES ÉTAPES SUGGÉRÉES (session suivante)
- Corriger le bug #6 (impôts et taxes prévisionnel = ratio charges externes évaluation, pas montant bilan brut)
- Décider et implémenter le comportement "in fine" (#1)
- Persister l'état du prévisionnel (charges gardées, salariés) en base
- Revoir avec Jessy les points #2, #3, #4 (fidélité vs bugs du classeur d'origine)
- Tests réels avec vraies données + vrai projet Supabase, ajustements suite aux retours
- Éventuellement : export PDF du dossier, graphiques (actuellement barres CSS simples, pourrait passer à un vrai lib de graph), gestion multi-utilisateurs sur un même dossier (associés)




----
# 🏛️ Architecture & Spécifications — Outil Expert Valorisation Pharmacie

## 1. Stack Technique
- **Frontend :** HTML5, CSS3 (Vanilla), JavaScript (ES6+). Un seul fichier `index.html` pour simplifier le déploiement et la maintenance.
- **Backend / BDD :** Supabase (PostgreSQL).
- **Authentification :** Supabase Auth (Email/Mot de passe).
- **Export :** Librairie `html2pdf.js` intégrée par CDN.

## 2. Carte Mentale du fichier `index.html`
Le fichier `index.html` est long (~1700 lignes). Voici où trouver chaque fonctionnalité pour naviguer rapidement (repères `/* === X. ... === */`) :

- **Lignes 1 - 250 :** CSS (Styles, Grilles, Modales, Design PDF).
- **Lignes 250 - 350 :** Structure HTML de base (Topbar, Onglets, Conteneurs).
- **`/* 1. CATALOGUE DES CHAMPS BILANS */` :** Définition de `BILAN_SECTIONS` et `INFO_FIELDS`. C'est ici que l'on ajoute ou renomme une ligne du bilan (Achats, Ventes, etc.).
- **`/* 2. PARAMÈTRES HYPOTHÈSES */` :** Définition de `EMPTY_PARAMS` (valeurs par défaut) et `PARAM_GROUPS_SIMPLE` (structure du formulaire de l'onglet "Hypothèses").
- **`/* FONCTIONS UTILITAIRES & AUTH */` :** `toast()`, `fmtEUR()`, `copyToClipboard()`, Supabase Auth (`signInWithPassword`).
- **`/* ONGLETS (RENDERING) */` :**
  - `renderInfosTab()` : Onglet 1 (Projet).
  - `renderBilansTab()` : Onglet 2 (Saisie des bilans N, N-1, N-2).
  - `renderParametresTab()` : Onglet 3 (Saisie des hypothèses et financements).
- **`/* COMPUTATION ENGINE (LE COEUR FINANCIER) */` :**
  - `computeBilanAggregate()` : Calcule CA Total, Achats Consommés, etc.
  - `computeEvaluation()` : Calcule l'EBE Retraité, Marge, Ratios (Onglet 4).
  - `calcGenericLoan()` & `pmtAnnuite()` : Calcule les tableaux d'amortissement de tous les prêts (In fine ou constants).
  - `computeValorisation()` : Calcule les multiples, frais d'acquisitions, plan de financement (Onglet 5).
  - `calcIS()` : Calcul de l'IS (Barème progressif).
  - `computePrevisionnel()` : Génère le tableau sur 12 ans (Onglet 6).
- **`/* ONGLETS D'AFFICHAGE FINAUX */` :**
  - `renderEvaluationTab()` : Génère la vue HTML de l'onglet 4.
  - `renderValorisationTab()` : Génère la vue HTML de l'onglet 5.
  - `renderPrevisionnelTab()` : Génère la vue HTML de l'onglet 6 et gère les Modales d'ajustement (Croissance, Salaires, Charges).
- **`/* EXPORT PDF PROFESSIONNEL */` :** Écouteur du bouton `#btn-export-pdf`, mise en page HTML pour le PDF et conclusion IA.
- **`/* IMPORT IA */` :** `buildImportPrompt()`, `handleParseJson()`, `applyImport()`. Apprentissage des clés non reconnues.

## 3. Modèle de Données (Schéma `valorisation`)
Le projet utilise une base de données NoSQL-like pour une flexibilité totale, évitant de créer 150 colonnes.
- **Table `projects`** : 
  - `id` (UUID, PK), `owner` (UUID, FK auth.users), `nom` (Text), `infos` (JSONB : ville, adresse...), `unavailable` (Array : champs N/A), `created_at`.
- **Table `parametres`** : 
  - `project_id` (UUID, PK/FK).
  - `params` (JSONB) : Contient toutes les hypothèses (taux, durées, montants). Contient aussi un objet imbriqué `previ_state` qui sauvegarde les ajustements du prévisionnel (`chargesExt`, `salaries`, `customCharges`, `growth`).
- **Table `bilans`** : 
  - `project_id` (UUID, PK/FK), `annee_offset` (Int : 0, -1, -2, PK).
  - `data` (JSONB) : Paires clé/valeur des montants comptables (ex: `{"ventes_21": 150000}`).
- **Table `import_mappings`** : 
  - `user_id`, `source_label` (Clé inventée par l'IA), `target_field` (Clé officielle du système). Permet d'apprendre des erreurs de l'IA.

## 4. Règles de Gestion Financière
- **L'EBE Retraité** est la base absolue de valorisation (EBE Comptable + Rémunérations + Retraitements divers).
- **Le Prévisionnel :** 
  - L'évolution de marge n'est pas incrémentale, elle est définie de manière **fixe** par une `marge_cible_previsionnel` dès l'Année 1.
  - L'évolution du CA se fait année par année (1 à 5). De l'année 6 à 12, on fige le taux de croissance sur la valeur de l'Année 5.
- **Le Crédit Vendeur :** Son remboursement ne figure pas dans le calcul du cash-flow


