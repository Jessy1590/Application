# Edge Function : delete-user

Supprime un compte Auth (admin portail uniquement). `service_role` côté serveur seulement.

Doc : [auth.admin.deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser)

## Garde-fous

- JWT + rôle `portail.profiles.role` ∈ `admin` | `administrateur`
- Interdit de supprimer son propre compte
- Nettoyage minimal `portail.access_requests.reviewed_by` uniquement
- Pas de purge métier (PharmaOs, etc.) — si FK bloque → HTTP 409

## Déploiement

```bash
supabase functions deploy delete-user --project-ref kpjflntnotftpzffjbud
```

## Appel (Portail Administration)

```js
await fetch(`${SUPABASE_URL}/functions/v1/delete-user`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${access_token}`,
    apikey: anon_key,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ user_id: '<uuid>' }),
})
```
