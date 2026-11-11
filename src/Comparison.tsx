import { useState } from 'react';
import { Activity, CalendarDays } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Analytics, Employee } from './api';
import { bestDay, compareValues, dailyComparison } from './lib/comparison';

const money = (cents: number | null) => cents === null ? '—' : new Intl.NumberFormat('hr-HR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const amount = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 2 }).format(value);
const percent = (value: number | null) => value === null ? '—' : `${amount(value * 100)} %`;
const dayLabel = (date: string) => new Intl.DateTimeFormat('hr-HR', { day: 'numeric', month: 'short', timeZone: 'Europe/Zagreb' }).format(new Date(`${date}T12:00:00Z`));

type Props = { data: Analytics; month: string; setMonth: (value: string) => void; onRefresh: () => void };

export default function Comparison({ data, month, setMonth, onRefresh }: Props) {
  const [firstChoice, setFirstChoice] = useState<number | null>(null);
  const [secondChoice, setSecondChoice] = useState<number | null>(null);
  const people = data.employees;
  const first = people.find(person => person.id === firstChoice) ?? people[0] ?? null;
  const second = people.find(person => person.id === secondChoice && person.id !== first?.id)
    ?? people.find(person => person.id !== first?.id) ?? null;

  if (data.from.slice(0, 7) !== month) return <div className="panel comparison-empty">Učitavanje usporedbe za odabrani mjesec…</div>;

  const metrics = first && second ? [
    { label: 'Neto prodaja', a: first.cents, b: second.cents, format: money, difference: money },
    { label: 'Broj usluga', a: first.quantity, b: second.quantity, format: amount, difference: amount },
    { label: 'Prosječna vrijednost', a: first.quantity ? Math.round(first.cents / first.quantity) : null, b: second.quantity ? Math.round(second.cents / second.quantity) : null, format: money, difference: money },
    { label: 'Udio u prodaji', a: first.share, b: second.share, format: percent, difference: (value: number | null) => value === null ? '—' : `${amount(value * 100)} postotnih bodova` },
    { label: 'Najbolji dan', a: bestDay(first)?.cents ?? null, b: bestDay(second)?.cents ?? null, format: money, difference: money }
  ] : [];
  const trend = first && second ? dailyComparison(first, second) : [];

  return <>
    <div className="period-bar"><div><span className="eyebrow">ODABRANO RAZDOBLJE</span><h2>{new Intl.DateTimeFormat('hr-HR', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00Z`))}</h2></div><div className="period-actions"><input aria-label="Odabrani mjesec" type="month" value={month} onChange={event => setMonth(event.target.value)}/><button className="icon-button outlined" onClick={onRefresh} title="Osvježi podatke">↻</button></div></div>
    <div className="section-title"><div><span className="eyebrow">USPOREDBA DJELATNIKA</span><h1>Usporedba djelatnika</h1><p>Uspoređuju se neto rezultati iz odabranog razdoblja.</p></div></div>
    {people.length < 2 ? <div className="panel comparison-empty">Za usporedbu su potrebna najmanje dva djelatnika s rezultatom u odabranom mjesecu.</div> : <>
      <div className="compare-selects"><label>Prvi djelatnik<select aria-label="Prvi djelatnik" value={first?.id ?? ''} onChange={event => setFirstChoice(Number(event.target.value))}>{people.filter(person => person.id !== second?.id).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><span className="versus">VS</span><label>Drugi djelatnik<select aria-label="Drugi djelatnik" value={second?.id ?? ''} onChange={event => setSecondChoice(Number(event.target.value))}>{people.filter(person => person.id !== first?.id).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label></div>
      <article className="panel comparison-panel"><div className="comparison-head"><div><span className="avatar huge">{initials(first!.name)}</span><h3>{first!.name}</h3><small>{first!.rank}. mjesto</small></div><span>VS</span><div><span className="avatar huge secondary">{initials(second!.name)}</span><h3>{second!.name}</h3><small>{second!.rank}. mjesto</small></div></div>
        <div className="comparison-table">{metrics.map(metric => { const result = compareValues(metric.a, metric.b); return <div className="comparison-metric" key={metric.label}><div className="comparison-metric-title">{metric.label}</div><div className={`comparison-value ${result.leader === 'first' ? 'leads' : ''}`}>{metric.format(metric.a)}</div><div className="comparison-lead">{result.difference === null ? 'Nije dostupno' : result.leader === null ? 'Izjednačeno' : `${result.leader === 'first' ? first!.name : second!.name} vodi za ${metric.difference(result.difference)}`}</div><div className={`comparison-value second ${result.leader === 'second' ? 'leads' : ''}`}>{metric.format(metric.b)}</div></div>; })}</div>
        <p className="comparison-note"><Activity size={15}/> Razlika u prodaji znači razliku neto rezultata, ne promjenu između Excel uvoza.</p>
      </article>
      <article className="panel comparison-trend"><div className="panel-head"><div><span className="eyebrow">DNEVNI UČINAK</span><h3>Prodaja po danu</h3></div></div>{trend.length ? <ResponsiveContainer width="100%" height={275}><LineChart data={trend}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="date" tickFormatter={dayLabel} tickLine={false} axisLine={false}/><YAxis tickFormatter={value => `${amount(value)} €`} tickLine={false} axisLine={false} width={58}/><Tooltip labelFormatter={value => dayLabel(String(value))} formatter={(value, name) => [value == null ? 'Nema zapisa' : money(Math.round(Number(value) * 100)), name]}/><Line type="monotone" name={first!.name} dataKey="first" stroke="#28a773" strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false}/><Line type="monotone" name={second!.name} dataKey="second" stroke="#6a7bd2" strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false}/></LineChart></ResponsiveContainer> : <div className="comparison-empty"><CalendarDays size={21}/> Nema dnevnih zapisa za usporedbu.</div>}</article>
    </>}
  </>;
}

function initials(name: string) { return name.split(/\s+/).map(part => part[0]).join('').slice(0, 2); }
