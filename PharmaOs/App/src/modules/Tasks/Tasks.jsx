import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../core/AuthContext';
import { CheckCircle, MessageSquare, CheckSquare, User, Calendar, Tag, FileText, ShoppingBag } from 'lucide-react';

export default function Tasks() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [comments, setComments] = useState({});

  useEffect(() => {
    fetchMyTasks();
  }, [user?.id]);

  const fetchMyTasks = async () => {
    const { data, error } = await supabase
      .schema('PharmaOs')
      .from('task_assignments')
      .select('id, statut, tasks(titre, description)')
      .eq('user_id', user.id)
      .eq('statut', 'en_cours');

    if (!error && data) {
      const today = new Date().toISOString().split('T')[0];
      
      const filteredAssignments = data.filter(assignment => {
        let taskDate = null;
        try {
          const parsed = JSON.parse(assignment.tasks?.description);
          taskDate = parsed.date;
        } catch (e) {}
        
        // Affiche la tâche si elle n'a pas de date, ou si la date est passée/aujourd'hui
        if (!taskDate) return true;
        return taskDate <= today;
      });

      setAssignments(filteredAssignments);
    }
  };

  const handleCompleteTask = async (assignmentId) => {
    const note = comments[assignmentId] || '';
    const { error } = await supabase
      .schema('PharmaOs')
      .from('task_assignments')
      .update({ 
        statut: 'terminee', 
        commentaire: note,
        completed_at: new Date().toISOString()
      })
      .eq('id', assignmentId);

    if (!error) fetchMyTasks();
  };

  const renderDescription = (desc) => {
    try {
      const data = JSON.parse(desc);
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
      // Si la description n'est pas un JSON (tâche classique), on l'affiche normalement
      return <p className="text-slate-600 mt-2">{desc}</p>;
    }
  };

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
            <div key={assignment.id} className="p-5 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col">
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
                  onClick={() => handleCompleteTask(assignment.id)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-lg flex items-center gap-2 transition-colors shrink-0"
                >
                  <CheckCircle size={18} /> Clôturer
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}