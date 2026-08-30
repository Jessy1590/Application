import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../core/AuthContext';
import { CheckCircle, MessageSquare, CheckSquare, User, Calendar, Tag, FileText, ShoppingBag, AlertOctagon } from 'lucide-react';
function parseTaskDetails(desc) {
  try {
    return JSON.parse(desc || '{}');
  } catch {
    return {};
  }
}
export default function Tasks() {
  const { user, profile } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [comments, setComments] = useState({});
  const [quantites, setQuantites] = useState({});
  const [retraitModal, setRetraitModal] = useState(null);
  useEffect(() => {
    fetchMyTasks();
  }, [user?.id]);
  const fetchMyTasks = async () => {
    const { data, error } = await supabase
      .schema('PharmaOs')
      .from('task_assignments')
      .select('id, task_id, statut, tasks(titre, description)')
      .eq('user_id', user.id)
      .eq('statut', 'en_cours');
    if (!error && data) {
      const today = new Date().toISOString().split('T')[0];
      const filteredAssignments = data.filter(assignment => {
        const parsed = parseTaskDetails(assignment.tasks?.description);
        if (parsed.type === 'retrait_lot') return true;
        const taskDate = parsed.date;
        if (!taskDate) return true;
        return taskDate <= today;
      });
      setAssignments(filteredAssignments);
    }
  };
  const completeTask = async (assignment, quantiteIsolee = null) => {
    const note = comments[assignment.id] || '';
    const completedBy = profile?.display_name || 'Utilisateur';
    let finalNote = note ? `${note} (Validé par ${completedBy})` : `(Validé par ${completedBy})`;
    const details = parseTaskDetails(assignment.tasks?.description);
    if (details.type === 'retrait_lot' && quantiteIsolee !== null) {
      details.quantite_isolee = quantiteIsolee;
      finalNote = `Qté isolée: ${quantiteIsolee} — ${finalNote}`;
      await supabase
        .schema('PharmaOs')
        .from('tasks')
        .update({ description: JSON.stringify(details) })
        .eq('id', assignment.task_id);
    }
    const { error } = await supabase
      .schema('PharmaOs')
      .from('task_assignments')
      .update({
        statut: 'terminee',
        commentaire: finalNote,
        completed_at: new Date().toISOString(),
      })
      .eq('task_id', assignment.task_id);
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
    completeTask(assignment);
  };
  const handleRetraitConfirm = () => {
    const qty = quantites[retraitModal.id];
    if (qty === '' || qty === undefined || qty === null) {
      alert('Veuillez saisir la quantité mise en quarantaine (0 si aucun stock).');
      return;
    }
    completeTask(retraitModal, parseInt(qty, 10));
  };
  const renderDescription = (desc) => {
    const data = parseTaskDetails(desc);
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
    if (data.type === 'stock_error' || data.type === 'stock_recompte') {
      return (
        <div className="mt-3 p-4 bg-violet-50 border border-violet-200 rounded-lg space-y-1 text-sm">
          <p className="font-bold text-violet-700">{data.type === 'stock_recompte' ? 'RECOMPTAGE DEMANDÉ' : 'ERREUR DE STOCK'}</p>
          <p><span className="font-semibold">Médicament:</span> {data.medicament}</p>
          {data.cip && <p><span className="font-semibold">CIP:</span> {data.cip}</p>}
          {data.description && <p className="text-slate-600">{data.description}</p>}
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
    if (data.type === 'etalonnage_rdv') {
      return (
        <div className="mt-3 p-4 bg-teal-50 border border-teal-200 rounded-lg text-sm">
          <p className="font-bold text-teal-800">Prendre RDV étalonnage — {data.equipment_name}</p>
          <p>Fin validité : {new Date(data.calibration_end_date).toLocaleDateString('fr-FR')}</p>
          <p>Visite cible : {new Date(data.next_visit_date).toLocaleDateString('fr-FR')}</p>
        </div>
      );
    }
    try {
      const isFacture = !!data.facture;
      return (
        <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-sm">
          <div className="flex items-center gap-2 text-slate-700 font-medium pb-2 border-b border-slate-200">
            <User size={16} className="text-slate-400" />
            <span>{data.nom} {data.prenom} <span className="font-normal text-slate-500">(Né(e) le {data.dob})</span></span>
          </div>
          {isFacture ? (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <p className="flex items-center gap-2"><FileText size={14} className="text-sky-500" /> <span className="font-semibold">Facture:</span> {data.facture}</p>
              <p className="flex items-center gap-2"><Calendar size={14} className="text-slate-400" /> <span className="font-semibold">Pour le:</span> {data.date}</p>
            </div>
          ) : (
            <div className="space-y-2 pt-1">
              <p className="flex items-center gap-2"><ShoppingBag size={14} className="text-emerald-500" /> <span className="font-semibold">Produit:</span> {data.medicament} {data.cip && <span className="text-xs bg-slate-200 px-1.5 rounded">CIP: {data.cip}</span>}</p>
              {data.totalSeries && (
                <p className="flex items-center gap-2 text-slate-600"><Tag size={14} /> <span className="font-semibold">Renouvellement:</span> Série {data.seriesIndex}/{data.totalSeries} (toutes les {data.recurrence_semaines} sem.)</p>
              )}
            </div>
          )}
          {data.commentaire && (
             <div className="mt-2 pt-2 border-t border-slate-200 text-slate-600 italic flex gap-2">
               <span className="font-semibold not-italic text-slate-700">Notes:</span> {data.commentaire}
             </div>
          )}
        </div>
      );
    } catch (e) {
      return <p className="text-slate-600 mt-2">{desc}</p>;
    }
  };
  const isRetrait = (assignment) => parseTaskDetails(assignment.tasks?.description).type === 'retrait_lot';
  return (
    <div className="w-full h-full flex flex-col bg-slate-50 text-slate-800">
      <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center gap-2 shadow-sm">
        <CheckSquare className="text-amber-500" />
        <h2 className="font-bold text-xl">Mes Tâches en cours</h2>
      </div>
      <div className="p-6 overflow-y-auto space-y-4 flex-1">
        {assignments.length === 0 ? (
          <p className="text-center text-slate-500 mt-10">Aucune tâche en cours pour le moment.</p>
        ) : (
          assignments.map(assignment => (
            <div key={assignment.id} className={`p-5 rounded-xl border shadow-sm flex flex-col ${isRetrait(assignment) ? 'border-red-300 bg-red-50/30' : 'border-slate-200 bg-white'}`}>
              <div>
                <h3 className="font-bold text-lg text-slate-800">{assignment.tasks?.titre}</h3>
                {renderDescription(assignment.tasks?.description)}
              </div>
              <div className="flex items-center gap-3 pt-4 mt-4 border-t border-slate-100">
                <MessageSquare size={18} className="text-slate-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Ajouter une note ou visa de clôture..."
                  value={comments[assignment.id] || ''}
                  onChange={(e) => setComments({ ...comments, [assignment.id]: e.target.value })}
                  className="flex-1 text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-500"
                />
                <button
                  onClick={() => handleCompleteTask(assignment)}
                  className={`font-bold px-4 py-2.5 rounded-lg flex items-center gap-2 transition-colors shrink-0 text-white ${isRetrait(assignment) ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                >
                  <CheckCircle size={18} /> Clôturer
                </button>
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
              onChange={e => setQuantites({ ...quantites, [retraitModal.id]: e.target.value })}
              className="w-full p-3 border rounded-lg mb-4 text-lg font-bold"
            />
            <div className="flex gap-2">
              <button onClick={() => setRetraitModal(null)} className="flex-1 p-2 border rounded-lg">Annuler</button>
              <button onClick={handleRetraitConfirm} className="flex-1 p-2 bg-red-600 text-white rounded-lg font-bold">Valider</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
