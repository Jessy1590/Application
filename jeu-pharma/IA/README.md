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
