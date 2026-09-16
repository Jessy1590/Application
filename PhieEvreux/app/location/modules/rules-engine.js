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

  const ENCART_DEFAUT = {
    aerosol: 'Aérosolthérapie — préciser masque (facturé / offert). Joindre copie d’ordonnance.',
    tire_lait: 'Tire-lait — modèle / MUT à jour / date d’accouchement. Location initiale 10 semaines.',
    pese_bebe: 'Pèse-bébé — à faire régler d’avance. Location à la semaine ou au mois.',
    tens: 'Neurostimulateur (TENS) — électrodes (offerts / facturés / non délivrés) et modèle. Max 6 mois.',
    fauteuil: 'Fauteuil — bascule facturation prestataire après 2 mois (paramétrable).',
    autre: '',
  };

  function parseJson(v, fallback) {
    if (v == null) return fallback;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch (_) { return fallback; }
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

  /** Motif file Contact (code règle / seuil) → motif template. */
  const MOTIF_TO_TEMPLATE = {
    tens_max: 'reclame_appareil_tens',
    tire_lait_prolong_max: 'prolongation_tire_lait',
    pas_de_rendu: 'reclame_appareil',
  };

  function templateMotifFor(motif) {
    return MOTIF_TO_TEMPLATE[motif] || 'prolongation';
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
      ...(extra || {}),
    };
  }

  /**
   * @param {object} ctx
   * @param {string} [ctx.type_appareil]
   * @param {string} [ctx.date_debut]
   * @param {string} [ctx.date_fin] date fin courante (dernière prolongation)
   * @param {boolean} [ctx.appareil_rendu]
   * @param {string} [ctx.qui_facture]
   * @param {boolean} [ctx.facturation_prestataire]
   * @param {boolean} [ctx.has_prolongation] au moins une prolongation au-delà de l’initiale
   * @param {number} [ctx.prolong_duree]
   * @param {string} [ctx.prolong_unite]
   * @param {object[]} rules
   * @param {object} [params] map cle -> valeur
   */
  function evaluate(ctx, rules, params) {
    const infos = [];
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
      const msgVars = varsFromConditions(cond, { date_min: ctx.date_fin || '' });
      const rawMsg = rule.message || rule.nom;
      const message = interpolate(rawMsg, msgVars);

      if (rule.action === 'info_creation') {
        if (!ctx.type_appareil || !rule.type_appareil || rule.type_appareil === ctx.type_appareil) {
          infos.push({ code: rule.code, message, rule });
        }
        continue;
      }

      if (!hit) continue;

      const item = { code: rule.code, message, action: rule.action, rule };
      if (rule.action === 'alerte_contact' || rule.action === 'bloquer_ou_alerter') {
        alerts.push(item);
        contactReasons.push({ motif: rule.code, message: item.message });
      } else if (rule.action === 'bascule_facture') {
        actions.push(item);
      } else {
        alerts.push(item);
      }
    }

    // File contact générique : fin proche / dépassée sans rendu
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
          });
        } else if (delta <= seuil && !ctx.appareil_rendu) {
          contactReasons.push({
            motif: 'fin_location',
            message: `Fin de location dans ${delta} j (seuil J-${seuil}).`,
          });
        }
        if (delta <= seuil && ctx.has_prolongation === false && !ctx.appareil_rendu) {
          contactReasons.push({
            motif: 'pas_de_prolongation',
            message: 'Pas de prolongation enregistrée alors que la fin approche.',
          });
        }
      }
    }

    // Dédup motifs
    const seen = new Set();
    const uniqueReasons = [];
    for (const r of contactReasons) {
      const k = r.motif + '|' + r.message;
      if (seen.has(k)) continue;
      seen.add(k);
      uniqueReasons.push(r);
    }

    return { infos, alerts, contactReasons: uniqueReasons, actions, shouldContact: uniqueReasons.length > 0 };
  }

  function matchConditions(cond, ctx, rule) {
    if (cond.rappel_electrodes || cond.facturer_masque || cond.regler_avance) {
      // info only — handled separately
      return false;
    }
    if (cond.duree_initiale != null) return false;

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

  function infosForType(type, rules) {
    return evaluate({ type_appareil: type }, rules, {}).infos;
  }

  function encartDefaut(type) {
    return ENCART_DEFAUT[type] || '';
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
      updated_at: new Date().toISOString(),
    };
    if (id) {
      const { data, error } = await sb.from('location_regles').update(payload).eq('id', id).select().single();
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
    ENCART_DEFAUT,
    MOTIF_TO_TEMPLATE,
    parseJson,
    addDuration,
    daysBetween,
    todayISO,
    interpolate,
    varsFromConditions,
    templateMotifFor,
    evaluate,
    infosForType,
    encartDefaut,
    typeLabel,
    listRules,
    upsertRule,
    deleteRule,
  };
})(window);
