import React, { useState, useEffect } from 'react';
import { fetchIps, updateIp } from '../services/ipService';
import { Activity, Edit2, AlertTriangle, CheckCircle, Check, Copy, ArrowLeft, X, Save, FileJson } from 'lucide-react';

export default function IpManagement({ onNavigate }) {
  const [ips, setIps] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // États de l'UI
  const [statusFilter, setStatusFilter] = useState('all');
  
  // États des Modales
  const [editingIp, setEditingIp] = useState(null);
  const [declareIp, setDeclareIp] = useState(null); // Contient l'IP en cours de déclaration
  const [jsonCopied, setJsonCopied] = useState(false);

  const loadData = async () => {
    try {
      const data = await fetchIps();
      setIps(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // --- FILTRES ---
  const filteredIps = ips.filter(ip => statusFilter === 'all' || ip.statut_ip === statusFilter);

  // --- LOGIQUE EDITION ---
  const handleSaveEdit = async () => {
    try {
      // Nettoyage avant l'envoi pour éviter les conflits
      const { id, created_at, user_id, ...updates } = editingIp;
      await updateIp(id, updates);
      setEditingIp(null);
      loadData();
    } catch (err) {
      alert("Erreur lors de la sauvegarde.");
    }
  };

  // --- LOGIQUE DÉCLARATION JSON ---
  const handleOpenDeclare = (ip) => {
    setDeclareIp(ip);
    setJsonCopied(false);
  };

  const handleCopyJsonAndDeclare = async () => {
    // 1. Génération du JSON
    const jsonData = JSON.stringify({
      patient: {
        initiales: declareIp.patient_initiales,
        age: declareIp.patient_age,
        sexe: declareIp.patient_sexe
      },
      prescripteur: {
        nom: declareIp.medecin_nom
      },
      intervention: {
        medicament_en_cause: declareIp.medicament_en_cause,
        probleme_identifie: declareIp.probleme_identifie,
        type_intervention: declareIp.type_intervention,
        avis_prescripteur: declareIp.avis_prescripteur,
        devenir_intervention: declareIp.devenir_intervention,
        mode_transmission: declareIp.mode_transmission,
        commentaires: declareIp.commentaires
      }
    }, null, 2);

    // 2. Copie ultra-sécurisée (Plan A : natif, Plan B : manuel pour Electron/Local)
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(jsonData);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = jsonData;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setJsonCopied(true);
    } catch (clipboardError) {
      console.warn("La copie automatique a échoué, mais on continue :", clipboardError);
      setJsonCopied(true); // On affiche quand même le succès visuel
    }

    // 3. Mise à jour Supabase (s'exécutera toujours, même si le presse-papier bug)
    try {
      await updateIp(declareIp.id, { statut_ip: 'Déclaré' });
      
      // On ferme la fenêtre après 1.5s et on recharge le tableau
      setTimeout(() => {
        setDeclareIp(null);
        loadData();
      }, 1500);
      
    } catch (err) {
      console.error("Erreur base de données:", err);
      alert("Erreur lors de la mise à jour du statut. Vérifie ta console.");
    }
  };

  if (loading) return <div className="p-8 text-slate-500">Chargement des IP...</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <button 
        onClick={() => onNavigate && onNavigate('dashboard')}
        className="flex items-center gap-2 text-slate-500 hover:text-blue-600 transition-colors mb-6 text-sm font-medium"
      >
        <ArrowLeft size={16} /> Retour au Dashboard
      </button>

      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Activity className="text-blue-600" /> Registre des Interventions Pharmaceutiques
          </h1>
          <p className="text-sm text-slate-500 mt-1">Classification basée sur le référentiel Act-IP / SFPC</p>
        </div>
      </div>

      {/* --- TABLEAU --- */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex gap-4 items-center">
          <label className="text-sm font-medium text-slate-600">Filtrer par statut :</label>
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)} 
            className="text-sm border-slate-300 rounded-lg p-2 bg-white outline-none"
          >
            <option value="all">Toutes les IP</option>
            <option value="En attente">En attente</option>
            <option value="Cloturee">Clôturée</option>
            <option value="Déclaré">Déclarée</option>
          </select>
          <span className="text-sm text-slate-400 ml-auto">{filteredIps.length} intervention(s)</span>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-white border-b border-slate-200 text-slate-600">
            <tr>
              <th className="p-4 font-medium">Date & Patient</th>
              <th className="p-4 font-medium">Médicament & Problème</th>
              <th className="p-4 font-medium">Statut Actuel</th>
              <th className="p-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredIps.map((ip) => {
              const isDeclare = ip.statut_ip === 'Déclaré';
              return (
                <tr key={ip.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 align-top">
                    <div className="font-bold text-slate-800">{new Date(ip.created_at).toLocaleDateString('fr-FR')}</div>
                    <div className="text-xs text-slate-500">
                      {ip.patient_initiales} • {ip.patient_age} ans • Sexe {ip.patient_sexe}
                    </div>
                  </td>
                  <td className="p-4 align-top max-w-md">
                    <div className="font-medium text-slate-800">{ip.medicament_en_cause}</div>
                    <div className="text-xs text-slate-500 mt-1 truncate" title={ip.probleme_identifie}>
                      Problème : {ip.probleme_identifie}
                    </div>
                    <div className="text-xs text-slate-500 truncate" title={ip.type_intervention}>
                      Action : {ip.type_intervention}
                    </div>
                  </td>
                  <td className="p-4 align-top">
                    {ip.statut_ip === 'Cloturee' && <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md text-xs font-bold flex w-max items-center gap-1"><CheckCircle size={14}/> Clôturée</span>}
                    {ip.statut_ip === 'En attente' && <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-md text-xs font-bold flex w-max items-center gap-1"><AlertTriangle size={14}/> En attente</span>}
                    {ip.statut_ip === 'Déclaré' && <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded-md text-xs font-bold flex w-max items-center gap-1"><Check size={14}/> Déclarée</span>}
                  </td>
                  <td className="p-4 align-top text-right space-x-2">
                    {/* Bouton Éditer */}
                    <button 
                      onClick={() => setEditingIp(ip)} 
                      className="px-3 py-1.5 text-slate-600 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors inline-flex items-center gap-1 text-xs font-medium"
                    >
                      <Edit2 size={14} /> Éditer
                    </button>

                    {/* Bouton Déclarer (Grisé si déjà déclaré, sinon coloré) */}
                    <button 
                      onClick={() => !isDeclare && handleOpenDeclare(ip)}
                      disabled={isDeclare}
                      className={`px-3 py-1.5 rounded-md inline-flex items-center gap-1 text-xs font-medium transition-colors ${
                        isDeclare 
                          ? 'bg-slate-100 text-slate-400 border border-transparent cursor-not-allowed' 
                          : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                      }`}
                    >
                      <FileJson size={14} />
                      {isDeclare ? 'Déjà Déclaré' : 'Déclarer (JSON)'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {filteredIps.length === 0 && (
              <tr><td colSpan="4" className="p-8 text-center text-slate-500">Aucune intervention pharmaceutique trouvée.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* --- MODALE : DÉCLARATION JSON --- */}
      {declareIp && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-blue-50">
              <h2 className="font-bold text-blue-800 flex items-center gap-2"><FileJson size={18}/> Code JSON pour Act-IP</h2>
              <button onClick={() => setDeclareIp(null)} className="text-slate-400 hover:text-slate-700"><X size={20}/></button>
            </div>
            <div className="p-4 bg-slate-800 text-emerald-400 font-mono text-xs overflow-y-auto max-h-96">
              <pre>{JSON.stringify({
                patient: { initiales: declareIp.patient_initiales, age: declareIp.patient_age, sexe: declareIp.patient_sexe },
                prescripteur: { nom: declareIp.medecin_nom },
                intervention: {
                  medicament_en_cause: declareIp.medicament_en_cause,
                  probleme_identifie: declareIp.probleme_identifie,
                  type_intervention: declareIp.type_intervention,
                  avis_prescripteur: declareIp.avis_prescripteur,
                  devenir_intervention: declareIp.devenir_intervention,
                  mode_transmission: declareIp.mode_transmission,
                  commentaires: declareIp.commentaires
                }
              }, null, 2)}</pre>
            </div>
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex gap-3">
              <button onClick={() => setDeclareIp(null)} className="flex-1 px-4 py-2 text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">Annuler</button>
              <button 
                onClick={handleCopyJsonAndDeclare} 
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-white rounded-lg transition-colors ${jsonCopied ? 'bg-emerald-600' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {jsonCopied ? <><Check size={18}/> Copié & Déclaré !</> : <><Copy size={18}/> Copier & Valider</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODALE : ÉDITION COMPLÈTE --- */}
      {editingIp && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <h2 className="font-bold text-slate-800 flex items-center gap-2"><Edit2 size={18}/> Éditer l'Intervention</h2>
              <button onClick={() => setEditingIp(null)} className="text-slate-400 hover:text-slate-700"><X size={20}/></button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6 text-sm">
              {/* Section Patient & Statut */}
              <div className="grid grid-cols-4 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Statut IP</label>
                  <select className="w-full p-2 border rounded font-medium text-slate-700" value={editingIp.statut_ip || 'En attente'} onChange={e => setEditingIp({...editingIp, statut_ip: e.target.value})}>
                    <option value="En attente">En attente</option>
                    <option value="Cloturee">Clôturée</option>
                    <option value="Déclaré">Déclarée</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Initiales</label>
                  <input className="w-full p-2 border rounded uppercase" maxLength="4" value={editingIp.patient_initiales || ''} onChange={e => setEditingIp({...editingIp, patient_initiales: e.target.value.toUpperCase()})} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Âge</label>
                  <input type="number" className="w-full p-2 border rounded" value={editingIp.patient_age || ''} onChange={e => setEditingIp({...editingIp, patient_age: parseInt(e.target.value) || null})} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Sexe</label>
                  <select className="w-full p-2 border rounded" value={editingIp.patient_sexe || ''} onChange={e => setEditingIp({...editingIp, patient_sexe: e.target.value})}>
                    <option value="">Sélectionner...</option>
                    <option value="M">Masculin (M)</option>
                    <option value="F">Féminin (F)</option>
                  </select>
                </div>
              </div>

              {/* Section Médicament & Problème */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Médicament en cause</label>
                  <input className="w-full p-2 border rounded" value={editingIp.medicament_en_cause || ''} onChange={e => setEditingIp({...editingIp, medicament_en_cause: e.target.value})} />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Problème Identifié</label>
                  <input className="w-full p-2 border rounded" placeholder="Ex: Contre-indication, Surdosage..." value={editingIp.probleme_identifie || ''} onChange={e => setEditingIp({...editingIp, probleme_identifie: e.target.value})} />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Type d'intervention</label>
                  <input className="w-full p-2 border rounded" placeholder="Ex: Adaptation posologique, Arrêt..." value={editingIp.type_intervention || ''} onChange={e => setEditingIp({...editingIp, type_intervention: e.target.value})} />
                </div>
              </div>

              {/* Section Médecin & Transmission */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Nom du Médecin</label>
                  <input className="w-full p-2 border rounded" value={editingIp.medecin_nom || ''} onChange={e => setEditingIp({...editingIp, medecin_nom: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Avis du Prescripteur</label>
                  <select className="w-full p-2 border rounded" value={editingIp.avis_prescripteur || ''} onChange={e => setEditingIp({...editingIp, avis_prescripteur: e.target.value})}>
                    <option value="">Sélectionner...</option>
                    <option value="Accepte">Accepté par le prescripteur</option>
                    <option value="Refuse">Non accepté par le prescripteur</option>
                    <option value="Non joignable">Non joignable</option>
                    <option value="Non contacte">Non contacté</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Mode de transmission</label>
                  <input className="w-full p-2 border rounded" placeholder="Ex: Oralement, Téléphone, Fax..." value={editingIp.mode_transmission || ''} onChange={e => setEditingIp({...editingIp, mode_transmission: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Devenir de l'intervention</label>
                  <input className="w-full p-2 border rounded" placeholder="Ex: Délivrance modifiée, Refus..." value={editingIp.devenir_intervention || ''} onChange={e => setEditingIp({...editingIp, devenir_intervention: e.target.value})} />
                </div>
              </div>
              
              {/* Commentaires */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Commentaires libres</label>
                <textarea className="w-full p-2 border rounded" rows="3" value={editingIp.commentaires || ''} onChange={e => setEditingIp({...editingIp, commentaires: e.target.value})} />
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-xl flex justify-end gap-3">
              <button onClick={() => setEditingIp(null)} className="px-4 py-2 text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">Annuler</button>
              <button onClick={handleSaveEdit} className="flex items-center gap-2 px-6 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                <Save size={16} /> Enregistrer les modifications
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}