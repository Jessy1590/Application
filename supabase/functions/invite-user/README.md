# Edge Function : invite-user

Crée / invite un compte (admin portail). `service_role` serveur uniquement.

**Public principal :** Portail Application (`index.html` → Administration).

Doc :
- [createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
- [inviteUserByEmail](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail)

## Modes

| `mode` | Comportement |
|--------|----------------|
| `temp_password` (défaut) | `createUser` + MDP temporaire + `must_change_password` |
| `invite_email` | `inviteUserByEmail` — OTP / lien d’invitation |

## Rôles

- **Acteur** : `portail.profiles.role` ∈ `admin` \| `administrateur`
- **Création** (stockés tels quels) : `admin`, `member`, `équipe`, + rôles PharmaOS si besoin (`pharmacien`, `administrateur`, `préparateur`…)

## Appel Portail

```js
await fetch(`${SUPABASE_URL}/functions/v1/invite-user`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${access_token}`,
    apikey: anon_key,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'MotDePasseTemp8', // si mode temp_password
    display_name: 'Nom',
    role: 'member',
    mode: 'temp_password', // ou invite_email
  }),
})
```
