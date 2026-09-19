# Edge Function : ocr-document

OCR via **Azure Document Intelligence** (`prebuilt-read`). Réservée aux admins (portail `admin` ou `phieevreux.equipe.role = administrateur`).

## Secrets Supabase

```bash
supabase secrets set AZURE_DI_ENDPOINT="https://xxxx.cognitiveservices.azure.com/"
supabase secrets set AZURE_DI_KEY="<clé Azure>"
```

Ne jamais committer la clé. Ne jamais exposer côté client.

## Déploiement

```bash
supabase login
supabase link --project-ref kpjflntnotftpzffjbud
supabase functions deploy ocr-document
```

## Appel (Transcription)

`POST {SUPABASE_URL}/functions/v1/ocr-document`

Headers :
- `Authorization: Bearer <access_token>`
- `apikey: <anon_key>`

Body :
```json
{ "imageBase64": "<jpeg ou png en base64, sans data-URL ou avec>" }
```

Réponse :
```json
{
  "text": "...",
  "words": [{ "text": "...", "bbox": { "x0": 0, "y0": 0, "x1": 10, "y1": 10 }, "confidence": 90 }],
  "width": 1200,
  "height": 1600,
  "engine": "azure-read"
}
```
