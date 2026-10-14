/** Probe temporaire ANSM → EPAR PDF */
async function getEpar(cis) {
  const url = `https://base-donnees-publique.medicaments.gouv.fr/medicament/${cis}/extrait`;
  const res = await fetch(url, { headers: { 'User-Agent': 'JeuPharma-probe/1.0' } });
  const html = await res.text();
  const pdfs = [...html.matchAll(/href="([^"]*epar[^"]*\.pdf)"/gi)].map((m) => m[1]);
  const anyPdf = [...html.matchAll(/href="([^"]+\.pdf)"/gi)].map((m) => m[1]).slice(0, 5);
  const abs = pdfs.map((u) => (u.startsWith('http') ? u : `https://www.ema.europa.eu${u}`));
  console.log(JSON.stringify({ cis, status: res.status, epar: abs.slice(0, 3), anyPdf }, null, 2));
  if (abs[0]) {
    const r = await fetch(abs[0], {
      headers: { 'User-Agent': 'JeuPharma-probe/1.0' },
      redirect: 'follow',
    });
    const buf = Buffer.from(await r.arrayBuffer());
    console.log(
      JSON.stringify({
        pdfStatus: r.status,
        len: buf.length,
        ct: r.headers.get('content-type'),
        magic: buf.slice(0, 8).toString(),
        finalUrl: r.url,
      }),
    );
  }
}

for (const cis of ['69340279', '67154354', '60549911', '61902218', '64206365']) {
  await getEpar(cis);
}
