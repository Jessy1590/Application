import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../core/AuthContext';
import { Phone, Save, Clock, History, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function Calls({ data: initialContact }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [history, setHistory] = useState([]);

  // État du formulaire ISO 9001
  const [formData, setFormData] = useState({
    type: 'out',
    contact_nom: '',
    numero: '',
    contact_id: null,
    motif: 'renseignement_patient',
    statut_traitement: 'cloture',
    duree_secondes: 0,
    notes_appel: ''
  });

  // Pré-remplissage depuis l'annuaire
  useEffect(() => {
    if (initialContact) {
      setFormData(prev => ({
        ...prev,
        contact_id: initialContact.id,
        contact_nom: `${initialContact.prenom || ''} ${initialContact.nom || ''}`.trim(),
        numero: initialContact.telephone || initialContact.telephone_prive || '',
      }));
    }
    fetchHistory();
  }, [initialContact]);

  const fetchHistory = async () => {
    try {
      const { data, error } = await supabase
        .schema('PharmaOs')
        .from('call_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (!error && data) setHistory(data);
    } catch (err) {
      console.error("Erreur historique:", err);
    }
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSuccessMsg('');

    try {
      const { error } = await supabase
        .schema('PharmaOs')
        .from('call_logs')
        .insert([{
          user_id: user.id,
          type: formData.type,
          contact_id: formData.contact_id,
          contact_nom: formData.contact_nom,
          numero: formData.numero,
          motif: formData.motif,
          statut_traitement: formData.statut_traitement,
          duree_secondes: parseInt(formData.duree_secondes) || 0,
          notes_appel: formData.notes_appel
        }]);

      if (error) throw error;

      setSuccessMsg('Appel tracé avec succès.');
      fetchHistory(); // Rafraîchit la colonne de droite
      
      // Réinitialisation partielle (on garde le contact s'il vient de l'annuaire)
      setFormData(prev => ({
        ...prev,
        notes_appel: '',
        duree_secondes: 0,
        statut_traitement: 'cloture'
      }));

      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error("Erreur sauvegarde:", err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-full flex bg-slate-50 text-slate-800">
      
      {/* FORMULAIRE ISO 9001 */}
      <div className="w-1/2 bg-white border-r border-slate-200 p-8 overflow-y-auto">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-slate-800">
          <Phone className="text-sky-600" /> Tracer un appel
        </h2>

        {successMsg && (
          <div className="mb-6 p-4 bg-emerald-50 text-emerald-700 rounded-lg flex items-center gap-2 border border-emerald-200">
            <CheckCircle2 size={20} /> {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Direction</label>
              <select name="type" value={formData.type} onChange={handleInputChange} className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500">
                <option value="in">Entrant</option>
                <option value="out">Sortant</option>
                <option value="missed">Manqué</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Numéro</label>
              <input type="text" name="numero" value={formData.numero} onChange={handleInputChange} required className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500" placeholder="01 23..." />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Interlocuteur</label>
            <input type="text" name="contact_nom" value={formData.contact_nom} onChange={handleInputChange} className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500" placeholder="Nom du patient, Dr, Labo..." />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Motif (Qualité)</label>
              <select name="motif" value={formData.motif} onChange={handleInputChange} className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500">
                <option value="information_medicale">Information Médicale</option>
                <option value="commande_labo">Commande Labo</option>
                <option value="reclamation_patient">Réclamation Patient</option>
                <option value="renseignement_patient">Renseignement Patient</option>
                <option value="autre">Autre</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Statut</label>
              <select name="statut_traitement" value={formData.statut_traitement} onChange={handleInputChange} className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500">
                <option value="cloture">Clôturé</option>
                <option value="a_rappeler">À rappeler</option>
                <option value="transmis_pharmacien">Transmis Pharmacien</option>
                <option value="en_attente">En attente</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Notes de l'appel</label>
            <textarea name="notes_appel" value={formData.notes_appel} onChange={handleInputChange} rows="4" className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500" placeholder="Résumé de l'échange..."></textarea>
          </div>

          <button type="submit" disabled={loading} className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-70">
            <Save size={20} /> {loading ? 'Enregistrement...' : 'Valider la fiche d\'appel'}
          </button>
        </form>
      </div>

      {/* HISTORIQUE RÉCENT */}
      <div className="w-1/2 bg-slate-100 p-8 overflow-y-auto">
        <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-700">
          <History className="text-slate-500" /> Derniers appels tracés
        </h3>
        
        <div className="space-y-3">
          {history.length === 0 ? (
            <p className="text-slate-500 text-sm">Aucun historique récent.</p>
          ) : (
            history.map((log) => (
              <div key={log.id} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold text-slate-800">{log.contact_nom || 'Inconnu'}</span>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    log.statut_traitement === 'cloture' ? 'bg-emerald-100 text-emerald-700' : 
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {log.statut_traitement.replace('_', ' ')}
                  </span>
                </div>
                <div className="text-sm text-slate-500 flex items-center gap-4">
                  <span className="flex items-center gap-1"><Phone size={14} /> {log.numero}</span>
                  <span className="flex items-center gap-1 capitalize"><AlertCircle size={14} /> {log.motif.replace('_', ' ')}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}