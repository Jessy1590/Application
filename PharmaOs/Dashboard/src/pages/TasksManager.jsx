import React, { useState, useEffect } from 'react';
import { useAuth } from '../core/AuthContext';
import { fetchTasks, fetchProfiles, createTask, completeTaskGlobal, uncompleteTaskGlobal, updateTask } from '../services/agendaTaskService';
import { CheckSquare, Plus, ArrowLeft, Check, Clock, Filter, Edit2, RotateCcw, Save, X } from 'lucide-react';

export default function TasksManager({ onNavigate }) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [newTask, setNewTask] = useState({ titre: '', description: '', assignees: [] });
  const [comment, setComment] = useState({});
  const [statusFilter, setStatusFilter] = useState('en_cours');
  const [userFilter, setUserFilter] = useState('all');

  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editTaskForm, setEditTaskForm] = useState({ titre: '', description: '' });

  const loadData = async () => {
    setTasks(await fetchTasks());
    setProfiles(await fetchProfiles());
  };

  useEffect(() => { loadData(); }, []);

  const handleCreate = async (e) => { 
    e.preventDefault();
    await createTask(newTask.titre, newTask.description, newTask.assignees, user.id);
    setShowForm(false);
    setNewTask({ titre: '', description: '', assignees: [] });
    loadData();
  };

  const handleCompleteTask = async (taskId, createdAt) => { 
    const timeSec = Math.floor((new Date() - new Date(createdAt)) / 1000);
    const currentUserProfile = profiles.find(p => p.id === user.id)?.display_name || 'Utilisateur';
    await completeTaskGlobal(taskId, comment[taskId] || '', timeSec, currentUserProfile);
    loadData();
  };

  const handleUncomplete = async (taskId) => {
    if (window.confirm("Voulez-vous vraiment annuler la validation de cette tâche ?")) {
      await uncompleteTaskGlobal(taskId);
      loadData();
    }
  };

  const startEditing = (task) => {
    setEditingTaskId(task.id);
    setEditTaskForm({ titre: task.titre, description: task.description });
  };

  const saveEditTask = async (taskId) => {
    await updateTask(taskId, editTaskForm.titre, editTaskForm.description);
    setEditingTaskId(null);
    loadData();
  };

  const filteredTasks = tasks.filter(t => {
    if (statusFilter !== 'all' && t.statutGlobal !== statusFilter) return false;
    if (userFilter !== 'all' && !t.task_assignments.some(a => a.user_id === userFilter)) return false;
    return true;
  });

  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <button onClick={() => onNavigate('dashboard')} className="flex items-center gap-2 text-slate-500 hover:text-orange-600 mb-6 text-sm font-medium"><ArrowLeft size={16} /> Retour</button>
      
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><CheckSquare className="text-orange-600" /> Tâches d'Équipe</h1>
        <button onClick={() => setShowForm(!showForm)} className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 flex gap-2"><Plus size={18}/> Nouvelle Tâche</button>
      </div>

      <div className="flex gap-4 mb-6 bg-white p-3 rounded-lg border border-slate-200 shadow-sm items-center">
        <Filter size={16} className="text-slate-400" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="p-2 border rounded-md text-sm">
          <option value="en_cours">Tâches en cours (À faire)</option>
          <option value="terminee">Tâches terminées</option>
          <option value="all">Toutes les tâches</option>
        </select>
        <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="p-2 border rounded-md text-sm disabled:opacity-50" disabled={statusFilter === 'en_cours'}>
          <option value="all">Par tous les membres</option>
          {profiles.map(p => <option key={p.id} value={p.id}>Validées par : {p.display_name}</option>)}
        </select>
      </div>

      {showForm && (
         <form onSubmit={handleCreate} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-6 space-y-4">
         <input required placeholder="Titre de la tâche" className="w-full p-2 border rounded-md" value={newTask.titre} onChange={e => setNewTask({...newTask, titre: e.target.value})} />
         <textarea placeholder="Description" className="w-full p-2 border rounded-md" value={newTask.description} onChange={e => setNewTask({...newTask, description: e.target.value})} />
         <div className="flex gap-4">
           {profiles.map(p => (
             <label key={p.id} className="flex items-center gap-2 text-sm bg-slate-50 p-2 rounded-md border">
               <input type="checkbox" checked={newTask.assignees.includes(p.id)} onChange={e => {
                 const assignees = e.target.checked ? [...newTask.assignees, p.id] : newTask.assignees.filter(id => id !== p.id);
                 setNewTask({...newTask, assignees});
               }}/> {p.display_name}
             </label>
           ))}
         </div>
         <button type="submit" disabled={newTask.assignees.length === 0} className="bg-orange-600 text-white px-4 py-2 rounded-md w-full disabled:opacity-50">Assigner</button>
       </form>
      )}

      <div className="space-y-4">
        {filteredTasks.map(task => {
          const isEditing = editingTaskId === task.id;

          return (
            <div key={task.id} className={`p-5 rounded-xl border shadow-sm ${task.statutGlobal === 'terminee' ? 'bg-emerald-50/30 border-emerald-100' : 'bg-white border-slate-200'}`}>
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1 mr-4">
                  {isEditing ? (
                    <div className="space-y-2 mb-3">
                      <input className="w-full p-2 border rounded-md font-bold text-lg" value={editTaskForm.titre} onChange={e => setEditTaskForm({...editTaskForm, titre: e.target.value})} />
                      <textarea className="w-full p-2 border rounded-md text-sm" value={editTaskForm.description} onChange={e => setEditTaskForm({...editTaskForm, description: e.target.value})} />
                      <div className="flex gap-2">
                        <button onClick={() => saveEditTask(task.id)} className="bg-blue-600 text-white px-3 py-1.5 rounded-md flex items-center gap-1 text-sm hover:bg-blue-700"><Save size={14}/> Enregistrer</button>
                        <button onClick={() => setEditingTaskId(null)} className="bg-slate-200 text-slate-700 px-3 py-1.5 rounded-md flex items-center gap-1 text-sm hover:bg-slate-300"><X size={14}/> Annuler</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h3 className="font-bold text-lg text-slate-800">{task.titre}</h3>
                      {/* CORRECTION ICI : La balise <p> a été remplacée par un <div> */}
                      <div className="text-sm text-slate-500 mt-2">
                        {(() => {
                          let details = {};
                          try {
                            details = JSON.parse(task.description || '{}');
                          } catch (e) {
                            details = {};
                          }

                          if (task.titre.startsWith('Commande') || details.medicament) {
                            return (
                              <div className="text-sm text-slate-600 space-y-0.5 mt-1">
                                <p><strong>Médicament :</strong> {details.medicament || 'Non spécifié'} {details.cip ? `(CIP: ${details.cip})` : ''}</p>
                                <p><strong>Patient :</strong> {details.nom} {details.prenom} (Né(e) le {details.dob})</p>
                                {details.repetitions && <p><strong>Fréquence :</strong> Répétition tous les {details.recurrence_semaines} semaines ({details.repetitions} fois)</p>}
                                {details.commentaire && <p className="italic text-slate-500">Note : {details.commentaire}</p>}
                              </div>
                            );
                          }

                          if (task.titre.startsWith('Facturation') || details.facture !== undefined) {
                            return (
                              <div className="text-sm text-slate-600 space-y-0.5 mt-1">
                                <p><strong>Facture n° :</strong> {details.facture || 'En attente'}</p>
                                <p><strong>Patient :</strong> {details.nom} {details.prenom} (Né(e) le {details.dob})</p>
                                {details.commentaire && <p className="italic text-slate-500">Note : {details.commentaire}</p>}
                              </div>
                            );
                          }

                          return <p className="text-sm text-slate-500 mt-1">{task.description}</p>;
                        })()}
                      </div>
                    </>
                  )}
                </div>
                
                <div className="flex flex-col items-end gap-2">
                  {task.statutGlobal === 'en_cours' ? (
                    <div className="flex gap-2">
                      {!isEditing && <button onClick={() => startEditing(task)} className="text-blue-600 p-2 bg-blue-50 rounded-md hover:bg-blue-100"><Edit2 size={16}/></button>}
                      <input placeholder="Note de validation..." className="text-xs p-2 border rounded-md w-40" onChange={e => setComment({...comment, [task.id]: e.target.value})} />
                      <button onClick={() => handleCompleteTask(task.id, task.created_at)} className="bg-emerald-600 text-white px-3 py-1.5 rounded-md hover:bg-emerald-700 flex items-center gap-1 text-sm"><Check size={16}/> Valider</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1"><Check size={14}/> Terminée</span>
                      <button onClick={() => handleUncomplete(task.id)} className="text-rose-600 p-1.5 bg-rose-50 rounded-md hover:bg-rose-100 title='Annuler la validation'"><RotateCcw size={16}/></button>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="text-xs text-slate-400 mt-4 border-t pt-2">
                Assignée à : {task.task_assignments.map(a => a.profiles?.display_name).join(', ')}
                {task.statutGlobal === 'terminee' && task.task_assignments[0]?.commentaire && (
                  <div className="mt-1 text-slate-600 italic font-medium">Détails : {task.task_assignments[0].commentaire}</div>
                )}
              </div>
            </div>
          );
        })}
        {filteredTasks.length === 0 && <div className="text-slate-500 p-8 text-center bg-white rounded-xl border">Aucune tâche trouvée pour ce filtre.</div>}
      </div>
    </div>
  );
}