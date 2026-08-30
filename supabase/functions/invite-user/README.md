# Edge Function : invite-user

Crée un compte utilisateur (admin-only). Nécessite la clé `service_role` côté serveur uniquement.

## Déploiement

```bash
supabase login
supabase link --project-ref kpjflntnotftpzffjbud
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<votre_service_role_key>
supabase functions deploy invite-user
```

## Appel (depuis le portail admin)

POST `{SUPABASE_URL}/functions/v1/invite-user`

Headers :
- `Authorization: Bearer <access_token_admin>`
- `apikey: <anon_key>`

Body :
```json
{
  "email": "user@example.com",
  "password": "mot-de-passe-temporaire",
  "display_name": "Nom",
  "role": "member"
}
```
