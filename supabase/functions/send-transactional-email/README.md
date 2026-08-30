# send-transactional-email

Envoie un e-mail transactionnel (préparations magistrales, etc.).

## Body JSON

```json
{
  "to": "labo@exemple.fr",
  "subject": "Commande préparation",
  "html": "<p>...</p>",
  "attachments": [{ "filename": "formule.txt", "content": "base64...", "contentType": "text/plain" }]
}
```

## Secrets

```bash
# Recommandé (Resend)
supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set SMTP_FROM="Pharmacie <noreply@votredomaine.fr>"

# Ou relais HTTP (Brevo/Mailgun proxy)
# supabase secrets set SMTP_HTTP_URL=https://... SMTP_PASS=... SMTP_FROM=...

supabase functions deploy send-transactional-email
```

Auth : JWT utilisateur avec rôle `admin` ou `équipe` dans `portail.profiles`.
