import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../core/AuthContext';
import { Activity, Save, History, CheckCircle2, UserPlus } from 'lucide-react';

export default function Ip() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [history, setHistory] = useState([]);
  const [doctors, setDoctors] = useState([]);

  // États pour la note médecin automatique
  const [addDoctorNote, setAddDoctorNote] = useState(false);
  const [doctorNoteText, setDoctorNoteText] = useState(`... --> ... le ${new Date().toLocaleDateString('fr-FR')}`);

  const initialForm = {
    patient_initiales: '', patient_age: '', patient_sexe: 'M',
    medecin_id: '', medecin_nom_libre: '',
    medicament_en_cause: '',
    probleme_identifie: '1- Contre-indication/Non-conformité',
    type_intervention: '1. Adaptation posologique',
    avis_prescripteur: 'Non contacte', // <-- AJOUT ICI
    devenir_intervention: '1. Acceptée par le prescripteur',
    mode_transmission: 'Appel téléphonique',
    statut_ip: 'Cloturee', commentaires: ''
  };

  const [formData, setFormData] = useState(initialForm);

  useEffect(() => {
    fetchHistory();
    fetchDoctors();
  }, []);

  const fetchHistory = async () => {
    try {
      const { data, error } = await supabase.schema('PharmaOs').from('act_ip_logs')
        .select('*, directory_contacts(nom, prenom)')
        .order('created_at', { ascending: false }).limit(10);
      if (!error && data) setHistory(data);
    } catch (err) { console.error(err); }
  };

  const fetchDoctors = async () => {
    try {
      const { data, error } = await supabase.schema('PharmaOs').from('directory_contacts')
        // Ajout de switch_rupture ici
        .select('id, nom, prenom, switch_rupture') 
        .eq('type', 'health_professional')
        .order('nom', { ascending: true });
      if (!error && data) setDoctors(data);
    } catch (err) { console.error(err); }
  };

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (!user?.id) throw new Error("Utilisateur non authentifié.");

      // NOUVEAU : On récupère le nom complet si un médecin de l'annuaire est sélectionné
      let medecinFinalNom = formData.medecin_nom_libre;
      if (formData.medecin_id) {
        const selectedDoc = doctors.find(d => d.id === formData.medecin_id);
        if (selectedDoc) medecinFinalNom = `Dr ${selectedDoc.nom} ${selectedDoc.prenom}`.trim();
      }

      const payload = {
        user_id: user.id,
        patient_initiales: formData.patient_initiales,
        patient_age: parseInt(formData.patient_age) || null,
        patient_sexe: formData.patient_sexe,
        medecin_id: formData.medecin_id || null,
        medecin_nom: medecinFinalNom, // <-- MODIFIÉ ICI
        medicament_en_cause: formData.medicament_en_cause,
        probleme_identifie: formData.probleme_identifie,
        type_intervention: formData.type_intervention,
        avis_prescripteur: formData.avis_prescripteur, // <-- AJOUT ICI
        devenir_intervention: formData.devenir_intervention,
        mode_transmission: formData.mode_transmission,
        statut_ip: formData.statut_ip,
        commentaires: formData.commentaires
      };

      const { error: insertError } = await supabase.schema('PharmaOs').from('act_ip_logs').insert([payload]);
      if (insertError) throw insertError;

      if (addDoctorNote && formData.medecin_id) {
        const selectedDoc = doctors.find(d => d.id === formData.medecin_id);
        
        // S'il y a déjà des consignes, on garde l'existant et on passe à la ligne (\n)
        const currentNotes = selectedDoc?.switch_rupture ? `${selectedDoc.switch_rupture}\n` : '';
        const newNotes = `${currentNotes}${doctorNoteText}`;
        
        const { error: updateError } = await supabase.schema('PharmaOs').from('directory_contacts')
          .update({ switch_rupture: newNotes }) // Ciblage de la bonne colonne
          .eq('id', formData.medecin_id);
        
        if (updateError) console.error("Erreur mise à jour consigne médecin", updateError);
        else fetchDoctors(); // Rafraîchir la liste en cache
      }

      setSuccessMsg('IP enregistrée selon normes SFPC.');
      setFormData(initialForm);
      setAddDoctorNote(false);
      fetchHistory();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setErrorMsg(err.message || "Erreur d'insertion.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-full flex bg-slate-50 text-slate-800">
      <div className="w-1/2 bg-white border-r border-slate-200 p-8 overflow-y-auto">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-slate-800">
          <Activity className="text-indigo-600" /> Saisie Act-IP
        </h2>
        
        {successMsg && <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 rounded-lg flex items-center gap-2 border border-emerald-200"><CheckCircle2 size={20} /> {successMsg}</div>}
        {errorMsg && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg border border-red-200 text-sm font-medium">Erreur : {errorMsg}</div>}

        <form onSubmit={handleSubmit} className="space-y-6 text-sm">
          {/* SECTION PATIENT */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <h3 className="font-bold text-slate-700 mb-3 border-b pb-2">1. Patient</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block font-semibold mb-1">Initiales</label>
                <input type="text" name="patient_initiales" required value={formData.patient_initiales} onChange={handleChange} className="w-full p-2 border rounded-lg uppercase focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block font-semibold mb-1">Âge</label>
                <input type="number" name="patient_age" value={formData.patient_age} onChange={handleChange} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block font-semibold mb-1">Sexe</label>
                <select name="patient_sexe" value={formData.patient_sexe} onChange={handleChange} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
                  <option value="M">M</option><option value="F">F</option>
                </select>
              </div>
            </div>
          </div>

          {/* SECTION MEDECIN */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <h3 className="font-bold text-slate-700 mb-3 border-b pb-2 flex items-center justify-between">
              2. Prescripteur
            </h3>
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <label className="block font-semibold mb-1">Depuis l'annuaire</label>
                <select name="medecin_id" value={formData.medecin_id} onChange={handleChange} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
                  <option value="">-- Autre médecin (texte libre) --</option>
                  {doctors.map(doc => (
                    <option key={doc.id} value={doc.id}>Dr. {doc.nom} {doc.prenom}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Ou saisie manuelle</label>
                <input type="text" name="medecin_nom_libre" disabled={!!formData.medecin_id} value={formData.medecin_nom_libre} onChange={handleChange} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-200" placeholder="Nom du médecin" />
              </div>
            </div>
            
            {formData.medecin_id && (
              <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-indigo-900 mb-2">
                  <input type="checkbox" checked={addDoctorNote} onChange={(e) => setAddDoctorNote(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500" />
                  Ajouter une note de rupture/changement dans le dossier du médecin
                </label>
                {addDoctorNote && (
                  <input type="text" value={doctorNoteText} onChange={(e) => setDoctorNoteText(e.target.value)} className="w-full p-2 border border-indigo-200 rounded text-xs focus:ring-2 focus:ring-indigo-500" placeholder="Ex: Colchimax --> Colchicine le 27/08/26" />
                )}
              </div>
            )}
          </div>

          {/* SECTION INTERVENTION SFPC */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <h3 className="font-bold text-slate-700 mb-3 border-b pb-2">3. Problème et Intervention (SFPC)</h3>
            
            <div className="mb-4">
              <label className="block font-semibold mb-1">Médicament en cause</label>
              <input type="text" name="medicament_en_cause" required value={formData.medicament_en_cause} onChange={handleChange} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" />
            </div>

            <div className="mb-4">
              <label className="block font-semibold mb-1">Identification du problème</label>
              <select name="probleme_identifie" value={formData.probleme_identifie} onChange={handleChange} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
                <option value="1- Contre-indication/Non-conformité">1- Contre-indication/Non-conformité aux référentiels</option>
                <option value="2- Problème de posologie">2- Problème de posologie</option>
                <option value="3- Interaction Médicamenteuse">3- Interaction Médicamenteuse</option>
                <option value="4- Effet indésirable">4- Effet indésirable</option>
                <option value="5- Oubli de prescription">5- Oubli de prescription</option>
                <option value="6- Médicament non reçu (Rupture/Inobservance)">6- Médicament non reçu (Rupture/Inobservance)</option>
                <option value="7- Prescription d'un médicament non justifié">7- Prescription d'un médicament non justifié</option>
                <option value="8- Redondance">8- Redondance</option>
                <option value="9- Prescription non conforme">9- Prescription non conforme</option>
                <option value="10- Monitorage à suivre">10- Monitorage à suivre</option>
                <option value="11- Pharmacodépendance">11- Pharmacodépendance</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block font-semibold mb-1">Intervention</label>
              <select name="type_intervention" value={formData.type_intervention} onChange={handleChange} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
                <option value="1. Adaptation posologique">1. Adaptation posologique</option>
                <option value="2. Choix de la voie d'administration">2. Choix de la voie d'administration</option>
                <option value="3. Amélioration de la méthode de dispensation">3. Amélioration de la méthode de dispensation</option>
                <option value="4. Suivi thérapeutique">4. Suivi thérapeutique</option>
                <option value="5. Ajout (prescription nouvelle)">5. Ajout (prescription nouvelle)</option>
                <option value="6. Changement de médicament">6. Changement de médicament</option>
                <option value="7. Arrêt ou refus de délivrer">7. Arrêt ou refus de délivrer</option>
              </select>
            </div>
          </div>

          {/* SECTION RESULTAT */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <h3 className="font-bold text-slate-700 mb-3 border-b pb-2">4. Résultat & Transmission</h3>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block font-semibold mb-1">Transmission</label>
                <select name="mode_transmission" value={formData.mode_transmission} onChange={handleChange} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
                  <option value="Oralement">Oralement</option>
                  <option value="Appel téléphonique">Appel téléphonique</option>
                  <option value="Papier">Papier</option>
                  <option value="Voie électronique sécurisée">Voie électronique sécurisée</option>
                  <option value="Texto/Messagerie instantanée">Texto/Messagerie instantanée</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Avis du prescripteur</label>
                <select name="avis_prescripteur" value={formData.avis_prescripteur} onChange={handleChange} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
                  <option value="Accepte">Accepté</option>
                  <option value="Refuse">Refusé</option>
                  <option value="Non joignable">Non joignable</option>
                  <option value="Non contacte">Non contacté</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Devenir de l'intervention</label>
                <select name="devenir_intervention" value={formData.devenir_intervention} onChange={handleChange} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-xs">
                  <option value="1. Acceptée par le prescripteur">1. Acceptée par le prescripteur</option>
                  <option value="2. Non acceptée sans motif">2. Non acceptée sans motif</option>
                  <option value="3. Non acceptée avec motif">3. Non acceptée avec motif</option>
                  <option value="4. Refus délivrance avec appel">4. Refus délivrance avec appel</option>
                  <option value="5. Refus délivrance sans appel">5. Refus délivrance sans appel</option>
                  <option value="6. Acceptation patient (sans appel doc)">6. Acceptation patient (sans appel doc)</option>
                  <option value="7. Non acceptation patient">7. Non acceptation patient</option>
                </select>
              </div>
            </div>

            <div className="mb-4">
              <label className="block font-semibold mb-1">Détail du contexte (Notes)</label>
              <textarea name="commentaires" value={formData.commentaires} onChange={handleChange} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" rows="3"></textarea>
            </div>
            
            <div>
              <label className="block font-semibold mb-1">Statut IP</label>
              <select name="statut_ip" value={formData.statut_ip} onChange={handleChange} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500">
                <option value="Cloturee">Clôturée</option>
                <option value="En attente">En attente</option>
              </select>
            </div>
          </div>

          <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl flex justify-center gap-2 transition-colors shadow-md">
            <Save size={20} /> {loading ? 'Validation en cours...' : 'Valider l\'IP SFPC'}
          </button>
        </form>
      </div>

      <div className="w-1/2 bg-slate-100 p-8 overflow-y-auto">
        <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-700">
          <History className="text-slate-500" /> Historique Act-IP
        </h3>
        <div className="space-y-3">
          {history.map((log) => (
            <div key={log.id} className="bg-white p-4 rounded-lg border shadow-sm text-sm">
              <div className="flex justify-between items-start mb-2">
                <span className="font-bold">{log.patient_initiales} ({log.patient_age || '?'} ans)</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  log.statut_ip === 'Cloturee' ? 'bg-indigo-100 text-indigo-700' : 
                  log.statut_ip === 'Déclaré' ? 'bg-slate-100 text-slate-500' : 
                  'bg-amber-100 text-amber-700'
                }`}>
                  {log.statut_ip}
                </span>
              </div>
              <p className="font-medium text-slate-800">
                Dr. {log.medecin_id ? log.directory_contacts?.nom : log.medecin_nom || 'Non renseigné'}
              </p>
              <p className="text-slate-600 mt-1"><span className="font-semibold text-slate-700">Traitement:</span> {log.medicament_en_cause}</p>
              <div className="mt-2 p-2 bg-slate-50 rounded border border-slate-100 text-xs text-slate-600">
                <p><strong>Prob:</strong> {log.probleme_identifie}</p>
                <p><strong>Int:</strong> {log.type_intervention}</p>
                <p><strong>Résultat:</strong> {log.devenir_intervention}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}