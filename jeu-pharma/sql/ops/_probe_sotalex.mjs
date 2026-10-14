for (const cis of ['62519799', '64820630', '67154354']) {
  for (const path of [
    `/medicament/${cis}/extrait`,
    `/affichageDoc.php?specid=${cis}&typedoc=R`,
    `/extrait.php?specid=${cis}`,
  ]) {
    const url = `https://base-donnees-publique.medicaments.gouv.fr${path}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'JeuPharma-probe/1.0' }, redirect: 'follow' });
    const html = await res.text();
    console.log(
      JSON.stringify({
        cis,
        path,
        status: res.status,
        len: html.length,
        annexe: /AmmAnnexeTitre/i.test(html),
        epar: /epar.*\.pdf/i.test(html),
        indications: /Indications th/i.test(html),
        final: res.url.slice(-60),
      }),
    );
  }
}
