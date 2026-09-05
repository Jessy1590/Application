import React, { useState, useEffect } from 'react';
import { ArrowLeft, Users, Plus, Phone, Edit, Trash2, Filter } from 'lucide-react';
import { fetchContacts, deleteContact } from '../services/directoryService.js';
import DirectoryForm from './DirectoryForm.jsx';

export default function DirectoryManager({ onNavigate }) {
  const [contacts, setContacts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [editingContact, setEditingContact] = useState(null);
  const [filterType, setFilterType] = useState('all');

  const loadContacts = async () => {
    try {
      const data = await fetchContacts();
      setContacts(data);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    loadContacts();
  }, []);

  const toggleRow = (id) => setExpandedId(expandedId === id ? null : id);

  const handleEditClick = (contact, e) => {
    e.stopPropagation();
    setEditingContact(contact);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteClick = async (id, e) => {
    e.stopPropagation();
    if (window.confirm('Êtes-vous sûr de vouloir supprimer définitivement ce contact ?')) {
      try {
        await deleteContact(id);
        loadContacts();
        if (expandedId === id) setExpandedId(null);
      } catch {
        alert('Erreur lors de la suppression.');
      }
    }
  };

  const filteredContacts = contacts.filter((c) => filterType === 'all' || c.type === filterType);

  return (
    <div className="w-full">
      <div className="mb-6">
        {onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="flex items-center gap-2 text-slate-500 hover:text-blue-600 transition-colors mb-4 text-sm font-medium"
          >
            <ArrowLeft size={16} />
            Retour au Dashboard
          </button>
        )}

        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Users size={20} className="text-blue-600" />
            Annuaire Contacts
          </h2>
          <button
            type="button"
            onClick={() => {
              setEditingContact(null);
              setShowForm(!showForm);
            }}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 shadow-sm transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            {showForm && !editingContact ? 'Fermer le formulaire' : 'Nouveau Contact'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {showForm && (
          <div className="lg:col-span-1">
            <DirectoryForm
              contactToEdit={editingContact}
              onCancelEdit={() => setEditingContact(null)}
              onContactSaved={() => {
                loadContacts();
                setShowForm(false);
                setEditingContact(null);
              }}
            />
          </div>
        )}

        <div className={`flex flex-col gap-4 ${showForm ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <div className="flex bg-white p-2 rounded-xl shadow-sm border border-slate-200">
            <div className="flex items-center px-3 text-slate-400 border-r border-slate-200 mr-2">
              <Filter size={16} />
            </div>
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${filterType === 'all' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              Tous
            </button>
            <button
              type="button"
              onClick={() => setFilterType('health_professional')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${filterType === 'health_professional' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              Pros de Santé
            </button>
            <button
              type="button"
              onClick={() => setFilterType('commercial_partner')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${filterType === 'commercial_partner' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              Partenaires Commerciaux
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-medium">
                <tr>
                  <th className="p-4 w-1/3">Nom & Type</th>
                  <th className="p-4">Contact Principal</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map((c) => (
                  <React.Fragment key={c.id}>
                    <tr
                      onClick={() => toggleRow(c.id)}
                      className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${expandedId === c.id ? 'bg-blue-50/50' : ''}`}
                    >
                      <td className="p-4">
                        <div className="font-bold text-slate-800 text-base">
                          {c.nom} {c.prenom && c.prenom}
                        </div>
                        <div className="text-xs mt-1">
                          <span className={`px-2 py-0.5 rounded-full font-medium ${c.type === 'health_professional' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>
                            {c.type === 'health_professional' ? (c.specialite || 'Pro de Santé') : 'Partenaire'}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2 font-medium text-slate-700">
                          <Phone className="w-4 h-4 text-slate-400" />
                          {c.telephone}
                        </div>
                      </td>
                      <td className="p-4 text-right flex justify-end gap-2 items-center h-full">
                        <button
                          type="button"
                          onClick={(e) => handleEditClick(c, e)}
                          className="text-amber-600 p-1.5 bg-amber-50 rounded-md hover:bg-amber-100 transition"
                          title="Modifier"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteClick(c.id, e)}
                          className="text-red-600 p-1.5 bg-red-50 rounded-md hover:bg-red-100 transition"
                          title="Supprimer"
                        >
                          <Trash2 size={16} />
                        </button>
                        <span className="text-blue-600 text-xs font-medium hover:underline ml-2">
                          {expandedId === c.id ? 'Masquer' : 'Détails'}
                        </span>
                      </td>
                    </tr>

                    {expandedId === c.id && (
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <td colSpan="3" className="p-6">
                          {c.type === 'health_professional' ? (
                            <div className="grid grid-cols-2 gap-6">
                              <div>
                                <h4 className="font-semibold text-slate-800 mb-2 border-b pb-1">Coordonnées Privées / Accès</h4>
                                <ul className="space-y-1 text-slate-700">
                                  {c.telephone_prive && <li><span className="font-medium text-slate-500">Ligne directe :</span> {c.telephone_prive}</li>}
                                  {c.mail_prive && <li><span className="font-medium text-slate-500">Email privé :</span> {c.mail_prive}</li>}
                                  {c.infos_contact && <li><span className="font-medium text-slate-500">Dispo :</span> {c.infos_contact}</li>}
                                  {c.mail_mssante && <li><span className="font-medium text-slate-500">MS Santé :</span> {c.mail_mssante}</li>}
                                </ul>
                              </div>
                              <div>
                                <h4 className="font-semibold text-emerald-700 mb-2 border-b border-emerald-200 pb-1">Infos Métier</h4>
                                {c.switch_rupture && (
                                  <div className="mb-2 p-2 bg-emerald-100 text-emerald-800 rounded text-xs font-medium border border-emerald-200">
                                    Autorisations rupture : {c.switch_rupture}
                                  </div>
                                )}
                                {c.commentaires && <p className="text-sm italic text-slate-600">&quot;{c.commentaires}&quot;</p>}
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-3 gap-6">
                              <div>
                                <h4 className="font-semibold text-indigo-700 mb-2 border-b border-indigo-200 pb-1">Contact Délégué</h4>
                                <ul className="space-y-1 text-slate-700">
                                  {c.prenom && <li><span className="font-medium text-slate-500">Nom :</span> {c.prenom}</li>}
                                  {c.telephone_prive && <li><span className="font-medium text-slate-500">Portable :</span> {c.telephone_prive}</li>}
                                  {c.mail_prive && <li><span className="font-medium text-slate-500">Email :</span> {c.mail_prive}</li>}
                                </ul>
                              </div>
                              <div>
                                <h4 className="font-semibold text-orange-600 mb-2 border-b border-orange-200 pb-1">Service Client & Web</h4>
                                <ul className="space-y-1 text-slate-700">
                                  {c.tel_service_client && <li><span className="font-medium text-slate-500">Tél SAV :</span> {c.tel_service_client}</li>}
                                  {c.email_service_client && <li><span className="font-medium text-slate-500">Email SAV :</span> {c.email_service_client}</li>}
                                  {c.site_web && <li><span className="font-medium text-slate-500">Portail :</span> <a href={c.site_web} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{c.site_web}</a></li>}
                                </ul>
                              </div>
                              <div>
                                <h4 className="font-semibold text-slate-800 mb-2 border-b pb-1">Commandes</h4>
                                <ul className="space-y-1 text-slate-700">
                                  {c.mode_commande && <li><span className="font-medium text-slate-500">Mode :</span> {c.mode_commande}</li>}
                                  {c.franco && <li><span className="font-medium text-slate-500">Franco :</span> {c.franco}</li>}
                                  {c.remise_commande && <li><span className="font-medium text-slate-500">Remise :</span> {c.remise_commande}</li>}
                                </ul>
                                {c.commentaires && <p className="mt-2 text-xs italic text-slate-500">&quot;{c.commentaires}&quot;</p>}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {filteredContacts.length === 0 && (
                  <tr>
                    <td colSpan="3" className="p-8 text-center text-slate-500">
                      Aucun contact ne correspond à ce filtre.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
