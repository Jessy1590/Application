import React, { useState, useEffect } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import format from 'date-fns/format';
import parse from 'date-fns/parse';
import startOfWeek from 'date-fns/startOfWeek';
import getDay from 'date-fns/getDay';
import fr from 'date-fns/locale/fr';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Pill, FileText, Trash2, Edit2, X } from 'lucide-react';
import { fetchAgendaEvents, fetchProfiles, createAgendaEvent, deleteAgendaEvent, updateAgendaEvent } from '../services/agendaService.js';
import { fetchTasksCompletionMap } from '../../tasks/services/taskService.js';
import { useAuth } from '../../../core/AuthContext.jsx';
import PatientOrderForm from '../../tasks/shared/PatientOrderForm.jsx';

const locales = { fr };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

function eventTitle(e) {
  if (e.type === 'commande_med') return `Commande: ${e.details?.medicament || '—'}`;
  if (e.type === 'facturation') return `Facturation: ${e.details?.facture || '—'}`;
  return String(e.type || '').replace(/_/g, ' ').toUpperCase();
}

export default function AgendaManager() {
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
    const relevant = rawEvents.filter((e) => e.type !== 'changement_horaire');
    const taskIds = relevant.map((e) => e.details?.taskId).filter(Boolean);
    const completion = await fetchTasksCompletionMap(taskIds);

    setEvents(relevant.map((e) => {
      const startDate = new Date(e.date_evenement);
      const done = e.details?.taskId ? !!completion[e.details.taskId] : false;
      return {
        id: e.id,
        title: eventTitle(e),
        start: startDate,
        end: startDate,
        allDay: true,
        resource: e,
        done,
        eventKind: e.type,
      };
    }));
    setProfiles(await fetchProfiles());
  };

  useEffect(() => { loadData(); }, []);

  const eventStyleGetter = (event) => {
    const isCmdOrBill = event.eventKind === 'commande_med' || event.eventKind === 'facturation';
    if (!isCmdOrBill) {
      return {
        style: {
          backgroundColor: '#64748b',
          borderColor: '#475569',
          color: '#fff',
        },
      };
    }
    if (event.done) {
      return {
        style: {
          backgroundColor: '#10b981',
          borderColor: '#059669',
          color: '#fff',
        },
      };
    }
    return {
      style: {
        backgroundColor: '#ef4444',
        borderColor: '#dc2626',
        color: '#fff',
      },
    };
  };

  const openEditForm = () => {
    const dateFormatee = selectedEvent.resource.date_evenement.split('T')[0];
    setFormData({
      ...selectedEvent.resource.details,
      id: selectedEvent.resource.id,
      type: selectedEvent.resource.type,
      date_evenement_originale: selectedEvent.resource.date_evenement,
      date: dateFormatee,
    });
    setModalType(selectedEvent.resource.type);
    setIsEditing(true);
    setUpdateFuture(false);
    setSelectedEvent(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const assignees = profiles.map((p) => p.id);
    if (isEditing) {
      await updateAgendaEvent(
        formData.id,
        formData.groupId,
        formData.date_evenement_originale,
        formData,
        updateFuture,
        assignees,
        user.id,
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
    if (window.confirm('Confirmer la suppression ?')) {
      await deleteAgendaEvent(
        selectedEvent.resource.id,
        selectedEvent.resource.details.groupId,
        deleteFuture,
        selectedEvent.resource.date_evenement,
      );
      setSelectedEvent(null);
      loadData();
    }
  };

  return (
    <div className="w-full">
      <div className="flex gap-4 mb-4">
        <button type="button" onClick={() => { setModalType('commande_med'); setIsEditing(false); setFormData({}); }} className="flex-1 bg-white border border-blue-200 text-blue-700 p-4 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-50 shadow-sm font-semibold">
          <Pill size={20} /> Commander Médicament
        </button>
        <button type="button" onClick={() => { setModalType('facturation'); setIsEditing(false); setFormData({}); }} className="flex-1 bg-white border border-emerald-200 text-emerald-700 p-4 rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-50 shadow-sm font-semibold">
          <FileText size={20} /> Facturation
        </button>
      </div>

      <div className="flex gap-4 mb-6 text-xs font-medium text-slate-600">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500" /> À faire</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500" /> Validée (≥ 1 membre)</span>
      </div>

      {selectedEvent && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-slate-800">{selectedEvent.title}</h2>
              <button type="button" onClick={() => setSelectedEvent(null)} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>
            <div className="text-sm text-slate-600 space-y-2 mb-6 bg-slate-50 p-4 rounded-lg">
              <p><strong>Du :</strong> {selectedEvent.start.toLocaleString('fr-FR')}</p>
              <p>
                <strong>Statut :</strong>{' '}
                <span className={selectedEvent.done ? 'text-emerald-700 font-semibold' : 'text-red-600 font-semibold'}>
                  {selectedEvent.done ? 'Validée' : 'À faire'}
                </span>
              </p>
              {selectedEvent.resource.details?.nom && (
                <p><strong>Patient :</strong> {selectedEvent.resource.details.nom} {selectedEvent.resource.details.prenom}</p>
              )}
              {selectedEvent.resource.details?.commentaire && (
                <p><strong>Notes :</strong> {selectedEvent.resource.details.commentaire}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <button type="button" onClick={openEditForm} className="bg-blue-100 text-blue-700 p-2 rounded-md font-medium hover:bg-blue-200 flex items-center justify-center gap-2">
                <Edit2 size={16} /> Modifier cet événement
              </button>
              <button type="button" onClick={() => handleDelete(false)} className="bg-rose-100 text-rose-700 p-2 rounded-md font-medium hover:bg-rose-200 flex items-center justify-center gap-2">
                <Trash2 size={16} /> Supprimer cet événement uniquement
              </button>
              {selectedEvent.resource.details?.groupId && selectedEvent.resource.type === 'commande_med' && (
                <button type="button" onClick={() => handleDelete(true)} className="bg-red-600 text-white p-2 rounded-md font-medium hover:bg-red-700 flex items-center justify-center gap-2">
                  <Trash2 size={16} /> Supprimer cet événement et les suivants
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {modalType && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4 uppercase">{isEditing ? 'Éditer' : 'Créer'} {modalType.replace('_', ' ')}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <PatientOrderForm
                type={modalType === 'commande_med' ? 'order' : 'billing'}
                form={formData}
                onChange={(patch) => setFormData((prev) => ({ ...prev, ...patch }))}
                compact
              />
              {isEditing && formData.groupId && modalType === 'commande_med' && (
                <label className="flex items-center gap-2 bg-blue-50 p-2 rounded border border-blue-200 text-sm font-medium text-blue-800">
                  <input type="checkbox" checked={updateFuture} onChange={(e) => setUpdateFuture(e.target.checked)} />
                  Appliquer la modification à cet événement et aux suivants
                </label>
              )}
              <div className="flex gap-2 pt-4">
                <button type="button" onClick={() => { setModalType(null); setIsEditing(false); }} className="flex-1 bg-slate-100 p-2 rounded font-medium hover:bg-slate-200 text-slate-700">Annuler</button>
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
          eventPropGetter={eventStyleGetter}
          messages={{ today: "Aujourd'hui", previous: 'Précédent', next: 'Suivant', month: 'Mois', week: 'Semaine', day: 'Jour' }}
        />
      </div>
    </div>
  );
}
