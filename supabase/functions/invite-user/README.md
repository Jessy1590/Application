# Edge Function : invite-user

Crée un compte utilisateur (admin-only) via `service_role` côté serveur.

Doc Supabase :
- [createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
- [inviteUserByEmail](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail)

## Modes

| `mode` | Comportement |
|--------|----------------|
| `temp_password` (défaut) | `createUser` + e-mail confirmé + mot de passe temporaire ; flag `must_change_password` |
| `invite_email` | `inviteUserByEmail` — l’utilisateur reçoit le mail d’invitation (OTP / lien) |

Rôles acceptés : `pharmacien` \| `administrateur` \| `préparateur`  
Acteur autorisé : `administrateur` (ou legacy `admin`).

## Déploiement

```bash
supabase functions deploy invite-user --project-ref kpjflntnotftpzffjbud
```

## Appel client

```js
await supabase.functions.invoke('invite-user', {
  body: {
    email: 'user@example.com',
    password: 'MotDePasseTemp8',
    display_name: 'Nom',
    role: 'préparateur',
    mode: 'temp_password', // ou 'invite_email'
  },
})
```
