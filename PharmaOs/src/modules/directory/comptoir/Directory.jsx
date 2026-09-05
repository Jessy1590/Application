import React, { useState, useEffect } from 'react';
import { openModuleWindow } from '../../../shared/windowService.js';
import { fetchContactsSafe } from '../services/directoryService.js';
import {
  Search, Phone, ChevronDown, ChevronUp, User,
  Briefcase, Mail, Globe, Info, FileText, ShoppingCart,
} from 'lucide-react';

export default function Directory() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [activeTab, setActiveTab] = useState('health_professional');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      setLoading(true);
      const { data, error: err } = await fetchContactsSafe();
      if (err) throw err;
      setContacts(data || []);
    } catch (err) {
      console.error("Erreur lors de la récupération de l'annuaire:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCall = (e, contact) => {
    e.stopPropagation(); // Évite de déclencher l'ouverture de l'accordéon
    // On bascule la fenêtre vers le module 'call' en lui passant les données du contact
    openModuleWindow('call', contact);
  };

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // Filtrage des contacts (par type + recherche texte)
  const filteredContacts = contacts.filter(c => {
    const matchType = c.type === activeTab;
    const searchString = `${c.nom || ''} ${c.prenom || ''} ${c.specialite || ''} ${c.infos_contact || ''}`.toLowerCase();
    const matchSearch = searchString.includes(searchQuery.toLowerCase());
    return matchType && matchSearch;
  });

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 text-slate-800">
      
      {/* HEADER & FILTRES */}
      <div className="bg-white px-6 pt-6 pb-4 border-b border-slate-200 shadow-sm shrink-0">
        <h1 className="text-2xl font-bold text-slate-800 mb-4">Annuaire</h1>
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          {/* Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => { setActiveTab('health_professional'); setExpandedId(null); }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'health_professional' 
                  ? 'bg-white text-sky-600 shadow-sm' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Professionnels de santé
            </button>
            <button
              onClick={() => { setActiveTab('commercial_partner'); setExpandedId(null); }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'commercial_partner' 
                  ? 'bg-white text-sky-600 shadow-sm' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Partenaires commerciaux
            </button>
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Rechercher un contact..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm"
            />
          </div>
        </div>
      </div>

      {/* LISTE DES CONTACTS */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div>
          </div>
        ) : error ? (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm">
            Erreur: {error}
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="text-center text-slate-500 mt-10">
            Aucun contact trouvé pour cette recherche.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredContacts.map(contact => {
              const isExpanded = expandedId === contact.id;
              const title = contact.prenom ? `${contact.prenom} ${contact.nom}` : contact.nom;
              const subtitle = activeTab === 'health_professional' ? contact.specialite : contact.infos_contact;
              
              return (
                <div 
                  key={contact.id} 
                  className={`bg-white rounded-lg border transition-all duration-200 overflow-hidden ${
                    isExpanded ? 'border-sky-300 shadow-md' : 'border-slate-200 hover:border-slate-300 shadow-sm'
                  }`}
                >
                  {/* MAIN ROW (Clickable) */}
                  <div 
                    onClick={() => toggleExpand(contact.id)}
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-full ${activeTab === 'health_professional' ? 'bg-teal-100 text-teal-600' : 'bg-indigo-100 text-indigo-600'}`}>
                        {activeTab === 'health_professional' ? <User size={20} /> : <Briefcase size={20} />}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800">{title}</h3>
                        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {contact.telephone && (
                        <button 
                          onClick={(e) => handleCall(e, contact)}
                          className="flex items-center gap-2 px-3 py-1.5 bg-sky-100 hover:bg-sky-200 text-sky-700 rounded-md transition-colors text-sm font-medium"
                        >
                          <Phone size={16} />
                          <span>Appeler</span>
                        </button>
                      )}
                      <div className="text-slate-400 p-1">
                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </div>
                    </div>
                  </div>

                  {/* EXPANDED DETAILS */}
                  {isExpanded && (
                    <div className="p-4 bg-slate-50 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-sm">
                      
                      {/* SECTION 1: Coordonnées de base */}
                      <div className="space-y-3">
                        <h4 className="font-semibold text-slate-700 border-b border-slate-200 pb-1 mb-2">Coordonnées</h4>
                        {contact.telephone && (
                          <div className="flex items-start gap-2">
                            <Phone size={16} className="text-slate-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-slate-500 text-xs">Standard / Pro</p>
                              <p className="font-medium">{contact.telephone}</p>
                            </div>
                          </div>
                        )}
                        {contact.telephone_prive && (
                          <div className="flex items-start gap-2">
                            <Phone size={16} className="text-slate-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-slate-500 text-xs">Ligne privée</p>
                              <p className="font-medium text-amber-600">{contact.telephone_prive}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* SECTION 2: Numérique (Email / Web / MS Santé) */}
                      <div className="space-y-3">
                        <h4 className="font-semibold text-slate-700 border-b border-slate-200 pb-1 mb-2">Canaux digitaux</h4>
                        {contact.mail_mssante && (
                          <div className="flex items-start gap-2">
                            <Mail size={16} className="text-slate-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-slate-500 text-xs">MS Santé</p>
                              <p className="font-medium break-all">{contact.mail_mssante}</p>
                            </div>
                          </div>
                        )}
                        {contact.mail_prive && (
                          <div className="flex items-start gap-2">
                            <Mail size={16} className="text-slate-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-slate-500 text-xs">Email privé</p>
                              <p className="font-medium break-all">{contact.mail_prive}</p>
                            </div>
                          </div>
                        )}
                        {contact.site_web && (
                          <div className="flex items-start gap-2">
                            <Globe size={16} className="text-slate-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-slate-500 text-xs">Site Web</p>
                              <a href={contact.site_web} target="_blank" rel="noreferrer" className="font-medium text-sky-600 hover:underline break-all">
                                {contact.site_web}
                              </a>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* SECTION 3: Spécifique (Pro métier ou Partenaire commercial) */}
                      <div className="space-y-3">
                        <h4 className="font-semibold text-slate-700 border-b border-slate-200 pb-1 mb-2">
                          {activeTab === 'health_professional' ? 'Infos métier' : 'Infos commerciales'}
                        </h4>
                        
                        {/* Affichage Pros de santé */}
                        {activeTab === 'health_professional' && contact.switch_rupture && (
                          <div className="flex items-start gap-2">
                            <Info size={16} className="text-slate-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-slate-500 text-xs">Consigne Switch/Rupture</p>
                              {/* Ajout de whitespace-pre-wrap juste ici 👇 */}
                              <p className="font-medium text-slate-800 whitespace-pre-wrap">
                                {contact.switch_rupture}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Affichage Partenaires */}
                        {activeTab === 'commercial_partner' && (
                          <>
                            {(contact.mode_commande || contact.franco || contact.remise_commande) && (
                              <div className="flex items-start gap-2">
                                <ShoppingCart size={16} className="text-slate-400 mt-0.5 shrink-0" />
                                <div>
                                  <p className="text-slate-500 text-xs">Conditions d'achat</p>
                                  <ul className="list-disc list-inside font-medium text-slate-800">
                                    {contact.mode_commande && <li>Via: {contact.mode_commande}</li>}
                                    {contact.franco && <li>Franco: {contact.franco}</li>}
                                    {contact.remise_commande && <li>Remise: {contact.remise_commande}</li>}
                                  </ul>
                                </div>
                              </div>
                            )}
                            {contact.tel_service_client && (
                              <div className="flex items-start gap-2 mt-2">
                                <Phone size={16} className="text-slate-400 mt-0.5 shrink-0" />
                                <div>
                                  <p className="text-slate-500 text-xs">Service Client</p>
                                  <p className="font-medium">{contact.tel_service_client}</p>
                                  {contact.email_service_client && <p className="font-medium break-all">{contact.email_service_client}</p>}
                                </div>
                              </div>
                            )}
                          </>
                        )}

                        {/* Commentaires globaux */}
                        {contact.commentaires && (
                          <div className="flex items-start gap-2 mt-2 pt-2 border-t border-slate-200">
                            <FileText size={16} className="text-slate-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-slate-500 text-xs">Notes internes</p>
                              <p className="text-slate-700 italic">{contact.commentaires}</p>
                            </div>
                          </div>
                        )}
                      </div>

                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}