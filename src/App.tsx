import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, BarChart3, CalendarDays, Check, ChevronRight, CircleHelp, CloudOff, FileSpreadsheet, LayoutDashboard, LogOut, Menu, Moon, RefreshCw, Search, Shield, Sun, Trophy, Upload, Users, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api, demoMode } from './api';
import type { Analytics, Employee } from './api';
import ComparisonView from './Comparison';
import { getMonthRange, getReportingMonth } from './lib/report-period';

const hrDate = (date: string) => new Intl.DateTimeFormat('hr-HR', { dateStyle: 'medium', timeZone: 'Europe/Zagreb' }).format(new Date(`${date}T12:00:00`));
const hrMoney = (value: number | null | undefined) => value == null ? '—' : new Intl.NumberFormat('hr-HR', { style: 'currency', currency: 'EUR' }).format(value);
const hrNumber = (value: number) => new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 2 }).format(value);
const monthName = (month: string) => new Intl.DateTimeFormat('hr-HR', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00`));

type Page = 'pregled' | 'poredak' | 'djelatnici' | 'usporedba' | 'povijest' | 'tv' | 'admin';
type PeriodProps = { month: string; setMonth: (value: string) => void; onRefresh: () => void };
type ReportProps = PeriodProps & { data: Analytics };
type ShellProps = {
  page: Page;
  setPage: (page: Page) => void;
  dark: boolean;
  setDark: (dark: boolean) => void;
  onLogout: () => void;
  children: ReactNode;
};
type ImportBatch = {
  id: number;
  file_name: string;
  date_from: string | null;
  date_to: string | null;
  updated_records: number;
  status: string;
};
type ImportResult = { records: number; employees: number; dateFrom: string; dateTo: string };

const nav: Array<{ id: Page; label: string; icon: LucideIcon }> = [
  { id: 'pregled', label: 'Pregled', icon: LayoutDashboard }, { id: 'poredak', label: 'Poredak', icon: Trophy }, { id: 'djelatnici', label: 'Djelatnici', icon: Users }, { id: 'usporedba', label: 'Usporedba', icon: Activity }, { id: 'povijest', label: 'Povijest', icon: BarChart3 }, { id: 'tv', label: 'TV Mode', icon: CalendarDays }
];

function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (!demoMode) await api('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
      onLogin();
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return <main className="login-shell"><div className="login-orb orb-one"/><div className="login-orb orb-two"/><section className="login-card"><div className="brand-mark"><span>SB</span></div><p className="eyebrow">CCOW · PRODAJNA ANALITIKA</p><h1>SalesBoard</h1><p className="login-copy">Jedan miran pogled na učinak trgovine.</p><form onSubmit={submit}><label htmlFor="password">Pristupna lozinka</label><input id="password" autoFocus type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Unesite lozinku"/><button className="primary-button full" type="submit">Prijava <ChevronRight size={17}/></button>{error && <p className="form-error">{error}</p>}</form><p className="muted tiny">Pristup je zaštićen i namijenjen internoj upotrebi.</p></section></main>;
}

function Shell({ page, setPage, dark, setDark, onLogout, children }: ShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return <div className={`app-shell ${dark ? 'dark' : ''}`}><aside className={`sidebar ${mobileOpen ? 'open' : ''}`}><div className="sidebar-head"><div className="brand-mark small"><span>SB</span></div><div><strong>SalesBoard</strong><small>CCOW · Zagreb</small></div><button className="icon-button mobile-close" onClick={() => setMobileOpen(false)}><X size={18}/></button></div><nav>{nav.map(item => { const Icon = item.icon; return <button key={item.id} className={page === item.id ? 'nav-item active' : 'nav-item'} onClick={() => { setPage(item.id); setMobileOpen(false); }}><Icon size={18}/><span>{item.label}</span></button>; })}<div className="nav-divider"/><button className={page === 'admin' ? 'nav-item active' : 'nav-item'} onClick={() => { setPage('admin'); setMobileOpen(false); }}><Shield size={18}/><span>Administracija</span><span className="nav-dot"/></button></nav><div className="sidebar-bottom"><button className="nav-item" onClick={() => setDark(!dark)}>{dark ? <Sun size={18}/> : <Moon size={18}/>}<span>{dark ? 'Svijetli način' : 'Tamni način'}</span></button><button className="nav-item logout" onClick={onLogout}><LogOut size={18}/><span>Odjava</span></button></div></aside><div className="main-area"><header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={21}/></button><div className="crumb"><span>SalesBoard</span><ChevronRight size={14}/><strong>{nav.find(item => item.id === page)?.label ?? 'Administracija'}</strong></div><div className="top-actions"><span className="live-dot"/> <span className="tiny muted">Podaci su zaštićeni</span><button className="icon-button" onClick={() => setDark(!dark)}>{dark ? <Sun size={18}/> : <Moon size={18}/>}</button></div></header><main className="content">{children}</main></div></div>;
}

function PeriodBar({ month, setMonth, onRefresh }: PeriodProps) { return <div className="period-bar"><div><span className="eyebrow">ODABRANO RAZDOBLJE</span><h2>{monthName(month)}</h2></div><div className="period-actions"><input aria-label="Odabrani mjesec" type="month" value={month} onChange={event => setMonth(event.target.value)}/><button className="icon-button outlined" onClick={onRefresh} title="Osvježi podatke"><RefreshCw size={17}/></button></div></div>; }
function Card({ label, value, detail, icon: Icon, tone = 'neutral' }: {
  label: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  tone?: string;
}) { return <article className={`metric-card ${tone}`}><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={17}/></span></div><strong>{value}</strong>{detail && <small>{detail}</small>}</article>; }
function Empty({ title = 'Nema podataka za odabrano razdoblje', text = 'Uvezite izvještaj ili odaberite drugo razdoblje.' }: { title?: string; text?: string }) { return <div className="empty"><CircleHelp size={21}/><strong>{title}</strong><span>{text}</span></div>; }
function ChartTip({ active, payload, label }: {
  active?: boolean;
  payload?: ReadonlyArray<{ dataKey: string; name: string; value: number; color?: string }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const title = typeof label === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(label) ? hrDate(label) : label;
  return <div className="chart-tip"><small>{title}</small>{payload.map(item => <strong key={item.dataKey} style={{ color: item.color }}>{item.name}: {item.dataKey === 'quantity' ? hrNumber(item.value) : hrMoney(item.value)}</strong>)}</div>;
}

function Dashboard({ data, month, setMonth, onRefresh, setPage }: ReportProps & { setPage: (page: Page) => void }) {
  const top = data.leaderboard[0];
  return <><PeriodBar month={month} setMonth={setMonth} onRefresh={onRefresh}/><section className="metric-grid"><Card label="Ukupna prodaja" value={hrMoney(data.total)} detail="neto vrijednost usluga" icon={BarChart3} tone="positive"/><Card label="Prodano usluga" value={hrNumber(data.quantity)} detail="neto količina" icon={Activity}/><Card label="Prosječna vrijednost" value={data.quantity ? hrMoney(data.total / data.quantity) : '—'} detail="po usluzi" icon={CalendarDays}/><Card label="Najbolji prodavač" value={top?.name ?? '—'} detail={top ? `${hrMoney(top.value)} neto prodaja` : 'Nema podataka'} icon={Trophy} tone="accent"/><Card label="Dani s podacima" value={hrNumber(data.daily.length)} detail="u odabranom mjesecu" icon={CalendarDays}/><Card label="Zadnje ažuriranje" value={data.latestImport ? new Intl.DateTimeFormat('hr-HR', { day: '2-digit', month: 'short' }).format(new Date(data.latestImport.imported_at)) : '—'} detail={data.latestImport ? new Intl.DateTimeFormat('hr-HR', { timeStyle: 'short', timeZone: 'Europe/Zagreb' }).format(new Date(data.latestImport.imported_at)) : 'Još nema uvoza'} icon={RefreshCw}/></section><section className="chart-grid"><article className="panel chart-panel wide"><div className="panel-head"><div><span className="eyebrow">TREND</span><h3>Dnevna prodaja</h3></div><span className="panel-note">Neto vrijednost</span></div>{data.daily.length ? <ResponsiveContainer width="100%" height={285}><AreaChart data={data.daily}><defs><linearGradient id="salesFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#28a773" stopOpacity={.26}/><stop offset="100%" stopColor="#28a773" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="date" tickFormatter={date => date.slice(8)} tickLine={false} axisLine={false}/><YAxis tickFormatter={value => `${hrNumber(Math.round(value))} €`} tickLine={false} axisLine={false} width={50}/><Tooltip content={<ChartTip/>}/><Area type="monotone" dataKey="value" name="Prodaja" stroke="#28a773" strokeWidth={2.5} fill="url(#salesFill)"/></AreaChart></ResponsiveContainer> : <Empty/>}</article><article className="panel chart-panel"><div className="panel-head"><div><span className="eyebrow">RASPOVJETA</span><h3>Po djelatniku</h3></div><button className="text-button" onClick={() => setPage('poredak')}>Poredak <ChevronRight size={15}/></button></div>{data.leaderboard.length ? <ResponsiveContainer width="100%" height={285}><BarChart data={data.leaderboard.slice(0, 6)} layout="vertical" margin={{ left: 12, right: 12 }}><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" hide/><YAxis type="category" dataKey="name" width={100} tickLine={false} axisLine={false} tick={{ fontSize: 11 }}/><Tooltip content={<ChartTip/>}/><Bar dataKey="value" name="Prodaja" radius={[0, 5, 5, 0]}>{data.leaderboard.slice(0, 6).map((_, index) => <Cell key={index} fill={index === 0 ? '#28a773' : '#a9cdbd'}/>)}</Bar></BarChart></ResponsiveContainer> : <Empty/>}</article></section><section className="panel insight"><div className="insight-icon"><Activity size={20}/></div><div><span className="eyebrow">BRZI UVID</span><h3>{top ? `${top.name} vodi poredak u ${monthName(month)}.` : 'Spremno za prvi izvještaj.'}</h3><p>{top ? `${top.name} ostvaruje ${hrMoney(top.value)} neto prodaje i ${hrNumber(top.quantity)} usluga. Usporedbe se računaju samo iz uvezenih podataka.` : 'Nakon administratorskog uvoza statistika će se pojaviti ovdje.'}</p></div></section></>;
}

function Leaderboard({ data, month, setMonth, onRefresh, setSelected }: ReportProps & { setSelected: (employee: Employee) => void }) { const [sort, setSort] = useState('cents'); const list = [...data.leaderboard].sort((a, b) => sort === 'quantity' ? b.quantity - a.quantity || b.cents - a.cents : sort === 'avg' ? (b.avg ?? -Infinity) - (a.avg ?? -Infinity) || b.cents - a.cents : b.cents - a.cents || b.quantity - a.quantity || a.name.localeCompare(b.name, 'hr')); return <><PeriodBar month={month} setMonth={setMonth} onRefresh={onRefresh}/><div className="section-title"><div><span className="eyebrow">REZULTATI TRGOVINE</span><h1>Poredak djelatnika</h1><p>Deterministički poredak: prodaja, zatim količina, pa abecedni red.</p></div><div className="segmented">{[['cents', 'Prodaja'], ['quantity', 'Količina'], ['avg', 'Prosjek']].map(([id, label]) => <button key={id} className={sort === id ? 'selected' : ''} onClick={() => setSort(id)}>{label}</button>)}</div></div><div className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>#</th><th>Djelatnik</th><th>Udio</th><th>Usluge</th><th>Prosjek</th><th className="right">Neto prodaja</th></tr></thead><tbody>{list.map((employee, index) => <tr key={employee.id} onClick={() => setSelected(employee)}><td><span className={`rank ${index < 3 ? 'medal' : ''}`}>{index + 1}</span></td><td><div className="person"><span className="avatar">{employee.name.split(' ').map(part => part[0]).join('').slice(0, 2)}</span><strong>{employee.name}</strong></div></td><td><div className="share-cell"><span>{employee.share == null ? '—' : `${hrNumber(employee.share * 100)} %`}</span><div className="mini-bar"><i style={{ width: `${Math.min(Math.abs(employee.share ?? 0) * 100, 100)}%` }}/></div></div></td><td>{hrNumber(employee.quantity)}</td><td>{hrMoney(employee.avg)}</td><td className="right"><strong>{hrMoney(employee.value)}</strong></td></tr>)}</tbody></table></div>{!list.length && <Empty/>}</div></>; }

function EmployeePage({ data, month, setMonth, onRefresh, selected, setSelected }: ReportProps & {
  selected: Employee | null;
  setSelected: (employee: Employee | null) => void;
}) { const [query, setQuery] = useState(''); const filtered = data.employees.filter((e: Employee) => e.name.toLocaleLowerCase('hr').includes(query.toLocaleLowerCase('hr'))); return <><PeriodBar month={month} setMonth={setMonth} onRefresh={onRefresh}/>{selected ? <EmployeeDetail employee={selected} onBack={() => setSelected(null)}/> : <><div className="section-title"><div><span className="eyebrow">TIM</span><h1>Djelatnici</h1><p>Odaberite profil za detaljniju analizu učinka.</p></div><div className="search-box"><Search size={17}/><input placeholder="Pretraži djelatnika" value={query} onChange={e => setQuery(e.target.value)}/></div></div><div className="employee-grid">{filtered.map((employee: Employee) => <button className="employee-card" key={employee.id} onClick={() => setSelected(employee)}><div className="person"><span className="avatar large">{employee.name.split(' ').map(part => part[0]).join('').slice(0, 2)}</span><div><strong>{employee.name}</strong><small>{employee.rank}. mjesto · {hrNumber(employee.quantity)} usluga</small></div></div><div className="employee-value"><strong>{hrMoney(employee.value)}</strong><ChevronRight size={17}/></div></button>)}</div>{!filtered.length && <Empty/>}</>}</>; }
function EmployeeDetail({ employee, onBack }: { employee: Employee; onBack: () => void }) {
  const daily = employee.days;
  const best = [...daily].sort((a, b) => b.cents - a.cents)[0];
  return <><button className="back-button" onClick={onBack}>← Svi djelatnici</button><div className="profile-head"><div className="avatar huge">{employee.name.split(' ').map((part: string) => part[0]).join('').slice(0, 2)}</div><div><span className="eyebrow">PROFIL DJELATNIKA</span><h1>{employee.name}</h1><p>{employee.rank}. mjesto u odabranom razdoblju</p></div><div className="profile-total"><span>Neto prodaja</span><strong>{hrMoney(employee.value)}</strong></div></div><div className="metric-grid compact"><Card label="Usluge" value={hrNumber(employee.quantity)} icon={Activity}/><Card label="Prosječna usluga" value={hrMoney(employee.avg)} icon={BarChart3}/><Card label="Udio trgovine" value={employee.share == null ? '—' : `${hrNumber(employee.share * 100)} %`} icon={Trophy}/><Card label="Najbolji dan" value={best ? hrMoney(best.value) : '—'} detail={best ? hrDate(best.date) : 'Nema podataka'} icon={CalendarDays} tone="positive"/></div><article className="panel chart-panel"><div className="panel-head"><div><span className="eyebrow">UČINAK KROZ VRIJEME</span><h3>Dnevna prodaja</h3></div></div>{daily.length ? <ResponsiveContainer width="100%" height={300}><AreaChart data={daily}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="date" tickFormatter={d => d.slice(8)} tickLine={false} axisLine={false}/><YAxis tickFormatter={value => `${hrNumber(Math.round(value))} €`} tickLine={false} axisLine={false}/><Tooltip content={<ChartTip/>}/><Area type="monotone" dataKey="value" name="Prodaja" stroke="#5575ef" fill="#5575ef22" strokeWidth={2.5}/></AreaChart></ResponsiveContainer> : <Empty text="Za djelatnika nema zapisa u odabranom razdoblju."/>}</article></>; }


function History({ data, month, setMonth, onRefresh }: ReportProps) { const months = data.daily.length ? [...new Set(data.daily.map(row => row.date.slice(0, 7)))] : []; return <><PeriodBar month={month} setMonth={setMonth} onRefresh={onRefresh}/><div className="section-title"><div><span className="eyebrow">KONTINUITET</span><h1>Povijest i analitika</h1><p>Podaci se čuvaju po izvještajnom danu; prazni dani nisu umjetno popunjeni.</p></div></div><section className="history-grid"><article className="panel"><div className="panel-head"><div><span className="eyebrow">DNEVNI REZULTATI</span><h3>Najuspješniji dani</h3></div></div>{data.daily.slice().sort((a, b) => b.cents - a.cents).slice(0, 8).map((day, index) => <div className="history-row" key={day.date}><span className="history-rank">{index + 1}</span><span>{hrDate(day.date)}</span><strong>{hrMoney(day.value)}</strong><small>{hrNumber(day.quantity)} usluga</small></div>)}{!data.daily.length && <Empty/>}</article><article className="panel"><div className="panel-head"><div><span className="eyebrow">DOSTUPNI MJESECI</span><h3>Uvezeni periodi</h3></div></div>{months.map(m => <div className="month-row" key={m}><CalendarDays size={17}/><span>{monthName(m)}</span><strong>{m === month ? 'Odabrano' : ''}</strong></div>)}{!months.length && <Empty text="Povijesni periodi pojavit će se nakon prvog uvoza."/>}</article></section></>; }

function TvMode({ data, onExit }: { data: Analytics; onExit: () => void }) { return <div className="tv-mode"><div className="tv-top"><div><div className="brand-line"><span className="brand-mark small"><span>SB</span></span><strong>SalesBoard</strong></div><span>CCOW · uživo</span></div><button className="icon-button" onClick={onExit}><X size={20}/></button></div><div className="tv-content"><span className="eyebrow">DANAS · ZADNJE AŽURIRANJE {data.latestImport ? new Intl.DateTimeFormat('hr-HR', { timeStyle: 'short', timeZone: 'Europe/Zagreb' }).format(new Date(data.latestImport.imported_at)) : '—'}</span><h1>{hrMoney(data.total)}</h1><p>ukupna neto prodaja · {hrNumber(data.quantity)} usluga</p><div className="tv-grid"><div><span className="eyebrow">POREDAK</span>{data.leaderboard.slice(0, 5).map((e: Employee, i: number) => <div className="tv-rank" key={e.id}><strong>{String(i + 1).padStart(2, '0')}</strong><span>{e.name}</span><b>{hrMoney(e.value)}</b></div>)}</div><div className="tv-chart"><ResponsiveContainer width="100%" height={320}><AreaChart data={data.daily}><defs><linearGradient id="tvFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5ee3a5" stopOpacity=".42"/><stop offset="1" stopColor="#5ee3a5" stopOpacity="0"/></linearGradient></defs><XAxis dataKey="date" tickFormatter={d => d.slice(8)} stroke="#94a39d" axisLine={false} tickLine={false}/><YAxis hide/><Area type="monotone" dataKey="value" stroke="#5ee3a5" fill="url(#tvFill)" strokeWidth={3}/></AreaChart></ResponsiveContainer></div></div></div></div>; }

function Admin({ onRefresh, admin, setAdmin }: {
  onRefresh: () => void;
  admin: boolean;
  setAdmin: (active: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [imports, setImports] = useState<ImportBatch[]>([]);
  const [adminPassword, setAdminPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function login() {
    try {
      await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: adminPassword }) });
      setAdmin(true);
      setError('');
    } catch (error) {
      setError((error as Error).message);
    }
  }

  async function loadImports() {
    try {
      const result = await api<{ results?: ImportBatch[] }>('/api/imports');
      setImports(result.results ?? []);
    } catch {}
  }

  useEffect(() => {
    if (admin) void loadImports();
  }, [admin]);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await api<ImportResult>('/api/import', { method: 'POST', body: form });
      setMessage(`Uvoz uspješan: ${result.records} dnevnih zapisa, ${result.employees} djelatnika (${result.dateFrom} – ${result.dateTo}).`);
      setFile(null);
      await loadImports();
      onRefresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!admin) return <><div className="section-title"><div><span className="eyebrow">ZAŠTIĆENA ZONA</span><h1>Administracija</h1><p>Unesite zasebnu administratorsku lozinku za uvoz i povijest.</p></div></div><div className="admin-login panel"><Shield size={28}/><h3>Administrator</h3><input type="password" placeholder="Administratorska lozinka" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()}/><button className="primary-button" onClick={login}>Otključaj administraciju <ChevronRight size={17}/></button>{error && <p className="form-error">{error}</p>}</div></>; return <><div className="section-title"><div><span className="eyebrow">UPRAVLJANJE PODACIMA</span><h1>Administracija</h1><p>Uvoz valjanog izvještaja odmah osvježava statistiku za sve korisnike.</p></div></div><section className="admin-grid"><article className="panel upload-panel"><div className="dropzone"><FileSpreadsheet size={30}/><h3>Uvezi Excel izvještaj</h3><p>Dodajte .xlsx datoteku do 10 MB. Preklapajući periodi obrađuju se idempotentno.</p><label className="secondary-button"><Upload size={17}/> {file ? file.name : 'Odaberi datoteku'}<input type="file" accept=".xlsx" onChange={e => setFile(e.target.files?.[0] ?? null)}/></label>{file && <button className="primary-button" disabled={busy} onClick={upload}>{busy ? 'Uvoz u tijeku…' : 'Pokreni uvoz'} <ChevronRight size={17}/></button>}{message && <p className="success-message"><Check size={16}/> {message}</p>}{error && <p className="form-error">{error}</p>}</div></article><article className="panel"><div className="panel-head"><div><span className="eyebrow">ZADNJIH 50</span><h3>Povijest uvoza</h3></div><button className="icon-button outlined" onClick={loadImports}><RefreshCw size={16}/></button></div>{imports.map(item => <div className="import-row" key={item.id}><div><strong>{item.file_name}</strong><small>{item.date_from ?? '—'} – {item.date_to ?? '—'} · {item.updated_records} zapisa</small></div><span className={`status ${item.status}`}>{item.status === 'success' ? 'Uspješno' : item.status}</span></div>)}{!imports.length && <Empty text="Povijest će se prikazati nakon prvog uvoza."/>}</article></section></>; }

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [page, setPage] = useState<Page>('pregled');
  const [month, setMonth] = useState(getReportingMonth);
  const [dark, setDark] = useState(() => localStorage.getItem('sb-theme') === 'dark');
  const [data, setData] = useState<Analytics | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);

  function selectMonth(value: string) {
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value) && !value.startsWith('0000-')) setMonth(value);
  }

  function selectEmployee(employee: Employee | null) {
    setSelectedId(employee?.id ?? null);
  }

  function refresh() {
    setRefreshCount(count => count + 1);
  }

  function logout() {
    setAuthenticated(false);
    setAdmin(false);
    setData(null);
    setOffline(false);
    if (!demoMode) void api('/api/logout', { method: 'POST' }).catch(() => {});
  }

  useEffect(() => {
    localStorage.setItem('sb-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    if (!authenticated) return;
    const request = new AbortController();
    const { from, to } = getMonthRange(month);

    async function load() {
      try {
        // Keep the import behind a build-time guard so Vite omits the demo chunk.
        const result = import.meta.env.DEV && import.meta.env.MODE === 'development' && demoMode
          ? (await import('./demo')).createDemoAnalytics(from, to)
          : await api<Analytics>(`/api/analytics?from=${from}&to=${to}`, { signal: request.signal });
        if (request.signal.aborted) return;
        setData(result);
        setOffline(false);
      } catch {
        if (!request.signal.aborted) setOffline(true);
      }
    }

    void load();
    return () => request.abort();
  }, [authenticated, month, refreshCount]);

  if (!authenticated) return <Login onLogin={() => setAuthenticated(true)}/>;
  if (!data && offline) {
    return <main className="offline">
      <CloudOff size={35}/><h2>Veza je privremeno nedostupna</h2>
      <p>Podaci se nisu mogli učitati. Provjerite mrežu i pokušajte ponovno.</p>
      <button className="primary-button" onClick={refresh}>Pokušaj ponovno <RefreshCw size={16}/></button>
    </main>;
  }
  if (!data) return <main className="loading"><div className="spinner"/><span>Učitavanje podataka…</span></main>;
  if (page === 'tv') return <TvMode data={data} onExit={() => setPage('pregled')}/>;

  const selected = data.employees.find(employee => employee.id === selectedId) ?? null;
  const report = { data, month, setMonth: selectMonth, onRefresh: refresh };
  return <Shell page={page} setPage={setPage} dark={dark} setDark={setDark} onLogout={logout}>
    {page === 'pregled' && <Dashboard {...report} setPage={setPage}/>}
    {page === 'poredak' && <Leaderboard {...report} setSelected={employee => {
      selectEmployee(employee);
      setPage('djelatnici');
    }}/>}
    {page === 'djelatnici' && <EmployeePage {...report} selected={selected} setSelected={selectEmployee}/>}
    {page === 'usporedba' && <ComparisonView {...report}/>}
    {page === 'povijest' && <History {...report}/>}
    {page === 'admin' && <Admin admin={admin} setAdmin={setAdmin} onRefresh={refresh}/>}
  </Shell>;
}
