# QA navigateur — associations & pubs base (2026-10-28)

## Environnement
- URL preview admin : `lecon.html?module=0918cd23-…&preview=1` (hta_associations)
- Studio Cardio-Vasculaires OK (desktop ≥1200px)
- JS **asso couleurs** : code local `lecon-player.js` + `player.css` — **pas encore sur GitHub Pages** → légende colorée absente en prod jusqu’au déploiement

## Constats leçon « Associations fixes et dispensation »
- Contenu cours texte/photo **présent** (IEC/ARA2/β + diurétiques/INCA, marques Coaprovel, Lodoz, Coveram…)
- Carrousel : **36** slides `data-mol` (assos liées)
- RPC `v2_fiches_resolues` (après `080`) : retourne `dci` + `composants` (ex. Périndopril + indapamide → **2** composants) 
- **`champs` publiés vides** pour l’échantillon testé → en base le joueur ne voit que l’identité (quand la fiche charge) ; pas d’indications/CI/EI « programme »
- Au 1er chargement preview, slots affichaient « — » (fiche absente côté rendu) alors que le même RPC fonctionne ensuite → à surveiller (timing / cache) ; identité devrait s’afficher dès que la fiche est résolue

## Référentiel (parcours)
- **164** matrices liées ; **158** densités Ind+CI+EI > 0 ; **6** faibles (skips no_cis historiques)
- Assos : **35/40** avec ≥2 composants ; **5** à 1 composant (monos absents BDM : chlortalidone, altizide, méthyclothiazide, sacubitril…)

## Écart vs règle pédagogique
- Référentiel ≈ dense pour la majorité
- **Pubs « base » leçon** encore trop minces (souvent dci/nom seulement après `078`) — **à enrichir** en ne sélectionnant que les faits **lisibles dans le texte de leçon** (marques, compositions, hypotension orthostatique, etc.)

## UI associations (local)
- `080` : `composants` + `entite_ids` dans fiches bulk
- Carrousel : légende pastilles colorées + chips teintés (composant vs « spécifique association »)
