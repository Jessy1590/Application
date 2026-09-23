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
  height = 'min-h-[13rem] h-56 sm:h-64',
  action = null,
  bodyLayout = 'stack',
  legend = null,
}) {
  const isRow = bodyLayout === 'row' && legend;

  return (
    <div
      className={`bg-[var(--surface-elevated)] rounded-xl shadow-sm border border-[var(--border)] p-4 flex flex-col min-w-0 overflow-hidden ${className}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1 shrink-0">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--fg)] truncate">{title}</h3>
          {subtitle ? <p className="text-xs text-[var(--muted)]">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {isRow ? (
        <div className={`flex gap-3 mt-1 min-h-0 w-full ${height}`}>
          <div className="flex-1 min-w-0 min-h-[12rem] h-full relative">{children}</div>
          <div className="shrink-0 w-[7.5rem] sm:w-36 self-stretch overflow-y-auto flex flex-col justify-center">
            {legend}
          </div>
        </div>
      ) : (
        <div className={`${height} w-full mt-1 min-h-[12rem] relative`}>{children}</div>
      )}
    </div>
  );
}

/** Couleurs via tokens thème — visibles clair / sombre / coloré / bleu doré. */
export const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
  'var(--chart-9)',
  'var(--chart-10)',
];

export const tipStyle = {
  background: 'var(--chart-tooltip-bg)',
  border: '1px solid var(--chart-tooltip-border)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--fg)',
};

export const gridStroke = 'var(--chart-grid)';
export const tickFill = 'var(--chart-tick)';

/** Légende HTML verticale (hors canvas Recharts) — évite le clipping. */
export function SideLegend({ items = [], colors = CHART_COLORS }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-1.5 pr-0.5">
      {items.map((it, i) => (
        <li key={it.name || i} className="flex items-start gap-1.5 text-[11px] leading-snug text-[var(--muted)]">
          <span
            className="mt-0.5 w-2.5 h-2.5 rounded-sm shrink-0"
            style={{ background: it.color || colors[i % colors.length] }}
          />
          <span className="min-w-0 break-words">
            <span className="font-medium text-[var(--fg)]">{it.name}</span>
            {it.value != null && (
              <span className="text-[var(--muted)]"> · {it.value}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function EmptyChart({ message = 'Aucune donnée sur cette période' }) {
  return (
    <div className="h-full min-h-[10rem] flex items-center justify-center text-sm text-[var(--muted)]">
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
