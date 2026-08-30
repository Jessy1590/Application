import React, { useState, useEffect } from 'react';
import { useAuth } from '../../core/AuthContext';
import { FileText, CheckCircle2, PenLine, BookOpen } from 'lucide-react';
import { fetchActiveDocuments, fetchMySignatures, signDocument } from '../../services/documentService.js';

export default function Documents() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [signatures, setSignatures] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => { loadData(); }, [user?.id]);

  const loadData = async () => {
    const [{ data: docs }, { data: sigs }] = await Promise.all([
      fetchActiveDocuments(),
      fetchMySignatures(user?.id),
    ]);
    if (docs) setDocuments(docs);
    if (sigs) setSignatures(sigs);
  };

  const isSigned = (doc) => signatures.some(
    s => s.document_id === doc.id && s.document_version === doc.version
  );

  const handleSign = async (doc) => {
    setLoading(true);
    setSuccessMsg('');
    const { error } = await signDocument(user.id, doc.id, doc.version);
    if (!error) {
      setSuccessMsg(`"${doc.title}" — Lu et approuvé (v${doc.version})`);
      loadData();
      setTimeout(() => setSuccessMsg(''), 3000);
    }
    setLoading(false);
  };

  return (
    <div className="w-full h-full flex bg-slate-50 text-slate-800">
      <div className="w-1/3 border-r border-slate-200 bg-white overflow-y-auto">
        <div className="p-4 border-b border-slate-200">
          <h2 className="font-bold text-lg flex items-center gap-2"><BookOpen className="text-blue-600" /> Procédures</h2>
        </div>
        {documents.length === 0 ? (
          <p className="p-4 text-slate-500 text-sm">Aucun document publié.</p>
        ) : documents.map(doc => (
          <button key={doc.id} onClick={() => setSelected(doc)}
            className={`w-full text-left p-4 border-b border-slate-100 hover:bg-slate-50 ${selected?.id === doc.id ? 'bg-blue-50' : ''}`}>
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">{doc.title}</span>
              {isSigned(doc) && <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />}
            </div>
            <span className="text-xs text-slate-400">v{doc.version} — {doc.category}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        {successMsg && (
          <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 rounded-lg flex items-center gap-2 border border-emerald-200">
            <CheckCircle2 size={18} /> {successMsg}
          </div>
        )}

        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <FileText size={48} className="mb-4" />
            <p>Sélectionnez une procédure à consulter.</p>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-bold">{selected.title}</h3>
                <p className="text-sm text-slate-500">Version {selected.version} — {selected.category}</p>
              </div>
              {selected.requires_signature && !isSigned(selected) && (
                <button onClick={() => handleSign(selected)} disabled={loading}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                  <PenLine size={16} /> Lu et approuvé
                </button>
              )}
              {isSigned(selected) && (
                <span className="flex items-center gap-1 text-emerald-700 text-sm font-medium bg-emerald-50 px-3 py-2 rounded-lg">
                  <CheckCircle2 size={16} /> Signé
                </span>
              )}
            </div>
            <div className="prose prose-sm max-w-none bg-white p-6 rounded-xl border border-slate-200 whitespace-pre-wrap text-sm leading-relaxed">
              {selected.content}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
