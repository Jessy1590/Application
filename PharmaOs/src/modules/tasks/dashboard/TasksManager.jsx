import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../core/AuthContext.jsx';
import { fetchTasks, fetchTeamProfiles, createTask, completeTaskGlobal, uncompleteTaskGlobal, updateTask } from '../services/taskService.js';
import {
  parseTaskDetails,
  getTaskCategory,
  TASK_CATEGORY_LABELS,
  isPlainTaskDetails,
  plainTaskText,
} from '../shared/taskDisplay.js';
import { CheckSquare, Plus, ArrowLeft, Check, Filter, Edit2, RotateCcw, Save, X } from 'lucide-react';

function renderTaskBody(task) {
  const details = parseTaskDetails(task.description);
  const titre = task.titre || '';

  if (isPlainTaskDetails(details)) {
    const text = plainTaskText(task.description);
    return text
      ? <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{text}</p>
      : null;
  }

  if (details.type === 'retrait_lot') {
    return (
      <div className="text-sm text-red-700 space-y-0.5 mt-1 bg-red-50 p-2 rounded border border-red-100">
        <p><strong>Médicament :</strong> {details.medicament}</p>
        <p><strong>Lot :</strong> {details.lot}</p>
        <p><strong>Laboratoire :</strong> {details.laboratoire}</p>
        <p><strong>Motif :</strong> {details.motif}</p>
        {details.quantite_isolee != null && <p><strong>Qté isolée :</strong> {details.quantite_isolee}</p>}
      </div>
    );
  }
  if (details.type === 'stock_error' || details.type === 'stock_recompte') {
    return (
      <div className="text-sm text-violet-700 space-y-0.5 mt-1 bg-violet-50 p-2 rounded border border-violet-100">
        <p><strong>{details.type === 'stock_recompte' ? 'Recomptage' : 'Erreur stock'} :</strong> {details.medicament}</p>
        {details.description && <p>{details.description}</p>}
      </div>
    );
  }
  if (details.type === 'perimes_mensuel') {
    return (
      <div className="text-sm text-orange-700 mt-1 bg-orange-50 p-2 rounded border border-orange-100">
        <p><strong>{details.count}</strong> produit(s) à traiter (en avant / promo)</p>
      </div>
    );
  }
  if (details.type === 'perime_decision') {
    return (
      <div className="text-sm text-amber-800 space-y-0.5 mt-1 bg-amber-50 p-2 rounded border border-amber-100">
        <p><strong>Périmé à décider</strong> — {details.medicament}</p>
        <p>DLC {details.date_peremption ? new Date(details.date_peremption).toLocaleDateString('fr-FR') : '—'} · Qté {details.quantite}</p>
      </div>
    );
  }
  if (details.type === 'perime_challenge') {
    return (
      <div className="text-sm text-emerald-800 space-y-0.5 mt-1 bg-emerald-50 p-2 rounded border border-emerald-100">
        <p><strong>Challenge</strong> — {details.challenge_titre || details.medicament}</p>
        {details.challenge_objectif && <p>{details.challenge_objectif}</p>}
        {details.challenge_message && <p className="italic">{details.challenge_message}</p>}
      </div>
    );
  }
  if (details.type === 'perime_mea') {
    return (
      <div className="text-sm text-amber-800 space-y-0.5 mt-1 bg-amber-50 p-2 rounded border border-amber-100">
        <p><strong>Mise en avant</strong> — {details.medicament}</p>
        <p>{[details.emplacement, details.montant != null && `${details.montant} €`].filter(Boolean).join(' · ')}</p>
        {details.message && <p className="italic">{details.message}</p>}
      </div>
    );
  }
  if (details.type === 'perime_promo') {
    return (
      <div className="text-sm text-emerald-800 space-y-0.5 mt-1 bg-emerald-50 p-2 rounded border border-emerald-100">
        <p><strong>Promotion</strong> — {details.medicament}</p>
        <p>{[details.emplacement, details.montant != null && `${details.montant} €`].filter(Boolean).join(' · ')}</p>
        {details.message && <p className="italic">{details.message}</p>}
      </div>
    );
  }
  if (details.type === 'etalonnage_rdv') {
    return (
      <div className="text-sm text-teal-800 mt-1 bg-teal-50 p-2 rounded border border-teal-100">
        <p>RDV {details.equipment_name} — visite le {new Date(details.next_visit_date).toLocaleDateString('fr-FR')}</p>
      </div>
    );
  }
  if (details.type === 'appel_attente_pharmacien') {
    return (
      <div className="text-sm text-amber-800 space-y-0.5 mt-1 bg-amber-50 p-2 rounded border border-amber-100">
        <p><strong>Appel — attente pharmacien</strong></p>
        <p>Contact : {details.contact_nom} — {details.numero}</p>
      </div>
    );
  }
  if (details.type === 'ip_brouillon') {
    return (
      <div className="text-sm text-indigo-800 space-y-0.5 mt-1 bg-indigo-50 p-2 rounded border border-indigo-100">
        <p><strong>IP à finaliser</strong> — {details.patient_initiales} {details.medicament || ''}</p>
      </div>
    );
  }
  if (details.type === 'litige_brouillon') {
    return (
      <div className="text-sm text-amber-800 space-y-0.5 mt-1 bg-amber-50 p-2 rounded border border-amber-100">
        <p><strong>Litige à finaliser</strong> — {details.fournisseur_nom || details.dispute_type || 'brouillon'}</p>
      </div>
    );
  }
  if (details.type === 'appel_brouillon') {
    return (
      <div className="text-sm text-sky-800 space-y-0.5 mt-1 bg-sky-50 p-2 rounded border border-sky-100">
        <p><strong>Appel à finaliser</strong> — {details.contact_nom || details.numero || 'brouillon'}</p>
      </div>
    );
  }
  if (details.type === 'nc_brouillon') {
    return (
      <div className="text-sm text-rose-800 space-y-0.5 mt-1 bg-rose-50 p-2 rounded border border-rose-100">
        <p><strong>NC à finaliser</strong> — {details.event_type || 'brouillon'}</p>
      </div>
    );
  }

  const cat = getTaskCategory(task.description, titre);
  if (cat === 'commande') {
    return (
      <div className="text-sm text-slate-600 space-y-0.5 mt-1">
        <p><strong>Médicament :</strong> {details.medicament || 'Non spécifié'} {details.cip ? `(CIP: ${details.cip})` : ''}</p>
        <p><strong>Patient :</strong> {details.nom} {details.prenom}{details.dob ? ` (Né(e) le ${details.dob})` : ''}</p>
        {details.repetitions && <p><strong>Fréquence :</strong> Répétition tous les {details.recurrence_semaines} semaines ({details.repetitions} fois)</p>}
        {details.commentaire && <p className="italic text-slate-500">Note : {details.commentaire}</p>}
      </div>
    );
  }
  if (cat === 'facturation') {
    return (
      <div className="text-sm text-slate-600 space-y-0.5 mt-1">
        <p><strong>Facture n° :</strong> {details.facture || 'En attente'}</p>
        <p><strong>Patient :</strong> {details.nom} {details.prenom}{details.dob ? ` (Né(e) le ${details.dob})` : ''}</p>
        {details.commentaire && <p className="italic text-slate-500">Note : {details.commentaire}</p>}
      </div>
    );
  }

  return <p className="text-sm text-slate-500 mt-1 whitespace-pre-wrap">{typeof task.description === 'string' ? task.description : ''}</p>;
}

export default function TasksManager({ onNavigate }) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [newTask, setNewTask] = useState({ titre: '', description: '', assignees: [] });
  const [comment, setComment] = useState({});
  const [statusFilter, setStatusFilter] = useState('en_cours');
  const [userFilter, setUserFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editTaskForm, setEditTaskForm] = useState({ titre: '', description: '' });

  const loadData = async () => {
    setTasks(await fetchTasks());
    setProfiles(await fetchTeamProfiles());
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
    const currentUserProfile = profiles.find((p) => p.id === user.id)?.display_name || 'Utilisateur';
    await completeTaskGlobal(taskId, comment[taskId] || '', timeSec, currentUserProfile);
    loadData();
  };

  const handleUncomplete = async (taskId) => {
    if (window.confirm('Voulez-vous vraiment annuler la validation de cette tâche ?')) {
      await uncompleteTaskGlobal(taskId);
      loadData();
    }
  };

  const startEditing = (task) => {
    setEditingTaskId(task.id);
    setEditTaskForm({ titre: task.titre, description: task.description || '' });
  };

  const saveEditTask = async (taskId) => {
    await updateTask(taskId, editTaskForm.titre, editTaskForm.description);
    setEditingTaskId(null);
    loadData();
  };

  const filteredTasks = useMemo(() => tasks.filter((t) => {
    if (statusFilter !== 'all' && t.statutGlobal !== statusFilter) return false;
    if (userFilter !== 'all' && !t.task_assignments.some((a) => a.user_id === userFilter)) return false;
    if (typeFilter !== 'all' && getTaskCategory(t.description, t.titre) !== typeFilter) return false;
    return true;
  }), [tasks, statusFilter, userFilter, typeFilter]);

  const grouped = useMemo(() => {
    const map = {};
    filteredTasks.forEach((t) => {
      const cat = getTaskCategory(t.description, t.titre);
      if (!map[cat]) map[cat] = [];
      map[cat].push(t);
    });
    return map;
  }, [filteredTasks]);

  const categoryOrder = ['libre', 'commande', 'facturation', 'appel', 'ip', 'retrait_lot', 'stock', 'perimes', 'perime_decision', 'perime_mea', 'perime_promo', 'perime_challenge', 'etalonnage', 'autre'];

  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <button type="button" onClick={() => onNavigate('dashboard')} className="flex items-center gap-2 text-slate-500 hover:text-orange-600 mb-6 text-sm font-medium">
        <ArrowLeft size={16} /> Retour
      </button>

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <CheckSquare className="text-orange-600" /> Tâches d&apos;Équipe
        </h1>
        <button type="button" onClick={() => setShowForm(!showForm)} className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 flex gap-2">
          <Plus size={18} /> Nouvelle Tâche
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-6 bg-white p-3 rounded-lg border border-slate-200 shadow-sm items-center">
        <Filter size={16} className="text-slate-400" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="p-2 border rounded-md text-sm">
          <option value="en_cours">En cours</option>
          <option value="terminee">Terminées</option>
          <option value="all">Toutes</option>
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="p-2 border rounded-md text-sm">
          {Object.entries(TASK_CATEGORY_LABELS).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
        <select
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className="p-2 border rounded-md text-sm"
        >
          <option value="all">Tous les membres</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>{p.display_name}</option>
          ))}
        </select>
        <span className="text-xs text-slate-400 ml-auto">{filteredTasks.length} tâche(s)</span>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Titre</label>
            <input
              required
              placeholder="Ex: Ranger le stock réserves"
              className="w-full p-2 border rounded-md"
              value={newTask.titre}
              onChange={(e) => setNewTask({ ...newTask, titre: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Description (texte libre)</label>
            <textarea
              placeholder="Détails optionnels…"
              rows={3}
              className="w-full p-2 border rounded-md"
              value={newTask.description}
              onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
            />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Assigner à</p>
            <div className="flex flex-wrap gap-2">
              {profiles.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm bg-slate-50 p-2 rounded-md border cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newTask.assignees.includes(p.id)}
                    onChange={(e) => {
                      const assignees = e.target.checked
                        ? [...newTask.assignees, p.id]
                        : newTask.assignees.filter((id) => id !== p.id);
                      setNewTask({ ...newTask, assignees });
                    }}
                  />
                  {p.display_name}
                </label>
              ))}
            </div>
          </div>
          <button type="submit" disabled={newTask.assignees.length === 0} className="bg-orange-600 text-white px-4 py-2 rounded-md w-full disabled:opacity-50">
            Assigner
          </button>
        </form>
      )}

      <div className="space-y-8">
        {categoryOrder.filter((cat) => grouped[cat]?.length).map((cat) => (
          <section key={cat}>
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3">
              {TASK_CATEGORY_LABELS[cat] || cat}
              <span className="ml-2 text-slate-400 font-normal normal-case">({grouped[cat].length})</span>
            </h2>
            <div className="space-y-4">
              {grouped[cat].map((task) => {
                const isEditing = editingTaskId === task.id;
                return (
                  <div
                    key={task.id}
                    className={`p-5 rounded-xl border shadow-sm ${task.statutGlobal === 'terminee' ? 'bg-emerald-50/30 border-emerald-100' : 'bg-white border-slate-200'}`}
                  >
                    <div className="flex justify-between items-start mb-2 gap-4">
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <div className="space-y-2 mb-3">
                            <input className="w-full p-2 border rounded-md font-bold text-lg" value={editTaskForm.titre} onChange={(e) => setEditTaskForm({ ...editTaskForm, titre: e.target.value })} />
                            <textarea className="w-full p-2 border rounded-md text-sm" rows={3} value={editTaskForm.description} onChange={(e) => setEditTaskForm({ ...editTaskForm, description: e.target.value })} />
                            <div className="flex gap-2">
                              <button type="button" onClick={() => saveEditTask(task.id)} className="bg-blue-600 text-white px-3 py-1.5 rounded-md flex items-center gap-1 text-sm"><Save size={14} /> Enregistrer</button>
                              <button type="button" onClick={() => setEditingTaskId(null)} className="bg-slate-200 text-slate-700 px-3 py-1.5 rounded-md flex items-center gap-1 text-sm"><X size={14} /> Annuler</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <h3 className="font-bold text-lg text-slate-800">{task.titre}</h3>
                            <div className="text-sm text-slate-500 mt-2">{renderTaskBody(task)}</div>
                          </>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {task.statutGlobal === 'en_cours' ? (
                          <div className="flex flex-wrap gap-2 justify-end">
                            {!isEditing && (
                              <button type="button" onClick={() => startEditing(task)} className="text-blue-600 p-2 bg-blue-50 rounded-md hover:bg-blue-100">
                                <Edit2 size={16} />
                              </button>
                            )}
                            <input
                              placeholder="Note de validation…"
                              className="text-xs p-2 border rounded-md w-40"
                              onChange={(e) => setComment({ ...comment, [task.id]: e.target.value })}
                            />
                            <button type="button" onClick={() => handleCompleteTask(task.id, task.created_at)} className="bg-emerald-600 text-white px-3 py-1.5 rounded-md hover:bg-emerald-700 flex items-center gap-1 text-sm">
                              <Check size={16} /> Valider
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                              <Check size={14} /> Terminée
                            </span>
                            <button type="button" onClick={() => handleUncomplete(task.id)} className="text-rose-600 p-1.5 bg-rose-50 rounded-md hover:bg-rose-100" title="Annuler la validation">
                              <RotateCcw size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-slate-400 mt-4 border-t pt-2">
                      Assignée à : {task.task_assignments.map((a) => a.profiles?.display_name).join(', ')}
                      {task.statutGlobal === 'terminee' && task.task_assignments.find((a) => a.commentaire)?.commentaire && (
                        <div className="mt-1 text-slate-600 italic font-medium">
                          Détails : {task.task_assignments.find((a) => a.commentaire)?.commentaire}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {filteredTasks.length === 0 && (
          <div className="text-slate-500 p-8 text-center bg-white rounded-xl border">Aucune tâche trouvée pour ce filtre.</div>
        )}
      </div>
    </div>
  );
}
