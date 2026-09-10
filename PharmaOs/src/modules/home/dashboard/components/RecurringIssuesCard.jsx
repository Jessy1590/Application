import React from 'react';
import { AlertTriangle, ShieldAlert, PackageX, Scale, Activity } from 'lucide-react';

function RankList({ title, icon: Icon, items, color }) {
  return (
    <div>
      <h4 className={`text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5 ${color}`}>
        <Icon size={12} /> {title}
      </h4>
      {!items?.length ? (
        <p className="text-xs text-slate-400 italic">Rien à signaler</p>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.label} className="flex justify-between gap-2 text-sm bg-slate-50 rounded px-2 py-1">
              <span className="truncate text-slate-700" title={it.label}>{it.label}</span>
              <span className="font-bold text-slate-900 shrink-0">{it.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function RecurringIssuesCard({ insights, onNavigate }) {
  const t = insights?.totals;
  const r = insights?.recurring;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col h-full md:col-span-2 xl:col-span-3">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
          <AlertTriangle size={20} />
        </div>
        <div>
          <h3 className="text-slate-800 font-semibold">Problèmes récurrents (30 j)</h3>
          <p className="text-slate-500 text-xs">IP, qualité, stock, litiges — pour prioriser les actions</p>
        </div>
      </div>

      {t && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <button type="button" onClick={() => onNavigate?.('quality')} className="text-left p-2 rounded-lg bg-rose-50 hover:bg-rose-100">
            <div className="text-[10px] text-rose-700 uppercase font-semibold">Qualité ouverts</div>
            <div className="text-lg font-bold text-rose-900">{t.openQuality}</div>
          </button>
          <button type="button" onClick={() => onNavigate?.('stock')} className="text-left p-2 rounded-lg bg-violet-50 hover:bg-violet-100">
            <div className="text-[10px] text-violet-700 uppercase font-semibold">Erreurs stock</div>
            <div className="text-lg font-bold text-violet-900">{t.openStock}</div>
          </button>
          <button type="button" onClick={() => onNavigate?.('disputes')} className="text-left p-2 rounded-lg bg-amber-50 hover:bg-amber-100">
            <div className="text-[10px] text-amber-700 uppercase font-semibold">Litiges ouverts</div>
            <div className="text-lg font-bold text-amber-900">{t.openDisputes}</div>
          </button>
          <button type="button" onClick={() => onNavigate?.('hr')} className="text-left p-2 rounded-lg bg-indigo-50 hover:bg-indigo-100">
            <div className="text-[10px] text-indigo-700 uppercase font-semibold">Abs. en attente / retards</div>
            <div className="text-lg font-bold text-indigo-900">{t.pendingAbs} / {t.retards}</div>
          </button>
        </div>
      )}

      {!insights ? (
        <p className="text-sm text-slate-400">Chargement…</p>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 flex-1">
          <RankList title="Problèmes IP" icon={Activity} items={r?.ip} color="text-sky-700" />
          <RankList title="Types qualité" icon={ShieldAlert} items={r?.quality} color="text-rose-700" />
          <RankList title="Médicaments stock" icon={PackageX} items={r?.stock} color="text-violet-700" />
          <RankList title="Types litiges" icon={Scale} items={r?.disputes} color="text-amber-700" />
        </div>
      )}
    </div>
  );
}
