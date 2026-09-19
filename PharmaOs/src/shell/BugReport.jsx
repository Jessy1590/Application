import React, { useState } from 'react';
import { Bug, Send, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../core/AuthContext.jsx';
import { createBug } from '../modules/admin/services/bugService.js';

export default function BugReport() {
  const { user, profile, isLoading } = useAuth();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const handleSubmit = async () => {
    setLoading(true);
    setErr('');
    setMsg('');
    try {
      if (!user?.id) throw new Error('Session requise pour envoyer un signalement.');
      await createBug({
        userId: user.id,
        userName: profile?.display_name || user.email || 'Inconnu',
        information: text,
      });
      setMsg('Bug enregistré. L’équipe administration pourra le traiter depuis le dashboard.');
      setText('');
    } catch (e) {
      setErr(
        e.code === 'empty' || e.message === 'empty'
          ? 'Décrivez le problème avant d’envoyer.'
          : (e.message || 'Erreur.'),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 p-6 flex flex-col">
      <h1 className="text-xl font-bold flex items-center gap-2 mb-1">
        <Bug className="text-rose-600" /> Signalement bug
      </h1>
      <p className="text-sm text-slate-500 mb-4">
        Décrivez ce qui ne va pas. Le ticket (date, votre nom, le détail) sera visible dans Administration → Bugs.
      </p>

      {isLoading && <p className="text-sm text-slate-500 mb-3">Chargement de la session…</p>}

      {msg && (
        <div className="mb-3 p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm flex items-center gap-2">
          <CheckCircle2 size={16} /> {msg}
        </div>
      )}
      {err && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{err}</div>}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={12}
        className="flex-1 w-full p-3 border border-slate-300 rounded-xl bg-white text-sm resize-none focus:ring-2 focus:ring-rose-400 outline-none"
        placeholder="Ex. : Sur les périmés, après validation d’une mise en avant, la tâche reste ouverte…"
      />

      <button
        type="button"
        disabled={loading || !text.trim() || !user}
        onClick={handleSubmit}
        className="mt-4 w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Send size={18} /> {loading ? 'Envoi…' : 'Envoyer'}
      </button>
    </div>
  );
}
