# IA — Jeu Pharma

Trois Edge Functions Gemini (secret **`GEMINI_API_KEY`** serveur uniquement, jamais dans le navigateur) :

| Edge | Surface | Rôle |
|---|---|---|
| `jeupharma-ia-blocs` | Modif parcours | Texte / PDF de cours → blocs de leçon (brouillon) |
| `jeupharma-ia-matrice` | Référentiel admin | BDM + RCP officiel → fiche matrice condensée (revue puis save) |
| `jeupharma-ia-entites` | Référentiel — Vérifier les éléments | Consigne + liste entités → propositions (rename/merge/delete) à valider une à une |

Client partagé : `gemini-client.js` (`JpIaGemini.invoke`, `FN_BLOCS`, `FN_MATRICE`, `FN_ENTITES`).

Ne **pas** appeler les Edge OCR Location depuis le client jeu-pharma.

---

# IA — blocs de leçon (Modif parcours) + mode modifier (Preview)

Deux usages de la même Edge `jeupharma-ia-blocs` :

| Mode | Surface | Entrée | Sortie |
|---|---|---|---|
| *(défaut / `generer`)* | Modif parcours — bouton **IA** | `text` et/ou `pdfBase64` | `blocs[]` (rétrocompat) |
| `modifier` | Preview parcours | `instruction` (+ `niveau`, `cible`, `context`) | `nodes[]` pré-brouillon |

| Fichier | Rôle |
|---|---|
| `gemini-client.js` | `JpIaGemini` : base64, `functions.invoke` (anon + session admin), messages d'erreur |
| `studio-blocs.js` | `JpStudioIA` : modale, sanitisation HTML, JSON → payload studio, insertion brouillon |
| `ia.css` | styles modale |
| `edge/jeupharma-ia-blocs/index.ts` | source de l'Edge Function (prompt + normalisation serveur) |
| `sql/072_ia_config.sql` | table `jeupharma.ia_config` (prompt éditable, RLS admin) |

## Edge Function
- Secret **`GEMINI_API_KEY`** (existant, partagé avec `ocr-map-fields`). Jamais côté navigateur.
- Modèle : `GEMINI_IA_MODEL` → sinon `GEMINI_OCR_MODEL` (config existante) → sinon `gemini-3.8-flash`. Raisonnement : `GEMINI_IA_THINKING` (défaut `low`).
- Accès : `portail.profiles.role === 'admin'` uniquement. `verify_jwt = true`.
- Prompt système : charge `jeupharma.ia_config` clé `blocs_system` (admin) si présent, sinon constante Edge ; **suffixe progression ★1–★5 toujours append** (non éditable : ★1 DEUST Préparateur → ★5 pharmacien confirmé, « N'invente rien », création/suppression chapitres·sections·leçons·blocs).
- Limites : texte 80 000 car., PDF 10 Mo, instruction 20 000 car. (mode `modifier`).
- Déploiement : MCP Supabase `deploy_edge_function` (projet `kpjflntnotftpzffjbud`, slug `jeupharma-ia-blocs`) ou CLI en copiant le dossier vers `supabase/functions/jeupharma-ia-blocs/`.

## Config SQL (`ia_config`)
```sql
-- jeupharma.ia_config (cle PK, valeur, updated_at, updated_by)
-- RLS : portail.is_admin() uniquement (SELECT/INSERT/UPDATE/DELETE)
-- Seed : cle = 'blocs_system' (prompt génération blocs, migration 072)
```
Édition UI du prompt (avec confirmation) = hors Edge ; l’Edge lit uniquement `blocs_system` à chaque appel.

## Requête — génération (rétrocompat)
```json
{ "text": "…", "pdfBase64": "…", "pdfName": "cours.pdf",
  "context": { "titre": "", "resume": "", "molecules": ["DCI publiées sur la leçon"],
               "blocs_existants": [{ "type": "texte", "titre": "" }] } }
```
`text` et/ou `pdfBase64` (au moins un). `mode` omis ou ≠ `modifier`.

## Réponse — génération
```json
{ "version": 1, "mode": "generer",
  "resume_lecon": "",
  "blocs": [
    { "type": "texte", "titre": "", "html": "<h2>…</h2><p>…</p>" },
    { "type": "conseil", "titre": "", "pathologie": "", "corps_html": "<ul><li>…</li></ul>" },
    { "type": "recommandation", "titre": "", "corps_html": "<p>…</p>", "lien_label": "", "lien_href": "https://… ou ''", "lien_bloc_index": null },
    { "type": "photo", "titre": "", "url": "https://… ou ''", "alt": "", "legende": "" },
    { "type": "video", "titre": "", "url": "https://…" },
    { "type": "molecule", "titre": "", "dci": ["DCI de molecules_lecon"] }
  ],
  "avertissements": [""],
  "model": "…", "usage": {} }
```
- HTML autorisé : `p h2 h3 ul ol li strong em u br` (re-sanitisé côté client, sans attributs).
- `lien_bloc_index` : index (dans `blocs`) d'un bloc de la leçon à pointer → converti en `lien_bloc_id` après insertion.
- `photo` sans `url` = stub à compléter (titre « Photo à compléter ») ; `video` sans URL source = ignoré ; `molecule` : seules les DCI déjà publiées sur la leçon (sinon ignoré) ; **jamais de `jeu`**.
- Max 40 blocs ; ajoutés après les blocs existants, avant les blocs `jeu`.

## Requête — mode `modifier` (Preview)
```json
{
  "mode": "modifier",
  "instruction": "Consigne libre de l’admin",
  "niveau": "base|1|2|3|4|5",
  "cible": { "kind": "lecon|chapitre|parcours", "id": "uuid…" },
  "context": { "/* arbre / nœuds courants, pubs, etc. */": "…" },
  "text": "(optionnel)",
  "pdfBase64": "(optionnel)",
  "pdfName": ""
}
```
Au moins `instruction`, ou `text` / `pdfBase64`.

## Réponse — mode `modifier`
```json
{ "version": 1, "mode": "modifier",
  "nodes": [
    {
      "temp_id": "t1",
      "kind": "chapitre|lecon|section|bloc",
      "ref_id": "uuid ou null",
      "parent_ref": "temp_id|uuid|null",
      "action": "create|update|delete|keep",
      "titre": "",
      "niveaux": { "min": 1, "max": 5 },
      "niveau_min": 1, "niveau_max": 5,
      "payload": { },
      "variantes": { "1": {}, "2": {}, "3": {}, "4": {}, "5": {} }
    }
  ],
  "avertissements": [],
  "model": "…", "usage": {} }
```
- `variantes` : clés `"1"`…`"5"` uniquement (couches ★) ; objets payload partiels (ex. `{ "html":"…" }`).
- Max 80 nœuds ; `kind=bloc` + `type=jeu` ignoré côté normalisation.

## Mapping payload studio (génération)
| IA | `payload` brouillon |
|---|---|
| texte | `{ html }` |
| conseil | `{ pathologie, corps_html }` |
| recommandation | `{ corps_html, lien_bloc_id, lien_href, lien_label, … }` |
| photo | `{ path:'', url, alt, legende }` |
| video | `{ url }` |
| molecule | `{ matrice_ids[], matrice_id, mode:'fiche' }` |

---

# IA — fiche matrice depuis RCP (Référentiel)

Bouton **IA** (`admin/referentiel.html`) → recherche BDM (agrégation **toutes formes** d’une DCI mono) → Edge `jeupharma-ia-matrice` → revue éditable → `JpMedicaments.save` (brouillon, `fiche_validee:false`). **Zéro écriture** pendant la génération. **1 DCI = 1 fiche** (pas de multi-fiches).

| Fichier | Rôle |
|---|---|
| `gemini-client.js` | `FN_MATRICE = 'jeupharma-ia-matrice'` |
| `referentiel-matrice.js` | `JpReferentielIA` : wizard 3 étapes (choisir / générer / revue) |
| `ia.css` | styles wizard (`.jp-ia-matrice-*`) |
| `edge/jeupharma-ia-matrice/index.ts` | fetch ANSM/EMA/Meddispar, prompt ATC + CPD/conseils, `normalize` |
| `js/bdm.js` | `suggest`, `getSpecialite`, `pickRecommendedCis`, `pickCisForFiche`, **`formatCombinedDci`**, **`listByDci`**, `formeAnnotation` |

## Mono vs association multi-substances
- **Mono** : inchangé — DCI = substance ; agrégat `listByDci` toutes formes ; CIS mono recommandé pour le RCP.
- **Multi** (ex. Lamaline) : DCI = libellé combiné stable « Paracétamol + caféine + opium » (ordre BDM, `findOrCreate` sur cette valeur). Wizard badge **asso** + liste des substances. CIS = spécialité sélectionnée (avertissement RCP asso) ; mono préféré seulement s’il existe la même marque.
- Edge : si `substances[]` multi / `association`, la DCI fournie est la combinaison — ne pas la réduire à la 1ʳᵉ substance ; `normalize` réimpose la DCI combinée.

## Edge Function
- Même secrets / modèle / gate admin que `jeupharma-ia-blocs`. `verify_jwt = true`. `GEMINI_API_KEY` serveur uniquement.
- Sources RCP : ANSM `…/medicament/{cis}/extrait` (4.1–4.6, 4.8, 5.1) ; EMA si ANSM vide + nº EU ; Meddispar best-effort pour CPD ; sinon `rcp_text` collé.
- Prompt : few-shot **Apixaban** (secteur / classes / détail ATC pédagogique) + **Lamictal** (classe pharma condensée) ; `detail_pharmacologie` max ~520 car. ; champs `conditions_prescription_delivrance` + `conseils_delivrance` ; multi-formes → annoter `(forme)` ; **asso multi** → DCI combinée + annoter `(composant)` si besoin.
- Déploiement : MCP `deploy_edge_function` (slug `jeupharma-ia-matrice`, projet `kpjflntnotftpzffjbud`).

## Requête
```json
{
  "dci": "Apixaban",
  "cis": "62271266",
  "noms_commerciaux": ["ELIQUIS"],
  "substances": ["Apixaban"],
  "contexte_bdm": {
    "forme_pharmaceutique": "comprimé pelliculé",
    "voies_administration": "orale",
    "formes": ["comprimé pelliculé"],
    "noms_commerciaux_bdm": ["ELIQUIS"],
    "cis_list": ["62271266"],
    "resume_formes": "1 spécialité(s) mono-substance · 1 forme(s)",
    "numero_autorisation_europeenne": null
  },
  "rcp_text": "(optionnel — collage secours)"
}
```
Association (ex. Lamaline) : `"dci": "Paracétamol + caféine + opium"`, `"substances": ["Paracétamol","Caféine","Opium"]`, `contexte_bdm.association: true`.

## Réponse
```json
{
  "version": 1,
  "need_manual_rcp": false,
  "source": "ansm",
  "cis": "62271266",
  "dci": "Apixaban",
  "rcp_url": "https://…/extrait",
  "champs": {
    "dci": "Apixaban",
    "nom_commercial": ["ELIQUIS"],
    "secteur_therapeutique": ["Cardiovasculaire"],
    "classe_therapeutique": ["Anticoagulant"],
    "classe_pharmacologique": ["INHIBITEURS facteur Xa"],
    "detail_pharmacologie": "INHIBITEURS DIRECTS DU FACTEUR Xa",
    "posologie_generale": "…",
    "grossesse_allaitement": "…",
    "voies_administration": ["orale"],
    "indications": ["…"],
    "contre_indications": ["…"],
    "effets_indesirables": ["…"],
    "precautions_emploi": ["…"],
    "interactions": ["…"],
    "surveillances": ["…"],
    "conditions_prescription_delivrance": ["…"],
    "conseils_delivrance": ["…"]
  },
  "avertissements": [],
  "model": "…",
  "usage": {}
}
```
Si `need_manual_rcp: true` : l’UI affiche la zone de collage ; aucune suggestion de champs.

## Revue client
Pour chaque libellé : match exact → **Existant** ; suggestions → **Proche** ; sinon **Nouveau**. Actions : **découper** (`;` / retours ligne), **ajouter**, **retirer** / **restaurer**, **re-matcher** (debounce à l’édition). Commit final via `JpMedicaments.save` (fusion DCI si fiche déjà présente). Pas de flags hospitalier/complexe (purgés `041`). Tables entités CPD / conseils : migration `046`.

---

# IA — propositions sur les éléments (Vérifier les éléments)

Bouton **IA** dans `admin/referentiel.html` → vue `#entites` (`JpReferentielEntites`) → consigne libre + liste filtrée visible → Edge `jeupharma-ia-entites` → file de propositions → **Accepter / Ignorer** unitaire via RPC existantes. **Zéro écriture** pendant la génération.

| Fichier | Rôle |
|---|---|
| `gemini-client.js` | `FN_ENTITES = 'jeupharma-ia-entites'` |
| `js/referentiel-entites.js` | bouton IA + modale consigne / file de validation |
| `ia.css` | `.jp-ia-entites-*` |
| `edge/jeupharma-ia-entites/index.ts` | gate admin, chunk ≤200, normalize JSON |

## Edge Function
- Mêmes secrets / modèle / gate admin (`portail.profiles.role === 'admin'`) que les autres Edges Jeu Pharma. `verify_jwt = true`.
- Plafonds : instruction 4 000 car. ; **800** éléments max ; lots de **200** (catalogue complet renvoyé à chaque lot pour `merge_into_id`).
- Déploiement : MCP `deploy_edge_function` (slug `jeupharma-ia-entites`, projet `kpjflntnotftpzffjbud`).

## Requête
```json
{
  "table": "indications",
  "instruction": "fusionne les doublons et normalise les libellés",
  "items": [
    { "id": "uuid…", "valeur": "HTA" },
    { "id": "uuid…", "valeur": "Hypertension artérielle" }
  ]
}
```

## Réponse
```json
{
  "version": 1,
  "table": "indications",
  "count": 2,
  "chunked": false,
  "chunk_size": 200,
  "propositions": [
    {
      "id": "uuid-source",
      "action": "merge",
      "merge_into_id": "uuid-cible",
      "reason": "Doublon de « Hypertension artérielle »"
    },
    {
      "id": "uuid-cible",
      "action": "noop",
      "reason": null
    }
  ],
  "avertissements": [],
  "model": "…",
  "usage": {}
}
```

Actions : `keep` | `rename` (`new_valeur`) | `merge` (`merge_into_id`) | `delete` | `noop`.  
Application client (si **Accepter**) : `v2_modifier_entites` / `v2_fusionner_entites` / `v2_supprimer_entite`. Les `noop`/`keep` sont masqués dans la file.
