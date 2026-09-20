import React from 'react';
import { Filter, LayoutGrid, Layers } from 'lucide-react';
import { DASHBOARD_CATEGORIES, DASHBOARD_MODULES } from '../../../../core/dashboardWidgets.js';

const PERIODS = [
  { days: 7, label: '7 j' },
  { days: 30, label: '30 j' },
  { days: 90, label: '90 j' },
];

/**
 * Barre de filtres : période, catégorie d’utilité, module.
 */
export default function DashboardFilters({
  days,
  onDaysChange,
  category,
  onCategoryChange,
  module,
  onModuleChange,
  resultCount,
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 mb-6 space-y-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2 text-slate-700">
          <Filter size={16} className="text-slate-400" />
          <span className="text-sm font-semibold">Filtres</span>
          {typeof resultCount === 'number' && (
            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {resultCount} widget{resultCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => onDaysChange(p.days)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${
                days === p.days
                  ? 'bg-white text-sky-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
          <Layers size={12} /> Catégorie d&apos;utilité
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            active={category === 'all'}
            onClick={() => onCategoryChange('all')}
            label="Toutes"
          />
          {DASHBOARD_CATEGORIES.map((c) => (
            <FilterChip
              key={c.id}
              active={category === c.id}
              onClick={() => onCategoryChange(c.id)}
              label={c.label}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
          <LayoutGrid size={12} /> Module
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            active={module === 'all'}
            onClick={() => onModuleChange('all')}
            label="Tous"
          />
          {DASHBOARD_MODULES.map((m) => (
            <FilterChip
              key={m.id}
              active={module === m.id}
              onClick={() => onModuleChange(m.id)}
              label={m.label}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
        active
          ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
          : 'bg-white text-slate-600 border-slate-200 hover:border-sky-300 hover:text-sky-700'
      }`}
    >
      {label}
    </button>
  );
}
