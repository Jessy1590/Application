import React, { useState, useEffect } from 'react';
import { insertContact, updateContact } from '../services/directoryService';

const DEFAULT_STATE = {
  type: 'health_professional',
  nom: '', prenom: '', specialite: '',
  telephone: '', telephone_prive: '',
  mail_mssante: '', mail_prive: '',
  infos_contact: '', switch_rupture: '', commentaires: '',
  site_web: '', mode_commande: '', franco: '', remise_commande: '',
  nom_service_client: '', tel_service_client: '', email_service_client: ''
};

export default function DirectoryForm({ onContactSaved, contactToEdit, onCancelEdit }) {
  const [formData, setFormData] = useState(DEFAULT_STATE);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (contactToEdit) {
      const sanitizedData = Object.fromEntries(
        Object.entries(contactToEdit).map(([k, v]) => [k, v === null ? '' : v])
      );
      setFormData(sanitizedData);
    } else {
      setFormData(DEFAULT_STATE);
    }
    setStatus('');
  }, [contactToEdit]);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('saving');
    try {
      if (contactToEdit) {
        await updateContact(contactToEdit.id, formData);
      } else {
        await insertContact(formData);
      }
      setStatus('success');
      setTimeout(() => onContactSaved(), 1000);
    } catch (error) {
      setStatus('error');
    }
  };

  const isPro = formData.type === 'health_professional';
  const isEditing = !!contactToEdit;

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-slate-800">
          {isEditing ? 'Modifier le Contact' : 'Ajouter un Contact'}
        </h2>
        {isEditing && (
          <button type="button" onClick={onCancelEdit} className="text-sm text-slate-500 hover:text-slate-700 underline">
            Annuler
          </button>
        )}
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <select name="type" value={formData.type} onChange={handleChange} disabled={isEditing} className="w-full rounded-lg border-slate-300 bg-slate-50 p-2.5 font-medium border focus:ring-blue-500 disabled:opacity-50">
            <option value="health_professional">Professionnel de Santé</option>
            <option value="commercial_partner">Partenaire Commercial (Labo/Grossiste)</option>
          </select>
        </div>

        {isPro ? (
          <>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider border-b pb-1">Identité</h3>
              <div className="grid grid-cols-2 gap-3">
                <input name="nom" value={formData.nom} placeholder="Nom *" required onChange={handleChange} className="p-2 border rounded-md" />
                <input name="prenom" value={formData.prenom} placeholder="Prénom" onChange={handleChange} className="p-2 border rounded-md" />
              </div>
              <input name="specialite" value={formData.specialite} placeholder="Spécialité (ex: Pédiatre, MG...)" onChange={handleChange} className="w-full p-2 border rounded-md" />
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider border-b pb-1">Coordonnées Pro</h3>
              <div className="grid grid-cols-2 gap-3">
                <input name="telephone" value={formData.telephone} placeholder="Tél Cabinet *" required onChange={handleChange} className="p-2 border rounded-md" />
                <input name="mail_mssante" value={formData.mail_mssante} placeholder="Email MS Santé" onChange={handleChange} className="p-2 border rounded-md" />
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-rose-500 uppercase tracking-wider border-b border-rose-100 pb-1">Accès Privilégié / Privé</h3>
              <div className="grid grid-cols-2 gap-3">
                <input name="telephone_prive" value={formData.telephone_prive} placeholder="Tél Portable (Ligne directe)" onChange={handleChange} className="p-2 border rounded-md bg-rose-50 border-rose-100" />
                <input name="mail_prive" value={formData.mail_prive} placeholder="Email perso" onChange={handleChange} className="p-2 border rounded-md bg-rose-50 border-rose-100" />
              </div>
              <input name="infos_contact" value={formData.infos_contact} placeholder="Disponibilités (ex: Appeler entre 12h et 14h...)" onChange={handleChange} className="w-full p-2 border rounded-md bg-rose-50 border-rose-100" />
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-emerald-600 uppercase tracking-wider border-b border-emerald-100 pb-1">Spécificités Métier</h3>
              <textarea name="switch_rupture" value={formData.switch_rupture} placeholder="Accords de substitution en rupture..." onChange={handleChange} rows="2" className="w-full p-2 border rounded-md bg-emerald-50 border-emerald-100" />
              <textarea name="commentaires" value={formData.commentaires} placeholder="Commentaires libres..." onChange={handleChange} rows="2" className="w-full p-2 border rounded-md" />
            </div>
          </>
        ) : (
          <>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider border-b pb-1">Identité Labo / Grossiste</h3>
              <input name="nom" value={formData.nom} placeholder="Nom du Laboratoire *" required onChange={handleChange} className="w-full p-2 border rounded-md" />
              <input name="site_web" value={formData.site_web} placeholder="Portail B2B (Site web)" onChange={handleChange} className="w-full p-2 border rounded-md" />
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-indigo-500 uppercase tracking-wider border-b border-indigo-100 pb-1">Le Délégué / Commercial</h3>
              <div className="grid grid-cols-2 gap-3">
                <input name="prenom" value={formData.prenom} placeholder="Prénom Nom du commercial" onChange={handleChange} className="p-2 border rounded-md bg-indigo-50 border-indigo-100" />
                <input name="telephone_prive" value={formData.telephone_prive} placeholder="Portable Délégué" onChange={handleChange} className="p-2 border rounded-md bg-indigo-50 border-indigo-100" />
              </div>
              <input name="mail_prive" value={formData.mail_prive} placeholder="Email Délégué" onChange={handleChange} className="w-full p-2 border rounded-md bg-indigo-50 border-indigo-100" />
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-orange-500 uppercase tracking-wider border-b border-orange-100 pb-1">Service Client & Commandes</h3>
              <div className="grid grid-cols-2 gap-3">
                <input name="tel_service_client" value={formData.tel_service_client} placeholder="Tél Service Client" onChange={handleChange} className="p-2 border rounded-md" />
                <input name="email_service_client" value={formData.email_service_client} placeholder="Email Litiges/Commandes" onChange={handleChange} className="p-2 border rounded-md" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <input name="mode_commande" value={formData.mode_commande} placeholder="Mode (Direct/Portail)" onChange={handleChange} className="p-2 border rounded-md" />
                <input name="franco" value={formData.franco} placeholder="Franco (€)" onChange={handleChange} className="p-2 border rounded-md" />
                <input name="remise_commande" value={formData.remise_commande} placeholder="Remise (%)" onChange={handleChange} className="p-2 border rounded-md" />
              </div>
            </div>
            
            <textarea name="commentaires" value={formData.commentaires} placeholder="Commentaires libres..." onChange={handleChange} rows="2" className="w-full p-2 border rounded-md" />
          </>
        )}

        <button type="submit" disabled={status === 'saving'} className={`w-full text-white font-medium py-3 rounded-lg transition ${isEditing ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
          {status === 'saving' ? 'Enregistrement...' : (isEditing ? 'Enregistrer les modifications' : 'Ajouter le contact')}
        </button>
        {status === 'success' && <div className="p-3 bg-green-50 text-green-700 rounded-md text-sm text-center">Contact {isEditing ? 'modifié' : 'ajouté'} !</div>}
      </form>
    </div>
  );
}