import React, { useState, useEffect } from 'react';
import { insertContact, updateContact } from '../services/directoryService';

const DEFAULT_STATE = {
  type: 'health_professional',
  nom: '', prenom: '', specialite: '',
  telephone: '', telephone_prive: '',
  mail_mssante: '', mail_prive: '',
  infos_contact: '', switch_rupture: '', commentaires: '',
  site_web: '', mode_commande: '', franco: '', remise_commande: '',
  nom_service_client: '', tel_service_client: '', email_service_client: '',
};

const Field = ({ label, children }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
    {children}
  </div>
);

export default function DirectoryForm({ onContactSaved, contactToEdit, onCancelEdit }) {
  const [formData, setFormData] = useState(DEFAULT_STATE);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (contactToEdit) {
      const sanitizedData = Object.fromEntries(
        Object.entries(contactToEdit).map(([k, v]) => [k, v === null ? '' : v]),
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
    } catch {
      setStatus('error');
    }
  };

  const isPro = formData.type === 'health_professional';
  const isEditing = !!contactToEdit;
  const inp = 'w-full p-2 border rounded-md';

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-slate-800">
          {isEditing ? 'Modifier le contact' : 'Ajouter un contact'}
        </h2>
        {isEditing && (
          <button type="button" onClick={onCancelEdit} className="text-sm text-slate-500 hover:text-slate-700 underline">
            Annuler
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Field label="Type de contact">
          <select name="type" value={formData.type} onChange={handleChange} disabled={isEditing} className="w-full rounded-lg border-slate-300 bg-slate-50 p-2.5 font-medium border focus:ring-blue-500 disabled:opacity-50">
            <option value="health_professional">Professionnel de santé</option>
            <option value="commercial_partner">Partenaire commercial (labo / grossiste)</option>
          </select>
        </Field>

        {isPro ? (
          <>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider border-b pb-1">Identité</h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nom *"><input name="nom" value={formData.nom} required onChange={handleChange} className={inp} /></Field>
                <Field label="Prénom"><input name="prenom" value={formData.prenom} onChange={handleChange} className={inp} /></Field>
              </div>
              <Field label="Spécialité"><input name="specialite" value={formData.specialite} onChange={handleChange} className={inp} placeholder="Ex. Pédiatre, MG…" /></Field>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider border-b pb-1">Coordonnées professionnelles</h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Téléphone cabinet *"><input name="telephone" value={formData.telephone} required onChange={handleChange} className={inp} /></Field>
                <Field label="E-mail MS Santé"><input name="mail_mssante" value={formData.mail_mssante} onChange={handleChange} className={inp} /></Field>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-rose-500 uppercase tracking-wider border-b border-rose-100 pb-1">Accès privilégié / privé</h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tél. portable (ligne directe)"><input name="telephone_prive" value={formData.telephone_prive} onChange={handleChange} className={`${inp} bg-rose-50 border-rose-100`} /></Field>
                <Field label="E-mail personnel"><input name="mail_prive" value={formData.mail_prive} onChange={handleChange} className={`${inp} bg-rose-50 border-rose-100`} /></Field>
              </div>
              <Field label="Disponibilités / consignes d'appel"><input name="infos_contact" value={formData.infos_contact} onChange={handleChange} className={`${inp} bg-rose-50 border-rose-100`} placeholder="Ex. Appeler entre 12h et 14h" /></Field>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-emerald-600 uppercase tracking-wider border-b border-emerald-100 pb-1">Spécificités métier</h3>
              <Field label="Accords de substitution en rupture"><textarea name="switch_rupture" value={formData.switch_rupture} onChange={handleChange} rows={2} className={`${inp} bg-emerald-50 border-emerald-100`} /></Field>
              <Field label="Commentaires"><textarea name="commentaires" value={formData.commentaires} onChange={handleChange} rows={2} className={inp} /></Field>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider border-b pb-1">Identité labo / grossiste</h3>
              <Field label="Nom du laboratoire *"><input name="nom" value={formData.nom} required onChange={handleChange} className={inp} /></Field>
              <Field label="Portail B2B (site web)"><input name="site_web" value={formData.site_web} onChange={handleChange} className={inp} /></Field>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-indigo-500 uppercase tracking-wider border-b border-indigo-100 pb-1">Délégué / commercial</h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Prénom Nom du commercial"><input name="prenom" value={formData.prenom} onChange={handleChange} className={`${inp} bg-indigo-50 border-indigo-100`} /></Field>
                <Field label="Portable délégué"><input name="telephone_prive" value={formData.telephone_prive} onChange={handleChange} className={`${inp} bg-indigo-50 border-indigo-100`} /></Field>
              </div>
              <Field label="E-mail délégué"><input name="mail_prive" value={formData.mail_prive} onChange={handleChange} className={`${inp} bg-indigo-50 border-indigo-100`} /></Field>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-orange-500 uppercase tracking-wider border-b border-orange-100 pb-1">Service client & commandes</h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tél. service client"><input name="tel_service_client" value={formData.tel_service_client} onChange={handleChange} className={inp} /></Field>
                <Field label="E-mail litiges / commandes"><input name="email_service_client" value={formData.email_service_client} onChange={handleChange} className={inp} /></Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Mode de commande"><input name="mode_commande" value={formData.mode_commande} onChange={handleChange} className={inp} placeholder="Direct / Portail" /></Field>
                <Field label="Franco (€)"><input name="franco" value={formData.franco} onChange={handleChange} className={inp} /></Field>
                <Field label="Remise (%)"><input name="remise_commande" value={formData.remise_commande} onChange={handleChange} className={inp} /></Field>
              </div>
            </div>

            <Field label="Commentaires"><textarea name="commentaires" value={formData.commentaires} onChange={handleChange} rows={2} className={inp} /></Field>
          </>
        )}

        <button type="submit" disabled={status === 'saving'} className={`w-full text-white font-medium py-3 rounded-lg transition ${isEditing ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
          {status === 'saving' ? 'Enregistrement…' : (isEditing ? 'Enregistrer les modifications' : 'Ajouter le contact')}
        </button>
        {status === 'success' && <div className="p-3 bg-green-50 text-green-700 rounded-md text-sm text-center">Contact {isEditing ? 'modifié' : 'ajouté'} !</div>}
        {status === 'error' && <div className="p-3 bg-red-50 text-red-700 rounded-md text-sm text-center">Erreur lors de l&apos;enregistrement.</div>}
      </form>
    </div>
  );
}
