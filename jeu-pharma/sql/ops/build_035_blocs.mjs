/**
 * Génère sql/035_blocs_contenu_cardio_deust.sql — blocs leçon (hors jeu) parcours CV DEUST 2A.
 * Usage: node sql/ops/build_035_blocs.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const REPORT = process.env.JP_MEDIA_REPORT
  || path.join(process.env.TEMP || '/tmp', 'jp-media', 'upload-report.txt');

const MOD = {
  sang_rappel: 'e9adf9b0-090e-4d11-bfb4-ce6d01066cf3',
  sang_anemies: 'fc7d0e3c-f2b9-42de-a253-5b4f3f7aa95c',
  sang_antiagregants: '578a6b03-19f6-4825-b703-b7fbe2a879e9',
  sang_anticoagulants: '9c921bad-b792-4399-90c1-5d1b0eb7186c',
  sang_hemophilies: 'a72226d0-b374-4821-a8c3-1cdad8420982',
  cv_definitions: 'e9e30d64-3829-466c-8ccc-bfb0064adf06',
  cv_angor: '5eb80f08-844a-4816-90d7-3e7071897d4b',
  cv_idm: '96adf329-cad1-4b1b-896e-c9d930d252ba',
  cv_arythmies: 'bbc00500-0686-4c31-893f-acbd71832018',
  cv_ic: 'ed49bf8d-55c6-4756-952a-f927b1ed1e07',
  cv_veines: 'a391cd7f-1081-48d3-b106-4e6f0e046eda',
  cv_urgences: 'da6b1276-8a88-417b-9438-be0306a72719',
  hta_rappel_pa: '26f24ecd-7a54-40ed-a97f-f790f12d2cfc',
  hta_raa: '603a0958-684d-41ee-997e-ded72cf1b370',
  hta_clinique: '5a2f6bb1-7901-4b03-b84d-6360916a41fb',
  hta_classes: 'f0382a46-ee1d-4a53-8ef8-fdd8ea17bd6e',
  hta_associations: '0918cd23-6d0b-47c4-8f61-73c47e6842fb',
};

const PHOTO_LEGEND = {
  'hemostase-primaire': 'Hémostase primaire — quatre temps',
  'cascade-coagulation': 'Cascade de coagulation (hémostase secondaire)',
  'composition-sang': 'Composition du sang',
  'hematopoiese': 'Hématopoïèse',
  'erythropoiese': 'Étapes de l’érythropoïèse',
  'hemoglobine': 'Hémoglobine et transport de l’O₂',
  'breche-vasculaire': 'Brèche vasculaire',
  'ordonnance-1': 'Ordonnance — cas comptoir (données masquées)',
  'ordonnance-2': 'Ordonnance — cas comptoir (données masquées)',
  'schema-raa': 'Schéma du système rénine–angiotensine–aldostérone',
};

function escSql(s) {
  return s.replace(/'/g, "''");
}

function parsePhotos() {
  const byLesson = {};
  if (!fs.existsSync(REPORT)) {
    console.warn('upload-report absent:', REPORT);
    return byLesson;
  }
  const raw = fs.readFileSync(REPORT, 'utf8').replace(/^\uFEFF/, '');
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [lesson, slug, modId] = line.split(';');
    if (!byLesson[lesson]) byLesson[lesson] = [];
    byLesson[lesson].push({ slug, modId });
  }
  return byLesson;
}

/** Contenu texte / conseil / vidéo / molécule par leçon (supports DEUST). */
const LESSON_CONTENT = {
  sang_rappel: {
    texte: [
      { key: 'intro', titre: 'Éléments figurés et globules rouges', html: `<p>Les <strong>globules rouges</strong> transportent l’O₂ via l’hémoglobine. Durée de vie ≈ <strong>120 jours</strong>. Un GR mature est dépourvu de noyau.</p><p><strong>Érythropoïèse</strong> : hémocytoblaste → proérythroblaste → érythroblaste → réticulocyte (1–2 j) → hématie mâure.</p><p>Les <strong>plaquettes</strong> interviennent dans l’hémostase primaire ; durée de vie ≈ <strong>7 jours</strong>.</p>` },
      { key: 'fer', titre: 'Fer et absorption', html: `<p>Le <strong>fer</strong> n’est pas synthétisé par l’organisme : il provient de l’alimentation. Le fer animal est en général mieux absorbé que le fer végétal.</p><ul><li>La <strong>vitamine C</strong> augmente l’absorption (agrumes, kiwi, poivron…).</li><li>Le <strong>thé</strong> et le <strong>café</strong> la diminuent (tanins).</li></ul>` },
      { key: 'cas-ordo', titre: 'Cas de comptoir — ordonnances', html: `<p>Repérez sur les ordonnances (ci-dessous) les <strong>classes</strong> présentes (ex. fer, vitamine B12, vitamine D, IPP/antiacide…), leur <strong>indication probable</strong> et les <strong>conseils de dispensation</strong> à associer.</p><p><em>Questions guidées — pas de corrigé unique imposé dans le texte : validez votre analyse avec le jeu de la leçon.</em></p><p>Ressources vidéo du support : chaîne <a href="https://www.youtube.com/@lecoursdebio" target="_blank" rel="noopener">Le cours de bio</a> (érythropoïèse, hémostase).</p>` },
    ],
    videos: [
      { key: 'vid-erythro', titre: 'Érythropoïèse (complément)', url: 'https://www.youtube.com/watch?v=zeKTU_cZY64' },
      { key: 'vid-hemostase', titre: 'Mesure et rappels vasculaires (complément)', url: 'https://www.youtube.com/watch?v=SbG23nc_U_4' },
    ],
    conseil: { key: 'conseil-breche', pathologie: 'Brèche vasculaire', corps_html: `<p>L’hémostase <strong>primaire</strong> forme un clou plaquettaire <strong>fragile</strong>. Il doit être renforcé par la <strong>coagulation</strong> (hémostase secondaire) pour stabiliser le clot.</p>` },
    molecule: true,
  },
  sang_anemies: {
    texte: [
      { key: 'def', titre: 'Définition et classifications', html: `<p><strong>Anémie</strong> : Hb &lt; 13 g/100 mL (H) ou &lt; 12 g/100 mL (F).</p><p>Classifications : <strong>cause</strong> (centrale vs périphérique) et <strong>morphologie</strong> (VGM, CCMH) — microcytaire / normocytaire / macrocytaire.</p><p>Signes cliniques : fatigue, pâleur, dyspnée d’effort, tachycardie…</p>` },
      { key: 'types', titre: 'Types principaux (support)', html: `<p><strong>Ferriprive</strong>, <strong>macrocytaire</strong> (B9/B12, Biermer), <strong>hypo/aplasique</strong>, <strong>hémolytiques</strong> (drépanocytose, thalassémie, allo-immunisation Rh — le slide distingue parfois « liée à X » : retenir la transmission récessive classique et le rôle de <strong>Rhophylac</strong> en prévention).</p><p><strong>Intervalle de 2 h</strong> entre fer et quinolones, tétracyclines, topiques gastriques, hormones thyroïdiennes.</p>` },
    ],
    conseil: { key: 'conseil-fer', pathologie: 'Anémie ferriprive', corps_html: `<p>Conseiller la prise de fer loin du thé/café ; associer vitamine C si pertinent ; respecter les intervalles avec d’autres médicaments.</p><p>Les <strong>culots</strong> ne sont pas des fiches médicament dans ce parcours — information transmise en conseil/texte.</p>` },
    molecule: true,
  },
  sang_antiagregants: {
    texte: [
      { key: 'thrombose', titre: 'Thromboses', html: `<p><strong>TVP</strong>, <strong>EP</strong>, thrombose artérielle (coronaire, AVC/AIT). Les antiagrégants limitent l’agrégation plaquettaire.</p><p><strong>Indications</strong> : IDM, FA, pontage, AVC/AIT selon protocoles.</p><p>Mécanisme : inhibition <strong>COX</strong> → ↓ thromboxane A₂ (TXA₂).</p><p><strong>Chirurgie</strong> : arrêt des antiagrégants ≈ <strong>7 jours</strong> avant intervention (selon avis médical).</p>` },
    ],
    molecule: true,
  },
  sang_anticoagulants: {
    texte: [
      { key: 'classes', titre: 'Anticoagulants et thrombolytiques', html: `<p><strong>HNF / HBPM</strong>, fondaparinux, <strong>AOD</strong>, <strong>AVK</strong>, hirudines.</p><p>Relais héparine → AVK ; <strong>INR</strong> cible souvent 2–3.</p><p>Antidote dabigatran : <strong>idarucizumab (Praxbind)</strong>.</p><p><strong>Thrombolytiques</strong> : délais IDM &lt; 6 h, AVC &lt; 3 h (urgences hospitalières).</p>` },
    ],
    molecule: true,
  },
  sang_hemophilies: {
    texte: [
      { key: 'hemophilie', titre: 'Hémophilies et hémostatiques', html: `<p><strong>Hémophilie A</strong> (facteur VIII) et <strong>B</strong> (facteur IX) ; thrombopénie ; hémostatiques locaux et général.</p><p>Facteurs VIII/IX : pas de spécialités nommées dans les supports → rappel textuel uniquement.</p><p><strong>Phytoménadione</strong>, <strong>acide tranéxamique</strong> ; eau oxygénée 10 vol., alginate de calcium en conseil.</p>` },
    ],
    conseil: { key: 'conseil-local', pathologie: 'Petite plaie — conseils', corps_html: `<p>Eau oxygénée 10 vol., pansements (alginate…) selon contexte ; orienter si saignement abondant ou hémophilie connue.</p>` },
    molecule: true,
  },
  cv_definitions: {
    texte: [
      { key: 'atherome', titre: 'Artériosclérose et athérosclérose', html: `<p><strong>Artériosclérose</strong> : lésions dégénératives des artères → perte d’élasticité (HTA « essentielle », anévrismes).</p><p><strong>Athérosclérose</strong> : plaques lipidiques dans l’intima → sténose, ralentissement du flux, inflammation, thromboses.</p><p><strong>Complications</strong> : angor, AIT, AOMI, IDM, AVC. <em>Aucune nouvelle molécule</em> sur cette leçon — lecture des schémas.</p>` },
    ],
    molecule: false,
  },
  cv_angor: {
    texte: [
      { key: 'angor', titre: 'Angor', html: `<p>Angor <strong>stable</strong> ; le support mentionne aussi « instable ou Prinzmetal » — deux entités souvent confondues.</p><p>Anti-angoreux : dérivés nitrés (spray SL, patchs 8–12 h off), molsidomine, nicorandil, ivabradine ; INCA et bêtabloquants cités pour l’angor.</p>` },
    ],
    videos: [{ key: 'vid-natispray', titre: 'Spray sublingual — rappel d’emploi (stub)', url: 'https://www.youtube.com/watch?v=ah601yBXPS8' }],
    conseil: { key: 'conseil-crise', pathologie: 'Crise d’angor', corps_html: `<p><strong>Trinitrine</strong> : en général <strong>2 pulvérisations</strong>, puis rappeler la conduite à tenir si persistance (≤ 15 min) — orienter vers les urgences si douleur prolongée.</p>` },
    molecule: true,
  },
  cv_idm: {
    texte: [
      { key: 'idm', titre: 'Syndrome coronarien aigu', html: `<p>Définition, signes, marqueurs biologiques, complications.</p><p><strong>BASIC</strong> post-infarctus : bêtabloquant + antiagrégant + <strong>statine</strong> + IEC + contrôle des FDR.</p>` },
    ],
    videos: [{ key: 'vid-stent', titre: 'Angioplastie et stent (stub pédagogique)', url: 'https://www.youtube.com/watch?v=SGzp9wqeu84' }],
    molecule: true,
  },
  cv_arythmies: {
    texte: [
      { key: 'vw', titre: 'Arythmies et classes VW', html: `<p>Classification de <strong>Vaughan-Williams</strong> ; BAV ; tachy/brady ; FA ; extrasystoles.</p><p>Antiarythmiques classes I et III du cours ; vérapamil et diltiazem (classe IV) déjà vus.</p>` },
    ],
    molecule: true,
  },
  cv_ic: {
    texte: [
      { key: 'ic', titre: 'Insuffisance cardiaque', html: `<p>Définition, signes cliniques, classes thérapeutiques : bêtabloquants, IEC/ARA II, sacubitril/valsartan, SGLT2, digoxine, diurétiques (renvoi HTA pour furosémide, spironolactone, éplérénone).</p>` },
    ],
    molecule: true,
  },
  cv_veines: {
    texte: [
      { key: 'veines', titre: 'AOMI et insuffisance veineuse', html: `<p>AOMI ; retour veineux ; <strong>6 stades</strong> ; contention ; hémorroïdes.</p><p>Vasodilatateurs, veinotoniques ; sclérosants (noms commerciaux du cours) ; aromathérapie/homéopathie en conseil texte.</p>` },
    ],
    conseil: { key: 'conseil-jambes', pathologie: 'Jambes lourdes', corps_html: `<p>Marche, surélévation, éviter chaleur prolongée ; contention selon stade ; hygiène de vie.</p>` },
    molecule: true,
  },
  cv_urgences: {
    texte: [
      { key: 'oap', titre: 'OAP et urgences', html: `<p>OAP : signes d’alerte ; pas de traitement OAP nommé dans le texte du support.</p><p><strong>Anaphylaxie</strong> : adrénaline auto-injectable (Anapen, Jext).</p><p>Orientation <strong>15</strong> en urgence vitale.</p>` },
    ],
    conseil: { key: 'conseil-oap', pathologie: 'Détresse respiratoire aiguë', corps_html: `<p>Appeler le <strong>15</strong> ; ne pas retarder la prise en charge ; position demi-assise si OAP suspecté.</p>` },
    molecule: true,
  },
  hta_rappel_pa: {
    texte: [
      { key: 'pa', titre: 'Pression artérielle', html: `<p>PA = force du sang sur la paroi artérielle. Déterminants : <strong>VES × FC × résistances</strong> ; élasticité vasculaire.</p><p>Mesure au repos ; repères OMS (optimale, normale, HTA grades 1–3).</p><p>Régulation : SNA, résistances, volémie rénale — <em>RAA détaillé en leçon suivante</em>.</p><p>Barorécepteurs ; vasodilatateurs/vasoconstricteurs endogènes (NO, bradykinine, prostacycline vs catécholamines, angiotensine II, endothéline).</p>` },
    ],
    videos: [{ key: 'vid-pa', titre: 'Mesure de la PA', url: 'https://www.youtube.com/watch?v=SbG23nc_U_4' }],
    molecule: false,
  },
  hta_raa: {
    texte: [
      { key: 'raa', titre: 'Système rénine–angiotensine–aldostérone', html: `<p>Rénine (appareil juxtaglomérulaire) → angiotensine I → <strong>ECA</strong> → angiotensine II.</p><p>Effets : sympathique, aldostérone, vasoconstriction, ADH ; rétrocontrôle.</p><p>Exercices RAA (trous/QCM) : réponses via le jeu <strong>JP-CVH2</strong>, pas de spoiler ici.</p>` },
    ],
    molecule: false,
  },
  hta_clinique: {
    texte: [
      { key: 'clinique', titre: 'HTA clinique', html: `<p>HTA essentielle vs secondaire ; signes ; complications (organes cibles).</p><p>Hygiène : sel, excitants, réglisse, pseudoéphédrine, corticoïdes…</p><p>Cas patients du support (Me X, M Y, Me Eve, M Hyper) — traités dans le jeu.</p>` },
    ],
    conseil: { key: 'conseil-hta', pathologie: 'HTA — hygiène de vie', corps_html: `<p>Régime hyposodé, activité physique, poids, limiter alcool et excitants ; automesure encadrée.</p>` },
    molecule: false,
  },
  hta_classes: {
    texte: [
      { key: 'classes', titre: 'Antihypertenseurs par classe', html: `<p>Cibles : <strong>FC</strong>, <strong>volémie</strong>, <strong>vasodilatation</strong>.</p><p>BB, INCA, diurétiques, alpha/centraux, IEC, sartans — union stricte du deck HTA (voir schémas et programme molécules).</p>` },
    ],
    molecule: true,
  },
  hta_associations: {
    texte: [
      { key: 'assoc', titre: 'Associations fixes et dispensation', html: `<p>Tableau des associations du support (Cibadrex, Coveram, Exforge, Lodoz, Natrixam…).</p><p>Hypotension orthostatique ; grille « Je fais attention / Je conseille / Je surveille ».</p><p>Associations : fiches composants déjà publiés + tableau ci-dessous.</p>` },
    ],
    conseil: { key: 'conseil-disp', pathologie: 'Dispensation antihypertenseurs', corps_html: `<p>Première prise : risque d’hypotension — conseiller de s’asseoir, de se lever lentement ; horaires réguliers ; ne pas arrêter brutalement.</p>` },
    molecule: true,
  },
};

function buildInserts() {
  const photos = parsePhotos();
  const rows = [];
  let ordreBase = 0;

  for (const [code, content] of Object.entries(LESSON_CONTENT)) {
    const modId = MOD[code];
    if (!modId) throw new Error('module id manquant: ' + code);
    ordreBase = 0;

    for (const t of content.texte || []) {
      ordreBase += 10;
      rows.push({
        code,
        modId,
        ordre: ordreBase,
        type: 'texte',
        key: t.key,
        titre: t.titre || null,
        payload: { html: t.html },
      });
    }

    for (const v of content.videos || []) {
      ordreBase += 10;
      rows.push({
        code,
        modId,
        ordre: ordreBase,
        type: 'video',
        key: v.key,
        titre: v.titre || null,
        payload: { url: v.url },
      });
    }

    for (const p of photos[code] || []) {
      ordreBase += 10;
      const legende = PHOTO_LEGEND[p.slug] || p.slug.replace(/-/g, ' ');
      rows.push({
        code,
        modId,
        ordre: ordreBase,
        type: 'photo',
        key: `photo-${p.slug}`,
        titre: null,
        payload: {
          path: `modules/${modId}/${p.slug}.jpg`,
          alt: legende,
          legende,
        },
      });
    }

    if (content.conseil) {
      ordreBase += 10;
      const c = content.conseil;
      rows.push({
        code,
        modId,
        ordre: ordreBase,
        type: 'conseil',
        key: c.key,
        titre: null,
        payload: { pathologie: c.pathologie, corps_html: c.corps_html },
      });
    }

    if (content.molecule) {
      ordreBase += 10;
      rows.push({
        code,
        modId,
        ordre: ordreBase,
        type: 'molecule',
        key: 'molecule-lot',
        titre: 'Molécules du programme',
        payload: { dynamic: true },
      });
    }
  }

  return rows;
}

function emitSql(rows) {
  const lines = [];
  lines.push(`-- =============================================================================
-- 035 : Blocs contenu (texte, photo, vidéo, conseil, molécule) — CardioVasculaires Deust 2A
-- Idempotent : seed_key 035:* ; ne supprime pas les blocs type jeu (032).
-- Photos : bucket jeupharma-lecons (paths modules/<uuid>/<slug>.jpg).
-- Généré par sql/ops/build_035_blocs.mjs
-- =============================================================================

DELETE FROM jeupharma.module_blocs mb
USING jeupharma.modules_cours mc, jeupharma.parcours_apprentissage pa
WHERE mb.module_id = mc.id
  AND mc.parcours_id = pa.id
  AND pa.code = 'cardiovasculaires_deust_2a'
  AND NOT mc.est_groupe
  AND mb.type_bloc <> 'jeu'
  AND coalesce(mb.payload_json->>'seed_key', '') LIKE '035:%';

`);

  for (const r of rows) {
    const seed = `035:${r.code}:${r.key}`;
    let payload = { ...r.payload, seed_key: seed };
    if (r.type === 'molecule' && payload.dynamic) {
      delete payload.dynamic;
      lines.push(`-- Molécule ${r.code} : matrice_ids depuis publications de la leçon
INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, ${r.ordre}, 'molecule', ${r.titre ? `'${escSql(r.titre)}'` : 'NULL'},
  jsonb_build_object(
    'seed_key', '${escSql(seed)}',
    'matrice_ids', coalesce((
      SELECT jsonb_agg(sub.m ORDER BY sub.m)
      FROM (
        SELECT DISTINCT c.matrice_id AS m
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
        WHERE pc.module_id = mc.id AND pc.actif
      ) sub
    ), '[]'::jsonb),
    'matrice_id', (
      SELECT sub.m FROM (
        SELECT DISTINCT c.matrice_id AS m
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
        WHERE pc.module_id = mc.id AND pc.actif
      ) sub ORDER BY sub.m LIMIT 1
    )
  ),
  true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = '${escSql(r.code)}' AND NOT mc.est_groupe;

`);
      continue;
    }
    const titSql = r.titre ? `'${escSql(r.titre)}'` : 'NULL';
    lines.push(`INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, ${r.ordre}, '${r.type}', ${titSql}, '${escSql(JSON.stringify(payload))}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = '${escSql(r.code)}' AND NOT mc.est_groupe;

`);
  }

  lines.push(`-- Publication leçons pour les joueurs (contenu + critères jeux déjà posés en 032)
UPDATE jeupharma.modules_cours mc
SET publie = true, statut = 'publie', contenu_maj_at = now(), updated_at = now()
FROM jeupharma.parcours_apprentissage pa
WHERE mc.parcours_id = pa.id AND pa.code = 'cardiovasculaires_deust_2a' AND NOT mc.est_groupe;

UPDATE jeupharma.modules_cours mc
SET contenu_maj_at = now(), updated_at = now()
FROM jeupharma.parcours_apprentissage pa
WHERE mc.parcours_id = pa.id AND pa.code = 'cardiovasculaires_deust_2a' AND NOT mc.est_groupe;
`);

  return lines.join('\n');
}

const rows = buildInserts();
const out = path.join(ROOT, 'sql', '035_blocs_contenu_cardio_deust.sql');
fs.writeFileSync(out, emitSql(rows), 'utf8');
console.log(`Écrit ${out} — ${rows.length} blocs (hors jeu).`);
