import { useState } from 'react';
import { Activity, CalendarDays } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Analytics } from './api';
import { ChartTip, axisTick, seriesMotion, tooltipCursor } from './charts';
import { useChartTheme } from './lib/chart-theme';
import { bestDay, compareValues, dailyComparison } from './lib/comparison';
import { initials } from './lib/format';
import { PeriodBar } from './ui';
import type { PeriodProps } from './ui';

const money = (cents: number | null) => cents === null ? '—' : new Intl.NumberFormat('hr-HR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const amount = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 2 }).format(value);
const percent = (value: number | null) => value === null ? '—' : `${amount(value * 100)} %`;
const dayLabel = (date: string) => new Intl.DateTimeFormat('hr-HR', { day: 'numeric', month: 'short', timeZone: 'Europe/Zagreb' }).format(new Date(`${date}T12:00:00Z`));

type Props = PeriodProps & { data: Analytics };

export default function Comparison({ data, month, setMonth, onRefresh, loading }: Props) {
  const tokens = useChartTheme();
  const [firstChoice, setFirstChoice] = useState<number | null>(null);
  const [secondChoice, setSecondChoice] = useState<number | null>(null);
  const people = data.employees;
  const first = people.find(person => person.id === firstChoice) ?? people[0] ?? null;
  const second = people.find(person => person.id === secondChoice && person.id !== first?.id)
    ?? people.find(person => person.id !== first?.id) ?? null;

  if (data.from.slice(0, 7) !== month) return <div className="panel comparison-empty" role="status"><span className="spinner small" aria-hidden/>Učitavanje usporedbe za odabrani mjesec…</div>;

  const metrics = first && second ? [
    { label: 'Neto prodaja', a: first.cents, b: second.cents, format: money, difference: money },
    { label: 'Broj usluga', a: first.quantity, b: second.quantity, format: amount, difference: amount },
    { label: 'Prosječna vrijednost', a: first.quantity ? Math.round(first.cents / first.quantity) : null, b: second.quantity ? Math.round(second.cents / second.quantity) : null, format: money, difference: money },
    { label: 'Udio u prodaji', a: first.share, b: second.share, format: percent, difference: (value: number | null) => value === null ? '—' : `${amount(value * 100)} postotnih bodova` },
    { label: 'Najbolji dan', a: bestDay(first)?.cents ?? null, b: bestDay(second)?.cents ?? null, format: money, difference: money }
  ] : [];
  const trend = first && second ? dailyComparison(first, second) : [];
  const negativeTrend = trend.some(row => (row.first ?? 0) < 0 || (row.second ?? 0) < 0);
  // Keys tied to the selected pair make changed values fade in instead of swapping abruptly.
  const pair = `${first?.id}-${second?.id}`;

  return <>
    <PeriodBar month={month} setMonth={setMonth} onRefresh={onRefresh} loading={loading}/>
    <div className="section-title"><div><span className="eyebrow">USPOREDBA DJELATNIKA</span><h1>Usporedba djelatnika</h1><p>Uspoređuju se neto rezultati iz odabranog razdoblja.</p></div></div>
    {people.length < 2 ? <div className="panel comparison-empty">Za usporedbu su potrebna najmanje dva djelatnika s rezultatom u odabranom mjesecu.</div> : <>
      <div className="compare-selects">
        <label className="series-1">Prvi djelatnik<select className="field" aria-label="Prvi djelatnik" value={first?.id ?? ''} onChange={event => setFirstChoice(Number(event.target.value))}>{people.filter(person => person.id !== second?.id).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        <span className="versus" aria-hidden>VS</span>
        <label className="series-2">Drugi djelatnik<select className="field" aria-label="Drugi djelatnik" value={second?.id ?? ''} onChange={event => setSecondChoice(Number(event.target.value))}>{people.filter(person => person.id !== first?.id).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      </div>
      <article className="panel comparison-panel">
        <div className="comparison-head">
          <div key={`a-${first!.id}`} className="swap-in"><span className="avatar huge series-1">{initials(first!.name)}</span><h3>{first!.name}</h3><small>{first!.rank}. mjesto</small></div>
          <span aria-hidden>VS</span>
          <div key={`b-${second!.id}`} className="swap-in"><span className="avatar huge series-2">{initials(second!.name)}</span><h3>{second!.name}</h3><small>{second!.rank}. mjesto</small></div>
        </div>
        <div className="comparison-table">{metrics.map(metric => {
          const result = compareValues(metric.a, metric.b);
          return <div className="comparison-metric" key={metric.label}>
            <div className="comparison-metric-title">{metric.label}</div>
            <div key={`a-${pair}`} className={`comparison-value first swap-in ${result.leader === 'first' ? 'leads' : ''}`}>{metric.format(metric.a)}</div>
            <div key={`l-${pair}`} className="comparison-lead swap-in">{result.difference === null ? 'Nije dostupno' : result.leader === null ? 'Izjednačeno' : `${result.leader === 'first' ? first!.name : second!.name} vodi za ${metric.difference(result.difference)}`}</div>
            <div key={`b-${pair}`} className={`comparison-value second swap-in ${result.leader === 'second' ? 'leads' : ''}`}>{metric.format(metric.b)}</div>
          </div>;
        })}</div>
        <p className="comparison-note"><Activity size={14} aria-hidden/> Razlika u prodaji znači razliku neto rezultata, ne promjenu između Excel uvoza.</p>
      </article>
      <article className="panel comparison-trend">
        <div className="panel-head"><div><span className="eyebrow">DNEVNI UČINAK</span><h3>Prodaja po danu</h3></div>
          <div className="chart-legend" aria-hidden><span className="series-1"><i/>{first!.name}</span><span className="series-2"><i/>{second!.name}</span></div>
        </div>
        {trend.length ? <ResponsiveContainer width="100%" height={275}>
          <LineChart data={trend} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={tokens.grid} vertical={false}/>
            <XAxis dataKey="date" tickFormatter={dayLabel} tickLine={false} axisLine={false} tick={axisTick(tokens)} tickMargin={8} minTickGap={12}/>
            <YAxis tickFormatter={value => `${amount(value)} €`} tickLine={false} axisLine={false} width={58} tick={axisTick(tokens)}/>
            {negativeTrend && <ReferenceLine y={0} stroke={tokens.negative} strokeOpacity={0.5}/>}
            <Tooltip content={<ChartTip format={value => value == null ? 'Nema zapisa' : money(Math.round(value * 100))}/>} cursor={tooltipCursor(tokens)} isAnimationActive={false}/>
            <Line type="monotone" name={first!.name} dataKey="first" stroke={tokens.series1} strokeWidth={2.25} dot={{ r: 3, fill: tokens.series1, strokeWidth: 0 }} activeDot={{ r: 5, stroke: tokens.surface, strokeWidth: 2 }} connectNulls={false} {...seriesMotion()}/>
            <Line type="monotone" name={second!.name} dataKey="second" stroke={tokens.series2} strokeWidth={2.25} strokeDasharray="6 4" dot={{ r: 3, fill: tokens.series2, strokeWidth: 0 }} activeDot={{ r: 5, stroke: tokens.surface, strokeWidth: 2 }} connectNulls={false} {...seriesMotion()}/>
          </LineChart>
        </ResponsiveContainer> : <div className="comparison-empty"><CalendarDays size={20} aria-hidden/> Nema dnevnih zapisa za usporedbu.</div>}
      </article>
    </>}
  </>;
}
