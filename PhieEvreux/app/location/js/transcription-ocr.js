/**
 * OCR Transcription — Azure Document Intelligence (Edge Function ocr-document)
 * + pdf.js (CDN) + heuristiques FR. Repli Tesseract.js si Azure indisponible.
 * Images/PDF uniquement en mémoire (blob) — pas de stockage distant.
 *
 * Mapping patient / en-têtes : règles heuristiques uniquement (blacklist pharmacie,
 * noms prestataires, labels NOM/PRENOM) — pas d’extraction LLM.
 */
(function (global) {
  const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  const PDFJS_CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
  const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const MAX_OCR_WIDTH = 1600;
  const OCR_FN = 'ocr-document';
  const MAP_FN = 'ocr-map-fields';

  /**
   * Identifiants en-tête Pharmacie Grand Evreux (docs types) — à exclure du patient.
   * Filtrage rule-based uniquement, pas d’IA.
   */
  const PHARMACIE_LETTERHEAD = [
    'pharmacie grand evreux',
    'phie grand evreux',
    'phieevreux',
    'pharmacie grand',
    'siret',
    'rcs evreux',
    'code ape',
    'tva intracommunautaire',
    '@pharmacie',
  ];

  /** Sous-chaînes typiques d’en-tête (lignes), plus larges que le test sur une valeur champ. */
  const PHARMACIE_HEADER_EXTRA = ['grand evreux', '27000 evreux', 'evreux cedex', 'www.'];

  let pdfPromise = null;
  let tessPromise = null;
  let workerPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Impossible de charger ${src}`));
      document.head.appendChild(s);
    });
  }

  async function ensurePdfLib() {
    if (pdfPromise) return pdfPromise;
    pdfPromise = (async () => {
      await loadScript(PDFJS_CDN);
      if (!global.pdfjsLib) throw new Error('pdf.js indisponible');
      global.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    })();
    return pdfPromise;
  }

  async function ensureTesseract() {
    if (tessPromise) return tessPromise;
    tessPromise = (async () => {
      await loadScript(TESSERACT_CDN);
      if (!global.Tesseract) throw new Error('Tesseract.js indisponible');
    })();
    return tessPromise;
  }

  /** @deprecated use ensurePdfLib / ensureTesseract */
  async function ensureLibs() {
    await Promise.all([ensurePdfLib(), ensureTesseract()]);
  }

  async function getWorker(onProgress) {
    await ensureTesseract();
    if (workerPromise) return workerPromise;
    workerPromise = (async () => {
      const worker = await global.Tesseract.createWorker('fra', 1, {
        logger: (m) => {
          if (typeof onProgress === 'function' && m && m.status) {
            onProgress(m);
          }
        },
      });
      return worker;
    })();
    return workerPromise;
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const s = String(reader.result || '');
        const i = s.indexOf(',');
        resolve(i >= 0 ? s.slice(i + 1) : s);
      };
      reader.onerror = () => reject(new Error('Lecture base64 impossible'));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Appel Edge Function ocr-document (Azure Read).
   * @returns {Promise<{ text: string, words: object[], width: number, height: number, engine: string }>}
   */
  async function callAzureOcr(imageBase64) {
    const apps = global.PhieEvreuxApps;
    if (!apps) throw new Error('PhieEvreuxApps manquant');
    const cfg = apps.getCfg();
    const portail = apps.createPortailClient();
    const {
      data: { session },
    } = await portail.auth.getSession();
    if (!session?.access_token) throw new Error('Session expirée');

    const res = await fetch(`${cfg.url}/functions/v1/${OCR_FN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: cfg.anonKey,
      },
      body: JSON.stringify({ imageBase64 }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || `OCR Azure HTTP ${res.status}`);
    }
    return {
      text: String(body.text || '').trim(),
      words: Array.isArray(body.words) ? body.words : [],
      width: Number(body.width) || 0,
      height: Number(body.height) || 0,
      engine: body.engine || 'azure-read',
    };
  }

  /**
   * IA vision : remplit les champs du formulaire à partir des images + texte OCR.
   * @returns {Promise<{ code: string, value: *, confidence: number }[]>}
   */
  async function callAiFieldMapping(opts) {
    const apps = global.PhieEvreuxApps;
    if (!apps) throw new Error('PhieEvreuxApps manquant');
    const cfg = apps.getCfg();
    const portail = apps.createPortailClient();
    const {
      data: { session },
    } = await portail.auth.getSession();
    if (!session?.access_token) throw new Error('Session expirée');

    const res = await fetch(`${cfg.url}/functions/v1/${MAP_FN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: cfg.anonKey,
      },
      body: JSON.stringify({
        imagesBase64: (opts.imagesBase64 || []).slice(0, 8),
        ocrText: opts.ocrText || '',
        fields: opts.fields || [],
        workflow: opts.workflow || '',
        prestataires: (opts.prestataires || []).map((p) => ({
          id: p.id,
          nom: p.nom,
        })),
        pageCount: (opts.imagesBase64 || []).length,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || `IA mapping HTTP ${res.status}`);
    }
    return Array.isArray(body.mappings) ? body.mappings : [];
  }

  function mergeMappings(heuristic, ai) {
    const map = new Map();
    for (const m of heuristic || []) {
      if (m && m.code != null) map.set(m.code, m);
    }
    for (const m of ai || []) {
      if (m && m.code != null && m.value != null && String(m.value).trim() !== '') {
        map.set(m.code, m);
      }
    }
    return Array.from(map.values());
  }

  function scaleWords(words, srcW, srcH, dstW, dstH) {
    if (!srcW || !srcH || !dstW || !dstH) return words || [];
    const sx = dstW / srcW;
    const sy = dstH / srcH;
    if (Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return words || [];
    return (words || []).map((w) => ({
      ...w,
      bbox: {
        x0: (w.bbox?.x0 ?? 0) * sx,
        y0: (w.bbox?.y0 ?? 0) * sy,
        x1: (w.bbox?.x1 ?? 0) * sx,
        y1: (w.bbox?.y1 ?? 0) * sy,
      },
    }));
  }

  function revokeUrl(url) {
    if (url && String(url).startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url);
      } catch (_) {
        /* ignore */
      }
    }
  }

  /**
   * Redimensionne une image/canvas vers canvas ≤ MAX_OCR_WIDTH.
   * @returns {Promise<{ canvas: HTMLCanvasElement, width: number, height: number, objectUrl: string }>}
   */
  function resizeToCanvas(source, maxW) {
    return new Promise((resolve, reject) => {
      const limit = maxW || MAX_OCR_WIDTH;
      const img = source instanceof HTMLCanvasElement ? null : new Image();
      const finish = (el) => {
        const sw = el.width || el.naturalWidth;
        const sh = el.height || el.naturalHeight;
        if (!sw || !sh) {
          reject(new Error('Image invalide'));
          return;
        }
        const scale = sw > limit ? limit / sw : 1;
        const w = Math.max(1, Math.round(sw * scale));
        const h = Math.max(1, Math.round(sh * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(el, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Conversion image impossible'));
              return;
            }
            resolve({
              canvas,
              width: w,
              height: h,
              blob,
              objectUrl: URL.createObjectURL(blob),
            });
          },
          'image/jpeg',
          0.92
        );
      };
      if (source instanceof HTMLCanvasElement) {
        finish(source);
        return;
      }
      img.onload = () => finish(img);
      img.onerror = () => reject(new Error('Lecture image impossible'));
      if (source instanceof Blob) {
        img.src = URL.createObjectURL(source);
      } else if (typeof source === 'string') {
        img.src = source;
      } else {
        reject(new Error('Source image inconnue'));
      }
    });
  }

  /** Contraste / N&B léger — aide Tesseract sur chiffres et capitales manuscrites. */
  function enhanceForOcr(canvas) {
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(canvas, 0, 0);
    const img = ctx.getImageData(0, 0, out.width, out.height);
    const d = img.data;
    let min = 255;
    let max = 0;
    const gray = new Float32Array(d.length / 4);
    for (let i = 0, p = 0; i < d.length; i += 4, p += 1) {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      gray[p] = g;
      if (g < min) min = g;
      if (g > max) max = g;
    }
    const span = Math.max(1, max - min);
    for (let i = 0, p = 0; i < d.length; i += 4, p += 1) {
      let g = ((gray[p] - min) / span) * 255;
      g = (g - 128) * 1.25 + 128;
      g = Math.max(0, Math.min(255, g));
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    ctx.putImageData(img, 0, 0);
    return out;
  }

  async function pdfToCanvases(file, onPage) {
    await ensurePdfLib();
    const buf = await file.arrayBuffer();
    const pdf = await global.pdfjsLib.getDocument({ data: buf }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = base.width > MAX_OCR_WIDTH ? MAX_OCR_WIDTH / base.width : 1.5;
      const viewport = page.getViewport({ scale: Math.max(scale, 1.2) });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      if (typeof onPage === 'function') onPage(i, pdf.numPages);
      pages.push(canvas);
    }
    return pages;
  }

  function wordsFromData(data) {
    return (data?.words || [])
      .filter((w) => w && w.text && String(w.text).trim())
      .map((w) => ({
        text: String(w.text).trim(),
        bbox: {
          x0: w.bbox?.x0 ?? 0,
          y0: w.bbox?.y0 ?? 0,
          x1: w.bbox?.x1 ?? 0,
          y1: w.bbox?.y1 ?? 0,
        },
        confidence: typeof w.confidence === 'number' ? w.confidence : 0,
      }));
  }

  function bboxOverlap(a, b) {
    const ix0 = Math.max(a.x0, b.x0);
    const iy0 = Math.max(a.y0, b.y0);
    const ix1 = Math.min(a.x1, b.x1);
    const iy1 = Math.min(a.y1, b.y1);
    if (ix1 <= ix0 || iy1 <= iy0) return 0;
    const inter = (ix1 - ix0) * (iy1 - iy0);
    const areaA = Math.max(1, (a.x1 - a.x0) * (a.y1 - a.y0));
    const areaB = Math.max(1, (b.x1 - b.x0) * (b.y1 - b.y0));
    return inter / Math.min(areaA, areaB);
  }

  /** Fusionne 2 passes OCR (imprimé + PSM bloc) en gardant le meilleur conf par zone. */
  function mergeWords(primary, secondary) {
    const out = primary.map((w) => ({ ...w, bbox: { ...w.bbox } }));
    for (const w of secondary || []) {
      let best = -1;
      let bestOv = 0;
      for (let i = 0; i < out.length; i += 1) {
        const ov = bboxOverlap(out[i].bbox, w.bbox);
        if (ov > bestOv) {
          bestOv = ov;
          best = i;
        }
      }
      if (best >= 0 && bestOv >= 0.45) {
        if (w.confidence > out[best].confidence) out[best] = { ...w, bbox: { ...w.bbox } };
      } else if (w.confidence >= 35 && w.text.length >= 1) {
        out.push({ ...w, bbox: { ...w.bbox } });
      }
    }
    return out;
  }

  /**
   * OCR principal = Azure (Edge Function). Repli Tesseract si échec.
   * @returns {Promise<{ text: string, words: { text: string, bbox: { x0,y0,x1,y1 }, confidence: number }[], width: number, height: number, objectUrl: string, blob: Blob, engine?: string }>}
   */
  async function ocrCanvasOrBlob(source, onProgress) {
    const resized = await resizeToCanvas(source, MAX_OCR_WIDTH);
    const base64 = await blobToBase64(resized.blob);

    try {
      if (typeof onProgress === 'function') onProgress({ status: 'azure', progress: 0.2 });
      const azure = await callAzureOcr(base64);
      if (typeof onProgress === 'function') onProgress({ status: 'azure', progress: 1 });
      const words = scaleWords(
        azure.words,
        azure.width,
        azure.height,
        resized.width,
        resized.height
      );
      return {
        text: azure.text,
        words,
        width: resized.width,
        height: resized.height,
        objectUrl: resized.objectUrl,
        blob: resized.blob,
        base64,
        engine: azure.engine || 'azure-read',
      };
    } catch (azureErr) {
      console.warn('[Transcription OCR] Azure indisponible, repli Tesseract', azureErr);
      if (typeof onProgress === 'function') {
        onProgress({ status: 'tesseract-fallback', progress: 0 });
      }
    }

    const enhanced = enhanceForOcr(resized.canvas);
    const worker = await getWorker(onProgress);

    await worker.setParameters({ tessedit_pageseg_mode: '3' });
    const result1 = await worker.recognize(enhanced);
    const words1 = wordsFromData(result1?.data);

    let words2 = [];
    let text2 = '';
    try {
      await worker.setParameters({ tessedit_pageseg_mode: '6' });
      const result2 = await worker.recognize(enhanced);
      words2 = wordsFromData(result2?.data);
      text2 = String(result2?.data?.text || '').trim();
    } catch (_) {
      /* ignore 2e passe */
    } finally {
      try {
        await worker.setParameters({ tessedit_pageseg_mode: '3' });
      } catch (_) {
        /* ignore */
      }
    }

    const words = mergeWords(words1, words2);
    const text1 = String(result1?.data?.text || '').trim();
    const text = [text1, text2].filter(Boolean).join('\n').trim() || text1;

    return {
      text,
      words,
      width: resized.width,
      height: resized.height,
      objectUrl: resized.objectUrl,
      blob: resized.blob,
      base64,
      engine: 'tesseract-fallback',
    };
  }

  function normalizeText(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseFrDate(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
    if (!m) return null;
    let d = Number(m[1]);
    let mo = Number(m[2]);
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
    return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function afterLabel(text, labels, opts) {
    const n = normalizeText(text);
    for (const label of labels) {
      const idx = n.indexOf(normalizeText(label));
      if (idx < 0) continue;
      let rest = text.slice(idx + label.length);
      rest = rest.replace(/^[\s:.\-–—]+/, '');
      if (opts?.untilLine) {
        rest = rest.split(/\n/)[0];
      }
      rest = rest.trim();
      if (opts?.pattern) {
        const m = rest.match(opts.pattern);
        return m ? m[0] : null;
      }
      if (opts?.maxLen) rest = rest.slice(0, opts.maxLen);
      return rest || null;
    }
    return null;
  }

  function prestataireNames(ctx) {
    return (ctx?.prestataires || [])
      .map((p) => normalizeText(p.nom || ''))
      .filter((n) => n.length >= 3);
  }

  function isLetterheadOrSenderLine(line, prestNames) {
    const n = normalizeText(line);
    if (!n || n.length < 3) return false;
    if (/^pharmacie\b/.test(n) && n.length < 80) return true;
    for (const s of PHARMACIE_LETTERHEAD) {
      if (n.includes(s)) return true;
    }
    for (const s of PHARMACIE_HEADER_EXTRA) {
      if (n.includes(s) && (n.includes('pharmacie') || n.includes('siret') || n.includes('tel') || /^[a-z0-9 ._-]{0,40}evreux/.test(n))) {
        return true;
      }
    }
    if (/\bsiret\b|\brcs\b|\bape\b|\btva\b/.test(n)) return true;
    if (/\b(orkyn|air\s*liquide|vitalaire|bastide|santeo)\b/.test(n)) return true;
    for (const pn of prestNames) {
      if (n.includes(pn) || pn.includes(n)) return true;
    }
    return false;
  }

  /**
   * Retire en-tête pharmacie / blocs prestataire avant mapping patient.
   * Heuristiques seules — pas d’IA.
   */
  function stripSenderNoise(text, ctx) {
    const prestNames = prestataireNames(ctx);
    const lines = String(text || '').split(/\n/);
    const kept = [];
    let headerBudget = Math.min(12, lines.length);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const inHeaderZone = i < headerBudget;
      if (inHeaderZone && isLetterheadOrSenderLine(line, prestNames)) continue;
      if (!inHeaderZone && isLetterheadOrSenderLine(line, prestNames) && /^pharmacie\b/i.test(line.trim())) {
        continue;
      }
      if (prestNames.some((pn) => normalizeText(line).includes(pn) && normalizeText(line).length < pn.length + 40)) {
        /* bloc identité prestataire (ex. Orkyn) — ignorer pour patient */
        continue;
      }
      kept.push(line);
    }
    return kept.join('\n');
  }

  function looksLikePharmacyOrPrestataireValue(value, ctx) {
    const n = normalizeText(value);
    if (!n) return true;
    for (const s of PHARMACIE_LETTERHEAD) {
      if (n.includes(s) || (s.length >= 8 && s.includes(n))) return true;
    }
    if (/^pharmacie\b/.test(n)) return true;
    if (/pharmacie grand|phie grand evreux/.test(n)) return true;
    for (const pn of prestataireNames(ctx)) {
      if (n === pn || n.includes(pn) || (pn.length >= 5 && pn.includes(n))) return true;
    }
    return false;
  }

  function detectTypeAppareil(text) {
    const n = normalizeText(text);
    if (/neurostim|neuro.?stimul|tens\b|neurostimulation/.test(n)) return 'tens';
    if (/tire.?lait|tirelait/.test(n)) return 'tire_lait';
    if (/a[eé]rosol|nebuliseur|n[eé]buliseur/.test(n)) return 'aerosol';
    if (/p[eè]se.?b[eé]b[eé]|pesee.?bebe|pesebebe/.test(n)) return 'pese_bebe';
    if (/fauteuil/.test(n)) return 'fauteuil';
    return null;
  }

  function detectCaution(text) {
    const n = normalizeText(text);
    if (/cheque.?caution|caution.?150|cheque.?150|150\s*€|150\s*euros/.test(n)) {
      return 'cheque_150';
    }
    if (/\bespeces\b|\besp[eè]ces\b/.test(n)) return 'especes';
    return null;
  }

  function detectDureeUnite(text) {
    const n = normalizeText(text);
    let m = n.match(/(\d+)\s*trimestre/);
    if (m) {
      return { duree: Number(m[1]) * 3, unite: 'mois' };
    }
    m = n.match(/qsp\s*(\d+)\s*mois/);
    if (m) return { duree: Number(m[1]), unite: 'mois' };
    m = n.match(/(\d+)\s*mois/);
    if (m) return { duree: Number(m[1]), unite: 'mois' };
    m = n.match(/(\d+)\s*semaines?/);
    if (m) return { duree: Number(m[1]), unite: 'semaines' };
    m = n.match(/(\d+)\s*jours?/);
    if (m) return { duree: Number(m[1]), unite: 'jours' };
    return null;
  }

  /** Prolongation écrite sur le document (durée extra / mot-clé). */
  function detectProlongation(text) {
    const n = normalizeText(text);
    const hasKw =
      /\bprolongation\b|\bprolonger\b|\bprolonge\b|\brenouvellement\b|\brenouveler\b/.test(n);
    let duree = null;
    let unite = null;
    let m =
      n.match(/prolongation[^\d]{0,48}(\d+)\s*(mois|semaines?|jours?)/) ||
      n.match(/prolonger[^\d]{0,48}(\d+)\s*(mois|semaines?|jours?)/) ||
      n.match(/(\d+)\s*(mois|semaines?|jours?)[^\n]{0,40}prolong/);
    if (m) {
      duree = Number(m[1]);
      const u = m[2];
      unite = /^mois/.test(u) ? 'mois' : /^jour/.test(u) ? 'jours' : 'semaines';
    }
    const finRaw = afterLabel(
      text,
      ['fin de location', 'fin location', 'date de fin', 'jusqu au', "jusqu'au", 'au'],
      { pattern: /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/ }
    );
    const finIso = parseFrDate(finRaw);
    const enabled = hasKw || !!m || !!finIso;
    if (!enabled) return null;
    return {
      enabled: true,
      duree: duree && duree > 0 ? duree : null,
      unite: unite || null,
      date_fin_hint: finIso || null,
      notes: hasKw ? 'Prolongation détectée sur document' : null,
    };
  }

  /** Indices contact / à rappeler sur le document. */
  function detectContactHints(text) {
    const n = normalizeText(text);
    const hasKw =
      /a contacter|a rappeler|rappeler|joindre|contact patient|commentaire patient|message patient|\blgo\b|\bappel\b/.test(
        n
      );
    if (!hasKw && !/reclam|retour.?appareil|ramener.?appareil/.test(n)) return null;
    let motif = null;
    if (/reclam|retour.?appareil|ramener/.test(n)) motif = 'reclame_appareil';
    else if (/prolong/.test(n)) motif = 'prolongation';
    else if (/tens/.test(n)) motif = 'reclame_appareil_tens';
    return { enabled: true, motif };
  }

  function findMatricule(text) {
    const m =
      text.match(/\b([A-Z]\d{6,12})\b/) ||
      text.match(/\b(n[°o]\s*s[eé]rie[:\s]*)([A-Z0-9\-]{5,})/i) ||
      text.match(/\bmatricule[:\s]*([A-Z0-9\-]{5,})/i);
    if (!m) return null;
    return (m[2] || m[1] || '').replace(/^n[°o]\s*s[eé]rie[:\s]*/i, '').trim() || null;
  }

  function findPhone(text, ctx) {
    const re = /(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g;
    const matches = String(text || '').match(re) || [];
    for (const raw of matches) {
      const tel = raw.replace(/[^\d+]/g, '').replace(/^33/, '0');
      /* ignorer numéros typiques en-tête si la ligne porte aussi « pharmacie » */
      const idx = text.indexOf(raw);
      const around = text.slice(Math.max(0, idx - 40), idx + raw.length + 40);
      if (isLetterheadOrSenderLine(around, prestataireNames(ctx))) continue;
      return tel;
    }
    return null;
  }

  function findNomPrenom(text, ctx) {
    const cleaned = stripSenderNoise(text, ctx);
    const patientLabels = [
      'nom / prenom',
      'nom/prenom',
      'nom et prenom',
      'nom prenom',
      'destinataire',
      'patient',
      'nom du patient',
      'prenom',
      'nom',
    ];
    let raw = afterLabel(cleaned, ['nom / prenom', 'nom/prenom', 'nom et prenom', 'destinataire', 'nom du patient'], {
      untilLine: true,
      maxLen: 80,
    });
    if (!raw) {
      raw = afterLabel(cleaned, ['nom', 'prenom'], { untilLine: true, maxLen: 80 });
    }
    if (raw && !looksLikePharmacyOrPrestataireValue(raw, ctx)) {
      const parts = raw.split(/[\/,]/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const nom = parts[0];
        const prenom = parts[1];
        if (!looksLikePharmacyOrPrestataireValue(nom, ctx)) {
          return { nom, prenom };
        }
      }
      const sp = raw.split(/\s+/);
      if (sp.length >= 2) {
        const nom = sp[0];
        const prenom = sp.slice(1).join(' ');
        if (!looksLikePharmacyOrPrestataireValue(nom, ctx)) return { nom, prenom };
      }
      if (!looksLikePharmacyOrPrestataireValue(raw, ctx) && /nom/.test(normalizeText(raw)) === false) {
        return { nom: raw, prenom: '' };
      }
    }

    /* Préférer zone après label « ordonnance » / patient */
    const ordoIdx = normalizeText(cleaned).search(/\bordonnance\b|\bpatient\b|\bdestinataire\b/);
    const region = ordoIdx >= 0 ? cleaned.slice(Math.max(0, ordoIdx - 20)) : cleaned;
    const lines = region
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      if (isLetterheadOrSenderLine(line, prestataireNames(ctx))) continue;
      if (patientLabels.some((lb) => normalizeText(line).startsWith(normalizeText(lb)))) continue;
      const m = line.match(
        /^([A-ZÀÂÄÉÈÊËÏÎÔÖÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÔÖÙÛÜÇ' -]{1,})[,\s]+([A-Za-zÀ-ÿ' -]{2,})$/
      );
      if (m) {
        const nom = m[1].trim();
        const prenom = m[2].trim();
        if (!looksLikePharmacyOrPrestataireValue(nom, ctx) && !looksLikePharmacyOrPrestataireValue(`${nom} ${prenom}`, ctx)) {
          return { nom, prenom };
        }
      }
    }
    return null;
  }

  function matchPrestataireOrkyn(prestataires) {
    const list = prestataires || [];
    const hit = list.find((p) => /orkyn/i.test(p.nom || ''));
    return hit || null;
  }

  /**
   * Heuristiques FR → propositions de mapping (code → valeur).
   * Rule-based only (pas d’IA) : labels + blacklist pharmacie/prestataires.
   * @param {string} fullText
   * @param {{ prestataires?: object[] }} [ctx]
   * @returns {{ code: string, value: string|number|boolean, confidence: number }[]}
   */
  function mapHeuristics(fullText, ctx) {
    const text = String(fullText || '');
    const patientText = stripSenderNoise(text, ctx);
    const out = [];
    const push = (code, value, confidence) => {
      if (value == null || value === '') return;
      out.push({ code, value, confidence: confidence ?? 0.6 });
    };

    const np = findNomPrenom(text, ctx);
    if (np) {
      if (np.nom && !looksLikePharmacyOrPrestataireValue(np.nom, ctx)) {
        push('patient_nom', np.nom, 0.7);
      }
      if (np.prenom && !looksLikePharmacyOrPrestataireValue(np.prenom, ctx)) {
        push('patient_prenom', np.prenom, 0.7);
      }
    }

    const dn =
      afterLabel(patientText, ['date de naissance', 'ne(e) le', 'nee le', 'né le', 'née le'], {
        pattern: /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/,
      }) || afterLabel(patientText, ['date de naissance'], { untilLine: true });
    const dnIso = parseFrDate(dn);
    if (dnIso) push('patient_date_naissance', dnIso, 0.75);

    const adresse = afterLabel(patientText, ['adresse'], { untilLine: true, maxLen: 120 });
    if (
      adresse &&
      adresse.length > 5 &&
      !looksLikePharmacyOrPrestataireValue(adresse, ctx) &&
      !/pharmacie|siret/i.test(adresse)
    ) {
      push('patient_adresse', adresse, 0.55);
    }

    const tel = findPhone(patientText, ctx);
    if (tel) push('patient_telephone', tel, 0.7);

    const caution = detectCaution(text);
    if (caution) push('caution', caution, 0.8);

    const op =
      afterLabel(text, ['code op', 'op /', 'opérateur', 'operateur', 'op:'], {
        pattern: /[A-Za-z0-9]{1,12}/,
      }) || afterLabel(text, [' op '], { pattern: /\b[A-Z]{1,3}\d{0,4}\b/ });
    if (op) push('code_op', String(op).trim(), 0.55);

    const type = detectTypeAppareil(text);
    if (type) {
      push('type_appareil', type, 0.85);
    } else if (/appareil|location/.test(normalizeText(text))) {
      push('type_appareil', 'autre', 0.3);
      const lib = afterLabel(text, ['type', 'appareil'], { untilLine: true, maxLen: 40 });
      if (lib) push('type_libelle', lib, 0.4);
    }

    const n = normalizeText(text);
    if (/orkyn|bon orkyn/.test(n)) {
      push('source', 'prestataire', 0.8);
      const prest = matchPrestataireOrkyn(ctx?.prestataires);
      if (prest) push('prestataire_id', prest.id, 0.85);
    }

    const mat = findMatricule(text);
    if (mat) push('matricule', mat, 0.75);

    const numPh =
      afterLabel(text, ['pharmacie - numero', 'pharmacie - numéro', 'numero pharmacie', 'n° pharmacie', 'n pharmacie'], {
        pattern: /[A-Z0-9\-]{2,20}/i,
      }) || afterLabel(text, ['numero', 'numéro'], { pattern: /\b\d{2,8}\b/ });
    if (numPh && /pharmacie/.test(n)) {
      push('numero_pharmacie', String(numPh).trim(), 0.65);
      if (!out.some((x) => x.code === 'source')) push('source', 'parc', 0.5);
    }

    const debutRaw =
      afterLabel(text, ['debut de location', 'début de location', 'date de debut', 'date de début', 'debut'], {
        pattern: /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/,
      });
    const debutIso = parseFrDate(debutRaw);
    if (debutIso) push('date_debut', debutIso, 0.7);

    const ordoRaw =
      afterLabel(text, ['date prescription', 'date ordo', 'ordonnance', 'date d’ordonnance', "date d'ordonnance"], {
        pattern: /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/,
      });
    const ordoIso = parseFrDate(ordoRaw);
    if (ordoIso) push('date_ordo', ordoIso, 0.7);

    const du = detectDureeUnite(text);
    if (du) {
      push('duree', du.duree, 0.7);
      push('unite', du.unite, 0.7);
    }

    const prolong = detectProlongation(text);
    if (prolong) {
      push('prolong_enabled', true, 0.75);
      if (prolong.duree) push('prolong_duree', prolong.duree, 0.7);
      if (prolong.unite) push('prolong_unite', prolong.unite, 0.7);
      if (prolong.notes) push('prolong_notes', prolong.notes, 0.5);
      if (prolong.date_fin_hint) push('prolong_date_fin_hint', prolong.date_fin_hint, 0.55);
    }

    const contact = detectContactHints(text);
    if (contact) {
      push('contact_enabled', true, 0.7);
      if (contact.motif) push('contact_motif', contact.motif, 0.65);
    }

    return out;
  }

  /**
   * Traite une liste de File (images + PDF) → pages OCR.
   * @param {FileList|File[]} files
   * @param {{ onStatus?: function, onProgress?: function, prestataires?: object[] }} [opts]
   */
  async function processFiles(files, opts) {
    const list = Array.from(files || []);
    if (!list.length) return { pages: [], mappings: [] };
    const pages = [];
    const imagesBase64 = [];
    const onStatus = opts?.onStatus || (() => {});
    const errors = [];
    let usedAzure = false;
    let usedFallback = false;

    for (let fi = 0; fi < list.length; fi += 1) {
      const file = list[fi];
      try {
        const isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
        onStatus(`Préparation ${file.name || 'fichier'} (${fi + 1}/${list.length})…`);
        let sources = [];
        if (isPdf) {
          await ensurePdfLib();
          const canvases = await pdfToCanvases(file, (i, total) => {
            onStatus(`PDF ${file.name} — page ${i}/${total}`);
          });
          sources = canvases.map((c, idx) => ({ source: c, label: `${file.name} — p.${idx + 1}` }));
        } else {
          sources = [{ source: file, label: file.name || `Image ${fi + 1}` }];
        }
        for (const src of sources) {
          onStatus(`OCR Azure : ${src.label}`);
          const ocr = await ocrCanvasOrBlob(src.source, opts?.onProgress);
          if (ocr.engine === 'azure-read') usedAzure = true;
          if (ocr.engine === 'tesseract-fallback') {
            usedFallback = true;
            onStatus(`Repli Tesseract : ${src.label}`);
          }
          if (ocr.base64 && imagesBase64.length < 8) {
            imagesBase64.push(ocr.base64);
          }
          pages.push({
            id: `p_${pages.length}_${Date.now()}`,
            label: src.label,
            text: ocr.text,
            words: ocr.words,
            width: ocr.width,
            height: ocr.height,
            objectUrl: ocr.objectUrl,
            zoom: 1,
            engine: ocr.engine || 'azure-read',
          });
        }
      } catch (err) {
        const msg = err && err.message ? err.message : String(err || 'erreur');
        errors.push(`${file.name || 'fichier'}: ${msg}`);
        onStatus(`Échec ${file.name || 'fichier'} — suite des autres fichiers…`);
      }
    }

    const fullText = pages.map((p) => p.text).join('\n\n');
    let heurMappings = mapHeuristics(fullText, { prestataires: opts?.prestataires });
    let aiMappings = [];
    let aiError = null;

    if (pages.length && (opts?.fields || []).length) {
      try {
        onStatus('IA : lecture des cases / champs du formulaire…');
        aiMappings = await callAiFieldMapping({
          imagesBase64,
          ocrText: fullText,
          fields: opts.fields,
          workflow: opts.workflow,
          prestataires: opts.prestataires,
        });
        onStatus(`IA : ${aiMappings.length} champ(s) proposés`);
      } catch (e) {
        aiError = e && e.message ? e.message : String(e || 'erreur IA');
        console.warn('[Transcription OCR] Mapping IA', aiError);
        onStatus(`IA indisponible (${aiError}) — heuristiques seules`);
      }
    }

    const mappings = mergeMappings(heurMappings, aiMappings);
    if (errors.length && !pages.length) {
      throw new Error(errors.join(' — '));
    }
    let doneMsg = `Terminé (${pages.length} page(s)`;
    if (usedAzure) doneMsg += ', Azure';
    if (usedFallback) doneMsg += ', repli Tesseract';
    if (aiMappings.length) doneMsg += `, IA ${aiMappings.length} champs`;
    if (errors.length) doneMsg += `, ${errors.length} échec(s)`;
    doneMsg += ')';
    onStatus(doneMsg);
    return { pages, mappings, fullText, errors, aiError, aiCount: aiMappings.length };
  }

  async function terminateWorker() {
    if (!workerPromise) return;
    try {
      const w = await workerPromise;
      await w.terminate();
    } catch (_) {
      /* ignore */
    }
    workerPromise = null;
  }

  global.LocationTranscriptionOcr = {
    ensureLibs,
    processFiles,
    mapHeuristics,
    parseFrDate,
    revokeUrl,
    terminateWorker,
    callAiFieldMapping,
    MAX_OCR_WIDTH,
  };
})(window);
