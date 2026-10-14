#!/usr/bin/env node
/**
 * Jeu Pharma — extraction LECTURE SEULE du RCP public BDPM (rubriques utiles) vers des fichiers texte.
 * Usage : node bdpm_rcp_fetch.mjs <dossier_sortie> <cis> [<cis> ...]
 * Sortie : <dossier>/<cis>.txt avec sections 4.1 / 4.3 / 4.4 / 4.5 / 4.8 / 5.1 (texte brut, sans HTML).
 * Source : https://base-donnees-publique.medicaments.gouv.fr/medicament/<CIS>/extrait (page publique, pas d'auth).
 * Aucune écriture en base directe : condensé versionné dans sql/034+ (matrice référentiel).
 * Règle duale : RCP → matrice ; parcours DEUST → connaissances cours uniquement (035/036).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = process.argv[2];
const CIS = process.argv.slice(3);
if (!OUT || !CIS.length) {
  console.error('usage: node bdpm_rcp_fetch.mjs <dossier> <cis...>');
  process.exit(1);
}

const SECTIONS = [
  ['4.1', 'Indications'],
  ['4.3', 'Contre-indications'],
  ['4.4', 'Mises en garde / précautions'],
  ['4.5', 'Interactions'],
  ['4.8', 'Effets indésirables'],
  ['5.1', 'Pharmacodynamie'],
];

function decode(s) {
  return s
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function clean(html) {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<a [^>]*lien-retour-hautdepage[^>]*>[\s\S]*?<\/a>/gi, '')
      .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/t[dh]>/gi, ' | ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function extract(html) {
  // Ne garder que le RCP (avant la notice) : les titres RCP ont la classe AmmAnnexeTitre1 / 2
  const parts = html.split(/<p class="AmmAnnexeTitre[12]"/i).slice(1);
  const out = {};
  for (const p of parts) {
    const m = p.match(/<span id='([0-9]\.[0-9]*)\.?_/);
    if (!m) continue;
    const num = m[1];
    const body = p.replace(/^[^>]*>/, '');
    if (!out[num]) out[num] = body; // première occurrence = RCP
  }
  return out;
}

await mkdir(OUT, { recursive: true });
for (const cis of CIS) {
  const url = `https://base-donnees-publique.medicaments.gouv.fr/medicament/${cis}/extrait`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    const title = (html.match(/<title>([^<]*)<\/title>/i) || [, ''])[1].trim();
    const secs = extract(html);
    let txt = `# CIS ${cis} — ${decode(title)}\n# ${url}\n\n`;
    for (const [num, label] of SECTIONS) {
      const raw = secs[num];
      txt += `## ${num} ${label}\n${raw ? clean(raw).replace(/^\d\.\d\.?\s*[^\n]*\n/, '') : '(absent)'}\n\n`;
    }
    await writeFile(join(OUT, `${cis}.txt`), txt, 'utf8');
    console.log(cis, 'OK', txt.length);
  } catch (e) {
    console.log(cis, 'ERR', e.message);
  }
}
