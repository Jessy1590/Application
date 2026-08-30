import React, { useState, useEffect } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import format from 'date-fns/format';
import parse from 'date-fns/parse';
import startOfWeek from 'date-fns/startOfWeek';
import getDay from 'date-fns/getDay';
import fr from 'date-fns/locale/fr';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { ArrowLeft, Pill, FileText, Clock, Trash2, Edit2, X } from 'lucide-react';
import { fetchAgendaEvents, fetchProfiles, createAgendaEvent, deleteAgendaEvent, updateAgendaEvent } from '../services/agendaTaskService';
import { useAuth } from '../core/AuthContext';

const locales = { 'fr': fr };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

export default function AgendaManager({ onNavigate }) {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [profiles, setProfiles] = useState([]);
  
  const [modalType, setModalType] = useState(null); 
  const [formData, setFormData] = useState({});
  const [selectedEvent, setSelectedEvent] = useState(null);
  
  const [isEditing, setIsEditing] = useState(false);
  const [updateFuture, setUpdateFuture] = useState(false);

  const loadData = async () => {
    const rawEvents = await fetchAgendaEvents();
    setEvents(rawEvents.map(e => {
      // Construction précise de la date de début et de fin pour "changement_horaire"
      const startDate = e.type === 'changement_horaire' && e.details.heure_debut 
        ? new Date(`${e.date_evenement.split('T')[0]}T${e.details.heure_debut}:00`)
        : new Date(e.date_evenement);
        
      const endDate = e.type === 'changement_horaire' && e.details.date_fin
        ? new Date(`${e.details.date_fin}T${e.details.heure_fin || '23:59'}:00`)
        : startDate;

      return {
        id: e.id,
        title: e.type === 'commande_med' ? `Commande: ${e.details.medicament}` : e.type.replace('_', ' ').toUpperCase(),
        start: startDate,
        end: endDate,
        allDay: e.type !== 'changement_horaire',
        resource: e
      };
    }));
    setProfiles(await fetchProfiles());
  };

  useEffect(() => { loadData(); }, []);

  const openEditForm = () => {
    const dateFormatee = selectedEvent.resource.date_evenement.split('T')[0];
    
    setFormData({
      ...selectedEvent.resource.details,
      id: selectedEvent.resource.id,
      type: selectedEvent.resource.type, // <--- TRÈS IMPORTANT pour éviter le type null
      date_evenement_originale: selectedEvent.resource.date_evenement,
      date: dateFormatee
    });
    setModalType(selectedEvent.resource.type);
    setIsEditing(true);
    setUpdateFuture(false);
    setSelectedEvent(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const assignees = profiles.map(p => p.id);
    
    if (isEditing) {
      // Ajout de assignees et user.id à la fin pour recréer les tâches
      await updateAgendaEvent(
        formData.id, 
        formData.groupId, 
        formData.date_evenement_originale, 
        formData, 
        updateFuture, 
        assignees, 
        user.id
      );
    } else {
      await createAgendaEvent(modalType, formData.date, formData, assignees, user.id);
    }
    
    setModalType(null);
    setIsEditing(false);
    setFormData({});
    loadData();
  };
  
  const handleDelete = async (deleteFuture = false) => {
    if (window.confirm("Confirmer la suppression ?")) {
      await deleteAgendaEvent(selectedEvent.resource.id, selectedEvent.resource.details.groupId, deleteFuture, selectedEvent.resource.date_evenement);
      setSelectedEvent(null);
      loadData();
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <button onClick={() => onNavigate('dashboard')} className="flex items-center gap-2 text-slate-500 hover:text-purple-600 mb-6 text-sm font-medium"><ArrowLeft size={16} /> Retour</button>
      
      <div className="flex gap-4 mb-8">
        <button onClick={() => { setModalType('commande_med'); setIsEditing(false); setFormData({}); }} className="flex-1 bg-white border border-blue-200 text-blue-700 p-4 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-50 shadow-sm font-semibold"><Pill size={20}/> Commander Médicament</button>
        <button onClick={() => { setModalType('facturation'); setIsEditing(false); setFormData({}); }} className="flex-1 bg-white border border-emerald-200 text-emerald-700 p-4 rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-50 shadow-sm font-semibold"><FileText size={20}/> Facturation</button>
        <button onClick={() => { setModalType('changement_horaire'); setIsEditing(false); setFormData({}); }} className="flex-1 bg-white border border-rose-200 text-rose-700 p-4 rounded-xl flex items-center justify-center gap-2 hover:bg-rose-50 shadow-sm font-semibold"><Clock size={20}/> Changement Horaires</button>
      </div>

      {/* Modal d'édition/suppression d'événement */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-slate-800">{selectedEvent.title}</h2>
              <button onClick={() => setSelectedEvent(null)} className="text-slate-400 hover:text-slate-700"><X size={20}/></button>
            </div>
            
            <div className="text-sm text-slate-600 space-y-2 mb-6 bg-slate-50 p-4 rounded-lg">
              <p><strong>Du :</strong> {selectedEvent.start.toLocaleString('fr-FR')}</p>
              {selectedEvent.resource.type === 'changement_horaire' && <p><strong>Au :</strong> {selectedEvent.end.toLocaleString('fr-FR')}</p>}
              {selectedEvent.resource.details.nom && <p><strong>Patient :</strong> {selectedEvent.resource.details.nom} {selectedEvent.resource.details.prenom}</p>}
              {selectedEvent.resource.details.assignee_id && <p><strong>Personne concernée :</strong> {profiles.find(p => p.id === selectedEvent.resource.details.assignee_id)?.display_name}</p>}
              {selectedEvent.resource.details.commentaire && <p><strong>Notes :</strong> {selectedEvent.resource.details.commentaire}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <button onClick={openEditForm} className="bg-blue-100 text-blue-700 p-2 rounded-md font-medium hover:bg-blue-200 flex items-center justify-center gap-2"><Edit2 size={16}/> Modifier cet événement</button>
              <button onClick={() => handleDelete(false)} className="bg-rose-100 text-rose-700 p-2 rounded-md font-medium hover:bg-rose-200 flex items-center justify-center gap-2"><Trash2 size={16}/> Supprimer cet événement uniquement</button>
              {selectedEvent.resource.details.groupId && selectedEvent.resource.type === 'commande_med' && (
                <button onClick={() => handleDelete(true)} className="bg-red-600 text-white p-2 rounded-md font-medium hover:bg-red-700 flex items-center justify-center gap-2"><Trash2 size={16}/> Supprimer cet événement et les suivants</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de création / édition */}
      {modalType && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4 uppercase">{isEditing ? 'Éditer' : 'Créer'} {modalType.replace('_', ' ')}</h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Informations Patient */}
              {['commande_med', 'facturation'].includes(modalType) && (
                <div className="bg-slate-50 p-3 rounded border space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <input required placeholder="Nom (2 lett.)" value={formData.nom || ''} className="w-full p-2 border rounded uppercase" maxLength={2} onChange={e=>setFormData({...formData, nom: e.target.value.toUpperCase()})}/>
                    <input required placeholder="Pré. (2 lett.)" value={formData.prenom || ''} className="w-full p-2 border rounded uppercase" maxLength={2} onChange={e=>setFormData({...formData, prenom: e.target.value.toUpperCase()})}/>
                    <input type="date" required value={formData.dob || ''} className="w-full p-2 border rounded text-sm" onChange={e=>setFormData({...formData, dob: e.target.value})}/>
                  </div>
                </div>
              )}

              {/* Spécifique Commande */}
              {modalType === 'commande_med' && (
                <div className="space-y-3">
                  <input required placeholder="Nom du médicament" value={formData.medicament || ''} className="w-full p-2 border rounded" onChange={e=>setFormData({...formData, medicament: e.target.value})}/>
                  <input required placeholder="Code CIP" value={formData.cip || ''} className="w-full p-2 border rounded" onChange={e=>setFormData({...formData, cip: e.target.value})}/>
                  <div className="grid grid-cols-2 gap-2 bg-blue-50 p-3 rounded border border-blue-100">
                    <div>
                      <label className="text-xs font-bold text-blue-700">Fréquence (Semaines)</label>
                      <input type="number" min="1" required value={formData.recurrence_semaines || ''} className="w-full p-2 border rounded mt-1" onChange={e=>setFormData({...formData, recurrence_semaines: e.target.value})}/>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-blue-700">Répétitions totales</label>
                      <input type="number" min="1" required value={formData.repetitions || ''} className="w-full p-2 border rounded mt-1" onChange={e=>setFormData({...formData, repetitions: e.target.value})}/>
                    </div>
                  </div>
                </div>
              )}

              {/* Spécifique Facturation */}
              {modalType === 'facturation' && (
                <input placeholder="N° de la facture" value={formData.facture || ''} className="w-full p-2 border rounded" onChange={e=>setFormData({...formData, facture: e.target.value})}/>
              )}

              {/* Spécifique Horaires (Multidate/Heure) */}
              {modalType === 'changement_horaire' && (
                <div className="space-y-3 bg-rose-50 p-3 rounded border border-rose-100">
                  <select required value={formData.assignee_id || ''} className="w-full p-2 border rounded bg-white" onChange={e=>setFormData({...formData, assignee_id: e.target.value})}>
                    <option value="">Sélectionner la personne...</option>
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                  </select>
                  <select required value={formData.motif || ''} className="w-full p-2 border rounded bg-white" onChange={e=>setFormData({...formData, motif: e.target.value})}>
                    <option value="">Sélectionner un motif...</option>
                    <option value="Congés">Congés</option>
                    <option value="Vacances">Période de vacances</option>
                    <option value="Absence injustifiée">Absence injustifiée</option>
                    <option value="Retard">Retard</option>
                  </select>

                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <label className="text-xs font-bold text-slate-600">Date début</label>
                      <input type="date" required value={formData.date || ''} className="w-full p-2 border rounded text-sm" onChange={e=>setFormData({...formData, date: e.target.value})}/>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600">Heure début</label>
                      <input type="time" value={formData.heure_debut || ''} className="w-full p-2 border rounded text-sm" onChange={e=>setFormData({...formData, heure_debut: e.target.value})}/>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600">Date fin (optionnel)</label>
                      <input type="date" value={formData.date_fin || ''} className="w-full p-2 border rounded text-sm" onChange={e=>setFormData({...formData, date_fin: e.target.value})}/>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600">Heure fin</label>
                      <input type="time" value={formData.heure_fin || ''} className="w-full p-2 border rounded text-sm" onChange={e=>setFormData({...formData, heure_fin: e.target.value})}/>
                    </div>
                  </div>
                </div>
              )}

              {/* Date unique pour Commande et Facturation */}
              {modalType !== 'changement_horaire' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Date du 1er événement</label>
                  <input type="date" required value={formData.date || ''} className="w-full p-3 border rounded-lg font-bold text-purple-700 bg-purple-50 border-purple-200" onChange={e=>setFormData({...formData, date: e.target.value})}/>
                </div>
              )}

              <textarea placeholder="Commentaire optionnel..." value={formData.commentaire || ''} className="w-full p-2 border rounded text-sm" rows="2" onChange={e=>setFormData({...formData, commentaire: e.target.value})}/>

              {/* Case à cocher "Mettre à jour les futurs" en mode Édition pour les récurrences */}
              {isEditing && formData.groupId && modalType === 'commande_med' && (
                <label className="flex items-center gap-2 bg-blue-50 p-2 rounded border border-blue-200 text-sm font-medium text-blue-800">
                  <input type="checkbox" checked={updateFuture} onChange={(e) => setUpdateFuture(e.target.checked)} />
                  Appliquer la modification à cet événement et aux suivants
                </label>
              )}

              <div className="flex gap-2 pt-4">
                <button type="button" onClick={() => {setModalType(null); setIsEditing(false);}} className="flex-1 bg-slate-100 p-2 rounded font-medium hover:bg-slate-200 text-slate-700">Annuler</button>
                <button type="submit" className="flex-1 bg-purple-600 text-white p-2 rounded font-medium hover:bg-purple-700">{isEditing ? 'Mettre à jour' : 'Valider'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm" style={{ height: 600 }}>
        <Calendar 
          localizer={localizer} 
          events={events} 
          startAccessor="start" 
          endAccessor="end" 
          culture="fr" 
          onSelectEvent={(e) => setSelectedEvent(e)}
          messages={{today: "Aujourd'hui", previous: 'Précédent', next: 'Suivant', month: 'Mois', week: 'Semaine', day: 'Jour'}}
        />
      </div>
    </div>
  );
}