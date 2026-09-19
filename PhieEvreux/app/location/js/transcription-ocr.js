/**
 * OCR Transcription — Tesseract.js + pdf.js (CDN jsDelivr) + heuristiques FR.
 * Images/PDF uniquement en mémoire (blob) — pas de stockage distant.
 */
(function (global) {
  const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  const PDFJS_CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
  const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const MAX_OCR_WIDTH = 1600;

  let libsPromise = null;
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

  async function ensureLibs() {
    if (libsPromise) return libsPromise;
    libsPromise = (async () => {
      await Promise.all([loadScript(TESSERACT_CDN), loadScript(PDFJS_CDN)]);
      if (!global.Tesseract) throw new Error('Tesseract.js indisponible');
      if (!global.pdfjsLib) throw new Error('pdf.js indisponible');
      global.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    })();
    return libsPromise;
  }

  async function getWorker(onProgress) {
    await ensureLibs();
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

  async function pdfToCanvases(file, onPage) {
    await ensureLibs();
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

  /**
   * @returns {Promise<{ text: string, words: { text: string, bbox: { x0,y0,x1,y1 }, confidence: number }[], width: number, height: number, objectUrl: string, blob: Blob }>}
   */
  async function ocrCanvasOrBlob(source, onProgress) {
    const resized = await resizeToCanvas(source, MAX_OCR_WIDTH);
    const worker = await getWorker(onProgress);
    const result = await worker.recognize(resized.canvas);
    const data = result?.data || {};
    const words = (data.words || [])
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
    return {
      text: String(data.text || '').trim(),
      words,
      width: resized.width,
      height: resized.height,
      objectUrl: resized.objectUrl,
      blob: resized.blob,
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

  function findMatricule(text) {
    const m =
      text.match(/\b([A-Z]\d{6,12})\b/) ||
      text.match(/\b(n[°o]\s*s[eé]rie[:\s]*)([A-Z0-9\-]{5,})/i) ||
      text.match(/\bmatricule[:\s]*([A-Z0-9\-]{5,})/i);
    if (!m) return null;
    return (m[2] || m[1] || '').replace(/^n[°o]\s*s[eé]rie[:\s]*/i, '').trim() || null;
  }

  function findPhone(text) {
    const m = text.match(/(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/);
    if (!m) return null;
    return m[0].replace(/[^\d+]/g, '').replace(/^33/, '0');
  }

  function findNomPrenom(text) {
    let raw = afterLabel(text, ['nom / prenom', 'nom/prenom', 'nom et prenom', 'destinataire'], {
      untilLine: true,
      maxLen: 80,
    });
    if (!raw) {
      const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        const m = line.match(/^([A-ZÀÂÄÉÈÊËÏÎÔÖÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÔÖÙÛÜÇ' -]{1,})[,\s]+([A-Za-zÀ-ÿ' -]{2,})$/);
        if (m) return { nom: m[1].trim(), prenom: m[2].trim() };
      }
      return null;
    }
    const parts = raw.split(/[\/,]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) return { nom: parts[0], prenom: parts[1] };
    const sp = raw.split(/\s+/);
    if (sp.length >= 2) return { nom: sp[0], prenom: sp.slice(1).join(' ') };
    return { nom: raw, prenom: '' };
  }

  function matchPrestataireOrkyn(prestataires) {
    const list = prestataires || [];
    const hit = list.find((p) => /orkyn/i.test(p.nom || ''));
    return hit || null;
  }

  /**
   * Heuristiques FR → propositions de mapping (code → valeur).
   * @param {string} fullText
   * @param {{ prestataires?: object[] }} [ctx]
   * @returns {{ code: string, value: string|number|boolean, confidence: number }[]}
   */
  function mapHeuristics(fullText, ctx) {
    const text = String(fullText || '');
    const out = [];
    const push = (code, value, confidence) => {
      if (value == null || value === '') return;
      out.push({ code, value, confidence: confidence ?? 0.6 });
    };

    const np = findNomPrenom(text);
    if (np) {
      if (np.nom) push('patient_nom', np.nom, 0.7);
      if (np.prenom) push('patient_prenom', np.prenom, 0.7);
    }

    const dn =
      afterLabel(text, ['date de naissance', 'ne(e) le', 'nee le', 'né le', 'née le'], {
        pattern: /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/,
      }) || afterLabel(text, ['date de naissance'], { untilLine: true });
    const dnIso = parseFrDate(dn);
    if (dnIso) push('patient_date_naissance', dnIso, 0.75);

    const adresse = afterLabel(text, ['adresse'], { untilLine: true, maxLen: 120 });
    if (adresse && adresse.length > 5) push('patient_adresse', adresse, 0.55);

    const tel = findPhone(text);
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

    return out;
  }

  /**
   * Traite une liste de File (images + PDF) → pages OCR.
   * @param {FileList|File[]} files
   * @param {{ onStatus?: function, onProgress?: function, prestataires?: object[] }} [opts]
   */
  async function processFiles(files, opts) {
    const list = [...(files || [])];
    if (!list.length) return { pages: [], mappings: [] };
    await ensureLibs();
    const pages = [];
    const onStatus = opts?.onStatus || (() => {});

    for (let fi = 0; fi < list.length; fi += 1) {
      const file = list[fi];
      const isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
      onStatus(`Préparation ${file.name || 'fichier'}…`);
      let sources = [];
      if (isPdf) {
        const canvases = await pdfToCanvases(file, (i, total) => {
          onStatus(`PDF ${file.name} — page ${i}/${total}`);
        });
        sources = canvases.map((c, idx) => ({ source: c, label: `${file.name} — p.${idx + 1}` }));
      } else {
        sources = [{ source: file, label: file.name || `Image ${fi + 1}` }];
      }
      for (const src of sources) {
        onStatus(`OCR : ${src.label}`);
        const ocr = await ocrCanvasOrBlob(src.source, opts?.onProgress);
        pages.push({
          id: `p_${pages.length}_${Date.now()}`,
          label: src.label,
          text: ocr.text,
          words: ocr.words,
          width: ocr.width,
          height: ocr.height,
          objectUrl: ocr.objectUrl,
        });
      }
    }

    const fullText = pages.map((p) => p.text).join('\n\n');
    const mappings = mapHeuristics(fullText, { prestataires: opts?.prestataires });
    onStatus('Terminé');
    return { pages, mappings, fullText };
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
    MAX_OCR_WIDTH,
  };
})(window);
