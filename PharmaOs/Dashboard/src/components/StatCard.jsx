import React from 'react';

/**
 * @param {string} title
 * @param {React.ComponentType} icon - composant icône Lucide
 * @param {{ label: string, value: string | number }[]} metrics
 * @param {string} [footnote]
 */
export default function StatCard({ title, icon: Icon, metrics, footnote, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col gap-4 ${onClick ? 'cursor-pointer hover:border-sky-300 transition' : ''}`}
    >
      <div className="flex items-center gap-2">
        {Icon && (
          <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center">
            <Icon size={16} className="text-sky-600" />
          </div>
        )}
        <h2 className="text-slate-900 text-sm font-semibold">{title}</h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {metrics.map((m) => (
          <div key={m.label} className="flex flex-col">
            <span className="text-slate-500 text-xs">{m.label}</span>
            <span className="text-slate-900 text-xl font-semibold">{m.value}</span>
          </div>
        ))}
      </div>

      {footnote && <p className="text-slate-400 text-xs">{footnote}</p>}
    </div>
  );
}
