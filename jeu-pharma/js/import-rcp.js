/**
 * Pipeline import RCP — sas de validation (jamais de publication auto).
 * Adaptateur indépendant de la source ; produit des connaissances brouillon/a_valider.
 */
(function (global) {
  function sb() {
    return global.JpApp.sbJeu();
  }

  /**
   * Enregistre une source RCP + version + import, puis crée des connaissances a_valider.
   * @param {{
   *   source_code: string,
   *   source_libelle: string,
   *   version_label: string,
   *   reference_externe?: string,
   *   items: Array<{ matrice_id: string, champ_code: string, texte: string, entite_id?: string|null, ordre?: number }>
   * }} payload
   */
  async function importerVersSas(payload) {
    const user = await global.JpApp.getUser();
    if (!user) throw new Error('Non authentifié');
    if (!(await global.JpApp.isAdmin())) throw new Error('Réservé admin');

    const code = String(payload.source_code || '').trim();
    const libelle = String(payload.source_libelle || code).trim();
    const versionLabel = String(payload.version_label || '').trim();
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!code || !versionLabel) throw new Error('source_code et version_label requis');
    if (!items.length) throw new Error('Aucun item à importer');

    let sourceId;
    {
      const { data: existing } = await sb()
        .from('sources_contenu')
        .select('id')
        .eq('code', code)
        .maybeSingle();
      if (existing?.id) {
        sourceId = existing.id;
      } else {
        const { data, error } = await sb()
          .from('sources_contenu')
          .insert({
            code,
            libelle,
            type_source: 'rcp',
            description: 'Import RCP — sas validation',
            created_by: user.id,
          })
          .select('id')
          .single();
        if (error) throw error;
        sourceId = data.id;
      }
    }

    let versionId;
    {
      const { data: existing } = await sb()
        .from('versions_source')
        .select('id')
        .eq('source_id', sourceId)
        .eq('version_label', versionLabel)
        .maybeSingle();
      if (existing?.id) {
        versionId = existing.id;
        await sb()
          .from('versions_source')
          .update({ statut: 'a_valider', reference_externe: payload.reference_externe || null })
          .eq('id', versionId);
      } else {
        const { data, error } = await sb()
          .from('versions_source')
          .insert({
            source_id: sourceId,
            version_label: versionLabel,
            reference_externe: payload.reference_externe || null,
            statut: 'a_valider',
            notes: 'Import automatique — validation humaine requise',
            created_by: user.id,
          })
          .select('id')
          .single();
        if (error) throw error;
        versionId = data.id;
      }
    }

    const { data: importRow, error: impErr } = await sb()
      .from('imports_source')
      .insert({
        source_id: sourceId,
        version_source_id: versionId,
        statut: 'en_cours',
        resume_json: { nb_items: items.length },
        created_by: user.id,
      })
      .select('id')
      .single();
    if (impErr) throw impErr;

    const erreurs = [];
    let inserted = 0;
    let skipped = 0;

    function normaliser(t) {
      return String(t || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
    }

    for (const item of items) {
      try {
        if (!item.matrice_id || !item.champ_code || !item.texte) {
          skipped += 1;
          continue;
        }
        const { error } = await sb().from('connaissances').insert({
          matrice_id: item.matrice_id,
          champ_code: item.champ_code,
          entite_id: item.entite_id || null,
          texte: String(item.texte).trim(),
          texte_norm: normaliser(item.texte),
          statut: 'a_valider',
          source_id: sourceId,
          version_source_id: versionId,
          ordre: item.ordre || 0,
          created_by: user.id,
        });
        if (error) {
          if (/duplicate|unique|connaissances_matrice/i.test(error.message || '')) {
            skipped += 1;
          } else {
            erreurs.push({ item, message: error.message });
          }
        } else {
          inserted += 1;
        }
      } catch (e) {
        erreurs.push({ item, message: e.message || String(e) });
      }
    }

    const resume = {
      inserted,
      skipped,
      errors: erreurs.length,
      note: 'Aucune publication automatique — valider puis publier dans un parcours.',
    };

    await sb()
      .from('imports_source')
      .update({
        statut: erreurs.length && !inserted ? 'erreur' : 'termine',
        resume_json: resume,
        erreurs_json: erreurs.slice(0, 50),
        finished_at: new Date().toISOString(),
      })
      .eq('id', importRow.id);

    void global.JpLogs?.action?.('v2_rcp_import', resume);
    return {
      source_id: sourceId,
      version_source_id: versionId,
      import_id: importRow.id,
      ...resume,
    };
  }

  /**
   * Diff simplifié entre deux jeux de textes (ajout / retrait).
   */
  function diffTextes(ancien, nouveau) {
    const a = new Set((ancien || []).map((t) => String(t).trim().toLowerCase()));
    const b = new Set((nouveau || []).map((t) => String(t).trim().toLowerCase()));
    const ajouts = [...b].filter((x) => !a.has(x));
    const retraits = [...a].filter((x) => !b.has(x));
    return { ajouts, retraits, inchanges: [...b].filter((x) => a.has(x)).length };
  }

  global.JpV2ImportRcp = {
    importerVersSas,
    diffTextes,
  };
})(window);
