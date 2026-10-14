# IA — Jeu Pharma

Deux Edge Functions Gemini (secret **`GEMINI_API_KEY`** serveur uniquement, jamais dans le navigateur) :

| Edge | Surface | Rôle |
|---|---|---|
| `jeupharma-ia-blocs` | Modif parcours | Texte / PDF de cours → blocs de leçon (brouillon) |
| `jeupharma-ia-matrice` | Référentiel admin | BDM + RCP officiel → fiche matrice condensée (revue puis save) |

Client partagé : `gemini-client.js` (`JpIaGemini.invoke`, `FN_BLOCS`, `FN_MATRICE`).

Ne **pas** appeler les Edge OCR Location depuis le client jeu-pharma.

---

# IA — blocs de leçon (Modif parcours)

Bouton **IA** (barre « Ajouter » d'une leçon) → texte collé ou PDF → Edge Function `jeupharma-ia-blocs` (Gemini) → JSON → blocs **brouillon** (`visible=false`, `payload_json._brouillon`), publiés seulement via « Enregistrer et publier ».

| Fichier | Rôle |
|---|---|
| `gemini-client.js` | `JpIaGemini` : base64, `functions.invoke` (anon + session admin), messages d'erreur |
| `studio-blocs.js` | `JpStudioIA` : modale, sanitisation HTML, JSON → payload studio, insertion brouillon |
| `ia.css` | styles modale |
| `edge/jeupharma-ia-blocs/index.ts` | source de l'Edge Function (prompt + normalisation serveur) |

## Edge Function
- Secret **`GEMINI_API_KEY`** (existant, partagé avec `ocr-map-fields`). Jamais côté navigateur.
- Modèle : `GEMINI_IA_MODEL` → sinon `GEMINI_OCR_MODEL` (config existante) → sinon `gemini-3.8-flash`. Raisonnement : `GEMINI_IA_THINKING` (défaut `low`).
- Accès : `portail.profiles.role === 'admin'` uniquement. `verify_jwt = true`.
- Limites : texte 80 000 car., PDF 10 Mo.
- Déploiement : MCP Supabase `deploy_edge_function` (projet `kpjflntnotftpzffjbud`, slug `jeupharma-ia-blocs`) ou CLI en copiant le dossier vers `supabase/functions/jeupharma-ia-blocs/`.

## Requête (client → fonction)
```json
{ "text": "…", "pdfBase64": "…", "pdfName": "cours.pdf",
  "context": { "titre": "", "resume": "", "molecules": ["DCI publiées sur la leçon"],
               "blocs_existants": [{ "type": "texte", "titre": "" }] } }
```
`text` et/ou `pdfBase64` (au moins un).

## Réponse (JSON)
```json
{ "version": 1,
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

## Mapping payload studio
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

Bouton **IA** (`admin/referentiel.html`) → recherche BDM (agrégation **toutes formes** d’une DCI) → Edge `jeupharma-ia-matrice` → revue éditable → `JpMedicaments.save` (brouillon, `fiche_validee:false`). **Zéro écriture** pendant la génération. **1 DCI = 1 fiche** (pas de multi-fiches).

| Fichier | Rôle |
|---|---|
| `gemini-client.js` | `FN_MATRICE = 'jeupharma-ia-matrice'` |
| `referentiel-matrice.js` | `JpReferentielIA` : wizard 3 étapes (choisir / générer / revue) |
| `ia.css` | styles wizard (`.jp-ia-matrice-*`) |
| `edge/jeupharma-ia-matrice/index.ts` | fetch ANSM/EMA/Meddispar, prompt ATC + CPD/conseils, `normalize` |
| `js/bdm.js` | `suggest`, `getSpecialite`, `pickRecommendedCis`, **`listByDci`**, `formeAnnotation` |

## Edge Function
- Même secrets / modèle / gate admin que `jeupharma-ia-blocs`. `verify_jwt = true`. `GEMINI_API_KEY` serveur uniquement.
- Sources RCP : ANSM `…/medicament/{cis}/extrait` (4.1–4.6, 4.8, 5.1) ; EMA si ANSM vide + nº EU ; Meddispar best-effort pour CPD ; sinon `rcp_text` collé.
- Prompt : few-shot **Apixaban** (secteur / classes / détail ATC pédagogique) + **Lamictal** (classe pharma condensée) ; `detail_pharmacologie` max ~520 car. ; champs `conditions_prescription_delivrance` + `conseils_delivrance` ; multi-formes → annoter `(forme)` si besoin.
- Déploiement : MCP `deploy_edge_function` (slug `jeupharma-ia-matrice`, projet `kpjflntnotftpzffjbud`).

## Requête
```json
{
  "dci": "Apixaban",
  "cis": "62271266",
  "noms_commerciaux": ["ELIQUIS"],
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
