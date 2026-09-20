import React from 'react';
import { ArrowLeft, Inbox } from 'lucide-react';
import InboxPanel from '../comptoir/Inbox.jsx';

/** Dashboard — même UI que le module taskbar. */
export default function InboxManager({ onNavigate }) {
  return (
    <div className="max-w-3xl mx-auto w-full">
      {typeof onNavigate === 'function' && (
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 mb-6 text-sm font-medium"
        >
          <ArrowLeft size={16} /> Retour
        </button>
      )}

      <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-2">
        <Inbox className="text-indigo-600" /> À traiter & mes saisies
      </h1>
      <p className="text-sm text-slate-500 mb-6">Complément LGO — file perso + corrections</p>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[70vh]">
        <InboxPanel compact initialTab="inbox" />
      </div>
    </div>
  );
}
