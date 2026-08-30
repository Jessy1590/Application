import React, { useState, useEffect } from 'react';
import { ArrowLeft, FileText, Plus, Edit2, Save, X, Users } from 'lucide-react';
import { useAuth } from '../core/AuthContext';
import {
  fetchDocuments,
  createDocument,
  updateDocument,
  fetchDocumentSignatures,
} from '../services/documentService';

export default function DocumentManager({ onNavigate }) {
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [signatures, setSignatures] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewSigs, setViewSigs] = useState(null);
  const [form, setForm] = useState({
    title: '', content: '', version: '1.0', category: 'procedure', requires_signature: true,
  });

  const loadData = async () => {
    setDocuments(await fetchDocuments());
  };

  useEffect(() => { loadData(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editing) {
      await updateDocument(editing.id, form);
    } else {
      await createDocument(form, user.id);
    }
    setShowForm(false);
    setEditing(null);
    setForm({ title: '', content: '', version: '1.0', category: 'procedure', requires_signature: true });
    loadData();
  };

  const startEdit = (doc) => {
    setEditing(doc);
    setForm({
      title: doc.title,
      content: doc.content,
      version: doc.version,
      category: doc.category,
      requires_signature: doc.requires_signature,
    });
    setShowForm(true);
  };

  const viewSignatures = async (doc) => {
    setViewSigs({ doc, list: await fetchDocumentSignatures(doc.id) });
  };

  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <button onClick={() => onNavigate('dashboard')} className="flex items-center gap-2 text-slate-500 hover:text-blue-600 mb-6 text-sm font-medium">
        <ArrowLeft size={16} /> Retour au Dashboard
      </button>

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <FileText className="text-blue-600" /> GED — Procédures Qualité
        </h1>
        <button onClick={() => { setShowForm(true); setEditing(null); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm hover:bg-blue-700">
          <Plus size={16} /> Nouvelle procédure
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-slate-200 mb-6 space-y-4">
          <h2 className="font-bold">{editing ? 'Modifier' : 'Créer'} une procédure</h2>
          <div className="grid grid-cols-3 gap-4">
            <input required placeholder="Titre" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="col-span-2 p-2 border rounded-lg" />
            <input required placeholder="Version (ex: 1.0)" value={form.version} onChange={e => setForm({ ...form, version: e.target.value })} className="p-2 border rounded-lg" />
          </div>
          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="p-2 border rounded-lg">
            <option value="procedure">Procédure (SOP)</option>
            <option value="instruction">Instruction de travail</option>
            <option value="formulaire">Formulaire</option>
          </select>
          <textarea required rows={8} placeholder="Contenu (Markdown ou texte)" value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} className="w-full p-2 border rounded-lg font-mono text-sm" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.requires_signature} onChange={e => setForm({ ...form, requires_signature: e.target.checked })} />
            Exiger la signature « Lu et approuvé »
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2 border rounded-lg">Annuler</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center gap-1"><Save size={16} /> Enregistrer</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b text-slate-600">
            <tr>
              <th className="p-4">Titre</th>
              <th className="p-4">Version</th>
              <th className="p-4">Catégorie</th>
              <th className="p-4">Signature</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {documents.map(doc => (
              <tr key={doc.id} className="hover:bg-slate-50">
                <td className="p-4 font-medium">{doc.title}</td>
                <td className="p-4">v{doc.version}</td>
                <td className="p-4 capitalize">{doc.category}</td>
                <td className="p-4">{doc.requires_signature ? 'Oui' : 'Non'}</td>
                <td className="p-4 text-right space-x-2">
                  <button onClick={() => viewSignatures(doc)} className="p-1.5 border rounded hover:bg-slate-50" title="Signatures"><Users size={16} /></button>
                  <button onClick={() => startEdit(doc)} className="p-1.5 border rounded hover:bg-slate-50"><Edit2 size={16} /></button>
                </td>
              </tr>
            ))}
            {documents.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-slate-500">Aucun document.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {viewSigs && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold">Signatures — {viewSigs.doc.title}</h2>
              <button onClick={() => setViewSigs(null)}><X size={20} /></button>
            </div>
            {viewSigs.list.length === 0 ? (
              <p className="text-slate-500 text-sm">Aucune signature pour v{viewSigs.doc.version}.</p>
            ) : viewSigs.list.map(s => (
              <div key={s.id} className="py-2 border-b text-sm flex justify-between">
                <span>{s.signer_name}</span>
                <span className="text-slate-400">{new Date(s.signed_at).toLocaleDateString('fr-FR')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
