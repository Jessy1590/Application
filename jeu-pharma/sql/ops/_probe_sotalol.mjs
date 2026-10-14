const cis = '67154354';
const html = await (
  await fetch(`https://base-donnees-publique.medicaments.gouv.fr/medicament/${cis}/extrait`, {
    headers: { 'User-Agent': 'JeuPharma-probe/1.0' },
  })
).text();
const pats = [
  'heading-',
  'fr-collapse',
  'Indications',
  'Contre-indications',
  'AmmAnnexe',
  'affichageDoc',
  'typedoc',
  'RCP',
  'notice',
];
for (const p of pats) {
  const i = html.toLowerCase().indexOf(p.toLowerCase());
  console.log(p, i, i >= 0 ? JSON.stringify(html.slice(Math.max(0, i - 20), i + 90).replace(/\s+/g, ' ')) : null);
}
const headings = html.match(/id="heading-[^"]+"/g);
console.log('headings', headings?.slice(0, 30));
const docs = html.match(/href="[^"]*affichageDoc[^"]*"/g);
console.log('docs', docs);
const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((u) => /rcp|notice|doc|pdf|specid/i.test(u));
console.log('interesting links', [...new Set(links)].slice(0, 20));
