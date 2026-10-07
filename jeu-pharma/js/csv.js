/**
 * Import / export CSV catalogue (sans IA).
 * Multi-valeurs séparées par `;` ; niveaux par `|`.
 */
(function (global) {
  const VALUE_SEP = ';';
  const NIVEAUX_SEP = '|';

  /** En-têtes / import : champs actifs uniquement (legacy ignorés). */
  function champs() {
    if (typeof global.JpConstants?.champsActifs === 'function') {
      return global.JpConstants.champsActifs();
    }
    return (global.JpConstants?.CHAMP_CODES || []).filter((c) => c.actif !== false);
  }

  function allChampCodes() {
    return (global.JpConstants?.CHAMP_CODES || []).map((c) => c.code);
  }

  const LEGACY_CODES = new Set([
    'posologie_generale',
    'grossesse_allaitement',
    'voies_administration',
  ]);

  function niveauCodes() {
    return (global.JpConstants?.NIVEAUX || []).map((n) => n.code);
  }

  /** En-têtes du modèle téléchargeable */
  function templateHeaders() {
    const headers = ['statut'];
    for (const c of champs()) {
      headers.push(c.code);
      headers.push(c.code + '_niveaux');
    }
    return headers;
  }

  function escapeCsvCell(v) {
    const s = String(v ?? '');
    if (/[",;\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCsv(rows, headers) {
    const lines = [headers.join(',')];
    for (const row of rows) {
      lines.push(headers.map((h) => escapeCsvCell(row[h])).join(','));
    }
    return lines.join('\n') + '\n';
  }

  function downloadBlob(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadTemplate() {
    const headers = templateHeaders();
    const example = { statut: 'brouillon' };
    for (const c of champs()) {
      if (c.card === 1) {
        example[c.code] = c.code === 'dci' ? 'ExempleDCI' : '';
        example[c.code + '_niveaux'] = 'apprenti|pharmacien|preparatrice|etu_3a|etu_4a|etu_6a';
      } else {
        example[c.code] = c.code === 'nom_commercial' ? 'ExempleMed;AutreNom' : '';
        example[c.code + '_niveaux'] =
          c.code === 'nom_commercial'
            ? 'apprenti|pharmacien|preparatrice|etu_3a|etu_4a|etu_6a'
            : 'apprenti|pharmacien';
      }
    }
    const csv = toCsv([example], headers);
    downloadBlob('jeu-pharma-modele.csv', '\uFEFF' + csv);
  }

  /** Parse CSV simple (virgules, guillemets). */
  function parseCsv(text) {
    const raw = String(text || '').replace(/^\uFEFF/, '');
    const rows = [];
    let i = 0;
    let field = '';
    let row = [];
    let inQuotes = false;
    while (i < raw.length) {
      const ch = raw[i];
      if (inQuotes) {
        if (ch === '"') {
          if (raw[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i++;
          continue;
        }
        field += ch;
        i++;
        continue;
      }
      if (ch === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (ch === ',') {
        row.push(field);
        field = '';
        i++;
        continue;
      }
      if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && raw[i + 1] === '\n') i++;
        row.push(field);
        field = '';
        if (row.some((c) => String(c).trim() !== '')) rows.push(row);
        row = [];
        i++;
        continue;
      }
      field += ch;
      i++;
    }
    if (field.length || row.length) {
      row.push(field);
      if (row.some((c) => String(c).trim() !== '')) rows.push(row);
    }
    if (!rows.length) return { headers: [], records: [] };
    const headers = rows[0].map((h) => String(h).trim());
    const records = rows.slice(1).map((r) => {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = r[idx] != null ? String(r[idx]).trim() : '';
      });
      return obj;
    });
    return { headers, records };
  }

  function parseNiveaux(str) {
    if (!str || !String(str).trim()) return [];
    const allowed = new Set(niveauCodes());
    return String(str)
      .split(NIVEAUX_SEP)
      .map((s) => s.trim())
      .filter((s) => s && allowed.has(s));
  }

  function parseMultiValues(str) {
    if (!str || !String(str).trim()) return [];
    return String(str)
      .split(VALUE_SEP)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /**
   * Dry-run : valide lignes sans écrire.
   * @returns {{ ok: boolean, errors: {line:number, message:string}[], preview: object[], records: object[] }}
   */
  function dryRun(text) {
    const { headers, records } = parseCsv(text);
    const errors = [];
    const expected = new Set(templateHeaders());
    const knownBase = new Set(allChampCodes());
    // Colonnes legacy acceptées en lecture seule (ignorées à l’import) ; autres inconnues = erreur.
    for (const h of headers) {
      if (!h) continue;
      if (expected.has(h) || h === 'statut') continue;
      const base = h.endsWith('_niveaux') ? h.slice(0, -'_niveaux'.length) : h;
      if (LEGACY_CODES.has(base)) continue;
      if (!knownBase.has(base) && h !== 'statut') {
        errors.push({
          line: 1,
          message: 'Colonne inconnue: ' + h,
        });
      }
    }
    // Colonnes actives non obligatoires (absence OK) — au moins statut conseillé.
    if (!headers.includes('statut') && !headers.includes('dci') && !headers.includes('nom_commercial')) {
      errors.push({
        line: 1,
        message: 'Colonnes requises absentes: statut ou dci / nom_commercial',
      });
    }
    const allowedStatuts = new Set(
      (global.JpConstants?.STATUTS_FICHE || []).map((s) => s.code)
    );
    const preview = [];
    records.forEach((rec, idx) => {
      const line = idx + 2;
      const statut = rec.statut || 'brouillon';
      if (!allowedStatuts.has(statut)) {
        errors.push({ line, message: 'Statut invalide: ' + statut });
      }
      const noms = parseMultiValues(rec.nom_commercial || '');
      const dci = rec.dci || '';
      if (!noms.length && !dci) {
        errors.push({ line, message: 'Au moins nom_commercial ou dci requis' });
      }
      for (const c of champs()) {
        const nivKey = c.code + '_niveaux';
        if (rec[nivKey]) {
          const rawParts = String(rec[nivKey])
            .split(NIVEAUX_SEP)
            .map((s) => s.trim())
            .filter(Boolean);
          const bad = rawParts.filter((p) => !niveauCodes().includes(p));
          if (bad.length) {
            errors.push({
              line,
              message: 'Niveaux inconnus (' + c.code + '): ' + bad.join(', '),
            });
          }
        }
      }
      preview.push({
        line,
        statut,
        nom_commercial: noms.join(VALUE_SEP),
        dci,
        secteur: rec.secteur_therapeutique || '',
      });
    });
    return { ok: errors.length === 0, errors, preview, records };
  }

  /** Import réel après dry-run OK. */
  async function importRecords(records) {
    const results = { created: 0, errors: [] };
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      const line = i + 2;
      try {
        const singular = {};
        const multi = {};
        for (const c of champs()) {
          const niveaux = parseNiveaux(rec[c.code + '_niveaux']);
          if (c.card === 1) {
            const v = rec[c.code];
            if (v) {
              singular[c.code] = {
                valeur: v,
                niveaux_connus: niveaux,
                mergeNiveaux: true,
              };
            }
          } else {
            const vals = parseMultiValues(rec[c.code]);
            multi[c.code] = vals.map((valeur) => ({
              valeur,
              niveaux_connus: niveaux,
              mergeNiveaux: true,
            }));
          }
        }
        // save() fusionne par DCI si une fiche active existe déjà
        await global.JpMedicaments.save({
          statut: rec.statut || 'brouillon',
          singular,
          multi,
        });
        results.created++;
      } catch (e) {
        results.errors.push({
          line,
          message: e?.message || String(e),
        });
      }
    }
    void global.JpLogs?.action?.('csv_import', {
      created: results.created,
      errors: results.errors.length,
    });
    return results;
  }

  function formatMulti(arr) {
    if (!Array.isArray(arr)) return '';
    return arr
      .map((x) => (typeof x === 'string' ? x : x?.valeur))
      .filter(Boolean)
      .join(VALUE_SEP);
  }

  function formatNiveaux(arr) {
    if (!Array.isArray(arr)) return '';
    return arr.join(NIVEAUX_SEP);
  }

  async function exportCatalogue(opts = {}) {
    const rows = await global.JpMedicaments.list({
      statut: opts.statut || null,
      publieOnly: false,
    });
    const headers = templateHeaders();
    const out = rows.map((r) => {
      const obj = { statut: r.statut || '' };
      for (const c of champs()) {
        if (c.card === 1) {
          obj[c.code] = r[c.code] || '';
          const nivKey =
            c.code === 'dci'
              ? 'dci_niveaux'
              : c.code === 'secteur_therapeutique'
                ? 'secteur_niveaux'
                : c.code === 'classe_therapeutique'
                  ? 'classe_therapeutique_niveaux'
                  : c.code === 'classe_pharmacologique'
                    ? 'classe_pharmacologique_niveaux'
                    : null;
          obj[c.code + '_niveaux'] = nivKey ? formatNiveaux(r[nivKey]) : '';
        } else if (c.code === 'nom_commercial') {
          obj[c.code] = formatMulti(r.noms_commerciaux);
          obj[c.code + '_niveaux'] = formatNiveaux(r.nom_commercial_niveaux || []);
        } else {
          obj[c.code] = formatMulti(r[c.code]);
          obj[c.code + '_niveaux'] = '';
        }
      }
      return obj;
    });
    const csv = toCsv(out, headers);
    downloadBlob('jeu-pharma-export.csv', '\uFEFF' + csv);
    void global.JpLogs?.action?.('csv_export', { count: out.length });
    return out.length;
  }

  global.JpCsv = {
    VALUE_SEP,
    NIVEAUX_SEP,
    templateHeaders,
    downloadTemplate,
    parseCsv,
    dryRun,
    importRecords,
    exportCatalogue,
  };
})(window);
