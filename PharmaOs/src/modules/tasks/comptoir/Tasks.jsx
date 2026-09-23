import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../../core/AuthContext.jsx';
import {
  fetchMyOpenAssignments,
  updateTaskDescription,
  completeAssignmentByTaskId,
  ensureTaskEscalations,
} from '../services/taskService.js';
import {
  parseTaskDetails,
  getTaskCategory,
  TASK_CATEGORY_LABELS,
  isPlainTaskDetails,
  plainTaskText,
} from '../shared/taskDisplay.js';
import {
  CheckCircle, MessageSquare, CheckSquare, User, Calendar, Tag, FileText,
  ShoppingBag, AlertOctagon, Filter, LayoutDashboard, PackageX,
} from 'lucide-react';
import { openDashboardWindow, closeModuleWindow } from '../../../shared/windowService.js';
import { submitRecountResult } from '../../stock/services/stockService.js';
import { useRealtimeRefresh } from '../../../shared/useRealtimeRefresh.js';

export default function Tasks() {
  const { user, profile } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [comments, setComments] = useState({});
  const [quantites, setQuantites] = useState({});
  const [retraitModal, setRetraitModal] = useState(null);
  const [recompteModal, setRecompteModal] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [dueFilter, setDueFilter] = useState('dues'); // dues | futures | all

  const fetchMyTasks = useCallback(async () => {
    if (!user?.id) return;
    try {
      await ensureTaskEscalations();
    } catch { /* best-effort */ }
    const { data, error } = await fetchMyOpenAssignments(user.id);
    if (!error && data) setAssignments(data);
  }, [user?.id]);

  useEffect(() => { fetchMyTasks(); }, [fetchMyTasks]);
  useRealtimeRefresh(fetchMyTasks, { tables: ['tasks', 'task_assignments'], enabled: !!user?.id });

  const filteredAssignments = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return assignments.filter((assignment) => {
      const parsed = parseTaskDetails(assignment.tasks?.description);
      const cat = getTaskCategory(assignment.tasks?.description, assignment.tasks?.titre || '');
      if (typeFilter !== 'all' && cat !== typeFilter) return false;

      if (parsed.type === 'retrait_lot') return dueFilter !== 'futures';

      const taskDate = parsed.date;
      if (!taskDate) return dueFilter !== 'futures';
      if (dueFilter === 'dues') return taskDate <= today;
      if (dueFilter === 'futures') return taskDate > today;
      return true;
    });
  }, [assignments, typeFilter, dueFilter]);

  const availableTypes = useMemo(() => {
    const set = new Set(assignments.map((a) => getTaskCategory(a.tasks?.description, a.tasks?.titre || '')));
    return ['all', ...[...set].sort()];
  }, [assignments]);

  const completeTask = async (assignment, quantiteIsolee = null) => {
    const note = comments[assignment.id] || '';
    const completedBy = profile?.display_name || 'Utilisateur';
    let finalNote = note ? `${note} (Validé par ${completedBy})` : `(Validé par ${completedBy})`;
    const details = parseTaskDetails(assignment.tasks?.description);
    if (details.type === 'retrait_lot' && quantiteIsolee !== null) {
      details.quantite_isolee = quantiteIsolee;
      finalNote = `Qté isolée: ${quantiteIsolee} — ${finalNote}`;
      await updateTaskDescription(assignment.task_id, JSON.stringify(details));
    }
    const { error } = await completeAssignmentByTaskId(assignment.task_id, finalNote);
    if (!error) {
      setRetraitModal(null);
      fetchMyTasks();
    }
  };

  const handleCompleteTask = (assignment) => {
    const details = parseTaskDetails(assignment.tasks?.description);
    if (details.type === 'retrait_lot') {
      setRetraitModal(assignment);
      return;
    }
    if (details.type === 'stock_recompte') {
      setRecompteModal(assignment);
      return;
    }
    if (details.type === 'stock_recompte_result') {
      openDashboardWindow({ page: 'stock' });
      closeModuleWindow();
      return;
    }
    if (details.type === 'stupefiant_verification' || details.type === 'stupefiant_recompte') {
      openStupefiantVerify(assignment);
      return;
    }
    completeTask(assignment);
  };

  const handleRecompteConfirm = async () => {
    const assignment = recompteModal;
    if (!assignment) return;
    const details = parseTaskDetails(assignment.tasks?.description);
    const qty = quantites[assignment.id];
    if (qty === '' || qty === undefined || qty === null) {
      alert('Indiquez obligatoirement le nombre final de boîtes comptées.');
      return;
    }
    try {
      await submitRecountResult({
        stockErrorId: details.stock_error_id,
        taskId: assignment.task_id,
        quantiteFinale: qty,
        note: comments[assignment.id] || '',
        userId: user.id,
        displayName: profile?.display_name,
      });
      setRecompteModal(null);
      fetchMyTasks();
    } catch (e) {
      alert(e.message);
    }
  };

  const openPerimeDecisionOnDashboard = async (assignment) => {
    const details = parseTaskDetails(assignment.tasks?.description);
    await openDashboardWindow({
      page: 'perimes',
      perimeId: details.perime_id || null,
    });
    await closeModuleWindow();
  };

  const openHrOnDashboard = async () => {
    await openDashboardWindow({ page: 'hr' });
    await closeModuleWindow();
  };

  const isPerimeDecision = (assignment) => {
    const details = parseTaskDetails(assignment.tasks?.description);
    return details.type === 'perime_decision';
  };

  const isHrAdminAction = (assignment) => {
    const details = parseTaskDetails(assignment.tasks?.description);
    return details.type === 'hr_absence_demande' || details.type === 'hr_horaire_demande';
  };

  const isStupefiantVerify = (assignment) => {
    const t = parseTaskDetails(assignment.tasks?.description).type;
    return t === 'stupefiant_verification' || t === 'stupefiant_recompte';
  };

  const openStupefiantVerify = async (assignment) => {
    const details = parseTaskDetails(assignment.tasks?.description);
    await openDashboardWindow({
      page: 'stupefiants',
      releveId: details.releve_id || null,
      tab: 'verifier',
    });
    await closeModuleWindow();
  };

  const handleRetraitConfirm = () => {
    const qty = quantites[retraitModal.id];
    if (qty === '' || qty === undefined || qty === null) {
      alert('Veuillez saisir la quantité mise en quarantaine (0 si aucun stock).');
      return;
    }
    completeTask(retraitModal, parseInt(qty, 10));
  };

  const renderDescription = (desc, titre) => {
    const data = parseTaskDetails(desc);

    if (isPlainTaskDetails(data)) {
      const text = plainTaskText(desc) || data.text || '';
      if (!text.trim()) return null;
      return <p className="text-slate-600 mt-2 whitespace-pre-wrap text-sm">{text}</p>;
    }

    if (data.type === 'retrait_lot') {
      return (
        <div className="mt-3 p-4 bg-red-50 border border-red-200 rounded-lg space-y-2 text-sm">
          <p className="flex items-center gap-2 font-bold text-red-700"><AlertOctagon size={16} /> RETRAIT DE LOT</p>
          <p><span className="font-semibold">Médicament:</span> {data.medicament}</p>
          <p><span className="font-semibold">Lot:</span> {data.lot}</p>
          <p><span className="font-semibold">Laboratoire:</span> {data.laboratoire}</p>
          <p><span className="font-semibold">Motif:</span> {data.motif}</p>
        </div>
      );
    }
    if (data.type === 'stock_error' || data.type === 'stock_recompte' || data.type === 'stock_recompte_result') {
      const title = data.type === 'stock_recompte'
        ? 'RECOMPTAGE DEMANDÉ'
        : data.type === 'stock_recompte_result'
          ? 'CORRIGER LE STOCK (après recomptage)'
          : 'ERREUR DE STOCK';
      return (
        <div className="mt-3 p-4 bg-violet-50 border border-violet-200 rounded-lg space-y-1 text-sm">
          <p className="font-bold text-violet-700">{title}</p>
          <p><span className="font-semibold">Médicament:</span> {data.medicament}</p>
          {data.cip && <p><span className="font-semibold">CIP:</span> {data.cip}</p>}
          {(data.quantite_theorique != null || data.quantite_constatee != null) && (
            <p>
              <span className="font-semibold">Stock théorique (logiciel):</span> {data.quantite_theorique ?? '—'}
              {' · '}
              <span className="font-semibold">Stock officiel / constaté:</span> {data.quantite_constatee ?? '—'}
            </p>
          )}
          {data.quantite_finale != null && (
            <p><span className="font-semibold">Qté finale recomptée:</span> {data.quantite_finale}</p>
          )}
          {data.instruction && <p className="text-violet-800 font-medium mt-1">{data.instruction}</p>}
          {data.description && <p className="text-slate-600">{data.description}</p>}
        </div>
      );
    }
    if (data.type === 'stupefiant_verification' || data.type === 'stupefiant_recompte') {
      const title = data.type === 'stupefiant_recompte'
        ? 'STUPÉFIANT — RECOMPTAGE'
        : 'STUPÉFIANT — VÉRIFICATION';
      return (
        <div className="mt-3 p-4 bg-rose-50 border border-rose-200 rounded-lg space-y-1 text-sm">
          <p className="font-bold text-rose-800">{title}</p>
          <p><span className="font-semibold">Médicament:</span> {data.medicament}</p>
          {data.cip && <p><span className="font-semibold">CIP:</span> {data.cip}</p>}
          {data.is_du && <p className="font-medium text-rose-700">Dû / promis patient</p>}
          {data.bl_numero && <p><span className="font-semibold">BL:</span> {data.bl_numero}</p>}
          {data.nb_boites_recues != null && (
            <p><span className="font-semibold">Boîtes reçues:</span> {data.nb_boites_recues}</p>
          )}
          {data.instruction && <p className="text-rose-900 font-medium mt-1">{data.instruction}</p>}
          <p className="text-xs text-slate-500 mt-2">Ouvrir le dashboard Stupéfiants pour saisir le contrôle.</p>
        </div>
      );
    }
    if (data.type === 'perimes_mensuel') {
      return (
        <div className="mt-3 p-4 bg-orange-50 border border-orange-200 rounded-lg text-sm">
          <p className="font-bold text-orange-700 mb-2">{data.count} produit(s) à mettre en avant / promo</p>
          <ul className="list-disc list-inside text-slate-600 space-y-0.5">
            {(data.items || []).slice(0, 8).map((it, i) => (
              <li key={i}>{it.medicament} — {new Date(it.date_peremption).toLocaleDateString('fr-FR')} (×{it.quantite})</li>
            ))}
          </ul>
        </div>
      );
    }
    if (data.type === 'perime_decision') {
      return (
        <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm">
          <p className="font-bold text-amber-800 mb-1">Périmé à décider</p>
          <p>{data.medicament} — DLC {data.date_peremption ? new Date(data.date_peremption).toLocaleDateString('fr-FR') : '—'}</p>
          <p className="text-xs text-slate-600 mt-1">
            {[data.code && `Code ${data.code}`, data.cip && `CIP ${data.cip}`, data.lot && `Lot ${data.lot}`, data.quantite != null && `Qté ${data.quantite}`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      );
    }
    if (data.type === 'hr_absence_demande') {
      return (
        <div className="mt-3 p-4 bg-indigo-50 border border-indigo-200 rounded-lg text-sm">
          <p className="font-bold text-indigo-800 mb-1">Demande d&apos;absence à valider</p>
          <p>
            {data.absence_type || 'Absence'} — {data.date_debut} → {data.date_fin}
          </p>
          {data.motif && <p className="text-xs text-slate-600 mt-1">{data.motif}</p>}
        </div>
      );
    }
    if (data.type === 'hr_absence_reponse') {
      return (
        <div className="mt-3 p-4 bg-indigo-50 border border-indigo-200 rounded-lg text-sm">
          <p className="font-bold text-indigo-800 mb-1">
            Réponse absence — {data.statut === 'validee' ? 'Acceptée' : 'Refusée'}
          </p>
          <p>{data.absence_type || 'Absence'} — {data.date_debut} → {data.date_fin}</p>
          {data.review_note && <p className="text-xs text-slate-600 mt-1 italic">{data.review_note}</p>}
        </div>
      );
    }
    if (data.type === 'hr_horaire_demande') {
      return (
        <div className="mt-3 p-4 bg-indigo-50 border border-indigo-200 rounded-lg text-sm">
          <p className="font-bold text-indigo-800 mb-1">Changement d&apos;horaire à valider</p>
          <p>
            {data.date_debut}
            {data.heure_debut ? ` · ${String(data.heure_debut).slice(0, 5)}` : ''}
            {data.heure_fin ? `–${String(data.heure_fin).slice(0, 5)}` : ''}
          </p>
          {data.commentaire && <p className="text-xs text-slate-600 mt-1">{data.commentaire}</p>}
        </div>
      );
    }
    if (data.type === 'hr_horaire_reponse') {
      return (
        <div className="mt-3 p-4 bg-indigo-50 border border-indigo-200 rounded-lg text-sm">
          <p className="font-bold text-indigo-800 mb-1">
            Réponse horaire — {data.statut === 'validee' ? 'Accepté' : 'Refusé'}
          </p>
          <p>{data.date_debut}</p>
          {data.review_note && <p className="text-xs text-slate-600 mt-1 italic">{data.review_note}</p>}
        </div>
      );
    }
    if (data.type === 'perime_challenge') {
      return (
        <div className="mt-3 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-sm">
          <p className="font-bold text-emerald-800 mb-1">Challenge périmé</p>
          <p>{data.challenge_titre || data.medicament}</p>
          {data.challenge_objectif && <p className="text-slate-600 mt-1">{data.challenge_objectif}</p>}
          {data.challenge_message && <p className="text-xs text-emerald-900 mt-2 italic">{data.challenge_message}</p>}
          {data.challenge_fin && (
            <p className="text-xs text-slate-500 mt-1">Fin : {new Date(data.challenge_fin).toLocaleDateString('fr-FR')}</p>
          )}
        </div>
      );
    }
    if (data.type === 'perime_mea') {
      return (
        <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm">
          <p className="font-bold text-amber-800 mb-1">Mise en avant à réaliser</p>
          <p>{data.medicament}</p>
          <p className="text-slate-600 mt-1">
            {[data.emplacement && `Emplacement : ${data.emplacement}`, data.montant != null && `${data.montant} €`]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {data.message && <p className="text-xs text-amber-900 mt-2 italic">{data.message}</p>}
        </div>
      );
    }
    if (data.type === 'perime_promo') {
      return (
        <div className="mt-3 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-sm">
          <p className="font-bold text-emerald-800 mb-1">Promotion à réaliser</p>
          <p>{data.medicament}</p>
          <p className="text-slate-600 mt-1">
            {[data.emplacement && `Emplacement : ${data.emplacement}`, data.montant != null && `${data.montant} €`]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {data.message && <p className="text-xs text-emerald-900 mt-2 italic">{data.message}</p>}
        </div>
      );
    }
    if (data.type === 'appel_attente_pharmacien') {
      return (
        <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm">
          <p className="font-bold text-amber-800 mb-1">Appel en attente pharmacien</p>
          <p>Contact : {data.contact_nom} — {data.numero}</p>
        </div>
      );
    }
    if (data.type === 'ip_brouillon') {
      return (
        <div className="mt-3 p-4 bg-indigo-50 border border-indigo-200 rounded-lg text-sm">
          <p className="font-bold text-indigo-800 mb-1">IP à finaliser</p>
          <p>{data.patient_initiales} — {data.medicament || 'brouillon'}</p>
        </div>
      );
    }
    if (data.type === 'litige_brouillon') {
      return (
        <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm">
          <p className="font-bold text-amber-800 mb-1">Litige à finaliser</p>
          <p>{data.fournisseur_nom || data.dispute_type || 'brouillon'}</p>
        </div>
      );
    }
    if (data.type === 'appel_brouillon') {
      return (
        <div className="mt-3 p-4 bg-sky-50 border border-sky-200 rounded-lg text-sm">
          <p className="font-bold text-sky-800 mb-1">Appel à finaliser</p>
          <p>{data.contact_nom || data.numero || 'brouillon'}</p>
        </div>
      );
    }
    if (data.type === 'nc_brouillon') {
      return (
        <div className="mt-3 p-4 bg-rose-50 border border-rose-200 rounded-lg text-sm">
          <p className="font-bold text-rose-800 mb-1">NC à finaliser</p>
          <p>{data.event_type || 'brouillon'} — {data.description || ''}</p>
        </div>
      );
    }
    if (data.type === 'etalonnage_rdv') {
      return (
        <div className="mt-3 p-4 bg-teal-50 border border-teal-200 rounded-lg text-sm">
          <p className="font-bold text-teal-800">Prendre RDV étalonnage — {data.equipment_name}</p>
          <p>Fin validité : {new Date(data.calibration_end_date).toLocaleDateString('fr-FR')}</p>
          <p>Visite cible : {new Date(data.next_visit_date).toLocaleDateString('fr-FR')}</p>
        </div>
      );
    }

    const cat = getTaskCategory(desc, titre);
    if (cat === 'facturation' || data.facture !== undefined) {
      return (
        <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-sm">
          <div className="flex items-center gap-2 text-slate-700 font-medium pb-2 border-b border-slate-200">
            <User size={16} className="text-slate-400" />
            <span>{data.nom} {data.prenom} {data.dob && <span className="font-normal text-slate-500">(Né(e) le {data.dob})</span>}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <p className="flex items-center gap-2"><FileText size={14} className="text-sky-500" /> <span className="font-semibold">Facture:</span> {data.facture}</p>
            <p className="flex items-center gap-2"><Calendar size={14} className="text-slate-400" /> <span className="font-semibold">Pour le:</span> {data.date}</p>
          </div>
          {data.commentaire && <p className="italic text-slate-600">Notes: {data.commentaire}</p>}
        </div>
      );
    }

    if (cat === 'commande' || data.medicament) {
      return (
        <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-sm">
          <div className="flex items-center gap-2 text-slate-700 font-medium pb-2 border-b border-slate-200">
            <User size={16} className="text-slate-400" />
            <span>{data.nom} {data.prenom} {data.dob && <span className="font-normal text-slate-500">(Né(e) le {data.dob})</span>}</span>
          </div>
          <p className="flex items-center gap-2"><ShoppingBag size={14} className="text-emerald-500" /> <span className="font-semibold">Produit:</span> {data.medicament} {data.cip && <span className="text-xs bg-slate-200 px-1.5 rounded">CIP: {data.cip}</span>}</p>
          {data.totalSeries && (
            <p className="flex items-center gap-2 text-slate-600"><Tag size={14} /> <span className="font-semibold">Renouvellement:</span> Série {data.seriesIndex}/{data.totalSeries} (toutes les {data.recurrence_semaines} sem.)</p>
          )}
          {data.commentaire && <p className="italic text-slate-600">Notes: {data.commentaire}</p>}
        </div>
      );
    }

    return <p className="text-slate-600 mt-2 text-sm whitespace-pre-wrap">{typeof desc === 'string' ? desc : ''}</p>;
  };

  const isRetrait = (assignment) => parseTaskDetails(assignment.tasks?.description).type === 'retrait_lot';

  return (
    <div className="w-full h-full flex flex-col bg-[var(--surface)] text-[var(--fg)]">
      <div className="px-6 py-4 border-b border-[var(--border)] bg-[var(--surface-elevated)] shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <CheckSquare className="text-amber-500" />
          <h2 className="font-bold text-xl">Mes Tâches en cours</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Filter size={14} className="text-slate-400" />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="p-2 border rounded-lg bg-slate-50">
            {availableTypes.map((t) => (
              <option key={t} value={t}>{TASK_CATEGORY_LABELS[t] || t}</option>
            ))}
          </select>
          <select value={dueFilter} onChange={(e) => setDueFilter(e.target.value)} className="p-2 border rounded-lg bg-slate-50">
            <option value="dues">À faire (dues)</option>
            <option value="futures">À venir</option>
            <option value="all">Toutes (ouvertes)</option>
          </select>
          <span className="text-xs text-slate-400 ml-auto">{filteredAssignments.length} tâche(s)</span>
        </div>
      </div>
      <div className="p-6 overflow-y-auto space-y-4 flex-1">
        {filteredAssignments.length === 0 ? (
          <p className="text-center text-slate-500 mt-10">Aucune tâche pour ce filtre.</p>
        ) : (
          filteredAssignments.map((assignment) => (
            <div key={assignment.id} className={`p-5 rounded-xl border shadow-sm flex flex-col ${isRetrait(assignment) ? 'border-red-300 bg-red-50/30' : 'border-slate-200 bg-white'}`}>
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-lg text-[var(--fg)]">{assignment.tasks?.titre}</h3>
                  <span className="text-[10px] uppercase tracking-wide bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full shrink-0">
                    {TASK_CATEGORY_LABELS[getTaskCategory(assignment.tasks?.description, assignment.tasks?.titre)] || 'autre'}
                  </span>
                </div>
                {renderDescription(assignment.tasks?.description, assignment.tasks?.titre)}
              </div>
              <div className="flex items-center gap-3 pt-4 mt-4 border-t border-slate-100">
                {isPerimeDecision(assignment) ? (
                  <button
                    type="button"
                    onClick={() => openPerimeDecisionOnDashboard(assignment)}
                    className="w-full font-bold px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors text-white bg-amber-600 hover:bg-amber-700"
                  >
                    <LayoutDashboard size={18} /> Décider sur le dashboard
                  </button>
                ) : isHrAdminAction(assignment) ? (
                  <button
                    type="button"
                    onClick={() => openHrOnDashboard()}
                    className="w-full font-bold px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors text-white bg-indigo-600 hover:bg-indigo-700"
                  >
                    <LayoutDashboard size={18} /> Ouvrir RH dashboard
                  </button>
                ) : isStupefiantVerify(assignment) ? (
                  <button
                    type="button"
                    onClick={() => openStupefiantVerify(assignment)}
                    className="w-full font-bold px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors text-white bg-rose-600 hover:bg-rose-700"
                  >
                    <LayoutDashboard size={18} /> Ouvrir vérification
                  </button>
                ) : parseTaskDetails(assignment.tasks?.description).type === 'stock_recompte_result' ? (
                  <button
                    type="button"
                    onClick={() => handleCompleteTask(assignment)}
                    className="w-full font-bold px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors text-white bg-violet-600 hover:bg-violet-700"
                  >
                    <LayoutDashboard size={18} /> Ouvrir stock dashboard
                  </button>
                ) : (
                  <>
                    <MessageSquare size={18} className="text-slate-400 shrink-0" />
                    <input
                      type="text"
                      placeholder={
                        parseTaskDetails(assignment.tasks?.description).type === 'stock_recompte'
                          ? 'Note optionnelle (qté finale demandée à la clôture)'
                          : 'Ajouter une note ou visa de clôture...'
                      }
                      value={comments[assignment.id] || ''}
                      onChange={(e) => setComments({ ...comments, [assignment.id]: e.target.value })}
                      className="flex-1 text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleCompleteTask(assignment)}
                      className={`font-bold px-4 py-2.5 rounded-lg flex items-center gap-2 transition-colors shrink-0 text-white ${isRetrait(assignment) ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                    >
                      <CheckCircle size={18} /> Clôturer
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      {retraitModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="font-bold text-lg text-red-700 flex items-center gap-2 mb-4">
              <AlertOctagon size={20} /> Clôture retrait de lot
            </h2>
            <p className="text-sm text-slate-600 mb-4">Indiquez la quantité trouvée en stock et mise en quarantaine (0 si aucun).</p>
            <input
              type="number"
              min="0"
              required
              placeholder="Quantité isolée"
              value={quantites[retraitModal.id] ?? ''}
              onChange={(e) => setQuantites({ ...quantites, [retraitModal.id]: e.target.value })}
              className="w-full p-3 border rounded-lg mb-4 text-lg font-bold"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setRetraitModal(null)} className="flex-1 p-2 border rounded-lg">Annuler</button>
              <button type="button" onClick={handleRetraitConfirm} className="flex-1 p-2 bg-red-600 text-white rounded-lg font-bold">Valider</button>
            </div>
          </div>
        </div>
      )}
      {recompteModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="font-bold text-lg text-violet-700 flex items-center gap-2 mb-4">
              <PackageX size={20} /> Clôture recomptage
            </h2>
            <p className="text-sm text-slate-600 mb-2">
              Indiquez <strong>obligatoirement</strong> le nombre final de boîtes comptées. L&apos;admin sera notifié pour corriger le stock logiciel.
            </p>
            {(() => {
              const d = parseTaskDetails(recompteModal.tasks?.description);
              return (
                <p className="text-xs text-slate-500 mb-4">
                  Théorique : {d.quantite_theorique ?? '—'} · Officiel/constaté : {d.quantite_constatee ?? '—'}
                </p>
              );
            })()}
            <input
              type="number"
              min="0"
              required
              placeholder="Nombre final de boîtes *"
              value={quantites[recompteModal.id] ?? ''}
              onChange={(e) => setQuantites({ ...quantites, [recompteModal.id]: e.target.value })}
              className="w-full p-3 border rounded-lg mb-3 text-lg font-bold"
            />
            <input
              type="text"
              placeholder="Note optionnelle"
              value={comments[recompteModal.id] || ''}
              onChange={(e) => setComments({ ...comments, [recompteModal.id]: e.target.value })}
              className="w-full p-2 border rounded-lg mb-4 text-sm"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setRecompteModal(null)} className="flex-1 p-2 border rounded-lg">Annuler</button>
              <button type="button" onClick={handleRecompteConfirm} className="flex-1 p-2 bg-violet-600 text-white rounded-lg font-bold">Valider recomptage</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
