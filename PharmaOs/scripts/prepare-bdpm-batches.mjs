/**
 * Parse les TSV BDPM officiels (tmp/bdpm/*.txt) et écrit des lots JSON
 * pour import via SELECT bdm.bulk_insert_*(payload).
 *
 * Usage: node scripts/prepare-bdpm-batches.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'tmp', 'bdpm');
const OUT = path.join(SRC, 'batches');
const BATCH = 800;

/**
 * UTF-8 d’abord ; fallback windows-1252 seulement si beaucoup de \uFFFD.
 * (Évite le mojibake Ã© quand du UTF-8 était préféré en latin1/win-1252.)
 */
function decode(buf) {
  const utf8 = buf.toString('utf8');
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return utf8;
  const badUtf8 = (utf8.match(/\uFFFD/g) || []).length;
  const threshold = Math.max(8, Math.floor(buf.length * 0.001));
  if (badUtf8 <= threshold) return utf8;
  try {
    return new TextDecoder('windows-1252').decode(buf);
  } catch {
    return Buffer.from(buf).toString('latin1');
  }
}

function lines(file) {
  const buf = fs.readFileSync(path.join(SRC, file));
  return decode(buf)
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .map((l) => l.split('\t'));
}

function empty(v) {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

function parseFrDate(v) {
  const s = empty(v);
  if (!s) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function parseEuro(v) {
  const s = empty(v);
  if (!s) return null;
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function parseOuiNon(v) {
  const s = (empty(v) || '').toLowerCase();
  return s === 'oui' || s === 'yes' || s === 'true' || s === '1';
}

function writeBatches(name, rows) {
  fs.mkdirSync(OUT, { recursive: true });
  let i = 0;
  for (let offset = 0; offset < rows.length; offset += BATCH) {
    const chunk = rows.slice(offset, offset + BATCH);
    const file = path.join(OUT, `${name}_${String(i).padStart(4, '0')}.json`);
    fs.writeFileSync(file, JSON.stringify(chunk));
    i += 1;
  }
  return i;
}

const specialites = lines('CIS_bdpm.txt')
  .map((c) => ({
    cis: empty(c[0]),
    denomination: empty(c[1]) || '',
    forme_pharmaceutique: empty(c[2]),
    voies_administration: empty(c[3]),
    statut_amm: empty(c[4]),
    type_procedure: empty(c[5]),
    etat_commercialisation: empty(c[6]),
    date_amm: parseFrDate(c[7]),
    statut_bdm: empty(c[8]),
    numero_autorisation_europeenne: empty(c[9]),
    titulaires: empty(c[10]),
    surveillance_renforcee: parseOuiNon(c[11]),
  }))
  .filter((r) => r.cis && r.denomination);

const presentations = lines('CIS_CIP_bdpm.txt')
  .map((c) => ({
    cis: empty(c[0]),
    cip7: empty(c[1]),
    libelle: empty(c[2]),
    statut_administratif: empty(c[3]),
    etat_commercialisation: empty(c[4]),
    date_declaration_commercialisation: parseFrDate(c[5]),
    cip13: empty(c[6]),
    agrement_collectivites: empty(c[7]),
    taux_remboursement: empty(c[8]),
    prix_euro: parseEuro(c[9]),
    prix_hors_honoraire: parseEuro(c[10]),
    honoraire: parseEuro(c[11]),
    indications_remboursement: empty(c[12]),
  }))
  .filter((r) => r.cis);

const compositions = lines('CIS_COMPO_bdpm.txt')
  .map((c) => ({
    cis: empty(c[0]),
    designation_element_pharmaceutique: empty(c[1]),
    code_substance: empty(c[2]),
    denomination_substance: empty(c[3]),
    dosage: empty(c[4]),
    reference_dosage: empty(c[5]),
    nature_composant: empty(c[6]),
    numero_lien: empty(c[7]) != null ? Number.parseInt(c[7], 10) || null : null,
  }))
  .filter((r) => r.cis);

const generiques = lines('CIS_GENER_bdpm.txt')
  .map((c) => ({
    identifiant_groupe: empty(c[0]) || '',
    libelle_groupe: empty(c[1]),
    cis: empty(c[2]),
    type: empty(c[3]) != null ? Number.parseInt(c[3], 10) : null,
    numero_tri: empty(c[4]) != null ? Number.parseInt(c[4], 10) : null,
  }))
  .filter((r) => r.cis && r.identifiant_groupe);

if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const manifest = {
  specialites: writeBatches('specialites', specialites),
  presentations: writeBatches('presentations', presentations),
  compositions: writeBatches('compositions', compositions),
  generiques: writeBatches('generiques', generiques),
  counts: {
    specialites: specialites.length,
    presentations: presentations.length,
    compositions: compositions.length,
    generiques: generiques.length,
  },
};

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
