/**
 * Moteur de règles Location — évaluation + helpers CRUD (admin).
 * Table : phieevreux.location_regles
 */
(function (global) {
  const TYPE_LABELS = {
    aerosol: 'Aérosol',
    tire_lait: 'Tire-lait',
    pese_bebe: 'Pèse-bébé',
    tens: 'TENS',
    fauteuil: 'Fauteuil',
    autre: 'Autre',
  };

  const GENERIC_CONTACT_MOTIFS = new Set([
    'fin_location',
    'pas_de_rendu',
    'pas_de_prolongation',
  ]);

  /** Motif file Contact (code règle / seuil) → motif template (fallback). */
  const MOTIF_TO_TEMPLATE = {
    tens_max: 'reclame_appareil_tens',
    tire_lait_prolong_max: 'prolongation_tire_lait',
    pas_de_rendu: 'reclame_appareil',
    fin_location: 'prolongation',
    pas_de_prolongation: 'prolongation',
  };

  /** Plus petit = prioritaire quand plusieurs raisons Contact. */
  const MOTIF_PRIORITY = {
    tens_max: 10,
    tire_lait_prolong_max: 20,
    pas_de_rendu: 30,
    fin_location: 40,
    pas_de_prolongation: 50,
  };

  function parseJson(v, fallback) {
    if (v == null) return fallback;
    if (typeof v === 'object') return v;
    try {
      return JSON.parse(v);
    } catch (_) {
      return fallback;
    }
  }

  function addDuration(dateStr, duree, unite) {
    if (!dateStr || !duree) return null;
    const d = new Date(dateStr + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return null;
    const n = Number(duree);
    if (unite === 'jours') d.setDate(d.getDate() + n);
    else if (unite === 'semaines') d.setDate(d.getDate() + n * 7);
    else if (unite === 'mois') d.setMonth(d.getMonth() + n);
    else return null;
    return d.toISOString().slice(0, 10);
  }

  function daysBetween(a, b) {
    const da = new Date(a + 'T12:00:00');
    const db = new Date(b + 'T12:00:00');
    return Math.round((db - da) / 86400000);
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  /** Durée totale en jours approximative depuis début jusqu’à date_fin courante. */
  function durationDays(start, end) {
    if (!start || !end) return null;
    return daysBetween(start, end);
  }

  function monthsApprox(days) {
    if (days == null) return null;
    return days / 30.44;
  }

  function weeksApprox(days) {
    if (days == null) return null;
    return days / 7;
  }

  function templateMotifFor(motif) {
    return MOTIF_TO_TEMPLATE[motif] || 'prolongation';
  }

  function isGenericContactMotif(motif) {
    return GENERIC_CONTACT_MOTIFS.has(motif);
  }

  function sortContactReasons(reasons) {
    return (reasons || []).slice().sort((a, b) => {
      const pa = MOTIF_PRIORITY[a.motif] ?? 100;
      const pb = MOTIF_PRIORITY[b.motif] ?? 100;
      return pa - pb;
    });
  }

  function pickContactMotif(reasons) {
    const list = sortContactReasons(reasons);
    if (!list.length) return 'fin_location';
    return list[0].motif;
  }

  /**
   * Résout le message LGO :
   * 1) règle dépassée → template_id de la règle (sinon motif template mappé) ;
   * 2) sinon générique → mois écoulés depuis la fin de la dernière prolongation
   *    (date_fin) vs seuil_reclame_mois → prolongation | reclame_appareil.
   */
  function resolveLgo(ctx, reasons, params) {
    const sorted = sortContactReasons(reasons);
    const ruleReason = sorted.find((r) => r.fromRule);
    if (ruleReason) {
      return {
        motif: ruleReason.motif,
        template_id: ruleReason.template_id || null,
        templateMotif: templateMotifFor(ruleReason.motif),
      };
    }
    const motif = sorted[0]?.motif || 'fin_location';
    const seuilMois = Number(params?.seuil_reclame_mois ?? 6);
    // Âge = depuis la fin courante (dernière prolongation), pas depuis date_debut.
    const fin = ctx?.date_fin || null;
    const days = fin ? daysBetween(fin, todayISO()) : null;
    const ageMois = monthsApprox(days);
    const templateMotif =
      ageMois != null && ageMois >= seuilMois ? 'reclame_appareil' : 'prolongation';
    return {
      motif,
      template_id: null,
      templateMotif,
    };
  }

  function formatDateFr(iso) {
    if (!iso) return '';
    const s = String(iso).slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return s;
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  function interpolate(text, vars) {
    if (text == null || text === '') return text;
    const map = vars || {};
    return String(text).replace(/\{(\w+)\}/g, (_, key) => {
      if (map[key] == null || map[key] === '') return `{${key}}`;
      return String(map[key]);
    });
  }

  function varsFromConditions(cond, extra) {
    const c = cond || {};
    return {
      max_duree: c.max_duree != null ? c.max_duree : '',
      unite: c.unite || '',
      max_duree_prolongation: c.max_duree_prolongation != null ? c.max_duree_prolongation : '',
      bascule_apres_mois: c.bascule_apres_mois != null ? c.bascule_apres_mois : '',
      date_min: '',
      type_appareil: '',
      ...(extra || {}),
    };
  }

  /**
   * @param {object} ctx
   * @param {object[]} rules
   * @param {object} [params]
   */
  function evaluate(ctx, rules, params) {
    const alerts = [];
    const contactReasons = [];
    const actions = [];
    const list = (rules || []).filter((r) => r.actif !== false);
    const seuil = Number(params?.seuil_contact_jours ?? 7);
    const today = todayISO();

    for (const rule of list) {
      if (rule.type_appareil && ctx.type_appareil && rule.type_appareil !== ctx.type_appareil) {
        continue;
      }
      const cond = parseJson(rule.conditions, {});
      const hit = matchConditions(cond, ctx, rule);
      const msgVars = varsFromConditions(cond, {
        date_min: formatDateFr(ctx.date_fin) || ctx.date_fin || '',
        type_appareil: ctx.type_appareil ? typeLabel(ctx.type_appareil) : '',
      });
      const rawMsg = rule.message || rule.nom;
      const message = interpolate(rawMsg, msgVars);

      if (!hit) continue;

      const item = { code: rule.code, message, action: rule.action, rule };
      if (rule.action === 'alerte_contact' || rule.action === 'bloquer_ou_alerter') {
        alerts.push(item);
        contactReasons.push({
          motif: rule.code,
          message: item.message,
          fromRule: true,
          template_id: rule.template_id || null,
        });
      } else if (rule.action === 'bascule_facture') {
        actions.push(item);
      } else {
        alerts.push(item);
      }
    }

    if (
      ctx.qui_facture !== 'prestataire' &&
      !ctx.facturation_prestataire &&
      ctx.statut !== 'cloture' &&
      ctx.statut !== 'annule'
    ) {
      if (ctx.date_fin) {
        const delta = daysBetween(today, ctx.date_fin);
        if (delta < 0 && !ctx.appareil_rendu) {
          contactReasons.push({
            motif: 'pas_de_rendu',
            message: 'Fin de location dépassée — appareil non rendu.',
            fromRule: false,
          });
        } else if (delta <= seuil && !ctx.appareil_rendu) {
          contactReasons.push({
            motif: 'fin_location',
            message: `Fin de location dans ${delta} j (seuil J-${seuil}).`,
            fromRule: false,
          });
        }
        if (delta <= seuil && ctx.has_prolongation === false && !ctx.appareil_rendu) {
          contactReasons.push({
            motif: 'pas_de_prolongation',
            message: 'Pas de prolongation enregistrée alors que la fin approche.',
            fromRule: false,
          });
        }
      }
    }

    const seen = new Set();
    const uniqueReasons = [];
    for (const r of contactReasons) {
      const k = r.motif + '|' + r.message;
      if (seen.has(k)) continue;
      seen.add(k);
      uniqueReasons.push(r);
    }

    return {
      alerts,
      contactReasons: uniqueReasons,
      actions,
      shouldContact: uniqueReasons.length > 0,
    };
  }

  function matchConditions(cond, ctx, rule) {
    if (cond.max_duree != null && cond.unite) {
      const days = durationDays(ctx.date_debut, ctx.date_fin || todayISO());
      if (days == null) return false;
      if (cond.unite === 'mois') return monthsApprox(days) > Number(cond.max_duree);
      if (cond.unite === 'semaines') return weeksApprox(days) > Number(cond.max_duree);
      if (cond.unite === 'jours') return days > Number(cond.max_duree);
    }

    if (cond.max_duree_prolongation != null && ctx.prolong_duree != null) {
      const u = ctx.prolong_unite || cond.unite;
      let asMonths = Number(ctx.prolong_duree);
      if (u === 'semaines') asMonths = asMonths / 4.345;
      else if (u === 'jours') asMonths = asMonths / 30.44;
      return asMonths > Number(cond.max_duree_prolongation);
    }

    if (cond.bascule_apres_mois != null) {
      const days = durationDays(ctx.date_debut, todayISO());
      if (days == null) return false;
      return monthsApprox(days) >= Number(cond.bascule_apres_mois);
    }

    return false;
  }

  function typeLabel(type) {
    return TYPE_LABELS[type] || type || '—';
  }

  async function listRules(sb) {
    const { data, error } = await sb
      .from('location_regles')
      .select('*')
      .order('priorite', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function upsertRule(sb, row) {
    const id = row.id;
    const payload = {
      code: row.code,
      nom: row.nom,
      type_appareil: row.type_appareil || null,
      conditions: row.conditions || {},
      action: row.action,
      message: row.message || null,
      actif: row.actif !== false,
      priorite: row.priorite ?? 100,
      template_id: row.template_id || null,
      updated_at: new Date().toISOString(),
    };
    if (id) {
      const { data, error } = await sb
        .from('location_regles')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    const { data, error } = await sb.from('location_regles').insert(payload).select().single();
    if (error) throw error;
    return data;
  }

  async function deleteRule(sb, id) {
    const { error } = await sb.from('location_regles').delete().eq('id', id);
    if (error) throw error;
  }

  global.LocationRules = {
    TYPE_LABELS,
    MOTIF_TO_TEMPLATE,
    MOTIF_PRIORITY,
    GENERIC_CONTACT_MOTIFS,
    parseJson,
    addDuration,
    daysBetween,
    todayISO,
    formatDateFr,
    interpolate,
    varsFromConditions,
    templateMotifFor,
    isGenericContactMotif,
    pickContactMotif,
    resolveLgo,
    evaluate,
    typeLabel,
    listRules,
    upsertRule,
    deleteRule,
  };
})(window);
