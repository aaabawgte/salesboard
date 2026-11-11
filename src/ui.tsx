import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { CircleHelp, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { monthName } from './lib/format';

export type PeriodProps = { month: string; setMonth: (value: string) => void; onRefresh: () => void; loading?: boolean };

// Dynamic view-transition-name; only the element being morphed carries one, so names stay unique.
export const vtName = (name: string | false | undefined, className?: string) => name
  ? { viewTransitionName: name, ...(className ? { viewTransitionClass: className } : {}) } as CSSProperties
  : undefined;

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return matches;
}

export function PeriodBar({ month, setMonth, onRefresh, loading = false }: PeriodProps) {
  return <div className="period-bar">
    <div>
      <span className="eyebrow">ODABRANO RAZDOBLJE</span>
      <h2 key={month} className="period-title">{monthName(month)}</h2>
    </div>
    <div className="period-actions">
      <input className="field" aria-label="Odabrani mjesec" type="month" value={month} onChange={event => setMonth(event.target.value)}/>
      <button className={`icon-button outlined ${loading ? 'is-loading' : ''}`} onClick={onRefresh} title="Osvježi podatke" aria-label="Osvježi podatke" aria-busy={loading}>
        <RefreshCw size={16} aria-hidden/>
      </button>
    </div>
  </div>;
}

export function Card({ label, value, detail, icon: Icon, tone = 'neutral', size = 'regular', textValue = false }: {
  label: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  tone?: 'neutral' | 'accent' | 'negative';
  size?: 'regular' | 'hero' | 'wide';
  textValue?: boolean;
}) {
  return <article className={`metric-card ${tone} ${size}`}>
    <div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={15} aria-hidden/></span></div>
    <strong className={textValue ? 'metric-value text' : 'metric-value'} title={value}>{value}</strong>
    {/* An empty detail line keeps values aligned across a row of cards. */}
    <small aria-hidden={!detail}>{detail ?? '\u00a0'}</small>
  </article>;
}

export function Empty({ title = 'Nema podataka za odabrano razdoblje', text = 'Uvezite izvještaj ili odaberite drugo razdoblje.' }: { title?: string; text?: string }) {
  return <div className="empty"><span className="empty-icon"><CircleHelp size={18} aria-hidden/></span><strong>{title}</strong><span>{text}</span></div>;
}

// Segmented control with one shared indicator that glides between options (position + width).
export function Segmented<T extends string>({ options, value, onChange, label }: {
  options: ReadonlyArray<readonly [T, string]>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => {
      const active = element.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (active) setBox({ x: active.offsetLeft, w: active.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [value]);

  useEffect(() => {
    if (!box || ready) return;
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, [box, ready]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const index = options.findIndex(([id]) => id === value);
    const next = options[(index + (event.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length][0];
    onChange(next);
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus());
  }

  return <div className={`segmented ${ready ? 'ready' : ''}`} role="group" aria-label={label} ref={root} onKeyDown={onKeyDown}>
    <span className="segmented-indicator" aria-hidden style={box ? { transform: `translateX(${box.x}px)`, width: box.w } : { opacity: 0 }}/>
    {options.map(([id, text]) => <button key={id} type="button" aria-pressed={value === id} className={value === id ? 'selected' : ''} onClick={() => onChange(id)}>{text}</button>)}
  </div>;
}

export function Skeleton() {
  return <div className="skeleton-page" aria-busy="true">
    <span className="visually-hidden" role="status">Učitavanje podataka…</span>
    <div className="period-bar" aria-hidden><div><span className="sk sk-line short"/><span className="sk sk-title"/></div><span className="sk sk-control"/></div>
    <div className="metric-grid" aria-hidden>{[0, 1, 2, 3, 4, 5].map(index => <div key={index} className={`metric-card sk-card ${index === 0 || index === 3 ? 'wide' : ''}`}><span className="sk sk-line short"/><span className="sk sk-value"/><span className="sk sk-line"/></div>)}</div>
    <div className="chart-grid" aria-hidden><div className="panel sk-panel"><span className="sk sk-line short"/><span className="sk sk-chart"/></div><div className="panel sk-panel"><span className="sk sk-line short"/><span className="sk sk-chart"/></div></div>
  </div>;
}
