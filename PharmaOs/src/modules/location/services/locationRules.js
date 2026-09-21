/**
 * Moteur de règles Location — port PhieEvreux rules-engine.js
 */
import { supabase } from '../../../shared/supabaseClient.js';

export const TYPE_LABELS = {
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

export const MOTIF_TO_TEMPLATE = {
  tens_max: 'reclame_appareil_tens',
  tire_lait_prolong_max: 'prolongation_tire_lait',
  pas_de_rendu: 'reclame_appareil',
  fin_location: 'prolongation',
  pas_de_prolongation: 'prolongation',
};

const MOTIF_PRIORITY = {
  tens_max: 10,
  tire_lait_prolong_max: 20,
  pas_de_rendu: 30,
  fin_location: 40,
  pas_de_prolongation: 50,
};

export function parseJson(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function addDuration(dateStr, duree, unite) {
  if (!dateStr || !duree) return null;
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const n = Number(duree);
  if (unite === 'jours') d.setDate(d.getDate() + n);
  else if (unite === 'semaines') d.setDate(d.getDate() + n * 7);
  else if (unite === 'mois') d.setMonth(d.getMonth() + n);
  else return null;
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  const da = new Date(`${a}T12:00:00`);
  const db = new Date(`${b}T12:00:00`);
  return Math.round((db - da) / 86400000);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

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

export function templateMotifFor(motif) {
  return MOTIF_TO_TEMPLATE[motif] || 'prolongation';
}

export function isGenericContactMotif(motif) {
  return GENERIC_CONTACT_MOTIFS.has(motif);
}

function sortContactReasons(reasons) {
  return (reasons || []).slice().sort((a, b) => {
    const pa = MOTIF_PRIORITY[a.motif] ?? 100;
    const pb = MOTIF_PRIORITY[b.motif] ?? 100;
    return pa - pb;
  });
}

export function pickContactMotif(reasons) {
  const list = sortContactReasons(reasons);
  if (!list.length) return 'fin_location';
  return list[0].motif;
}

export function resolveLgo(ctx, reasons, params) {
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
  const fin = ctx?.date_fin || null;
  const days = fin ? daysBetween(fin, todayISO()) : null;
  const ageMois = monthsApprox(days);
  const templateMotif =
    ageMois != null && ageMois >= seuilMois ? 'reclame_appareil' : 'prolongation';
  return { motif, template_id: null, templateMotif };
}

export function formatDateFr(iso) {
  if (!iso) return '';
  const s = String(iso).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function interpolate(text, vars) {
  if (text == null || text === '') return text;
  const map = vars || {};
  return String(text).replace(/\{(\w+)\}/g, (_, key) => {
    if (map[key] == null || map[key] === '') return `{${key}}`;
    return String(map[key]);
  });
}

export function varsFromConditions(cond, extra) {
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

function matchConditions(cond, ctx) {
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
    if (u === 'semaines') asMonths /= 4.345;
    else if (u === 'jours') asMonths /= 30.44;
    return asMonths > Number(cond.max_duree_prolongation);
  }
  if (cond.bascule_apres_mois != null) {
    const days = durationDays(ctx.date_debut, todayISO());
    if (days == null) return false;
    return monthsApprox(days) >= Number(cond.bascule_apres_mois);
  }
  return false;
}

export function typeLabel(type) {
  return TYPE_LABELS[type] || type || '—';
}

/** Facturation à jour portée par le prestataire → hors file contact. */
export function isFactureParPrestataire(ctx) {
  return ctx?.qui_facture === 'prestataire' || !!ctx?.facturation_prestataire;
}

export function evaluate(ctx, rules, params) {
  const alerts = [];
  const contactReasons = [];
  const actions = [];
  const list = (rules || []).filter((r) => r.actif !== false);
  const seuil = Number(params?.seuil_contact_jours ?? 7);
  const today = todayISO();
  // Valeur courante qui_facture / facturation_prestataire (peut changer en cours de location).
  const horsFileContact = isFactureParPrestataire(ctx);

  for (const rule of list) {
    if (rule.type_appareil && ctx.type_appareil && rule.type_appareil !== ctx.type_appareil) {
      continue;
    }
    const cond = parseJson(rule.conditions, {});
    const hit = matchConditions(cond, ctx);
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
      if (!horsFileContact) {
        contactReasons.push({
          motif: rule.code,
          message: item.message,
          fromRule: true,
          template_id: rule.template_id || null,
        });
      }
    } else if (rule.action === 'bascule_facture') {
      actions.push(item);
    } else {
      alerts.push(item);
    }
  }

  if (
    !horsFileContact
    && ctx.statut !== 'cloture'
    && ctx.statut !== 'annule'
    && ctx.statut !== 'en_attente'
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
    const k = `${r.motif}|${r.message}`;
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

/** Compat PhieEvreux : listRules(sb) — sb optionnel (client PharmaOs par défaut). */
export async function listRules(client) {
  const db = client && typeof client.from === 'function' ? client : supabase;
  const { data, error } = await db
    .from('location_regles')
    .select('*')
    .order('priorite', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

/** Compat : upsertRule(sb, row) | upsertRule(row) */
export async function upsertRule(clientOrRow, maybeRow) {
  const hasClient = clientOrRow && typeof clientOrRow.from === 'function';
  const db = hasClient ? clientOrRow : supabase;
  const row = hasClient ? maybeRow : clientOrRow;
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
  if (row.id) {
    const { data, error } = await db
      .from('location_regles')
      .update(payload)
      .eq('id', row.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await db.from('location_regles').insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data;
}

/** Compat : deleteRule(sb, id) | deleteRule(id) */
export async function deleteRule(clientOrId, maybeId) {
  const hasClient = clientOrId && typeof clientOrId.from === 'function';
  const db = hasClient ? clientOrId : supabase;
  const id = hasClient ? maybeId : clientOrId;
  const { error } = await db.from('location_regles').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
