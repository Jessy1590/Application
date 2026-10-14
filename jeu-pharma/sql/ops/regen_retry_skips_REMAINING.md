# Skips restants après retry (2026-10-14)

## Cause de l’échec task 835212

Boucle Edge `run_retry_skips_loop.mjs` avec `limit=2` → **HTTP 546 `WORKER_RESOURCE_LIMIT`** sur ~39 tours (OOM worker, ANSM HTML × plusieurs CIS). Exit `-1` amplifié par PowerShell (`console.error` → NativeCommandError + Tee-Object).

## Actions reprises

1. Durcissement script : `limit=1` par défaut, backoff 20 s sur échec, logs stdout only.
2. Relance Edge `retry_skips` (48 rounds, 0 fail) + coordination avec agent lié `retry_skips_local.mjs` (EPAR PDF local → `apply_one`).

## Bilan

| Statut | Nb approx. | Notes |
|--------|------------|--------|
| `ok` | ~159+ | Regen principale + retries Edge/local |
| `skip` / `no_cis_retried` | **6** | À traiter manuellement (voir ci-dessous) |

Les `rcp_vide` ont été résolus (HTML ANSM ou EPAR PDF local), y compris Sacubitril + valsartan.

## À faire manuellement (6 DCI)

Pas de CIS BDPM / produit commercialisé trouvé (molécules retirées, phytothérapie, ou libellé hors BDM) :

1. **Désirudine** — retirée ; vérifier si la fiche doit rester / être archivée.
2. **Lépirudine** — idem (retirée UE).
3. **Rétéplase** — vérifier CIS / disponibilité BDM ou archive.
4. **Streptokinase** — souvent hors commercialisation FR ; CIS manuel ou archive.
5. **Éprosartan** — chercher marque (Teveten…) / CIS ; sinon archive.
6. **Ruscoside** — phytothérapie ; CIS Tanakan-like ou hors référentiel.

### Procédure manuelle

Pour chaque DCI à garder :

1. Trouver un CIS BDPM (ou RCP PDF).
2. Extraire le texte RCP (HTML ANSM ou PDF).
3. Appeler Edge `apply_one` :

```bash
node -e "/* POST jeupharma-regen-referentiel body: { apply_one:true, matrice_id, dci, cis, rcp_text, source } */"
```

Ou réutiliser `sql/ops/retry_skips_local.mjs` après ajout CIS dans `CIS_ALLOW` / `retry_skips_input.json`.

Sinon : archiver la fiche (`statut = archive`) si hors programme pédagogique.
