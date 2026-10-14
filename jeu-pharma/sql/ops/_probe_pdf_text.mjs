/** Test extraction texte PDF EPAR (brut) */
async function pdfText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'JeuPharma-probe/1.0' } });
  const buf = Buffer.from(await res.arrayBuffer());
  const raw = buf.toString('latin1');
  const chunks = [];
  const re = /\((?:\\.|[^\\)]){3,}\)/g;
  let m;
  while ((m = re.exec(raw))) {
    let s = m[0].slice(1, -1);
    s = s
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '')
      .replace(/\\t/g, ' ')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\');
    if (/[A-Za-zÀ-ü]{3,}/.test(s)) chunks.push(s);
  }
  // Also try Tj streams
  const tj = [...raw.matchAll(/\((?:\\.|[^\\)])+\)\s*Tj/g)].map((x) => x[0]);
  const text = chunks.join(' ').replace(/\s+/g, ' ').slice(0, 5000);
  console.log(JSON.stringify({ url: url.slice(-50), len: buf.length, chunks: chunks.length, tj: tj.length, sample: text.slice(0, 800) }));
}

await pdfText(
  'https://www.ema.europa.eu/fr/documents/product-information/ivabradine-accord-epar-product-information_fr.pdf',
);
