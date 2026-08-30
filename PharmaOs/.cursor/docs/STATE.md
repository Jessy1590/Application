# 📍 État actuel du projet (STATE)

## Fonctionnalités actives et structurelles
- **Setup Electron + Vite :** Environnement de build fonctionnel supportant le Hot Module Replacement (HMR) avec React et Tailwind CSS.
- **Sécurité Contextuelle (Preload) :** Mise en place du fichier `preload.cjs` pour isoler les processus.
- **Multi-Windows :** Configuration prête pour gérer une fenêtre principale (`index.html`) et des fenêtres satellites (`module.html`).
- **Fondation React :** 
  - Routing ou rendu conditionnel préparé pour `Dashboard`, `Calls`, `Directory`, et `Tasks`.
  - Gestion de l'état d'authentification centralisée dans `AuthContext.jsx`.
- **Couche Données :** Client Supabase initialisé (`supabaseClient.js`) et squelette de base de données sauvegardé (`schema.sql`).
- **Services transverses :** `windowService.js` en place pour abstraire l'API Electron depuis les composants React.

## Prochaines étapes de développement (TODO)
*(À compléter selon vos besoins métiers)*
- [ ] Finaliser l'UI du `Dashboard` avec Tailwind.