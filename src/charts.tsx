import { hrDate, hrMoney, hrNumber } from './lib/format';
import { prefersReducedMotion } from './lib/motion';
import type { ChartTokens } from './lib/chart-theme';

type TipItem = { dataKey?: unknown; name?: unknown; value?: unknown; color?: string; stroke?: string; fill?: string };

// Shared tooltip for every Recharts chart; styled by .chart-tip in styles.css.
export function ChartTip({ active, payload, label, format }: {
  active?: boolean;
  payload?: ReadonlyArray<TipItem>;
  label?: string | number;
  format?: (value: number | null, item: TipItem) => string;
}) {
  if (!active || !payload?.length) return null;
  const title = typeof label === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(label) ? hrDate(label) : label;
  return <div className="chart-tip">
    <small>{title}</small>
    {payload.map(item => {
      const value = item.value == null ? null : Number(item.value);
      const text = format ? format(value, item) : item.dataKey === 'quantity' ? hrNumber(value ?? 0) : hrMoney(value);
      return <div className="chart-tip-row" key={String(item.dataKey)}>
        <i style={{ background: item.stroke && item.stroke !== 'none' ? item.stroke : item.color ?? item.fill }}/>
        <span>{String(item.name)}</span>
        <strong>{text}</strong>
      </div>;
    })}
  </div>;
}

export const axisTick = (tokens: ChartTokens) => ({ fill: tokens.axis, fontSize: 11 });
export const tooltipCursor = (tokens: ChartTokens) => ({ stroke: tokens.cursor, strokeWidth: 1 });
export const seriesMotion = () => ({ isAnimationActive: !prefersReducedMotion(), animationDuration: 520, animationEasing: 'ease-out' as const });
export const hasNegative = (rows: ReadonlyArray<Record<string, unknown>>, key: string) => rows.some(row => typeof row[key] === 'number' && (row[key] as number) < 0);
