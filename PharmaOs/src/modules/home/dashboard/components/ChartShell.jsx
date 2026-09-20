import React from 'react';

/**
 * Conteneur commun pour un graphique Recharts.
 * @param {'stack'|'row'} [bodyLayout] — `row` = graphique + légende à droite
 */
export default function ChartShell({
  title,
  subtitle,
  children,
  className = '',
  height = 'h-56',
  action = null,
  bodyLayout = 'stack',
  legend = null,
}) {
  const isRow = bodyLayout === 'row' && legend;

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col ${className}`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-800 truncate">{title}</h3>
          {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {isRow ? (
        <div className={`flex gap-3 mt-1 min-h-0 ${height}`}>
          <div className="flex-1 min-w-0 h-full">{children}</div>
          <div className="shrink-0 w-[7.5rem] sm:w-36 self-stretch overflow-y-auto flex flex-col justify-center">
            {legend}
          </div>
        </div>
      ) : (
        <div className={`${height} w-full mt-1`}>{children}</div>
      )}
    </div>
  );
}

export const CHART_COLORS = [
  '#0284c7', '#16a34a', '#d97706', '#dc2626', '#7c3aed',
  '#db2777', '#0d9488', '#ea580c', '#4f46e5', '#64748b',
];

export const tipStyle = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  fontSize: 12,
};

/** Légende HTML verticale (hors canvas Recharts) — évite le clipping. */
export function SideLegend({ items = [], colors = CHART_COLORS }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-1.5 pr-0.5">
      {items.map((it, i) => (
        <li key={it.name || i} className="flex items-start gap-1.5 text-[11px] leading-snug text-slate-600">
          <span
            className="mt-0.5 w-2.5 h-2.5 rounded-sm shrink-0"
            style={{ background: it.color || colors[i % colors.length] }}
          />
          <span className="min-w-0 break-words">
            <span className="font-medium text-slate-700">{it.name}</span>
            {it.value != null && (
              <span className="text-slate-400"> · {it.value}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function EmptyChart({ message = 'Aucune donnée sur cette période' }) {
  return (
    <div className="h-full flex items-center justify-center text-sm text-slate-400">
      {message}
    </div>
  );
}

/** Props Recharts Legend — vertical à droite dans le canvas (si assez large). */
export const legendRightProps = {
  layout: 'vertical',
  align: 'right',
  verticalAlign: 'middle',
  wrapperStyle: {
    fontSize: 11,
    lineHeight: '16px',
    paddingLeft: 8,
    maxWidth: 128,
    overflow: 'visible',
  },
};
