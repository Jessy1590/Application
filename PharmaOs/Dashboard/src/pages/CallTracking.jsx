import React, { useState, useEffect } from 'react';
import { fetchCallLogs, updateCallLog } from '../services/statsService';
import { 
  Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, 
  AlertTriangle, CheckCircle, Clock, Filter, AlertCircle, ArrowLeft, Edit2, Save, X 
} from 'lucide-react';

export default function CallTracking({ onNavigate, initialFilter }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Applique le filtre initial s'il existe
  const [statusFilter, setStatusFilter] = useState(initialFilter || 'all');
  const [motifFilter, setMotifFilter] = useState('all');

  // États pour l'édition en ligne
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ statut_traitement: '', notes_appel: '' });

  const loadData = async () => {
    try {
      const data = await fetchCallLogs();
      setLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleEditClick = (log) => {
    setEditingId(log.id);
    setEditForm({ 
      statut_traitement: log.statut_traitement || '', 
      notes_appel: log.notes_appel || '' 
    });
  };

  const handleSave = async (id) => {
    try {
      await updateCallLog(id, editForm);
      setEditingId(null);
      loadData(); // Recharge la liste pour afficher les modifs
    } catch (err) {
      alert("Erreur lors de la mise à jour.");
    }
  };

  const filteredLogs = logs.filter(log => {
    const matchStatus = statusFilter === 'all' || log.statut_traitement === statusFilter;
    const matchMotif = motifFilter === 'all' || log.motif === motifFilter;
    return matchStatus && matchMotif;
  });

  const getStatusBadge = (status) => {
    const config = {
      cloture: { color: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle size={14} />, label: 'Clôturé' },
      a_rappeler: { color: 'bg-rose-100 text-rose-700 font-bold', icon: <AlertCircle size={14} />, label: 'À rappeler' },
      transmis_pharmacien: { color: 'bg-amber-100 text-amber-700', icon: <AlertTriangle size={14} />, label: 'Transmis Pharmacien' },
      en_attente: { color: 'bg-orange-100 text-orange-700', icon: <Clock size={14} />, label: 'En attente' }
    };
    const c = config[status] || { color: 'bg-slate-100 text-slate-700', icon: null, label: status };
    return <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs w-max ${c.color}`}>{c.icon} {c.label}</span>;
  };

  if (loading) return <div className="p-8 text-slate-500">Chargement...</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <button 
        onClick={() => onNavigate('dashboard')}
        className="flex items-center gap-2 text-slate-500 hover:text-blue-600 transition-colors mb-6 text-sm font-medium"
      >
        <ArrowLeft size={16} /> Retour au Dashboard
      </button>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Phone className="text-emerald-600" /> Registre des Appels (Qualité)
        </h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center gap-4">
          <div className="flex items-center gap-2 text-slate-500 font-medium text-sm">
            <Filter size={16} /> Filtres :
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-sm border-slate-300 rounded-lg p-2 bg-white outline-none">
            <option value="all">Tous les statuts</option>
            <option value="a_rappeler">À rappeler</option>
            <option value="en_attente">En attente</option>
            <option value="transmis_pharmacien">Transmis Pharmacien</option>
            <option value="cloture">Clôturés</option>
          </select>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-white border-b border-slate-200 text-slate-600">
            <tr>
              <th className="p-4 font-medium w-1/5">Date</th>
              <th className="p-4 font-medium w-1/5">Contact</th>
              <th className="p-4 font-medium w-1/5">Statut</th>
              <th className="p-4 font-medium w-2/5">Notes & Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredLogs.map((log) => {
              const isEditing = editingId === log.id;
              
              return (
                <tr key={log.id} className={`${isEditing ? 'bg-blue-50/50' : 'hover:bg-slate-50'} transition-colors`}>
                  <td className="p-4 align-top">
                    <div className="font-medium text-slate-800">{new Date(log.created_at).toLocaleDateString('fr-FR')}</div>
                    <div className="text-xs text-slate-500">{new Date(log.created_at).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}</div>
                  </td>
                  
                  <td className="p-4 align-top">
                    <div className="font-medium text-slate-800">{log.contact_nom || 'Inconnu'}</div>
                    <div className="text-xs text-slate-500">{log.numero}</div>
                  </td>
                  
                  <td className="p-4 align-top">
                    {isEditing ? (
                      <select 
                        value={editForm.statut_traitement}
                        onChange={(e) => setEditForm({...editForm, statut_traitement: e.target.value})}
                        className="p-1.5 text-sm border rounded-md border-slate-300 bg-white w-full outline-none"
                      >
                        <option value="a_rappeler">À rappeler</option>
                        <option value="en_attente">En attente</option>
                        <option value="transmis_pharmacien">Transmis Pharmacien</option>
                        <option value="cloture">Clôturé</option>
                      </select>
                    ) : (
                      getStatusBadge(log.statut_traitement)
                    )}
                  </td>

                  <td className="p-4 align-top">
                    <div className="flex gap-3 items-start">
                      {isEditing ? (
                        <textarea 
                          value={editForm.notes_appel}
                          onChange={(e) => setEditForm({...editForm, notes_appel: e.target.value})}
                          className="flex-1 p-2 text-sm border rounded-md border-slate-300 bg-white outline-none resize-none"
                          rows="2"
                          placeholder="Ajouter une note..."
                        />
                      ) : (
                        <div className="flex-1 text-slate-600 text-sm whitespace-pre-wrap">
                          {log.notes_appel || <span className="text-slate-400 italic">Aucune note</span>}
                        </div>
                      )}

                      <div className="flex gap-2">
                        {isEditing ? (
                          <>
                            <button onClick={() => handleSave(log.id)} className="p-1.5 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 transition" title="Enregistrer">
                              <Save size={16} />
                            </button>
                            <button onClick={() => setEditingId(null)} className="p-1.5 bg-slate-200 text-slate-600 rounded hover:bg-slate-300 transition" title="Annuler">
                              <X size={16} />
                            </button>
                          </>
                        ) : (
                          <button onClick={() => handleEditClick(log)} className="p-1.5 bg-white border border-slate-200 text-slate-500 rounded hover:bg-blue-50 hover:text-blue-600 transition" title="Modifier">
                            <Edit2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredLogs.length === 0 && (
              <tr><td colSpan="4" className="p-8 text-center text-slate-500">Aucun appel ne correspond.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}