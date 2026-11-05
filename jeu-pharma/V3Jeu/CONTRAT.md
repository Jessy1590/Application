# V3Jeu — contrat d’architecture

Bac à sable autonome des jeux V3. **Lit** le site de base (lecture seule) ; **écrit** uniquement dans les tables V3 (`jeupharma.jeux*`) via RPC `jeu_*`. Jamais `modeles_jeu`, `tentatives_jeu`, `scores_fiche_aleatoire`.

Règles produit : voir le plan « Audit paramètres jeux » (résumé par type plus bas). Copy **laconique** : labels + actions, détail en tooltip (`V3UI.tip`). Aucun paragraphe d’emploi.

## Arborescence

```
V3Jeu/
  index.html                 shell unique (hash router)
  CONTRAT.md                 ce fichier
  css/
    base.css                 layout, contrôles, chips, stepper, tooltip, toast (socle)
    selection.css            sélecteur universel
    play.css                 socle joueur commun (progression, cartes, révélation, notation 0/½/1)
    games/<type>.css         un fichier par jeu (quiz, trous, fiche, ordonnance, classement, appariement)
  js/
    config.js                URL + clé anon (jamais service_role)
    core/ui.js               V3UI   — DOM builder + composants
    core/data.js             V3Data — lectures Supabase (site de base, lecture seule)
    core/champs.js           V3Champs — catalogue des champs pédagogiques
    core/selection.js        V3Selection — sélecteur universel + résolution en molécules
    core/notation.js         V3Notation — Rapide /10 · Détaillé 0/½/1 (trous, fiche, ordonnance)
    core/store.js            V3Store — RPC jeu_* (créer, maj, statut, charger, config, lister)
    core/games.js            V3Games — registre des modules de jeu
    core/wizard.js           V3Wizard — 5 étapes, délègue au module du type
    core/list.js             V3List — liste des jeux V3 (statuts, archives -An)
    core/app.js              boot, auth, routes
    games/<type>.js          un module par type
```

Un agent qui travaille sur un jeu ne touche **que** `js/games/<type>.js` et `css/games/<type>.css`. Besoin d’un composant commun manquant → l’ajouter dans `core/ui.js` sans casser l’API existante.

## Routes (hash)

- `#/` liste des jeux V3
- `#/nouveau` wizard création
- `#/edit/JP-XXXXX` wizard édition (préremplie via `jeu_charger` + `jeu_type_config`)
- `#/jouer/JP-XXXXX` partie réelle (RPC `jeu_demarrer_*` / `jeu_soumettre_*`, écrit dans `jeux_tentatives`)

## Sélection (format partagé, partout)

```json
{
  "module_ids": ["uuid leçon"],
  "bloc_ids": ["uuid bloc molécule"],
  "matrice_ids": ["uuid matrice"],
  "filtres": { "secteur": ["norm"], "classe_ther": ["norm"], "classe_pharma": ["norm"] }
}
```

- Sources = union (leçons ∪ blocs ∪ molécules). `filtres` restreint l’union ; sans source, `filtres` seul = molécules publiées du site qui matchent.
- Utilisé pour : pool du jeu (`jeux_pool` + tables liées), filtre d’un besoin d’ordonnance (`filtre_json`), import d’items classement / appariement (non stocké).
- `V3Selection.mount(el, { value, onChange, compact })` → `{ get(), set(sel), destroy() }`.
- `V3Selection.resolve(sel)` → `Promise<Molecule[]>` :

```js
{ id, dci, noms: ['Kardegic'], est_association: bool, composants: [id],
  valeurs: { indications: ['…'], contre_indications: ['…'], … },   // champ_code → string[]
  origine: [{ kind: 'lecon'|'bloc'|'molecule', id, label }] }
```

  Valeurs = connaissances **publiées** sur les leçons concernées (ce que voit l’apprenant), hors molécules `masque_ids` des blocs. Repli `v_medicaments_complet` uniquement si aucune publication, marqué `source: 'complet'`.

## Champs (`V3Champs`)

`V3Champs.list` = `[{ code, label, court, identite }]`, codes = colonnes de `v_medicaments_complet` (dci, nom_commercial, secteur_therapeutique, classe_therapeutique, classe_pharmacologique, detail_pharmacologie, posologie_generale, grossesse_allaitement, indications, contre_indications, effets_indesirables, precautions_emploi, interactions, surveillances, voies_administration, conditions_prescription_delivrance, conseils_delivrance). `identite` = dci, nom_commercial. `V3Champs.presents(mols)` = codes ayant ≥ 1 valeur dans le pool.

## Module de jeu (`V3Games.register(type, def)`)

```js
V3Games.register('quiz', {
  label: 'Quiz',
  tip: 'QCM, une bonne réponse.',          // tooltip du choix de type
  pool: true,                              // false pour classement / appariement
  defaults(ctx) { return { … } },          // cfg initiale du type
  fromConfig(cfg) { return { … } },        // jeu_type_config → cfg éditable
  params(el, ctx) {},                      // étape 3
  perso(el, ctx) {},                       // étape 4
  play(el, ctx, session) {},               // étape 5 (essai) et #/jouer (réel)
  validate(ctx) { return ['message court'] },
  payload(ctx) { return { quiz: { … } } }, // clé attendue par jeu__apply_type_cfg
});
```

`ctx` :

- `ctx.cfg` — objet mutable du type (source de vérité, jamais lu depuis le DOM au moment du save)
- `ctx.meta` — `{ titre, module_ids, niveau_min, niveau_max, selection }`
- `ctx.mols()` — `Promise<Molecule[]>` (résolution mémoïsée de `meta.selection`)
- `ctx.changed()` — signale une modif (rafraîchit le récap / validation, **ne re-rend pas** l’étape)
- `ctx.ui`, `ctx.data`, `ctx.champs`, `ctx.selection`, `ctx.notation`

`session` :

- `session.reel` — `false` en étape 5 (rien n’est écrit), `true` sur `#/jouer`
- `session.jeu` — ligne `jeu_charger` (si réel)
- `session.rpc(name, args)` — appel RPC `jeupharma` (réel seulement)
- `session.fin(resultat)` — `{ obtenu, max, details }` → écran de fin commun

Règle DOM : chaque étape construit son DOM **une fois** avec `V3UI.h` et met à jour des nœuds ciblés. Pas d’`innerHTML` global à chaque frappe (bug de focus V2).

## `V3UI` (socle composants)

`h(tag, attrs, ...children)`, `tip(text)`, `field(label, control, { tip, hint })`, `segmented(options, value, onChange)`, `number(value, { min, max, step, onChange })`, `checks(options, values, onChange)`, `toggle(label, value, onChange)`, `chip(label, { kind, onRemove })`, `button(label, { variant: 'primary'|'ghost'|'danger', onClick, icon })`, `section(title, ...children)`, `empty(text)`, `toast(msg, kind)`, `confirm(msg)`, `stars(min, max, onChange)` (★1–5).

## Base de données (V3 uniquement)

`jeu_creer(p_payload)` / `jeu_maj(p_jeu_id, p_payload)` :

```json
{ "type_jeu": "quiz", "titre": "…", "module_ids": [], "niveau_min": 1, "niveau_max": 5,
  "pool": <Sélection>,  "quiz": { … } }
```

Clés type : `quiz`, `trous`, `fiche`, `ordonnance`, `classement`, `appariement` (voir `sql/100`, `101`, `103`, `104`). Statut : `jeu_set_statut` (actif | pause | archive). Édition d’un jeu déjà joué → archive automatique `JP-XXXXX-An` côté SQL.

Tentatives : `jeux_tentatives` (`contexte` classique | examen, `notation` serveur | declaree, `relecture`). Quiz / classement / appariement = score serveur. Trous / fiche / ordonnance = `jeu_demarrer_declare` + `jeu_soumettre_declare` (Rapide /10 ou Détaillé 0/½/1, relecture admin optionnelle, obligatoire en examen).

## Révision R2 (retours admin) — prioritaire sur le reste

### Étapes du wizard

`STEPS = ['Molécules', 'Jeu', 'Paramètres', 'Personnalisation', 'Essai']`.

- **3 Paramètres** = le choix initial, court (ex. quiz : Style · Questions · Propositions ; trous : Composition · Lignes · % ; fiche : Composition · Nb fiches ; ordonnance : Nb besoins · Associations ; classement / appariement : Consigne · disposition).
- **4 Personnalisation** = le détail qui découle de l’étape 3 (quiz : banque de questions + réglages auto/mixte sens · difficulté · champs ; trous : colonnes / grille ; fiche : champs visibles / à restituer, emplacements ; ordonnance : besoins ; classement / appariement : zones + items).
- **5 Essai** = `def.essai(el, ctx)` (optionnel, outils d’aperçu : « Tester un tirage », etc.) affiché **au-dessus** de `def.play(...)`. Aucun « Tester un tirage » en étape 3 ou 4.

### Composant « ajout » semi-auto (`V3UI.adder`)

Toute liste construite par l’admin (questions quiz, besoins ordonnance, emplacements fiche, items/zones classement-appariement, imports) suit le même schéma : **panneau d’ajout en haut**, **liste validée en dessous**.

```js
const ad = V3UI.adder({
  title: 'Ajouter',                 // titre du panneau haut
  draft(host, api) {},              // construit le formulaire / la sélection ; api.propose(list) affiche les propositions
  propose: true,                    // true = propositions listées sous le formulaire, cochables, avant « Ajouter »
  items: () => cfg.questions,       // tableau source de vérité (mutable)
  renderItem(item, i, api) {},      // ligne de la liste validée (éditer, supprimer, monter/descendre via api)
  onAdd(list) {},                   // reçoit les propositions cochées (ou le brouillon) → push dans items
  onChange() {},                    // appelé après ajout / suppression / réordonnancement
  empty: 'Aucune question',
});
el.appendChild(ad.el); ad.refresh();
```

Rien n’entre dans la liste validée sans clic **Ajouter**. Choisir une source (sélection, champ, etc.) **propose** ; l’admin coche / décoche ; **Ajouter** valide.

### Données jouées = visibles joueur uniquement

`V3Selection.resolve(sel, { niveau_min, niveau_max })` : valeurs = publications actives des leçons concernées dont la plage ★ croise celle du jeu (et module non hors plage). **Plus aucun repli `v_medicaments_complet`** pour les valeurs : une molécule sans publication visible n’a pas de valeurs (exclue des pools de jeu). `ctx.mols()` passe la plage ★ du jeu.

### Visuel joueur = V2

`play()` reproduit le markup / classes `jp-*` du joueur V2 (`../js/jeux-play.js`, `../css/v2.css`, `../css/player.css`, `ordonnances/`), mêmes scores. Seules évolutions joueur autorisées : disposition des zones classement (embed / page) et choix Rapide / Détaillé (+ relecture admin) pour trous, fiche, ordonnance.

### Tooltips

`V3UI.tip(text)` renvoie `null` si texte vide → ne jamais passer `tip: ''`. Toute option `segmented` avec `tip` doit avoir un texte réel.

### Classement ↔ appariement

Même éditeur `V3Zones` (`core/zones.js`) : colonnes = zones, lignes = items, ≥ 1 item par zone. Appariement = exactement 2 zones de **même nombre de lignes** (ligne i ↔ ligne i). Classement = sinon. Seul l’affichage joueur final diffère.

## Résumé produit par type

- **Quiz** : styles manuel | auto | mixte. `nb_questions` (manuel/auto) ou `nb_manuelles` + `nb_auto` (mixte). `nb_propositions` 2–6. Sens auto mol→valeur (défaut) | valeur→mol | les deux. Difficulté = plafond de similarité N1 < 20 %, N2 < 50 %, N3 < 80 % (> 80 % toujours rejeté, question sautée si pas assez de distracteurs). Champs interrogés (auto/mixte, défaut = présents). Éditeur manuel : liste repliable + carte ouverte, radio bonne réponse, 2–6 propositions, dupliquer, réordonner, aperçu. « Tester un tirage ».
- **Trous** : composition auto (lignes N aléatoires ou groupe, % de trous, colonne visible | trouable) ou grille (clic case par case). Joueur choisit Rapide (/10) ou Détaillé (saisie, puis 0/½/1 par valeur masquée). Unité = valeur masquée.
- **Fiche** : partie = N fiches. Auto (N tirées ou groupe, exclusion après 3 notes ≥ 8) ou manuel (N emplacements fixe | aléatoire). Champs visibles (défaut identité) vs à restituer. Score = moyenne.
- **Ordonnance** : liste de besoins ; chaque besoin = aléatoire (sa propre Sélection) ou fixe (molécule / association). « Associations possibles » (option). Champs à restituer ≥ 1. Vigilance après révélation (interactions publiées entre lignes + conseil association).
- **Classement** : consigne + zones + items (clé item→zone), import via Sélection (molécules d’un bloc → items ou zones). Joueur embed : bandeau items en haut, zones en grille ; page pleine : pile | zones. Clic pour placer. 1 item = 1 point.
- **Appariement** : consigne + gauche / droite + paires 1–1, import par colonne, « Proposer associations » (molécule ↔ classe / indication). 1 paire = 1 point.
