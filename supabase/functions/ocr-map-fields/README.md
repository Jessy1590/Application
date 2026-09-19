# Edge Function : ocr-map-fields

Lit les images de dossier (**Gemini 3.8 Flash** vision) et renvoie un mapping `{ code, value }` pour le formulaire Transcription Location.

## Secrets

```bash
supabase secrets set GEMINI_API_KEY="AIza..."
# optionnel :
# supabase secrets set GEMINI_OCR_MODEL="gemini-3.8-flash"
```

## Déploiement

```bash
supabase functions deploy ocr-map-fields --project-ref kpjflntnotftpzffjbud
```

## Body

```json
{
  "imagesBase64": ["..."],
  "ocrText": "texte Azure optionnel",
  "fields": [{ "code": "patient_nom", "label": "Nom", "type": "string" }],
  "prestataires": [{ "id": "uuid", "nom": "Orkyn" }]
}
```
