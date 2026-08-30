import React, { useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../core/AuthContext';
import { Save, ShoppingBag, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

export default function QuickAction({ type }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  
  const initialForm = {
    nom: '', prenom: '', dob: '', medicament_ou_facture: '',
    cip: '', recurrence_semaines: 4, repetitions: 3,
    date: new Date().toISOString().split('T')[0], commentaire: ''
  };
  const [form, setForm] = useState(initialForm);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      const isOrder = type === 'order';
      // Utilisation des types exacts attendus par le Dashboard
      const dbType = isOrder ? 'commande_med' : 'facturation';
      const groupId = crypto.randomUUID();

      // 1. Récupération de l'équipe
      const { data: profiles, error: profilesError } = await supabase.schema('portail').from('profiles').select('id');
      if (profilesError) throw new Error(`Erreur Profils: ${profilesError.message}`);
      const assignees = profiles ? profiles.map(p => p.id) : [];

      // 2. Base des détails (identique pour Facture et Commande)
      const baseDetails = {
        nom: form.nom.toUpperCase(),
        prenom: form.prenom.toUpperCase(),
        dob: form.dob,
        commentaire: form.commentaire,
        groupId
      };

      let eventsToInsert = [];

      // --- LOGIQUE POUR LES COMMANDES (RÉCURRENCE) ---
      if (isOrder) {
        baseDetails.medicament = form.medicament_ou_facture;
        baseDetails.cip = form.cip;
        baseDetails.recurrence_semaines = form.recurrence_semaines.toString();
        const reps = parseInt(form.repetitions, 10);
        const weeks = parseInt(form.recurrence_semaines, 10);

        for (let i = 0; i < reps; i++) {
          const eventDate = new Date(form.date);
          eventDate.setDate(eventDate.getDate() + (i * weeks * 7));
          const isoDate = eventDate.toISOString();
          const displayDate = eventDate.toLocaleDateString('fr-FR');

          const titreTache = `Commande : ${baseDetails.medicament} (${i + 1}/${reps}) - Pour le ${displayDate}`;
          const detailsJson = { ...baseDetails, seriesIndex: i + 1, totalSeries: reps, date: isoDate.split('T')[0] };

          // Création de la tâche pour cette itération
          const { data: task, error: taskError } = await supabase.schema('PharmaOs').from('tasks')
            .insert([{ titre: titreTache, description: JSON.stringify(detailsJson), created_by: user.id }])
            .select().single();
          if (taskError) throw new Error(`Erreur Tâche: ${taskError.message}`);

          // Assignation de la tâche
          if (assignees.length > 0) {
            const assignments = assignees.map(userId => ({ task_id: task.id, user_id: userId, statut: 'en_cours' }));
            const { error: assignError } = await supabase.schema('PharmaOs').from('task_assignments').insert(assignments);
            if (assignError) throw new Error(`Erreur Assignation: ${assignError.message}`);
          }

          // Préparation de l'événement d'agenda
          eventsToInsert.push({
            type: dbType,
            date_evenement: isoDate,
            details: { ...detailsJson, taskId: task.id }
          });
        }
      } 
      // --- LOGIQUE POUR LES FACTURES (ÉVÉNEMENT UNIQUE) ---
      else {
        baseDetails.facture = form.medicament_ou_facture;
        baseDetails.date = form.date;

        const titreTache = `Facturation : ${baseDetails.facture || 'En attente'}`;

        // Création de la tâche
        const { data: task, error: taskError } = await supabase.schema('PharmaOs').from('tasks')
          .insert([{ titre: titreTache, description: JSON.stringify(baseDetails), created_by: user.id }])
          .select().single();
        if (taskError) throw new Error(`Erreur Tâche: ${taskError.message}`);

        // Assignation de la tâche
        if (assignees.length > 0) {
          const assignments = assignees.map(userId => ({ task_id: task.id, user_id: userId, statut: 'en_cours' }));
          const { error: assignError } = await supabase.schema('PharmaOs').from('task_assignments').insert(assignments);
          if (assignError) throw new Error(`Erreur Assignation: ${assignError.message}`);
        }

        // Préparation de l'événement d'agenda
        eventsToInsert.push({
          type: dbType,
          date_evenement: form.date,
          details: { ...baseDetails, taskId: task.id }
        });
      }

      // 3. Insertion groupée dans l'agenda
      const { error: agendaError } = await supabase.schema('PharmaOs').from('agenda_events').insert(eventsToInsert);
      if (agendaError) throw new Error(`Erreur Agenda: ${agendaError.message}`);

      setSuccessMsg("Créé et assigné à l'équipe avec succès.");
      setForm(initialForm);
      setTimeout(() => setSuccessMsg(''), 3000);

    } catch (err) {
      console.error(err);
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 text-slate-800">
      <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center gap-2 shadow-sm">
        {type === 'order' ? <ShoppingBag className="text-emerald-500" /> : <FileText className="text-sky-500" />}
        <h2 className="font-bold text-xl">
          {type === 'order' ? 'Commander un médicament' : 'Facturation à effectuer'}
        </h2>
      </div>

      <div className="p-6 overflow-y-auto">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5 text-sm">
          
          {successMsg && (
            <div className="p-3 bg-emerald-50 text-emerald-700 rounded-lg flex items-center gap-2 border border-emerald-200">
              <CheckCircle2 size={18} /> {successMsg}
            </div>
          )}
          {errorMsg && (
            <div className="p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 border border-red-200 break-words">
              <AlertCircle size={18} className="shrink-0" /> {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">Nom du Patient</label>
              <input type="text" required value={form.nom} onChange={e => setForm({...form, nom: e.target.value})} className="w-full p-2 border bg-slate-50 rounded focus:ring-2 focus:ring-sky-500 uppercase" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Prénom du Patient</label>
              <input type="text" required value={form.prenom} onChange={e => setForm({...form, prenom: e.target.value})} className="w-full p-2 border bg-slate-50 rounded focus:ring-2 focus:ring-sky-500 uppercase" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div>
              <label className="block font-semibold mb-1">Date de naissance</label>
              <input type="date" required value={form.dob} onChange={e => setForm({...form, dob: e.target.value})} className="w-full p-2 border bg-slate-50 rounded focus:ring-2 focus:ring-sky-500" />
            </div>
            <div>
              <label className="block font-semibold mb-1">{type === 'order' ? 'Nom du médicament' : 'N° de facture'}</label>
              <input type="text" required value={form.medicament_ou_facture} onChange={e => setForm({...form, medicament_ou_facture: e.target.value})} className="w-full p-2 border bg-slate-50 rounded focus:ring-2 focus:ring-sky-500" />
            </div>
          </div>

          {type === 'order' && (
            <div className="grid grid-cols-3 gap-4">
               <div>
                <label className="block font-semibold mb-1">Code CIP</label>
                <input type="text" value={form.cip} onChange={e => setForm({...form, cip: e.target.value})} className="w-full p-2 border bg-slate-50 rounded focus:ring-2 focus:ring-sky-500" />
              </div>
              <div>
                <label className="block font-semibold mb-1">Récurrence (sem)</label>
                <input type="number" value={form.recurrence_semaines} onChange={e => setForm({...form, recurrence_semaines: e.target.value})} className="w-full p-2 border bg-slate-50 rounded focus:ring-2 focus:ring-sky-500" />
              </div>
              <div>
                <label className="block font-semibold mb-1">Répétitions</label>
                <input type="number" value={form.repetitions} onChange={e => setForm({...form, repetitions: e.target.value})} className="w-full p-2 border bg-slate-50 rounded focus:ring-2 focus:ring-sky-500" />
              </div>
            </div>
          )}

          <div>
            <label className="block font-semibold mb-1">Date exacte</label>
            <input type="date" required value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="w-full p-2 border bg-slate-50 rounded focus:ring-2 focus:ring-sky-500" />
          </div>

          <div>
            <label className="block font-semibold mb-1">Commentaire</label>
            <textarea rows="3" value={form.commentaire} onChange={e => setForm({...form, commentaire: e.target.value})} className="w-full p-2 border bg-slate-50 rounded focus:ring-2 focus:ring-sky-500" />
          </div>

          <button type="submit" disabled={loading} className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 rounded-lg flex justify-center gap-2 transition-colors">
            <Save size={18} /> {loading ? 'Enregistrement...' : 'Créer et assigner à l\'équipe'}
          </button>
        </form>
      </div>
    </div>
  );
}