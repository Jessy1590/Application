import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Inbox, Pencil, Phone, Activity, ShieldAlert, PackageX,
  Scale, CalendarClock, FlaskConical, Home, Users, Wallet,
  Pill, FileText, MessageSquareHeart, Package,
} from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import {
  CALL_MOTIFS,
  CALL_STATUTS_COMPTOIR,
  labelCallMotif,
  labelCallStatut,
} from '../../calls/services/callService.js';
import {
  DISPUTE_TYPES,
  disputeRowToForm,
} from '../../disputes/services/disputeService.js';
import DisputeForm from '../../disputes/shared/DisputeForm.jsx';
import PerimeForm from '../../perimes/shared/PerimeForm.jsx';
import { PERIME_STATUS_LABELS } from '../../perimes/services/perimesService.js';
import {
  ABSENCE_TYPE_LABELS,
  CHANGE_TYPE_LABELS,
  labelAbsenceType,
  labelAbsenceStatut,
  labelChangeType,
} from '../../hr/services/hrService.js';
import { MAGISTRAL_STATUTS } from '../../magistral/services/magistralService.js';
import { STUPEFIANT_STATUS_LABELS } from '../../stupefiants/services/stupefiantService.js';
import {
  fetchInboxItems,
  updateMyCall,
  updateMyIp,
  updateMyQuality,
  updateMyStock,
  updateMyDispute,
  updateMyPerime,
  updateMyMagistral,
  updateMyLocationDossier,
  updateMyLocationContact,
  updateMyHrAbsence,
  updateMyHrSchedule,
  updateMyCash,
  updateMyStupefiant,
  updateMyPslUnit,
  updateMyPslMovement,
  updateMyDocument,
  updateMyConseil,
} from '../services/inboxService.js';

const inputCls = 'w-full p-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--input-bg)] text-[var(--fg)] focus:ring-2 focus:ring-[var(--ring)] focus:outline-none';

/** Chips — id = clé dans data.editable (sauf all). */
const SAISIES_CHIPS = [
  { id: 'all', label: 'Tout' },
  { id: 'calls', label: 'Appels' },
  { id: 'ips', label: 'IP' },
  { id: 'quality', label: 'Qualité' },
  { id: 'stock', label: 'Stock' },
  { id: 'disputes', label: 'Litiges' },
  { id: 'perimes', label: 'Périmés' },
  { id: 'magistral', label: 'Magistrales' },
  { id: 'location_dossiers', label: 'Location' },
  { id: 'location_contacts', label: 'Contacts loc.' },
  { id: 'hr_absences', label: 'Absences' },
  { id: 'hr_schedules', label: 'Horaires' },
  { id: 'cash', label: 'Caisse' },
  { id: 'stupefiants', label: 'Stupéfiants' },
  { id: 'psl_units', label: 'MDS unités' },
  { id: 'psl_movements', label: 'MDS mouvements' },
  { id: 'documents', label: 'Documents' },
  { id: 'conseils', label: 'Conseils' },
];

const FIELD_LABELS = {
  contact_nom: 'Interlocuteur',
  numero: 'Numéro',
  motif: 'Motif',
  statut_traitement: 'Statut',
  notes_appel: 'Notes',
  patient_initiales: 'Initiales patient',
  medicament_en_cause: 'Médicament en cause',
  probleme_identifie: 'Problème identifié',
  statut_ip: 'Statut IP',
  type: 'Type',
  severity: 'Sévérité',
  description: 'Description',
  status: 'Statut',
  medicament: 'Médicament',
  cip: 'CIP',
  quantite_theorique: 'Qté théorique',
  quantite_constatee: 'Qté constatée',
  formule: 'Formule',
  quantite: 'Quantité',
  forme: 'Forme',
  statut: 'Statut',
  notes: 'Notes',
  patient_phone: 'Téléphone patient',
  patient_email: 'E-mail patient',
  code_op: 'Code OP',
  date_debut: 'Date début',
  date_fin: 'Date fin',
  caution: 'Caution',
  commentaire: 'Commentaire',
  resultat: 'Résultat',
  canal: 'Canal',
  planned_at: 'Planifié le',
  absence_type: 'Type d’absence',
  change_type: 'Type de changement',
  heure_debut: 'Heure début',
  heure_fin: 'Heure fin',
  closure_date: 'Date de clôture',
  fond_reel: 'Fond réel',
  fond_logiciel: 'Fond logiciel',
  montant_cb: 'Montant CB',
  argent_lieu_sur: 'Argent lieu sûr',
  nb_cheques: 'Nb chèques',
  montant_cheques: 'Montant chèques',
  sortie_montant: 'Montant sortie',
  sortie_motif: 'Motif sortie',
  nb_boites_recues: 'Nb boîtes reçues',
  bl_numero: 'N° BL',
  armoire_boites: 'Armoire (boîtes)',
  armoire_unites: 'Armoire (unités)',
  stock_lgo_boites: 'LGO (boîtes)',
  stock_lgo_unites: 'LGO (unités)',
  denomination: 'Dénomination',
  code_produit: 'Code produit',
  numero_unite: 'N° unité',
  lot: 'Lot',
  date_peremption: 'Date de péremption',
  fournisseur: 'Fournisseur',
  patient_nom: 'Nom patient',
  patient_prenom: 'Prénom patient',
  title: 'Titre',
  category: 'Catégorie',
  content: 'Contenu',
  label_snapshot: 'Libellé',
  message: 'Message',
  target_type: 'Cible',
  cis: 'CIS',
  cip13: 'CIP13',
};

const IP_STATUT_OPTIONS = [
  { value: 'En attente', label: 'En attente' },
  { value: 'Déclaré', label: 'Déclaré' },
];

const QUALITY_SEVERITY_OPTIONS = [
  { value: 'mineure', label: 'Mineure' },
  { value: 'majeure', label: 'Majeure' },
  { value: 'critique', label: 'Critique' },
];

const QUALITY_STATUS_OPTIONS = [
  { value: 'ouvert', label: 'Ouvert' },
  { value: 'en_attente', label: 'En attente' },
  { value: 'en_analyse', label: 'En analyse' },
];

const DISPUTE_STATUT_OPTIONS = [
  { value: 'ouvert', label: 'Ouvert' },
  { value: 'en_attente', label: 'En attente' },
  { value: 'en_cours', label: 'En cours' },
];

const LOCATION_DOSSIER_STATUTS = [
  { value: 'actif', label: 'Actif' },
  { value: 'en_attente', label: 'En attente' },
];

const LOCATION_CONTACT_STATUTS = [
  { value: 'a_contacter', label: 'À contacter' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'contacte', label: 'Contacté' },
  { value: 'reporte', label: 'Reporté' },
];

const MAGISTRAL_EDIT_STATUTS = Object.keys(MAGISTRAL_STATUTS || {})
  .filter((s) => !['cloture', 'dispense', 'refuse'].includes(s))
  .map((value) => ({ value, label: MAGISTRAL_STATUTS[value] || value }));

const EDIT_KIND_TITLE = {
  call: 'Appel',
  ip: 'Act-IP',
  quality: 'NC qualité',
  stock: 'Erreur stock',
  dispute: 'Litige',
  perime: 'Périmé',
  magistral: 'Magistrale',
  location_dossier: 'Dossier location',
  location_contact: 'Contact location',
  hr_absence: 'Absence',
  hr_schedule: 'Changement horaire',
  cash: 'Clôture de caisse',
  stupefiant: 'Relevé stupéfiant',
  psl_unit: 'Unité MDS',
  psl_movement: 'Mouvement MDS',
  document: 'Document',
  conseil: 'Conseil',
};

/** Mapping chip id → kind édition + clé editable. */
const SECTION_DEFS = [
  { chip: 'calls', kind: 'call', key: 'calls', title: 'Mes appels', icon: Phone },
  { chip: 'ips', kind: 'ip', key: 'ips', title: 'Mes Act-IP', icon: Activity },
  { chip: 'quality', kind: 'quality', key: 'quality', title: 'Mes NC qualité', icon: ShieldAlert },
  { chip: 'stock', kind: 'stock', key: 'stock', title: 'Mes erreurs stock', icon: PackageX },
  { chip: 'disputes', kind: 'dispute', key: 'disputes', title: 'Mes litiges', icon: Scale },
  { chip: 'perimes', kind: 'perime', key: 'perimes', title: 'Mes périmés', icon: CalendarClock },
  { chip: 'magistral', kind: 'magistral', key: 'magistral', title: 'Mes magistrales', icon: FlaskConical },
  { chip: 'location_dossiers', kind: 'location_dossier', key: 'location_dossiers', title: 'Mes dossiers location', icon: Home },
  { chip: 'location_contacts', kind: 'location_contact', key: 'location_contacts', title: 'Mes contacts location', icon: Phone },
  { chip: 'hr_absences', kind: 'hr_absence', key: 'hr_absences', title: 'Mes absences', icon: Users },
  { chip: 'hr_schedules', kind: 'hr_schedule', key: 'hr_schedules', title: 'Mes changements horaire', icon: Users },
  { chip: 'cash', kind: 'cash', key: 'cash', title: 'Mes clôtures de caisse', icon: Wallet },
  { chip: 'stupefiants', kind: 'stupefiant', key: 'stupefiants', title: 'Mes relevés stupéfiants', icon: Pill },
  { chip: 'psl_units', kind: 'psl_unit', key: 'psl_units', title: 'Mes unités MDS', icon: Package },
  { chip: 'psl_movements', kind: 'psl_movement', key: 'psl_movements', title: 'Mes mouvements MDS', icon: Package },
  { chip: 'documents', kind: 'document', key: 'documents', title: 'Mes documents', icon: FileText },
  { chip: 'conseils', kind: 'conseil', key: 'conseils', title: 'Mes conseils', icon: MessageSquareHeart },
];

function fieldLabel(key) {
  return FIELD_LABELS[key] || key;
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
        active
          ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-transparent'
          : 'bg-[var(--surface-elevated)] text-[var(--muted)] border-[var(--border)] hover:text-[var(--fg)]'
      }`}
    >
      {children}
    </button>
  );
}

function Section({ title, icon: Icon, count, children }) {
  if (!count) return null;
  return (
    <section className="mb-3">
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--muted)] mb-2">
        <Icon size={14} /> {title}
        <span className="ml-auto bg-[var(--input-bg)] text-[var(--muted)] px-2 py-0.5 rounded-full text-[10px]">{count}</span>
      </h3>
      <ul className="space-y-1.5">{children}</ul>
    </section>
  );
}

function Row({ children, onEdit }) {
  return (
    <li className="flex items-start gap-2 p-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] text-sm">
      <div className="flex-1 min-w-0">{children}</div>
      <div className="flex gap-1 shrink-0">
        {onEdit && (
          <button type="button" title="Corriger" onClick={onEdit} className="p-1.5 rounded-lg hover:bg-[var(--input-bg)] text-[var(--muted)]">
            <Pencil size={14} />
          </button>
        )}
      </div>
    </li>
  );
}

function rowPreview(kind, row) {
  if (kind === 'call') {
    return {
      title: row.contact_nom || row.numero || 'Appel',
      sub: `${labelCallStatut(row.statut_traitement)}${row.motif ? ` · ${labelCallMotif(row.motif)}` : ''}`,
    };
  }
  if (kind === 'ip') {
    return { title: row.patient_initiales || row.medicament_en_cause || 'IP', sub: row.statut_ip };
  }
  if (kind === 'quality') {
    return { title: row.type || 'NC', sub: row.status };
  }
  if (kind === 'stock') {
    return { title: row.medicament || 'Stock', sub: row.status };
  }
  if (kind === 'dispute') {
    const typeLabel = DISPUTE_TYPES.find((t) => t.value === row.dispute_type)?.label || row.dispute_type;
    return { title: row.fournisseur_nom || typeLabel || 'Litige', sub: row.statut };
  }
  if (kind === 'perime') {
    return { title: row.medicament || 'Périmé', sub: PERIME_STATUS_LABELS[row.status] || row.status };
  }
  if (kind === 'magistral') {
    return {
      title: row.patient_initiales || row.formule || 'Magistrale',
      sub: MAGISTRAL_STATUTS[row.statut] || row.statut,
    };
  }
  if (kind === 'location_dossier') {
    return { title: row.code_op || 'Dossier location', sub: row.statut };
  }
  if (kind === 'location_contact') {
    return { title: row.motif || 'Contact', sub: row.statut };
  }
  if (kind === 'hr_absence') {
    return {
      title: labelAbsenceType(row.absence_type),
      sub: `${row.date_debut || ''} → ${row.date_fin || ''} · ${labelAbsenceStatut(row.statut)}`,
    };
  }
  if (kind === 'hr_schedule') {
    return {
      title: labelChangeType(row.change_type) || row.motif || 'Horaire',
      sub: `${row.date_debut || ''} · ${labelAbsenceStatut(row.statut)}`,
    };
  }
  if (kind === 'cash') {
    return { title: `Caisse ${row.closure_date || ''}`.trim(), sub: `Réel ${row.fond_reel} / Logiciel ${row.fond_logiciel}` };
  }
  if (kind === 'stupefiant') {
    return {
      title: row.medicament || row.cip || 'Stupéfiant',
      sub: STUPEFIANT_STATUS_LABELS[row.status] || row.status,
    };
  }
  if (kind === 'psl_unit') {
    return { title: row.denomination || row.code_produit || 'Unité MDS', sub: row.statut };
  }
  if (kind === 'psl_movement') {
    const who = [row.patient_prenom, row.patient_nom].filter(Boolean).join(' ') || row.patient_initiales;
    return { title: row.denomination || who || 'Mouvement MDS', sub: row.movement_type };
  }
  if (kind === 'document') {
    return { title: row.title || 'Document', sub: row.category };
  }
  if (kind === 'conseil') {
    return { title: row.label_snapshot || 'Conseil', sub: row.target_type };
  }
  return { title: 'Saisie', sub: '' };
}

function buildEditState(kind, row) {
  if (kind === 'call') {
    return {
      kind,
      id: row.id,
      fields: {
        contact_nom: row.contact_nom || '',
        numero: row.numero || '',
        motif: row.motif || 'autre',
        statut_traitement: row.statut_traitement || 'resolu',
        notes_appel: row.notes_appel || '',
      },
    };
  }
  if (kind === 'ip') {
    return {
      kind,
      id: row.id,
      fields: {
        patient_initiales: row.patient_initiales || '',
        medicament_en_cause: row.medicament_en_cause || '',
        probleme_identifie: row.probleme_identifie || '',
        statut_ip: row.statut_ip || 'En attente',
      },
    };
  }
  if (kind === 'quality') {
    return {
      kind,
      id: row.id,
      fields: {
        type: row.type || '',
        severity: row.severity || '',
        description: row.data?.description || '',
        status: row.status || 'ouvert',
      },
      _data: row.data || {},
    };
  }
  if (kind === 'stock') {
    return {
      kind,
      id: row.id,
      fields: {
        medicament: row.medicament || '',
        cip: row.cip || '',
        description: row.description || '',
        quantite_theorique: row.quantite_theorique ?? '',
        quantite_constatee: row.quantite_constatee ?? '',
      },
    };
  }
  if (kind === 'dispute') {
    return {
      kind,
      id: row.id,
      fields: { ...disputeRowToForm(row), statut: row.statut || 'ouvert' },
    };
  }
  if (kind === 'perime') {
    return {
      kind,
      id: row.id,
      fields: {
        medicament: row.medicament || '',
        cip: row.cip || row.code || '',
        code: row.code || row.cip || '',
        lot: row.lot || '',
        date_peremption: row.date_peremption || '',
        quantite: row.quantite ?? 1,
        notes: row.notes || '',
      },
    };
  }
  if (kind === 'magistral') {
    return {
      kind,
      id: row.id,
      fields: {
        patient_initiales: row.patient_initiales || '',
        formule: row.formule || '',
        quantite: row.quantite ?? '',
        forme: row.forme || '',
        statut: row.statut || 'brouillon',
        notes: row.notes || '',
        patient_phone: row.patient_phone || '',
        patient_email: row.patient_email || '',
      },
    };
  }
  if (kind === 'location_dossier') {
    return {
      kind,
      id: row.id,
      fields: {
        code_op: row.code_op || '',
        statut: row.statut || 'actif',
        date_debut: row.date_debut || '',
        notes: row.notes || '',
        caution: row.caution ?? '',
      },
    };
  }
  if (kind === 'location_contact') {
    return {
      kind,
      id: row.id,
      fields: {
        motif: row.motif || '',
        statut: row.statut || 'a_contacter',
        commentaire: row.commentaire || '',
        resultat: row.resultat || '',
        canal: row.canal || '',
      },
    };
  }
  if (kind === 'hr_absence') {
    return {
      kind,
      id: row.id,
      fields: {
        absence_type: row.absence_type || 'conge',
        date_debut: row.date_debut || '',
        date_fin: row.date_fin || '',
        motif: row.motif || '',
      },
    };
  }
  if (kind === 'hr_schedule') {
    return {
      kind,
      id: row.id,
      fields: {
        change_type: row.change_type || 'retard',
        motif: row.motif || '',
        date_debut: row.date_debut || '',
        heure_debut: row.heure_debut || '',
        date_fin: row.date_fin || '',
        heure_fin: row.heure_fin || '',
        commentaire: row.commentaire || '',
      },
    };
  }
  if (kind === 'cash') {
    return {
      kind,
      id: row.id,
      fields: {
        closure_date: row.closure_date || '',
        fond_reel: row.fond_reel ?? '',
        fond_logiciel: row.fond_logiciel ?? '',
        montant_cb: row.montant_cb ?? '',
        argent_lieu_sur: row.argent_lieu_sur ?? '',
        nb_cheques: row.nb_cheques ?? '',
        montant_cheques: row.montant_cheques ?? '',
        sortie_montant: row.sortie_montant ?? '',
        sortie_motif: row.sortie_motif || '',
        notes: row.notes || '',
      },
    };
  }
  if (kind === 'stupefiant') {
    return {
      kind,
      id: row.id,
      fields: {
        medicament: row.medicament || '',
        cip: row.cip || '',
        nb_boites_recues: row.nb_boites_recues ?? '',
        bl_numero: row.bl_numero || '',
        armoire_boites: row.armoire_boites ?? '',
        armoire_unites: row.armoire_unites ?? '',
        stock_lgo_boites: row.stock_lgo_boites ?? '',
        stock_lgo_unites: row.stock_lgo_unites ?? '',
        notes: row.notes || '',
      },
    };
  }
  if (kind === 'psl_unit') {
    return {
      kind,
      id: row.id,
      fields: {
        denomination: row.denomination || '',
        code_produit: row.code_produit || '',
        numero_unite: row.numero_unite || '',
        lot: row.lot || '',
        date_peremption: row.date_peremption || '',
        fournisseur: row.fournisseur || '',
      },
    };
  }
  if (kind === 'psl_movement') {
    return {
      kind,
      id: row.id,
      fields: {
        denomination: row.denomination || '',
        patient_nom: row.patient_nom || '',
        patient_prenom: row.patient_prenom || '',
        patient_initiales: row.patient_initiales || '',
        notes: row.notes || '',
        quantite: row.quantite ?? '',
      },
    };
  }
  if (kind === 'document') {
    return {
      kind,
      id: row.id,
      fields: {
        title: row.title || '',
        category: row.category || '',
        content: row.content || '',
      },
    };
  }
  if (kind === 'conseil') {
    return {
      kind,
      id: row.id,
      fields: {
        label_snapshot: row.label_snapshot || '',
        message: row.message || '',
        target_type: row.target_type || '',
        cis: row.cis || '',
        cip13: row.cip13 || '',
      },
    };
  }
  return null;
}

function numOrNull(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/**
 * Mes saisies (autocorrection 72h) — le hub « À traiter » vit désormais dans Tasks.
 * @param {{ mode?: 'hub'|'saisies', compact?: boolean }} props
 */
export default function InboxPanel({ mode = 'saisies', compact = false }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [saisieFilter, setSaisieFilter] = useState('all');

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const next = await fetchInboxItems(user.id);
      setData(next);
      setErr('');
    } catch (e) {
      setErr(e.message || 'Erreur chargement');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const visibleChips = useMemo(() => {
    if (!data?.editable) return SAISIES_CHIPS.filter((c) => c.id === 'all');
    return SAISIES_CHIPS.filter((c) => {
      if (c.id === 'all') return true;
      return (data.editable[c.id]?.length || 0) > 0;
    });
  }, [data?.editable]);

  const startEdit = (kind, row) => {
    setMsg('');
    setEdit(buildEditState(kind, row));
  };

  const saveEdit = async () => {
    if (!edit) return;
    setSaving(true);
    setMsg('');
    try {
      const f = edit.fields;
      if (edit.kind === 'call') await updateMyCall(edit.id, f);
      else if (edit.kind === 'ip') await updateMyIp(edit.id, f);
      else if (edit.kind === 'quality') {
        await updateMyQuality(edit.id, {
          type: f.type,
          severity: f.severity,
          status: f.status,
          data: { ...(edit._data || {}), description: f.description },
        });
      } else if (edit.kind === 'stock') {
        await updateMyStock(edit.id, {
          medicament: f.medicament,
          cip: f.cip,
          description: f.description,
          quantite_theorique: numOrNull(f.quantite_theorique),
          quantite_constatee: numOrNull(f.quantite_constatee),
        });
      } else if (edit.kind === 'dispute') {
        const { statut, ...payload } = f;
        await updateMyDispute(edit.id, {
          dispute_type: payload.dispute_type,
          fournisseur_id: payload.fournisseur_id || null,
          fournisseur_nom: payload.fournisseur_nom || null,
          montant: numOrNull(payload.montant),
          description: payload.description || null,
          pieces: payload.pieces || null,
          statut,
        });
      } else if (edit.kind === 'perime') {
        await updateMyPerime(edit.id, {
          medicament: f.medicament,
          cip: f.cip || f.code || null,
          code: f.code || f.cip || null,
          lot: f.lot,
          date_peremption: f.date_peremption,
          quantite: numOrNull(f.quantite) ?? 1,
          notes: f.notes || null,
        });
      } else if (edit.kind === 'magistral') {
        await updateMyMagistral(edit.id, {
          patient_initiales: f.patient_initiales || null,
          formule: f.formule || null,
          quantite: f.quantite === '' ? null : f.quantite,
          forme: f.forme || null,
          statut: f.statut,
          notes: f.notes || null,
          patient_phone: f.patient_phone || null,
          patient_email: f.patient_email || null,
        });
      } else if (edit.kind === 'location_dossier') {
        await updateMyLocationDossier(edit.id, {
          code_op: f.code_op || null,
          statut: f.statut,
          date_debut: f.date_debut || null,
          notes: f.notes || null,
          caution: numOrNull(f.caution),
        });
      } else if (edit.kind === 'location_contact') {
        await updateMyLocationContact(edit.id, {
          motif: f.motif || null,
          statut: f.statut,
          commentaire: f.commentaire || null,
          resultat: f.resultat || null,
          canal: f.canal || null,
        });
      } else if (edit.kind === 'hr_absence') {
        await updateMyHrAbsence(edit.id, {
          absence_type: f.absence_type,
          date_debut: f.date_debut,
          date_fin: f.date_fin,
          motif: f.motif || null,
        });
      } else if (edit.kind === 'hr_schedule') {
        await updateMyHrSchedule(edit.id, {
          change_type: f.change_type,
          motif: f.motif || null,
          date_debut: f.date_debut || null,
          heure_debut: f.heure_debut || null,
          date_fin: f.date_fin || null,
          heure_fin: f.heure_fin || null,
          commentaire: f.commentaire || null,
        });
      } else if (edit.kind === 'cash') {
        await updateMyCash(edit.id, {
          closure_date: f.closure_date,
          fond_reel: numOrNull(f.fond_reel),
          fond_logiciel: numOrNull(f.fond_logiciel),
          montant_cb: numOrNull(f.montant_cb),
          argent_lieu_sur: numOrNull(f.argent_lieu_sur),
          nb_cheques: numOrNull(f.nb_cheques),
          montant_cheques: numOrNull(f.montant_cheques),
          sortie_montant: numOrNull(f.sortie_montant),
          sortie_motif: f.sortie_motif || null,
          notes: f.notes || null,
        });
      } else if (edit.kind === 'stupefiant') {
        await updateMyStupefiant(edit.id, {
          medicament: f.medicament || null,
          cip: f.cip || null,
          nb_boites_recues: numOrNull(f.nb_boites_recues),
          bl_numero: f.bl_numero || null,
          armoire_boites: numOrNull(f.armoire_boites),
          armoire_unites: numOrNull(f.armoire_unites),
          stock_lgo_boites: numOrNull(f.stock_lgo_boites),
          stock_lgo_unites: numOrNull(f.stock_lgo_unites),
          notes: f.notes || null,
        });
      } else if (edit.kind === 'psl_unit') {
        await updateMyPslUnit(edit.id, {
          denomination: f.denomination || null,
          code_produit: f.code_produit || null,
          numero_unite: f.numero_unite || null,
          lot: f.lot || null,
          date_peremption: f.date_peremption || null,
          fournisseur: f.fournisseur || null,
        });
      } else if (edit.kind === 'psl_movement') {
        await updateMyPslMovement(edit.id, {
          denomination: f.denomination || null,
          patient_nom: f.patient_nom || null,
          patient_prenom: f.patient_prenom || null,
          patient_initiales: f.patient_initiales || null,
          notes: f.notes || null,
          quantite: numOrNull(f.quantite),
        });
      } else if (edit.kind === 'document') {
        await updateMyDocument(edit.id, {
          title: f.title,
          category: f.category || null,
          content: f.content || null,
        });
      } else if (edit.kind === 'conseil') {
        await updateMyConseil(edit.id, {
          label_snapshot: f.label_snapshot || null,
          message: f.message || null,
          target_type: f.target_type || null,
          cis: f.cis || null,
          cip13: f.cip13 || null,
        });
      }
      setEdit(null);
      setMsg('Enregistré');
      await load();
    } catch (e) {
      setMsg(e.message || 'Échec enregistrement');
    } finally {
      setSaving(false);
    }
  };

  if (mode === 'hub') {
    return (
      <div className={`w-full h-full flex flex-col items-center justify-center bg-[var(--surface)] text-[var(--fg)] p-6 ${compact ? '' : 'min-h-full'}`}>
        <Inbox className="text-[var(--muted)] mb-3" size={28} />
        <p className="text-sm text-[var(--muted)] text-center max-w-sm">
          Le hub « À traiter » est désormais basé sur les tâches. Ouvrez À traiter depuis la taskbar.
        </p>
      </div>
    );
  }

  const editCount = SECTION_DEFS.reduce((acc, s) => {
    if (saisieFilter !== 'all' && saisieFilter !== s.chip) return acc;
    return acc + (data?.editable?.[s.key]?.length || 0);
  }, 0);

  const renderEditField = (key, value) => {
    const onChange = (e) => setEdit((prev) => ({
      ...prev,
      fields: { ...prev.fields, [key]: e.target.value },
    }));
    if (key === 'motif' && edit?.kind === 'call') {
      return (
        <select className={inputCls} value={value ?? ''} onChange={onChange}>
          {CALL_MOTIFS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
    }
    if (key === 'statut_traitement') {
      return (
        <select className={inputCls} value={value ?? ''} onChange={onChange}>
          {CALL_STATUTS_COMPTOIR.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
    }
    if (key === 'statut_ip') {
      return (
        <select className={inputCls} value={value ?? ''} onChange={onChange}>
          {IP_STATUT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
    }
    if (key === 'severity') {
      return (
        <select className={inputCls} value={value ?? ''} onChange={onChange}>
          {QUALITY_SEVERITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
    }
    if (key === 'status' && edit?.kind === 'quality') {
      return (
        <select className={inputCls} value={value ?? ''} onChange={onChange}>
          {QUALITY_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
    }
    if (key === 'statut' && edit?.kind === 'dispute') {
      return (
        <select className={inputCls} value={value ?? ''} onChange={onChange}>
          {DISPUTE_STATUT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
    }
    if (key === 'statut' && edit?.kind === 'magistral') {
      return (
        <select className={inputCls} value={value ?? ''} onChange={onChange}>
          {MAGISTRAL_EDIT_STATUTS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
    }
    if (key === 'statut' && edit?.kind === 'location_dossier') {
      return (
        <select className={inputCls} value={value ?? ''} onChange={onChange}>
          {LOCATION_DOSSIER_STATUTS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
    }
    if (key === 'statut' && edit?.kind === 'location_contact') {
      return (
        <select className={inputCls} value={value ?? ''} onChange={onChange}>
          {LOCATION_CONTACT_STATUTS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
    }
    if (key === 'absence_type') {
      return (
        <select className={inputCls} value={value ?? ''} onChange={onChange}>
          {Object.entries(ABSENCE_TYPE_LABELS).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
      );
    }
    if (key === 'change_type') {
      return (
        <select className={inputCls} value={value ?? ''} onChange={onChange}>
          {Object.entries(CHANGE_TYPE_LABELS).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
      );
    }
    if (key === 'content' || key === 'message' || key === 'notes' || key === 'commentaire' || key === 'description' || key === 'formule') {
      return (
        <textarea
          className={inputCls}
          rows={key === 'content' ? 5 : 3}
          value={value ?? ''}
          onChange={onChange}
        />
      );
    }
    const type = ['date_debut', 'date_fin', 'date_peremption', 'closure_date'].includes(key)
      ? 'date'
      : ['quantite', 'quantite_theorique', 'quantite_constatee', 'montant', 'caution', 'fond_reel', 'fond_logiciel', 'montant_cb', 'argent_lieu_sur', 'nb_cheques', 'montant_cheques', 'sortie_montant', 'nb_boites_recues', 'armoire_boites', 'armoire_unites', 'stock_lgo_boites', 'stock_lgo_unites'].includes(key)
        ? 'number'
        : 'text';
    return (
      <input
        type={type}
        step={type === 'number' ? 'any' : undefined}
        className={inputCls}
        value={value ?? ''}
        onChange={onChange}
      />
    );
  };

  return (
    <div className={`w-full h-full flex flex-col bg-[var(--surface)] text-[var(--fg)] ${compact ? '' : 'min-h-full'}`}>
      {!compact && (
        <header className="shrink-0 px-6 py-4 border-b border-[var(--border)] bg-[var(--surface-elevated)]">
          <div className="flex items-center gap-2">
            <Inbox className="text-[var(--accent)] shrink-0" size={22} />
            <div className="min-w-0">
              <h2 className="font-bold text-xl text-[var(--fg)]">Mes saisies</h2>
              <p className="text-sm text-[var(--muted)]">
                Autocorrection — créateur, moins de 72 h, non clôturé, non modifié par un tiers
              </p>
            </div>
          </div>
        </header>
      )}

      <div className={`shrink-0 border-b border-[var(--border)] bg-[var(--surface-elevated)] ${compact ? 'px-3 py-2' : 'px-6 py-3'}`}>
        <div className="flex flex-wrap gap-1.5">
          {visibleChips.map((c) => (
            <Chip key={c.id} active={saisieFilter === c.id} onClick={() => setSaisieFilter(c.id)}>
              {c.label}
              {c.id !== 'all' && data?.editable?.[c.id]
                ? ` (${data.editable[c.id].length})`
                : ''}
            </Chip>
          ))}
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto space-y-1 ${compact ? 'p-3' : 'p-6'}`}>
        {loading && <p className="text-sm text-[var(--muted)]">Chargement…</p>}
        {err && (
          <div className="mb-3 p-3 bg-red-50 text-[var(--danger)] rounded-lg border border-red-200 text-sm">{err}</div>
        )}
        {msg && (
          <div className="mb-3 p-3 bg-emerald-50 text-[var(--success)] rounded-lg border border-emerald-200 text-sm">{msg}</div>
        )}

        {data && !loading && (
          <>
            {edit ? (
              <div className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-xl p-4 space-y-3 mb-4">
                <h3 className="text-sm font-semibold text-[var(--fg)]">
                  Correction — {EDIT_KIND_TITLE[edit.kind] || edit.kind}
                </h3>
                {edit.kind === 'dispute' ? (
                  <>
                    <DisputeForm
                      form={edit.fields}
                      onChange={(patch) => setEdit((prev) => ({
                        ...prev,
                        fields: { ...prev.fields, ...patch },
                      }))}
                      partners={[]}
                      compact
                    />
                    <div>
                      <label className="block text-xs font-semibold text-[var(--muted)] mb-1">Statut</label>
                      {renderEditField('statut', edit.fields.statut)}
                    </div>
                  </>
                ) : edit.kind === 'perime' ? (
                  <PerimeForm
                    form={edit.fields}
                    onChange={(patch) => setEdit((prev) => ({
                      ...prev,
                      fields: { ...prev.fields, ...patch },
                    }))}
                    requireCore
                  />
                ) : (
                  Object.entries(edit.fields).map(([key, value]) => (
                    <div key={key}>
                      <label className="block text-xs font-semibold text-[var(--muted)] mb-1">
                        {fieldLabel(key)}
                      </label>
                      {renderEditField(key, value)}
                    </div>
                  ))
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={saveEdit}
                    className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:opacity-90 text-[var(--accent-fg)] text-sm font-medium disabled:opacity-50"
                  >
                    {saving ? '…' : 'Enregistrer'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEdit(null)}
                    className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--fg)] hover:bg-[var(--input-bg)]"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : null}

            {!editCount && !edit && (
              <p className="text-center text-[var(--muted)] mt-10">Aucune saisie corrigeable (règle 72 h).</p>
            )}

            {SECTION_DEFS.map((s) => {
              if (saisieFilter !== 'all' && saisieFilter !== s.chip) return null;
              const rows = data.editable?.[s.key] || [];
              return (
                <Section key={s.key} title={s.title} icon={s.icon} count={rows.length}>
                  {rows.map((row) => {
                    const preview = rowPreview(s.kind, row);
                    return (
                      <Row key={row.id} onEdit={() => startEdit(s.kind, row)}>
                        <p className="font-medium truncate">{preview.title}</p>
                        {preview.sub ? (
                          <p className="text-[11px] text-[var(--muted)]">{preview.sub}</p>
                        ) : null}
                      </Row>
                    );
                  })}
                </Section>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
