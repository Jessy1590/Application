import React from 'react';
import { ArrowLeft, Pencil } from 'lucide-react';
import InboxPanel from '../comptoir/Inbox.jsx';

/**
 * @deprecated Le hub « À traiter » dashboard monte désormais TasksManager
 * (voir DashboardShell case inbox). Conservé pour imports legacy éventuels.
 */
export default function InboxManager({ onNavigate }) {
  return (
    <div className="max-w-3xl mx-auto w-full">
      {typeof onNavigate === 'function' && (
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="flex items-center gap-2 text-[var(--muted)] hover:text-[var(--accent)] mb-6 text-sm font-medium"
        >
          <ArrowLeft size={16} /> Retour
        </button>
      )}
      <p className="text-sm text-[var(--muted)]">
        Redirection — utilisez la page « À traiter » (TasksManager).
      </p>
    </div>
  );
}

/** Dashboard — Mes saisies (autocorrection). */
export function InboxSaisiesManager({ onNavigate }) {
  return (
    <div className="max-w-3xl mx-auto w-full">
      {typeof onNavigate === 'function' && (
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="flex items-center gap-2 text-[var(--muted)] hover:text-[var(--accent)] mb-6 text-sm font-medium"
        >
          <ArrowLeft size={16} /> Retour
        </button>
      )}

      <h1 className="text-2xl font-bold text-[var(--fg)] flex items-center gap-2 mb-2">
        <Pencil className="text-[var(--accent)]" /> Mes saisies
      </h1>
      <p className="text-sm text-[var(--muted)] mb-6">
        Autocorrection — créateur, moins de 72 h, non clôturé, non modifié par un tiers
      </p>

      <div className="bg-[var(--surface-elevated)] rounded-xl border border-[var(--border)] overflow-hidden min-h-[70vh]">
        <InboxPanel compact mode="saisies" />
      </div>
    </div>
  );
}
