# État Jeu Pharma (handoff)

Dernière mise à jour : 2026-10-14 — **IA référentiel molécules** (`jeupharma-ia-matrice`) + réactivation posologie / grossesse / voies. (Précédent : multi-niveaux ★ + purge `041`.)

## IA référentiel — fiche depuis RCP (`jeupharma-ia-matrice`, 2026-10-14)
- Bouton **IA** à côté de « Nouvelle fiche » (`admin/referentiel.html`) : wizard BDM → Edge **`jeupharma-ia-matrice`** (fetch ANSM `/extrait` puis EMA secours, collage manuel UI) → Gemini condense JSON → revue matching entités → `JpMedicaments.save` brouillon `fiche_validee:false`.
- Gate admin `portail.profiles.role === 'admin'` ; secret `GEMINI_API_KEY` serveur ; **pas** d’extension de `jeupharma-ia-blocs` ; **pas** d’OCR Location.
- Champs réactivés UI : `posologie_generale`, `grossesse_allaitement`, `voies_administration` (`actif:true` dans `constants.js`). Flags `hospitalier`/`complexe` absents (purgés `041`) — non proposés.
- Code : `IA/edge/jeupharma-ia-matrice/`, `IA/referentiel-matrice.js`, `IA/gemini-client.js` (`FN_MATRICE`), `js/bdm.js` (`suggest`, `getSpecialite`, `pickRecommendedCis`). Aucune migration SQL bulk.

## Parcours multi-niveaux ★1–★5 (`040` + `041` — remote 2026-10-14)
- **`sql/040_parcours_multi_niveaux.sql`** : `inscriptions_parcours.niveau_parcours` ; `niveau_min`/`niveau_max` sur modules / blocs / pubs ; helpers ; `v2_traiter_demande_parcours(..., p_niveau_parcours)` ; `v2_maj_niveau_parcours` ; filtrage `v2_lecon_joueur` / `v2_connaissances_visibles` / catalogue / progression / déblocage (prérequis hors plage ignorés) ; variantes `payload_json.variantes` ; mode `referentiel_valide` → `publications`.
- **`sql/041_purge_profil_niveaux.sql`** : DROP `niveaux`, `niveau_*`, `profil_apprentissage.niveau_id`, `parcours.niveau_lie`, colonnes `hospitalier`/`complexe` ; vue `v_medicaments_complet` sans ces champs ; policy `matrice_select` simplifiée.
- **Client** : `js/admin-acces.js` (★ à l’accord + modifier) ; `js/studio-parcours.js` (plages + aperçu ★N + variantes texte/conseil) ; `js/lecon-player.js` + `lecon.html?niveau=` ; purge `JpConstants.NIVEAUX`, hospitalier/complexe dans `medicaments.js` / `resolver.js` / CSS.
- Backfill : inscriptions acceptées → ★1 ; contenu → min=1 max=5.
- **Suivi admin** : réattribuer les ★ réels (aujourd’hui tous à 1) ; éventuellement désactiver le parcours code `pharmacien` s’il n’a plus de pubs.

## Appariement / classement — auto-liaison + traits (2026-10-14)
- Wizard : **Proposer associations** à côté de la recherche référentiel (items/zones et gauche/droite). Bidirectionnel : molécules → classes/indications… **et** classes → molécules. Si plusieurs → modale (1 appariement, multi classement). Messages d’échec explicites (rien en face, texte libre, aucun lien fiche, annulation…).
- Player appariement : ronds + traits SVG colorés ; classement accepte toute zone listée dans `item_ids`.

## Jeux classement, appariement, quiz mixte, édition (039 — appliquée remote, 2026-10-14)
- `sql/039_jeux_classement_appariement_edit.sql` : CHECK `type_jeu` + `classement` / `appariement` ; RPC admin **`v2_update_modele_jeu`** (titre, mode, `module_ids`, `configuration_json` — pas `type_jeu` / `code_unique` / `parcours_id`).
- Config hybride (mode B) dans `configuration_json` : items / zones / paires = texte libre **ou** typeahead matrice / entités.
- Wizard (`js/studio-jeu-wizard.js`) : panels classement / appariement ; section « Questions manuelles » quiz (+ `nb_auto_max`) ; mode édition (`modeleId`) → Enregistrer.
- Studio : bouton **Modifier les paramètres** (primaire) + **Remplacer / nouveau jeu** (secondaire).
- Player (`js/jeux-play.js`) : DnD classement (+ clic sélection→zone) ; appariement clic-à-clic 1↔1 + traits SVG ; quiz = union manuelles + auto, tirage `nb_questions` à chaque partie ; insert `tentatives_jeu` comme quiz.
- Admin scores : labels / filtres `classement` / `appariement`. Listes `jeux/index.html` + `lecon-player` → `jeux/jouer.html`.
- **Limite « 100 % molécules » levée** pour classement, appariement et questions manuelles quiz (contenu libre / référentiel hybride). Quiz auto / trous / fiche / ordonnance restent basés molécules + pubs.

## IA studio — blocs depuis texte / PDF (2026-10-14)
- Bouton **IA** dans « Modif parcours » (barre Ajouter) : modale texte ou PDF (10 Mo) → Edge **`jeupharma-ia-blocs`** (secret `GEMINI_API_KEY` partagé avec `ocr-map-fields` ; modèle `GEMINI_IA_MODEL` → `GEMINI_OCR_MODEL` → `gemini-3.8-flash`) → JSON → blocs **brouillon** (`visible=false`, `_brouillon`), publiés via « Enregistrer et publier ».
- Accès fonction : `portail.profiles.role === 'admin'` uniquement. Types : texte, conseil, recommandation, photo (stub), vidéo (URL source), molécule (DCI déjà publiées sur la leçon) ; jamais `jeu`.
- Code : `IA/` (`gemini-client.js`, `studio-blocs.js`, `ia.css`, `edge/…`, `README.md` = schéma JSON). Hook mince `openIa()` dans `js/studio-parcours.js`. Cache-bust `?v=040`. Aucune migration SQL.
- `ocr-map-fields` / `ocr-document` (Location, prompt figé) **non réutilisés** tels quels : nouvelle fonction fine, même pattern (CORS, gate admin, appel Gemini).
- **2ᵉ Edge** : voir section « IA référentiel » (`jeupharma-ia-matrice`).

## Bloc « recommandation » (038 — appliquée remote, 2026-10-14)
- `module_blocs.type_bloc` accepte `recommandation`. Payload : `corps_html`, `lien_bloc_id` | `lien_module_id` (+ `lien_parcours_id` opt.) | `lien_href`, `lien_label`.
- Studio : bouton « + Recommandation », éditeur riche + contexte (bloc de la leçon, autre leçon, URL in-app/https).
- Lecteur : pastille « Recommandation », cadre teal (`.jp-bloc--recommandation`), ancres `#jp-bloc-<id>` sur chaque bloc ; liens sans pop-up.
- Fichiers : `sql/038_bloc_recommandation.sql`, `js/studio-parcours.js`, `js/lecon-player.js`, `css/player.css`.

## Purge legacy V1 (2026-10-14)
- **Fichiers** : dossier `legacy-v1/` supprimé ; `admin/sources.html`, `import-rcp.html`, `import-export.html`, `js/import-rcp.js`, `js/admin.js`, `js/profil.js` supprimés.
- **Backup** : `jeu-pharma/backups/jeupharma-20261014-085552/` (fonctions, colonnes, core pédagogique, pubs DEUST, matrices, copie `sql/*`). Docker absent → pas de `pg_dump` CLI.
- **Remote `037_drop_legacy_v1_jeux`** : drop `quizz`, `quizz_reponses_utilisateur`, `parties_tableau_trous`, `parties_reponses_utilisateur` + RPC `soumettre_quiz` / `generer_et_geler_quiz` / `ouvrir_quiz` / `v2_backfill_connaissances_from_v1`. Conservés : `modeles_jeu`, `tentatives_jeu`, `scores_fiche_aleatoire`.

## Seed CardioVasculaires - Deust 2A (031 — appliquée remote, 2026-10-11)
- `sql/031_seed_cardiovasculaires_deust_2a.sql` : **supprime** `deust_apprenti`, `etu_3a`, `introduction` (+ modules, blocs, pubs, progression, inscriptions, 5 `modeles_jeu` JP-INT* / JP-QST9U + tentatives) ; **garde** `pharmacien`. Plus aucune inscription ni jeu en base.
- Crée `cardiovasculaires_deust_2a` (id `b0d4c335-717c-4574-aa81-3391cbce70a3`, `publications`, niveau apprenti, ordre 1) : chapitres `chap_sang` (10) → `chap_cv` (20) → `chap_hta` (30), verrous par `prerequis_module_id` entre chapitres ; 17 leçons chaînées (ordre 11–15, 21–27, 31–35 ; codes du plan `sang_*`, `cv_*`, `hta_*`), 1re leçon de chaque chapitre sans prérequis propre (`sang_rappel`, `cv_definitions`, `hta_rappel_pa` → `hta_raa`). `criteres_json` leçons = `{lecture:true, logique:'et'}` ; **jeux score min. à ajouter** avec les `JP-CV*`.
- Les utilisateurs doivent se réinscrire au nouveau parcours (demande → accepte).

## Blocs contenu + images CardioVasculaires Deust 2A (035 — appliquée remote, 2026-10-11)
- `sql/035_blocs_contenu_cardio_deust.sql` (MCP `jeupharma_035_blocs_contenu_cardio_deust_v2` + `supabase db query --linked`) : **132 blocs** hors `jeu` sur les **17 leçons** (`seed_key` `035:*`, idempotent — ne touche pas aux blocs `JP-CV*` ordre 999).
  - Répartition : **86** photo · **20** texte · **8** conseil · **5** vidéo · **13** molécule (carrousel = DCI publiées sur la leçon via `publications_connaissances` → `connaissances.matrice_id`).
  - Chemins photo : bucket privé **`jeupharma-lecons`** → `modules/<module_id>/<slug>.jpg` (86 objets, alignés `sql/ops/cardio_images_prepare.ps1` + `%TEMP%\jp-media\upload-report.txt`).
  - Schémas docx : hémostase primaire + cascade (L1), RAA (L14) ; ordonnances rappel sang **anonymisées** (script prepare).
  - Vidéos : embeds complémentaires (mesure PA, chaîne Le cours de bio en lien texte ; stubs Natispray / angioplastie — remplaçables dans le studio).
  - Leçons **sans** bloc molécule : `cv_definitions`, `hta_rappel_pa`, `hta_raa`, `hta_clinique`. Leçons `publie=true`, `statut=publie`, `contenu_maj_at` à jour.
- Générateur : `sql/ops/build_035_blocs.mjs` (relancer après changement d’images ou de texte cours).
- **Reste** : affiner CIS BDPM / RCP pour DCI restantes (EPO, AOD sans page RCP) ; remplacer URLs vidéo stub si besoin.

## Jeux JP-CV* CardioVasculaires - Deust 2A (032 — appliquée remote, 2026-10-11)
- `sql/032_jeux_cardiovasculaires_deust_2a.sql` : **17 `modeles_jeu`** actifs ; pool = publications cours (035, **3050** lignes actives).
- **Format code assoupli** : `modeles_jeu_code_format` = `^JP-[A-Z0-9]{4,5}$` (les codes du plan `JP-CVS1`… ont 4 caractères ; le générateur studio reste à 5). `ordonnances/index.html` : regex alignée.
- Jeux (leçon porteuse du bloc `jeu` ordre 999 + critère → `module_ids`) :
  - Sang : `JP-CVS1` quiz (L1 : L1) · `JP-CVS2` trous (L2 : L1–L2) · `JP-CVS3` fiche aléatoire (L3 : L3) · `JP-CVS4` quiz (L4 : L4) · `JP-CVSO1` ordonnance ACO (L4, **non requise**, règles AVK / anti-Xa / HBPM) · `JP-CVS5` quiz révision (L5 : L1–L5).
  - CV : `JP-CVC1` quiz (L7 : L7) · `JP-CVC2` ordonnance BASIC (L8 : L3, L7, L8 ; règles bêtabloquant / antiagrégant / statine HMG-CoA / IEC) · `JP-CVC3` quiz VW (L9 : L7, L9) · `JP-CVC4` trous IC (L10 : L10) · `JP-CVC5` quiz jambes lourdes (L11 : L11) · `JP-CVC6` quiz révision (L12 : L6–L12). L6 = lecture seule.
  - HTA : `JP-CVH1` quiz (L13 : L7, L10, L13) · `JP-CVH2` trous (L14 : L10, L14) · `JP-CVH3` quiz cas patients (L15 : L7, L10, L15) · `JP-CVH4` quiz cibles (L16 : L7, L10, L16) · `JP-CVH5` quiz final (L17 : les 17 leçons).
- **Critères leçons** = `{lecture:true, logique:'et', jeux:[{modele_id, score_min_pct}]}` : 70 % partout, **80 % pour L17** (`JP-CVH5`). Parcours : pas de critère propre (= toutes leçons validées).
- **Limites (partiellement levées en 039)** : quiz auto / trous / fiche / ordonnance restent basés molécules + pubs ; **classement / appariement / questions manuelles quiz** permettent du contenu libre (hybride typeahead). H1–H3 historiques s'appuient sur les pools L7 / L10 + leur leçon. Règles d'ordonnance = ids de classes pharmacologiques existantes (taxonomie avec doublons) ; repli sur le pool si une classe est absente des pubs.
- Pubs molécules posées (033) : **3085** publications actives remote ; le parcours est jouable côté pool jeux ; vérifier en conditions réelles les leçons H1–H3 (pool L7/L10) et molécules `hospitalier`.

## Fiches + pubs molécules CardioVasculaires Deust 2A (032–036 — remote, 2026-10-11)
- **Règle duale** : (1) **Matrice / référentiel** = RCP BDPM condensé (EI fréquents ou rares graves) ; (2) **DEUST** = connaissances **source `cours_cardio_deust_2a` uniquement** (libellés courts / champs cours — pas le surplus RCP long sur les leçons).
- `sql/032_fiches_cardio_deust_cours.sql` · `sql/033_pubs_molecules_cardio_deust.sql` : 1re passe cours + lots 1–13 (**165** fiches plan).
- **`sql/034_rcp_matrice_cardio_deust.sql` — appliquée remote 2026-10-11** (`supabase db query --linked -f sql/034_apply_parts/part_01..05` ; helpers `pg_temp` dupliqués par part ; historique MCP `034_rcp_matrice_cardio_deust_applied`) :
  - Générateur durci : `sql/ops/cardio_rcp_matrice_gen.mjs` + `cardio_rcp_cis_config.mjs` (DCI stricte, score forme orale/usuelle, allow/deny CIS, rapport `sql/ops/cardio_rcp_cis_report.json`).
  - **101** DCI enrichies matrice (124 mono plan 033) ; **23** ignorées (pas de CIS sûr / RCP BDPM vide / pas de hit) — liste dans le footer SQL + rapport JSON.
  - Source miroir **`rcp_bdpm_cardio_deust`** / version **`bdpm-2026-10`** → **4881** lignes `connaissances` (référentiel) ; **`0`** `publications_connaissances` sur cette source (DEUST inchangé).
  - Exemples CIS corrigés : colécalciférol **63902334**, cyanocobalamine **61247741**, dipyridamole **60021216** (plus alendronate+D3 / CERNEVIT / injectable diagnostic).
- **DCI 034 non traitées (matrice = cours 033 seulement)** : `acide folinique`, époétines / darbépoétine, rivaroxaban / apixaban / dapagliflozine / ivabradine, idarucizumab, desirudine / lepirudine, tenecteplase / reteplase / streptokinase / urokinase, alginate de calcium, isosorbide dinitrate, ginkgo, ruscoside, propranolol, timolol, triamterene, eprosartan.
- `sql/036_sync_connaissances_cours_deust.sql` : connaissances cours ← migration_v1 (filtre ≤ 55 car. ind/CI/EI… + champs structurels).
- `sql/035_deust_connaissances_cours.sql` : depub non-cours + repub lots 033 en source cours only.
- **Comptes remote** : **3085** publications actives (cours) · **4881** connaissances RCP matrice · **0** pub RCP sur leçons DEUST. Jeux / blocs **non touchés**.
- **Hors plan** : lacidipine ; sclérosants archivés ; facteurs VIII/IX, HE/homéo (conseil texte).
- Attention : thrombolytiques et idarucizumab sont `hospitalier` (visibles apprenti seulement si les RPC `v2_*` ne filtrent pas ce flag — à vérifier au jeu).
- **Statut tâche** : **pubs-molecules / RCP matrice 034** = **terminé** (033 + 034 appliqués ; relancer `cardio_rcp_matrice_gen.mjs` si BDPM ou allowlist évolue).

## Modif parcours — supprimer / réordonner chapitres et leçons (030 — **à appliquer remote**)
- Arbre : boutons ↑ ↓ × par ligne (visibles au survol / sélection). ↑↓ = échange avec le frère voisin (même `parent_id`) et renumérotation du niveau (`ordre` × 10) via `v2_reorder_modules` (027, inchangée). × = confirmation `JpModal` puis `v2_supprimer_module`.
- `modules_cours` n'a pas de `actif` → suppression **physique** du sous-arbre (blocs / publications / progression en cascade FK). `030` redéfinit `v2_supprimer_module` (ancienne = simple dépublication, jamais appelée) : raccroche les dépendants extérieurs au prérequis du module supprimé ; retire les ids de `modeles_jeu.module_ids` ; jeu à pool vide → **archivé** (`actif=false`, scores conservés) + critères `jeux` nettoyés + blocs jeu extérieurs retirés. Fichiers photo du bucket non purgés.
- Cache-bust `?v=030` (studio.css, studio-parcours.js).

## Bloc « photo » (029 — appliquée remote, 2026-10-11)
- `module_blocs.type_bloc` accepte `photo` (check recréé). `payload_json` = `{ path?, url?, alt?, legende? }` (`path` prioritaire ; `url` = https uniquement). RPC `v2_*` inchangées (génériques).
- Storage : bucket **privé** `jeupharma-lecons` (5 Mo, jpeg/png/webp/gif) ; écriture/suppression = `is_portail_admin()`, lecture = accès Jeu Pharma ; affichage via URL signées (1 h). Chemin `modules/<module_id>/<uuid>.<ext>`. Les fichiers remplacés restent en bucket (le publié peut encore les référencer).
- Client : `js/bloc-photo.js` (`JpBlocPhoto`, partagé studio + lecteur), styles `.jp-photo*` dans `css/v2.css`, cadre `.jp-bloc--photo` dans `css/player.css`. Agrandissement en overlay même document (pas de pop-up).
- Lecteur : le bloc **texte** n’affiche plus la pastille « Texte » (cadre seul, titre s’il existe). Cache-bust `?v=029`.

## Critères de déblocage (028 — appliquée remote, 2026-10-11)
- **Modèle** : chaque leçon / chapitre / parcours a `criteres_json` = comment il est **validé** : `{ lecture?: bool (leçon, défaut true), jeux: [{ modele_id, score_min_pct }], logique: 'et'|'ou', progression_min_pct (parcours, défaut 100) }`. Les **verrous** sont des pointeurs : `modules_cours.prerequis_module_id` (leçon ou chapitre) et `parcours_apprentissage.prerequis_parcours_id`. L’élément s’ouvre quand son prérequis est **validé** ; prérequis non publié = ignoré ; parcours verrouillé = toutes ses leçons verrouillées ; chapitre validé = toutes ses leçons publiées validées.
- **Validité calculée en direct** (fonctions internes non exposées) : lecture = `progression_modules.lu_at` (posé par `v2_enregistrer_lecture(p_module_id, p_pct)` quand pct ≥ 95) + meilleur score % de `tentatives_jeu` (terminées). `progression_modules.statut` n’est qu’un miroir (`v2__sync_progression`). % d’une leçon = moyenne des crédits partiels (lecture + ratio de chaque jeu ; `ou` = max) ; validée → 100.
- **RPC joueur** : `v2_progression_parcours` (arbre + `detail`, `valide`, `pct`, `verrouille`, `bloque_par`, `maj_at`), `v2_parcours_liste` (cartes parcours : pct, verrou, mise à jour), `v2_lecon_joueur` (refuse une leçon verrouillée ; renvoie `detail` + `module.maj_at`), `v2_mon_espace` (progression par parcours + scores). **RPC admin** : `v2_maj_parcours_criteres` (cycle check), `v2_upsert_module` étendu (`criteres_json`, `prerequis_module_id`, `contenu_maj_at`).
- **Client** : `js/parcours-ui.js` (`JpParcoursUi` : dates, barres / anneaux, messages « Veuillez faire le jeu … pour passer à la leçon suivante »), `js/lecon-player.js` (blocs typés, carrousel de molécules, suivi de lecture IntersectionObserver-like par scroll + 1,1 s en bas, panneau de validation, bouton « Leçon suivante → » grisé + raison), `js/mon-espace.js` (graphiques SVG/CSS), `js/studio-deblocage.js` (panneau « Déblocage » de l’inspecteur + modale « Réglages du parcours »).
- **Parcours** : `parcours.html` → clic sur la carte = `espace.html?parcours=ID` (plus d’écran « choix du parcours ») ; `espace.html` lit `?parcours=` / parcours actif / premier accepté.
- **Jeux** : liens `?module=&parcours=` depuis la leçon (retour leçon / parcours corrects, plus de lien « Introduction » en dur) ; carte de score (`JpJeuxPlay.mountScoreCard`) avec statut du critère minimum.
- **Limite connue** : les scores restent écrits par le client (`tentatives_jeu` insert, policy existante) → un joueur malveillant peut s’attribuer un score ; durcir = RPC de scoring serveur (hors périmètre).
- UI admin : tuile / page « Studio » renommée **Modif parcours**. CSS studio : polish des champs avec sélecteurs explicites + cache-bust `?v=028`.

## Studio brouillon / publication + admin (2026-10-11, suite)
- **Aide « ? »** : `.jp-help-btn` / `.jp-modal*` déplacés de `studio.css` vers `css/v2.css` (la modale n'était pas stylée sur Référentiel / Jeux, qui ne chargent pas `studio.css`). Corrige l'aide sur toutes les pages admin.
- **Référentiel** : filtre « Classification » et switches Hospitalière / Complexe retirés de l'UI ; colonnes DB et vue conservées ; `JpMedicaments.save` ne touche plus ces flags depuis l'éditeur (valeurs existantes inchangées).
- **Jeux & scores** : graphiques SVG/CSS sans librairie (moyenne par jeu, répartition, activité 30 j ; par parcours ; par personne : courbe + moyenne par parcours + classement global).
- **Accès** (`js/admin-acces.js`) : onglets Demandes | Accès accordés | Refusés + recherche ; avancement = jeux terminés / jeux actifs du parcours + leçons `progression_modules.statut='termine'` + moyenne + dernière activité ; détail par jeu / leçon ; « Retirer l'accès » = RPC `v2_traiter_demande_parcours(…, 'refuse')`. `progression_modules` n'est alimentée par aucune surface applicative (seed `024` seulement) : les jeux sont l'indicateur fiable.
- **Studio — modèle brouillon/publié (aucune migration)** :
  - Contenu publié = `module_blocs.titre` + `payload_json` (clés sans `_`). Brouillon auto (debounce 900 ms) = `payload_json._brouillon = { titre, payload }`. Nouveau bloc = `visible=false` jusqu'à publication. Leçon neuve = `publie=false, statut='brouillon'`.
  - **« Enregistrer et publier »** (en-tête) : flush des brouillons → copie vers le publié + `visible=true` + `v2_upsert_module(publie=true, statut='publie')`. Si une molécule d'un bloc n'a aucune valeur au programme de la leçon, tout est publié (`v2_publier_connaissances`).
  - Programme (`publications_connaissances`) = publication immédiate ; `v2_publier_connaissances` force `modules_cours.publie=true` → le studio rétablit le brouillon si la leçon l'était.
  - Suppression de bloc = immédiate. Aperçu (`lecon.html?preview=1`) = blocs masqués + brouillons (admin) ; joueurs : `lecon-player.js` ignore les clés `_*`. Limite : `_brouillon` transite dans le JSON de `v2_lecon_joueur` (contenu non sensible, mais une migration `028` avec colonnes dédiées + RPC de publication serait plus propre).
  - Bloc **molécule** multi : `payload_json.matrice_ids[]` (+ `matrice_id` = 1ʳᵉ, compat) ; lecture joueur : `matrice_ids` sinon `matrice_id`.
  - Rich text : couleur du texte (palette teal + sélecteur) ; le lecteur ne conserve que `color` dans `style`.

## Admin Jeux & recherche dynamique (2026-10-11)
- **Tuile admin « Jeux & scores »** → `admin/jeux.html` : tableau de bord (plus de création, plus de legacy). Vues **Jeux** | **Par parcours** | **Par personne** ; barre de recherche typeahead globale (jeux, parcours, personnes) ; filtres état/type.
- Actions : **Pause** (RPC existant `v2_set_pause_jeu`), **Relancer** (reprend si en pause ; remet `actif=true` si archivé), **Archiver** (`modeles_jeu.actif=false`, scores conservés) ; **Jouer** (`../jeux/jouer.html?code=` ou `../ordonnances/jouer.html?code=`, seulement si actif et non en pause) ; **Éditer** → `parcours.html?parcours=&module=&bloc=` (le studio ouvre la leçon et met le bloc jeu en évidence).
- Données : lecture admin (RLS) de `modeles_jeu`, `tentatives_jeu` (10 000 dernières max), `inscriptions_parcours` (accepte), `modules_cours`, `module_blocs` (type `jeu`, lien via `payload_json.modele_id`) ; noms via `portail.profiles`. Score % = `score_obtenu / score_max` sur tentatives terminées. **Aucune migration** : `en_pause` et `actif` existaient déjà (`019`, `021`, policy admin `020`).
- Fichiers : `admin/jeux.html`, `js/admin-jeux-scores.js` (remplace le hub de création ; `JpV2Admin.bootJeux` retiré).
- **Typeahead** : `js/typeahead.js` + styles `.jp-ta*` (`css/v2.css`). Appliqué : studio (sélecteur de parcours, pool de leçons du wizard jeu, classes théra/pharma, molécule fixe d’ordonnance, filtres + recherche live du sélecteur molécules — par défaut seules les fiches déjà en leçon sont listées). Reste en `<select>` : petites énumérations (type / mode / règle).

## Périmètre
App pédagogique vanilla sous `jeu-pharma/`. Schéma Supabase **`jeupharma`**. Auth portail (`protect.js` + `site_access`). Contenu = cours physiques / CSV. BDPM **lecture seule** (`schéma bdm`, RPC `search_products`) pour préremplir nom(s)/DCI — pas de sync destructive ni d’IA en v1.

## SITE_ID
- UUID portail : **`d4fc7fd0-944b-4594-9ba2-e1e2035aeddc`**
- Aligné dans : `js/supabase.js` → `SITE_ID` ; ce fichier ; `sql/001_jeupharma_init.sql` → `has_jeupharma_access()` (remote + local).
- URL Pages : `https://jessy1590.github.io/Application/jeu-pharma/`
- Pas de carte hardcodée dans le `index.html` racine du monorepo — la tuile vient de `portail.sites`.

## Modèle médicament (depuis 002)
- **1 `matrice_medicaments` = 1 DCI** (`dci_id` ; index unique partiel hors `archive`).
- **N noms commerciaux** via `jeupharma.matrice_noms_commerciaux` (plus de colonne `nom_commercial_id`).
- Champs pédagogiques (secteur, classes, indications, CI, EI…) partagés sur la fiche DCI.
- Secteur + classes théra / pharma : plusieurs par fiche (`matrice_secteurs_therapeutiques`, `matrice_classes_*`). La FK `*_id` = ordre 0.
- Vue `v_medicaments_complet` : `noms_commerciaux[]` + `nom_commercial` = 1er nom (compat / déprécié). `secteur_therapeutique` / `classe_therapeutique` / `classe_pharmacologique` = jsonb[].
- Save / CSV / BDPM : fusion par DCI (append noms, soft-archive doublons).

### Règles DCI / noms (catalogue RCP)
- DCI = INN / RCP (pas classe, pas labo). Exception pédagogique : fers mono sous `Sels ferreux`.
- Plusieurs spécialités / génériques = plusieurs noms sur la **même** fiche.
- `… Biogaran` = nom commercial, jamais une DCI ni une fiche séparée.
- Fusion sel → INN courte (`Clopidogrel`, `Bisoprolol`).
- Associations (`Clopidogrel + aspirine`, `Sels ferreux + acide folique`, etc.) = fiche distincte.
- Pas d’invention clinique : structure + libellés seulement.

## Ops remote (projet `kpjflntnotftpzffjbud`)
- [x] Schéma `jeupharma` créé.
- [x] Exposition Data API / PostgREST : `jeupharma` dans `authenticator.pgrst.db_schemas`.
- [x] SQL init `001` appliqué (helpers, tables, vue, RPC quiz/fusion, RLS).
- [x] `has_jeupharma_access()` = `d4fc7fd0-944b-4594-9ba2-e1e2035aeddc`.
- [x] Migration **`002_dci_centrique`** (MCP `jeupharma_002*` + update RPC) :
  - liaison `matrice_noms_commerciaux` + RLS
  - merge 34 groupes DCI doublons → **42** fiches soft-archivées
  - drop `nom_commercial_id`
  - index `matrice_medicaments_dci_unique_actif`
  - vue + `_valeur_champ_matrice` / `generer_et_geler_quiz` / `fusionner_entites`
- [x] Vérif post-`002` : **179** non-archive (**160** avec DCI uniques + **19** sans DCI), **0** groupe DCI dupliqué actif.
- [x] Migration **`004_catalogue_cleanup_rcp`** (MCP `catalogue_cleanup_rcp`, fichier `sql/004_catalogue_cleanup_rcp.sql`) :
  - ASA : DCI `Acide acétylsalicylique` + merge Aspegic / Kardegic / Aspirine Protect
  - Fers : 7 mono → `Sels ferreux` ; Tardyféron B9 → `Sels ferreux + acide folique`
  - Fusion `Bésilate de clopidogrel` → `Clopidogrel` ; `Fumarate de bisoprolol` → `Bisoprolol` (DCI sels soft-désactivées)
  - Biogaran = noms sur DCI (Clopidogrel / Ramipril / Rivaroxaban)
  - Soft-archive : Calcarea fluor, Hamamelis composé, Vipera redi, Aetoxisclérol, Sclérémo, Trombovar, Resitune
  - Eau oxygénée → DCI `Peroxyde d'hydrogène` ; Digoxine : nom redondant retiré, Hémigoxine conservé
- [x] Vérif post-`004` : **162** `publie` / **59** `archive` ; **0** sans `dci_id` actif ; **0** DCI multi-matrices actives.
- [x] Migration **`005_hospitalier`** (MCP `jeupharma_005_hospitalier`, fichier `sql/005_hospitalier.sql`) :
  - `matrice_medicaments.hospitalier boolean NOT NULL DEFAULT false` (legacy — sync depuis niveau)
  - vue `v_medicaments_complet.hospitalier`
  - RPC / filtre initialement liés au niveau `pharmacien` → remplacés par `007`
- [x] Migration historique **`007_niveau_hospitalier`** (MCP + fichier `sql/007_niveau_hospitalier.sql`, comportement remplacé par `017`) :
  - Seed DB legacy `jeupharma.niveaux` code `hospitalier` (ordre 7), désormais absent de `JpConstants.NIVEAUX`
  - Données : matrices `hospitalier=true` → `niveaux_connus = ['hospitalier']` sur DCI + noms commerciaux liés (6 DCI / 6 noms)
  - Bool `matrice.hospitalier` **conservé** : dérivé au save si DCI/noms portent le niveau hospitalier (exclusif)
  - ancien `generer_et_geler_quiz` : pool hospitalier dédié, remplacé par la règle pharmacien de `017`
  - UI : case « Hospitalier (pharmacien) » retirée ; contrôle = niveaux DCI / noms (Hosp exclusif)
  - ancien filtre client hospitalier exclusif, remplacé par `hospitalier OR complexe` réservé à `pharmacien`
- [x] Migration **`008_scores_fiche_aleatoire`** (MCP + fichier `sql/008_scores_fiche_aleatoire.sql`) :
  - Table `jeupharma.scores_fiche_aleatoire` : `utilisateur_id`, `matrice_id`, `score_obtenu` (sans défaut), `score_max` défaut 10, `created_at`
  - RLS : select soi ou `is_portail_admin()` ; insert soi + `has_jeupharma_access()`
  - Contrainte : note entière 0–10 ; 11 et omission de `score_obtenu` refusés
- [x] Migration **`010_classes_m2m`** (MCP + `sql/010_classes_m2m.sql`) :
  - jonctions `matrice_classes_therapeutiques` / `matrice_classes_pharmacologiques` (modèle `matrice_indications`) + RLS
  - migration de la FK existante en ordre 0 ; trigger : la FK reste la classe d’ordre minimum
  - vue : `classe_therapeutique` et `classe_pharmacologique` = jsonb `[{id,valeur,ordre,niveaux_connus}]` ; `*_id` et `*_niveaux` = 1er rang
  - `_valeur_champ_matrice` tire une classe au hasard dans la jonction ; `fusionner_entites` réécrit les jonctions
  - UI : `card: 'N'` (chips), filtres catalogue / jeux sur tous les ids
- [x] Import cours **`011_cours_sang_cv_hta.sql`** (MCP, idempotent) — voir section dédiée. Pas de fiche DCI créée.
- [x] Migration **`012_atc_secteurs_classes`** (MCP `jeupharma_012_atc_*`, fichier `sql/012_atc_secteurs_classes.sql`) :
  - jonction `matrice_secteurs_therapeutiques` + trigger sync FK ; secteurs renommés Sang→B, Cardiovasculaire→C
  - staging DCI→ATC + libellés ; mapping appliqué aux fiches `publie` (remplace secteurs/CT/CP)
  - décisions : dapagliflozine A+C ; piribedil N ; filgrastim/Ig/idarucizumab/BB/anti-angoreux suivent ATC ; associations multi-ATC
  - vue : `secteur_therapeutique` = jsonb[] ; UI `card: 'N'` + filtres `idsOf`
  - vérif : Furosémide C/C03/C03C ; Dapagliflozine A+C ; Piribedil N ; Bisoprolol C07 ; **0** `publie` hors staging
- [x] Migration **`013_atc_labels_cp_niveau`** (MCP, strip codes déjà fait + staging CP + DO) :
  - libellés secteur/CT/CP sans préfixe « CODE - » ; CP remplacés par libellés simples (Acénocoumarol → Antivitamines K ; Furosémide → Diurétiques de l'anse) ; extras multi-CP
  - UI : `admin/catalogue.html` + joueur `labelsOf` sur secteur (filtres/tri/recherche/incomplet) — plus de `[object Object]`
- [x] Notes **`006_catalogue_champs_actifs_notes.sql`** (pas de DDL) + audit dédup remote (2026-10-07) :
  - **0** groupe actif en doublon exact `valeur_norm` (tables entités actives) — index unique `_valeur_norm_actif_uidx` respecté ; aucune fusion RPC nécessaire
  - Doublons exacts `valeur_norm` : panneau Fusion / scanner (garder le plus lié)
  - **Quasi-doublons** (Priorité 2) : scanner séparé « inclusion de mots » (ex. « Hypotension » ⊂ « Hypotension orthostatique ») — suggestions uniquement, préremplissage formulaire ; fusion toujours manuelle ; exclus les égalités exactes `valeur_norm`
- [x] Migration **`014_fiche_validee`** (MCP + `sql/014_fiche_validee.sql`) :
  - `matrice_medicaments.fiche_validee boolean NOT NULL DEFAULT false` + colonne exposée dans `v_medicaments_complet`
  - Admin catalogue : bouton **Valider fiches** (file des fiches non validées du filtre courant) → **Validé** (écrit en base) ou **Modifier** (ouvre l’éditeur, reprend la file au fermeture)
  - Filtre toolbar « À valider / Validées » + badge tableau ; **Remettre à 0** remet `fiche_validee=false` sur les fiches du filtre actuel
  - Toute sauvegarde éditeur remet `fiche_validee` à `false` ; API `JpMedicaments.setFicheValidee` / `resetFicheValidee`
  - **Progression validation** (Priorité 2) : compteur « X / N fiches validées » à côté de **Valider fiches**, recalculé sur le filtre tableau courant
- [x] Migration **`015_simplifier_securite_cours`** (MCP + `sql/015_simplifier_securite_cours.sql`) :
  - Indications / CI / EI / précautions / interactions / surveillances : libellés courts isolables (ex. toutes variantes IDM → `IDM` ; angor → `Angor` ; IC ; FA ; SCA ; TVP ; MTEV…)
  - Fusion des doublons après renommage (jonctions réaffectées, anciennes entités soft-désactivées)
  - Source = vocabulaire cours Sang / CV / HTA (extraits ppt) — **pas de RCP** ; précautions longues (Natispray, patchs) raccourcies
- [x] Migration **`016_configuration_niveaux`** (MCP `jeupharma_016_configuration_niveaux` + `jeupharma_016_configuration_niveaux_hardening`, fichier `sql/016_configuration_niveaux.sql`) :
  - configuration centralisée : `niveau_secteurs_therapeutiques`, `niveau_classes_therapeutiques`, `niveau_classes_pharmacologiques`, `niveau_champs`
  - seed depuis l’ancien comportement `niveaux_connus` (tableau vide = disponible à tous) ; 12 champs actifs initialement disponibles pour chaque niveau
  - RLS : lecture `has_jeupharma_access()` ; écriture admin portail ; RPC atomique `enregistrer_configuration_niveau`
  - éditeur catalogue / CSV : aucun contrôle ni colonne de niveaux par valeur ; panneau admin unique par niveau
  - `matrice_medicaments.hospitalier` devient la source de vérité de la fiche hospitalière, distincte du rôle portail
  - quiz / trous / catalogue joueur / fiche aléatoire lisent taxonomies + champs du niveau
  - tables supprimées après contrôle des libellés migrés : `atc_map_staging`, `atc_labels_staging`, `atc_cp_fix_staging`, `atc_cp_extra_staging`
  - tables conservées : `secteurs_therapeutiques`, `classes_therapeutiques`, `classes_pharmacologiques` et leurs trois jonctions `matrice_*`
- [x] Migration **`017_classifications_fiches`** (MCP `jeupharma_017_classifications_fiches` + `jeupharma_017_classifications_fiches_rls`, fichier `sql/017_classifications_fiches.sql`) :
  - ajoute `matrice_medicaments.complexe boolean NOT NULL DEFAULT false` ; conserve `hospitalier` comme source du statut hospitalier
  - expose `hospitalier` + `complexe` dans `v_medicaments_complet` (`security_invoker`)
  - une fiche `hospitalier OR complexe` est visible / générable uniquement pour `profil_apprentissage.niveau_id = 'pharmacien'` ; les fiches ordinaires restent disponibles au pharmacien
  - `_matrice_disponible_niveau` et le générateur quiz legacy appliquent la même règle ; aucun `niveaux_connus` d’entité réintroduit
  - RLS `matrice_medicaments` / `quizz` / `parties_tableau_trous` + RPC `ouvrir_quiz` / `soumettre_quiz` empêchent la lecture et le jeu des contenus pharmacien par les autres profils
  - éditeur admin : deux switches explicites, sauvegardés séparément ; l’admin voit et édite toujours toutes les fiches
- [x] Nettoyage legacy **`niveaux_connus` / `*_niveaux`** (Priorité 1 — UI/JS uniquement) :
  - JSDoc morts retirés (`entites.js` `mergeNiveaux`, `quizz.js` contrôle `*_niveaux`) ; CSS `.jp-niveaux-warn` retiré
  - CSV continue d’ignorer les colonnes `*_niveaux` à l’import (compat anciens fichiers)
  - fichier local **`sql/018_vue_sans_niveaux_entite.sql`** prêt (`DROP VIEW` + `CREATE`, car Postgres refuse de retirer des colonnes via `CREATE OR REPLACE`) — **non appliqué remote** (prudence plan : colonnes vue encore exposées ; tables `niveaux_connus` de toute façon conservées)
- [x] Outil **audit snapshots** (pas de DDL) : `js/snapshots-audit.js` + section Historique dans `admin/jeux.html` ; SQL ops `sql/ops_audit_snapshots_archives.sql`
  - détecte quiz / trous dont le snapshot référence des `matrice_medicaments` en `archive`
  - régénération optionnelle quiz via `JpQuizz.regenerer` / RPC `generer_et_geler_quiz` ; trous = recréer (pas de régénération auto)
  - vérif remote initiale : 1 quiz touché (`PH-HH4X6`, déjà inactif), 0 trous

## Import cours Sang / CV / HTA (2026-10-08)

Sources lues (`ppt/slides/*.xml`, pas d’OCR) :
- `1-1 Rappel SANG AP et Cas de comptoir.pptx` — 34 slides, texte quasi vide (images). Aucune DCI extraite.
- `1-3 Sang PP 25-26 CécileB.pptx` — 79 slides (19 sans texte).
- `2- Appareil CV PP 23-24 Cécile.pptx` — 108 slides (34 sans texte, schémas).
- `5-HTA 2024.pptx` — 92 slides.

Extraits texte : `jeu-pharma/.cursor/docs/cours-extract/`.

### Fiches
- **Créées : 0.** Les DCI des cours (sang, CV, HTA, associations) étaient déjà `publie`.
- **Mises à jour** (fiches existantes, `publie` inchangé) :
  - classes multiples : 15 bêtabloquants du cours + classe pharma « Anti-arythmiques de classe 2 » ; Sotalol aussi bêtabloquant (FK reste classe 3) ; Vérapamil et Diltiazem + classe 4 et classe théra Anti-arythmiques ; Trinitrine + nitrés d’action immédiate ; Dabigatran + inhibiteurs de la thrombine (IIa)
  - précautions cours : dérivés nitrés (hypotension, association aux autres hypotenseurs) ; bêtabloquants « ne jamais interrompre brutalement »
  - indications cours manquantes : Molsidomine (angor) ; Amiodarone (troubles du rythme) ; Sacubitril + valsartan (insuffisance cardiaque) ; Sels ferreux + acide folique (3 indications acide folique du cours)
  - associations : CI, EI, précautions, interactions, surveillances recopiées des monocomposants déjà en base (dédoublonnées). Ex. Bisoprolol + HCT 15 CI / 16 EI ; Entresto 6 CI / 7 EI (valsartan) + indication IC ; fer + B9 : 5 indications, 2 CI, 4 EI. Clopidogrel + aspirine déjà complète, rien de nouveau.
  - nom Bisoce sur Bisoprolol ; détail Adrénaline (IV hôpital vs Anapen/Jext IM officine) ; thrombolytiques du cours en niveau `hospitalier` exclusif (Altéplase déjà, + Ténectéplase, Rétéplase, Streptokinase, Urokinase)
- **RCP (une seule molécule)** : Digoxine, BDPM CIS 67681303, rubriques 4.1 et 4.3. +2 indications (dont « Insuffisance cardiaque » déjà en entité), +4 CI graves. CI cours déjà présentes non dupliquées (BAV, hypokaliémie).
- **Ignorées** (citées, pas de fiche créée) : culots globulaires ; noradrénaline / dopamine (physiologie) ; pseudoéphédrine, réglisse, lithium, floctafénine, dantrolène (conseils / interactions) ; HE cyprès ; homéopathie et sclérosants déjà soft-archivés en `004` ; nom Digoxine® déjà retiré en `004`. Chlortalidone, altizide, méthyclothiazide, atorvastatine, triamtérène : pas de fiche mono. Triamtérène dans Prestole / Isobar : sécurité copiée de l’amiloride (même classe cours « épargneurs potassiques non antialdostérone »), pas du RCP triamtérène.

### Compteurs
- Cours : 3 classes nouvelles (classe 2, classe 4, inhibiteurs thrombine IIa) ; **20** liaisons pharma et **2** liaisons théra en plus de la classe d’ordre 0 (15 bêtabloquants + classe 2, Sotalol aussi bêtabloquant, Vérapamil et Diltiazem + classe 4 et classe théra Anti-arythmiques, Trinitrine + nitrés immédiats, Dabigatran + IIa) ; précautions nitrés et arrêt brutal ; 6 indications posées (molsidomine, amiodarone, entresto, 3 folate sur fer+B9) ; recopies sécurité des associations ; 1 nom (Bisoce) ; 1 détail (adrénaline) ; 4 fiches passées hospitalier.
- RCP : 1 indication nouvelle + 1 liaison indication existante + 4 CI, toutes sur Digoxine.

### Laissé vide (pas de source cours, RCP non extrait)
- Acide folique / folinique : pas de CI ni EI.
- Alginate de calcium, peroxyde d’hydrogène : pas d’indication rédigée dans le texte des slides.
- Rivaroxaban (CI et EI), apixaban (CI), fondaparinux (CI), dapagliflozine (CI et EI), thrombolytiques (CI), amiodarone (interactions), adrénaline (CI et EI) : cours muet ; pages BDPM des produits centralisés renvoient à l’EMA sans le texte des rubriques 4.x. Non complété.
- Partenaires sans fiche mono (chlortalidone, altizide, méthyclothiazide, atorvastatine) : leur part propre n’est pas dans les associations, hors la part amlodipine / amiloride / thiazidique déjà en base.
- Niveaux des fiches existantes non modifiés, sauf les 5 thrombolytiques hospitaliers. Niveaux des entités nouvelles = copie d’une entité sœur déjà en base.

## Catalogue — champs actifs & entités liées
- Flag `actif` sur `JpConstants.CHAMP_CODES` + `champsActifs()` / `isChampActif()`.
- **Actifs** : noms commerciaux, DCI, secteur, classes théra/pharma, détail pharmacologie, indications, CI, EI, précautions, interactions, surveillances (+ statut et booléens fiche hospitalière / complexe).
- Disponibilité par niveau : panneau admin centralisé (taxonomies + champs), sans `niveaux_connus` sur chaque valeur.
- **Legacy masqués** (tables/données conservées) : posologie générale, grossesse & allaitement, voies d’administration — absents UI admin/joueur, CSV modèle, cases quiz/trous ; `JpMedicaments.save` ne touche plus ces FK/jonctions.
- **Picker fiche** : chips multi `{ id, valeur }` + recherche ; « Créer … » seulement si pas de match exact `valeur_norm` ; singuliers id forcé (`data-entity-id`) + Effacer ; save priorise les ids.
- **Filtre Paramètres → Lié à** : type d’entité + sélection entité → fiches via jonction / FK (`JpMedicaments.lieAEntite`).
- **CSV** : en-têtes champs actifs ; dry-run refuse colonnes inconnues, ignore legacy si présentes ; import `findOrCreate` inchangé.
- **Fusion** : RPC inchangé + scanner « doublons exacts valeur_norm » (garder le plus lié) + scanner « quasi-doublons » (inclusion de mots, suggestions / préremplissage formulaire, fusion manuelle).
- **Complétude** (Priorité 2) : panneau admin **Complétude** — pour chaque champ actif, nombre de fiches `publie` vides via `isChampIncomplet` (indépendant du filtre tableau).
- **Progression validation** (Priorité 2) : compteur « X / N fiches validées » à côté de **Valider fiches** (filtre courant).

## Build code (livré)
- [x] `.cursor/` (rules + STATE).
- [x] SQL `sql/001` … `007_niveau_hospitalier.sql`.
- [x] Fiche aléatoire (joueur) : `fiche-aleatoire/index.html`, `js/fiche-aleatoire.js`, `sql/008_scores_fiche_aleatoire.sql`.
- [x] Socle hub / CSS / dual client / FAB / toasts / logs / bugs.
- [x] Admin + catalogue + quiz + trous + CSV + BDPM + profil + suivi charts.
- [x] Refactor DCI-centrique surfaces : `constants`, `medicaments`, `csv`, `bdm`, `trous`, `admin/catalogue`, `catalogue`, `admin/trous`, architecture.
- [x] Admin contenu unifié : `admin/catalogue.html` (table + création/édition en modal `.jp-catalogue-fiche-modal` + import + fusion + niveaux) ; redirects depuis medicaments / import-export / fusion / entites. Filtre **Incomplètes** + filtre **Lié à** (type + entité). Picker chips / id forcé (plus de textareas multi).
- [x] Admin jeux unifié : `admin/jeux.html` (« Création jeu ») — onglets **Historique** | Quiz | Tableau à trous ; Historique = liste filtrée (en cours / terminés / archivés) ; Quiz/Trous = création seule (même structure CSS `.jp-quiz-admin-*`) ; redirects `quizz.html` / `trous.html` → `?type=`.
- [x] Trous jouer — flux score manuel (voir section ci-dessous).
- [x] Refonte création tableau à trous (voir section ci-dessous) — **pas de migration Supabase**.
- [x] Refonte création quiz (voir section ci-dessous) — **pas de migration Supabase** (génération QCM côté client).
- [x] Priorité 4 — QR partage + tableau de bord classe (voir sections ci-dessous) — **pas de migration Supabase**.
- [x] Priorité 3 — points faibles + filtres FA + progression secteur + mobile trous (voir section dédiée) — **pas de migration Supabase**.

## Partage QR (création quiz / trous)
- Sur `admin/jeux.html` après création : bloc résultat affiche le `code_unique`, un **QR code** (canvas) et l’URL absolue de `quiz/jouer.html?code=` ou `trous/jouer.html?code=`.
- Génération **client** via `qrious@4.0.2` (jsDelivr, déjà autorisé CSP `script-src`) ; image canvas / pas d’API QR externe.
- Fichiers : `admin/jeux.html`, `js/admin-jeux.js` (`renderResultQr`), `css/app.css`.

## Tableau de bord classe (admin suivi)
- `admin/suivi.html` : section « Tableau de bord classe » visible **uniquement** quand une activité quiz ou trous est sélectionnée (filtre Activité).
- Agrégats sur la période : **moyenne** (%), nombre de tentatives / utilisateurs ; **questions les plus ratées** (top 15) depuis `details_reponses`.
- Quiz : items `correct` + libellé depuis `snapshot_questions.enonce` (ordre).
- Trous : détail auto (tableau), manuel `case` / `ligne` ; score **général** sans détail → message, pas de faux taux.
- Fichiers : `admin/suivi.html`, `js/charts-admin.js`, `css/app.css`.

## Création quiz (refonte admin)
- UI : `admin/jeux.html` panneau Quiz — **4 étapes** (Médicaments → Paramètres → Questions → Titre) ; **pas d’aperçu grille** (liste de questions éditable à l’étape 3).
- Étape 1 : niveau (les fiches hospitalières ou complexes entrent dans le pool uniquement pour `pharmacien`) ; filtres multi (secteurs + classes théra/pharma + texte) — **OR intra-filtre, AND inter-filtres** (même logique que trous) ; coches médicaments = pool QCM.
- Étape 2 : champs interrogés + nb questions + nb propositions.
- Étape 3 : « Générer les questions » ; par question : **Supprimer** / **Régénérer** ; « Ajouter une question » (même contraintes filtres/champs). Génération **client** (`JpQuizz.genererQuestions` / `genererUneQuestion`) — distracteurs priorité même secteur puis pool.
- Création = **exactement la liste affichée** via `JpQuizz.createWithSnapshot` (insert `snapshot_questions`, **zéro** appel `generer_et_geler_quiz`).
- `configuration_json` : `champs_interroges`, `nb_questions` (= longueur snapshot), `nb_propositions`, `distracteurs`, `filtres` ; `secteur_therapeutique_id` = seul secteur coché s’il y en a exactement un (sinon null).
- RPC `generer_et_geler_quiz` conservée (legacy / `createAndGenerate` / `regenerer`) — ne gère ni filtres multi ni régénération unitaire.
- Fichiers : `admin/jeux.html`, `js/admin-jeux.js`, `js/quizz.js`, `css/app.css` ; docs STATE + architecture.

## Création tableau à trous (refonte admin)
- UI : `admin/jeux.html` panneau Trous — **4 étapes** (Lignes → Colonnes → Trous → Titre) + **aperçu** auto-refresh (bouton Masquer / Afficher l’aperçu, UI only) ; plus de « Prévisualiser » ni select Aléatoire/Manuel exclusif.
- Étape 1 : niveau (les fiches hospitalières ou complexes entrent dans le pool uniquement pour `pharmacien`) ; filtres multi (secteurs + classes théra/pharma + texte) — **OR intra-filtre, AND inter-filtres** ; interrupteur « Une ligne par nom commercial » + retouche noms par fiche ; max lignes + « Tirer les lignes au hasard » (tirage figé jusqu’au re-clic).
- Étape 2 : colonnes + **identité de ligne** (`identite_visible` : `dci` | `noms` | `les_deux` | `au_moins_un`, défaut `au_moins_un`) — cases concernées jamais en trou ; `au_moins_un` empêche noms+DCI tous deux trous sur la même ligne (tirage + clic).
- Étape 3 : densité + « Tirer les trous au hasard » + clic case + « Effacer les trous ».
- Création = **exactement la grille affichée** (zéro re-tirage) via `buildSnapshot({ lignes, colonnes, trous, identite_visible })`.
- Snapshot : `identite_visible` + chaque ligne `ligne_id` / `label` / `matrice_id` (+ `nom_commercial_id`). **Plus de colonne fixe « Médicament »** (identité = colonnes Noms/DCI selon le mode).
- `configuration_json` : `colonnes`, `densite`, `max_lignes`, `par_nom`, `identite_visible`, `filtres`.
- Compat parties anciennes : sans `snapshot.identite_visible` → colonne « Médicament » (= `label`) encore affichée (jouer / imprimer / print). `JpTrous.ligneKey` / score — repli `matrice_id`.
- Fichiers : `admin/jeux.html`, `js/admin-jeux.js`, `js/trous.js`, `js/print.js`, `trous/jouer.html`, `trous/imprimer.html`, `css/app.css`.

## Flux score tableau à trous (`trous/jouer.html`)
- **Imprimer** : grille papier (cases vides) via `JpPrint.trousPrintDocument` + iframe same-document (`JpPrint.printHtml`). Admin création : lien `trous/imprimer.html?code=…` inchangé.
- **Voir la réponse** : affiche le corrigé (`JpTrous.listerTrous` → attendus sous chaque trou). **Aucun score** calculé ni affiché ni enregistré.
- **Indiquer un score** : seul chemin vers un score. Ouvre le modal `.jp-trous-score-modal` (3 modes) ; insert DB **uniquement** après validation.
  1. **Résultat général** — saisie manuelle `score_obtenu` / `score_max`.
  2. **Par ligne** — OK/KO par médicament ayant des trous → total = lignes OK / lignes scorables.
  3. **Par case** — case cochée = bonne réponse → total = cases OK / trous.
- API : `JpTrous.soumettreManuel(partieId, { mode_saisie, score_obtenu, score_max, details })` — pas d’`evaluer()` sur les champs écran. Log `trous_soumettre_manuel`. `soumettre()` (auto-éval saisies) reste exposé mais n’est plus utilisé par jouer.
- Fichiers : `js/trous.js`, `trous/jouer.html`, `css/app.css` (`.jp-trous-score-modal*`).

## Fiche aléatoire (joueur)
- Route : `fiche-aleatoire/index.html` — tuile hub « Fiche aléatoire ». Pas de page ni d’options admin.
- Tirage d’une fiche `publie`. Noms commerciaux + DCI visibles ; autres champs actifs vides jusqu’à **Voir les réponses** (aucun score calculé ni enregistré).
- **Mettre un score** : popup, note entière /10, insert `scores_fiche_aleatoire` seulement après validation. Pas de 0 par défaut.
- **Passer** : fiche suivante, sans score.
- Exclusion : **3 notes > 8/10** (8 ne compte pas) pour l’utilisateur connecté → fiche plus proposée.
- Filtre niveau : `JpNiveaux.filtrerMedicaments` / `visiblePourNiveau` + `JpProfil.getNiveauCode()` (joueur, pas le bypass admin du catalogue).
- **Filtres joueur** (Priorité 3) : secteur + classe thérapeutique + classe pharmacologique — options limitées via `niveau_*` (`JpFicheAleatoire.optionsFiltres` / `filtrerTaxonomie`) ; **Appliquer** retraite le pool puis tire.
- RLS : select soi ou `is_portail_admin()` ; insert soi + `has_jeupharma_access()`.
- **Suivi** : scores dans Mon espace (`espace.html`) + admin suivi Chart.js (`charts-admin.js`) — type « Fiche aléatoire », libellé DCI · noms, note /10.
- Fichiers : `fiche-aleatoire/index.html`, `js/fiche-aleatoire.js`, `espace.html`, `admin/suivi.html`, `js/charts-admin.js`, `index.html`, `sql/008_scores_fiche_aleatoire.sql`.

## Priorité 3 — Expérience joueur
- **Mes points faibles** : agrégation client des échecs déjà stockés — quiz (`details_reponses[].correct === false`), trous (tableau auto ou manuel `ligne`/`case`), fiche aléatoire (note ≤ 8/10). Score trous « général » sans détail par fiche : ignoré. Zéro IA, **pas de migration**.
  - API : `js/points-faibles.js` (`JpPointsFaibles.agreger`, `poolRevision`, `progressionParSecteur`).
  - Session : `points-faibles/index.html` (liste + révision type fiche aléatoire) ; entrée depuis `espace.html`.
- **Progression par secteur** (`espace.html`) : pour le niveau courant, fiches éligibles vs acquises (3 notes > 8/10) groupées par secteur (jonction multi).
- **Mobile** : `css/app.css` — grille `.jp-trous-table` scrollable (`min-width` + `.jp-table-wrap`), modal score en feuille bas / plein écran ≤480px, actions trous en colonne.
- Fichiers : `js/points-faibles.js`, `points-faibles/index.html`, `espace.html`, `fiche-aleatoire/index.html`, `js/fiche-aleatoire.js`, `css/app.css`, architecture.

## Test E2E navigateur authentifié (p1-e2e — 2026-10-08)

### Verdict
**Non abouti en UI authentifiée.** Aucun credential de test dans le repo, STATE, stores agent, ni README. `protect.js` redirige toute surface `jeu-pharma/` non authentifiée vers le portail (`https://jessy1590.github.io/Application/`). Shell local indisponible dans la session agent (pas de serveur file:// alternatif). Pas de modification de code suite à ce test (aucun bug bloquant trivial observé côté chemins critiques).

### Smoke non-auth (navigateur MCP)
- [x] Portail login affiché (`Email` / `Mot de passe` / Se connecter).
- [x] `…/jeu-pharma/` et `…/fiche-aleatoire/` → redirect portail (gate OK).
- [x] Assets Pages : `admin/catalogue.html` et `admin/jeux.html` servis (texte structure visible hors auth via fetch).
- [!] Pages **en retard** sur le worktree P3 : `js/points-faibles.js` → **404** ; `js/fiche-aleatoire.js` déployé **sans** `filtrerTaxonomie` / `optionsFiltres` (présents en local). Re-test UI P3/P4 nécessite commit + déploiement Pages (ou serveur local + session).

### Vérifs SQL remote (projet `kpjflntnotftpzffjbud`) — substitut data
- Publie : **161** ; hospitalier : **10** ; complexe : **0** ; ordinaires : **151**.
- `_matrice_disponible_niveau` : **apprenti** → 151 dispo / **0** hosp / **0** complexe ; **pharmacien** → 161 / 10 hosp / 0 complexe. Aligné client `visiblePourNiveau` + `JpNiveaux.filtrerMedicaments`.
- Config `niveau_*` peuplée : champs 81, secteurs 47, CT 179, CP 808 ; lookup `niveaux` = 7.
- Validation fiches : **0 / 161** validées (compteur UI à exercer une fois auth).
- Quiz en base : **2** ; parties trous : **4** ; DCI hosp ex. Altéplase, Ténectéplase, Urokinase, Idarucizumab…

### Revue code ciblée (worktree) — OK structurel
- Catalogue : boutons Valider fiches, Remettre à 0, compteur `#jpValidationCount`, panneau Complétude, scanner quasi-doublons `#jpFusionScanQuasi`.
- Paramétrage niveau : panneau catalogue + RPC `enregistrer_configuration_niveau` (016).
- Jeux : `renderResultQr` + Historique audit snapshots (`snapshots-audit.js`).
- Fiche aléatoire : `listerEligibles` → `filtrerMedicaments` / `visiblePourNiveau` ; filtres secteur/classe locaux.
- Mon espace : `progressionParSecteur` + lien `points-faibles/`.
- Admin suivi : section « Tableau de bord classe » si activité sélectionnée.
- Mobile CSS : `.jp-trous-table` min-width + scroll ; modal score feuille bas ≤720px / plein ≤480px.

### Non vérifié (besoin session admin + joueur)
Création/modif fiche, Valider / Remettre à 0, Complétude live, scanner UI, enregistrement `niveau_*`, wizard quiz/trous jusqu’au QR, Historique snapshots UI, bascule profil apprenti→pharmacien en FA, filtres FA live, progression / points faibles live, dashboard classe live, smoke responsive trous sur device.

### Pour rejouer l’E2E
1. Fournir un compte portail **admin** (et idéalement un joueur non-admin avec `site_access` Jeu Pharma) — ou se connecter manuellement dans le navigateur MCP.
2. Préférer le **worktree local** (ou Pages à jour) pour P2–P4.
3. Parcourir le périmètre listé dans le plan Priorité 1.

## App parcours (2026-10-11)

### Décision
- Surface principale = app parcours à la racine `jeu-pharma/`.
- Source de vérité joueur = publications par module (héritage ancêtres) + `module_blocs` ; parcours pharmacien = `referentiel_valide`.
- Accès parcours : `inscriptions_parcours.statut` (`demande` → admin `accepte`/`refuse`).
- Import RCP → sas `a_valider` uniquement (pas de publication auto).
- `legacy-v1/` hors dépendance produit (dossier archivable).

### Arborescence (`023`)
- `modules_cours.parent_id` + `est_groupe`
- DEUST / etu_3a : Sang → anémie, anticoagulation ; Cœur → angor, IDM, arythmies, IC ; Veine et artère → artérite, insuffisance veineuse ; Urgence → OAP, urgences_cv ; HTA
- Ancien module plat `cv` dépublié ; pubs migrées vers groupes Cœur / Veine / Urgence + pubs fines par indications/classes sur les feuilles
- RPC : `v2_module_ancetres`, `v2_publier_module_par_indications`, `v2_publier_module_par_classes_ther` ; résolveur / progression mis à jour

### Parcours démo Introduction (`024`)
- (Obsolète depuis 031 : parcours `introduction` supprimé, remplacé par `cardiovasculaires_deust_2a`) Parcours `introduction` (ordre 1, `publications`, niveau apprenti) — prise en main admin complète
- Thèmes : Prise en main → Sang premiers pas → Mise en pratique
- Feuilles : Lire une fiche (fer + énoxaparine) · Anémie · Anticoagulation · Révision guidée — **sans prérequis** (toutes ouvertes)
- Pubs : corpus réduit (~7 DCI) depuis connaissances `valide`
- Jeux démo actifs :
  - `JP-INTQ1` Quiz · `JP-INTT1` Trous · `JP-INTF1` Fiche aléatoire · `JP-INTO1` Ordonnance
- Déblocage : feuille sans `prerequis_module_id` = accessible (DEUST garde sa chaîne)

### Migrations remote (`kpjflntnotftpzffjbud`)
- [x] `019` … `022` (pédagogie + pause quiz)
- [x] `023` DDL/resolver + seed arborescence + pubs feuilles
- [x] `024` parcours Introduction + 4 jeux démo
- [x] `025` RPC `v2_creer_parcours` / `v2_creer_module` / `v2_publier_module_matrices` ; jeux jouables (`js/jeux-play.js`) ; admin parcours simplifié
- [x] `026` fix pool quiz / ordonnance
- [x] `027` studio : `module_blocs`, pubs par `connaissance_id`, accès demande/accepte, `v2_lecon_joueur`, `v2_mon_espace`
- [x] `037` drop legacy V1 jeux · `038` bloc recommandation · **`039` classement / appariement / `v2_update_modele_jeu`**
- [x] **`040` multi-niveaux ★** · **`041` purge profil / hospitalier-complexe** (vue sans `*_niveaux` / hospitalier — remplace l’intention de `018`)
- [~] `018_vue_sans_niveaux_entite` — **obsolète** (couvert par `041`)

### Surfaces
- Hub joueur : `index.html` — Parcours | Mon espace | Catalogue | Jeux
- Joueur : `parcours.html`, `espace.html`, `lecon.html`, `mon-espace.html`, `catalogue.html`, `jeux/`
- Admin desktop : tuiles `index.html` = Studio, Accès, **Référentiel** (`admin/referentiel.html` + `js/referentiel-admin.js`, `medicaments.js`, `entites.js`, `bdm.js`), Jeux. `catalogue.html`/`fiche.html` = redirects. Sources / Import RCP / CSV : fichiers conservés, non liés.

### Correctifs legacy conservés
- `JpQuizz.listQuiz` sans snapshot joueur ; pause quiz ; nouveau tirage entraînement

## Manuel restant (ops — pas code)
- [ ] Attribuer `site_access` aux joueurs (admins portail passent le gate sans ligne).
- [ ] (Optionnel) Sur les parties listées par l’audit Historique / `ops_audit_snapshots_archives.sql` : régénérer les quiz ou recréer les trous concernés.
- [ ] Rejouer E2E authentifié (voir section p1-e2e) après credentials + déploiement worktree.

## Ne pas
- Inventer UI / flux / IA hors demande.
- Utiliser `service_role` côté client.
- Importer `PhieEvreux/shared/*`.
- Réappliquer `001` / `002` / `004` / `005` / `007` / `008` sans vérifier l’état remote.
- Réintroduire un profil métier type apprenti/pharmacien ou `referentiel_valide` joueur ; l’accès contenu passe par pubs + ★ + déblocage.
- Impression via `window.open`.

## Règles Cursor
- `rules/architecture.mdc`, `security.mdc` (alwaysApply)
- `rules/design.mdc`, `rules/conventions.mdc` (globs)
