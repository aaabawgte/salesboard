import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, BarChart3, Calculator, CalendarClock, CalendarDays, Check, ChevronDown, ChevronRight, CloudOff, Eye, FileSpreadsheet, Gauge, KeyRound, LayoutDashboard, LogOut, Menu, Moon, RefreshCw, Search, Settings2, Shield, Sun, Target, TrendingUp, Trophy, Upload, UserRoundCheck, Users, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api, demoMode } from './api';
import type { Analytics, Employee, PortalUser } from './api';
import ComparisonView from './Comparison';
import { ChartTip, axisTick, hasNegative, seriesMotion, tooltipCursor } from './charts';
import { ChartThemeContext, chartTokens, useChartTheme } from './lib/chart-theme';
import { hrDate, hrMoney, hrNumber, initials, monthName } from './lib/format';
import { withViewTransition } from './lib/motion';
import { getMonthRange, getReportingMonth } from './lib/report-period';
import { AccessScreen, AccountCenter, AdminPortalTools, ManagerCenter, ShiftCenter, WarrantyCenter } from './Portal';
import { Card, Empty, PeriodBar, Segmented, Skeleton, useMediaQuery, vtName } from './ui';
import type { PeriodProps } from './ui';

type Page = 'pregled' | 'poredak' | 'djelatnici' | 'usporedba' | 'povijest' | 'jamstva' | 'smjene' | 'targeti' | 'uvoz' | 'vidljivost' | 'racun' | 'tv' | 'admin' | 'registracije' | 'poslovnice' | 'admin-uvoz';
type NavEntry = { id: Page; label: string; icon: LucideIcon };
type NavGroup = { id: string; label: string; icon: LucideIcon; items: NavEntry[] };
type NavSection = { label: string; entries: Array<NavEntry | NavGroup> };
type ReportProps = PeriodProps & { data: Analytics };
type ShellProps = {
  page: Page;
  onNavigate: (page: Page, animate: boolean) => void;
  dark: boolean;
  onToggleTheme: () => void;
  onLogout: () => void;
  navigation: NavSection[];
  canUseTv?: boolean;
  subtitle?: string;
  user?: PortalUser | null;
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
type SortKey = 'cents' | 'quantity' | 'avg';

const nav: NavEntry[] = [
  { id: 'pregled', label: 'Pregled', icon: LayoutDashboard }, { id: 'poredak', label: 'Poredak', icon: Trophy }, { id: 'djelatnici', label: 'Djelatnici', icon: Users }, { id: 'usporedba', label: 'Usporedba', icon: Activity }, { id: 'povijest', label: 'Povijest', icon: BarChart3 }, { id: 'jamstva', label: 'Jamstva', icon: Calculator }, { id: 'smjene', label: 'Smjene i zahtjevi', icon: CalendarClock }, { id: 'targeti', label: 'Targeti', icon: Target }, { id: 'uvoz', label: 'Uvoz podataka', icon: Upload }, { id: 'vidljivost', label: 'Vidljivost rezultata', icon: Eye }, { id: 'racun', label: 'Moj račun', icon: KeyRound }, { id: 'tv', label: 'TV Mode', icon: CalendarDays }, { id: 'admin', label: 'Administracija', icon: Shield }, { id: 'registracije', label: 'Registracije', icon: UserRoundCheck }, { id: 'poslovnice', label: 'Poslovnice', icon: Settings2 }, { id: 'admin-uvoz', label: 'Centralni uvoz', icon: FileSpreadsheet }
];
const navEntry = (id: Page) => nav.find(item => item.id === id)!;
const navGroup = (id: string, label: string, icon: LucideIcon, pages: Page[]): NavGroup => ({ id, label, icon, items: pages.map(navEntry) });
const legacyNavigation: NavSection[] = [
  { label: 'GLAVNO', entries: [navEntry('pregled'), navGroup('results', 'Rezultati', BarChart3, ['poredak', 'djelatnici', 'usporedba', 'povijest'])] },
  { label: 'UPRAVLJANJE', entries: [navEntry('admin')] }
];
const sortOptions = [['cents', 'Prodaja'], ['quantity', 'Količina'], ['avg', 'Prosjek']] as const;
const shareText = (share: number | null) => share == null ? '—' : `${hrNumber(share * 100)} %`;
const compactEuro = (value: number) => `${hrNumber(Math.round(value))} €`;
// Names of the shared elements that morph between an employee list entry and the profile header.
const morphNames = (id: number) => ({ card: `emp-card-${id}`, avatar: `emp-avatar-${id}`, name: `emp-name-${id}` });

function BrandMark({ small = false, morph = false }: { small?: boolean; morph?: boolean }) {
  return <div className={`brand-mark ${small ? 'small' : ''}`} style={vtName(morph && 'brand')} aria-hidden><span>SB</span></div>;
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      if (!demoMode) await api('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
      onLogin();
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  }
  return <main className="login-shell">
    <section className="login-card">
      <BrandMark morph/>
      <p className="eyebrow">CCOW · PRODAJNA ANALITIKA</p>
      <h1>SalesBoard</h1>
      <p className="login-copy">Jedan miran pogled na učinak trgovine.</p>
      <form onSubmit={submit}>
        <label htmlFor="password">Pristupna lozinka</label>
        <input id="password" className={`field ${error ? 'invalid' : ''}`} autoFocus type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Unesite lozinku" aria-invalid={Boolean(error)} aria-describedby={error ? 'login-error' : undefined}/>
        <button className="primary-button full" type="submit" disabled={busy}>Prijava <ChevronRight size={16} aria-hidden/></button>
        {error && <p className="form-error" id="login-error" role="alert">{error}</p>}
      </form>
      <p className="muted tiny">Pristup je zaštićen i namijenjen internoj upotrebi.</p>
    </section>
  </main>;
}

function Shell({ page, onNavigate, dark, onToggleTheme, onLogout, navigation, canUseTv = false, subtitle = 'Big Bang Zagreb CCO West', user, children }: ShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(navigation.flatMap(section => section.entries).filter((entry): entry is NavGroup => 'items' in entry && entry.items.some(item => item.id === page)).map(group => group.id)));
  const compact = useMediaQuery('(max-width: 1023px)');
  const sidebar = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const current = nav.find(item => item.id === page)?.label ?? 'SalesBoard';

  useEffect(() => { if (!compact) setMobileOpen(false); }, [compact]);
  useEffect(() => {
    const activeGroups = navigation.flatMap(section => section.entries).filter((entry): entry is NavGroup => 'items' in entry && entry.items.some(item => item.id === page));
    if (activeGroups.length) setOpenGroups(current => new Set([...current, ...activeGroups.map(group => group.id)]));
  }, [page]);

  useEffect(() => {
    if (!mobileOpen) return;
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = 'hidden';
    const focusables = () => [...(sidebar.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])];
    (sidebar.current?.querySelector<HTMLElement>('.nav-item.active') ?? focusables()[0])?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
      if (event.key !== 'Tab') return;
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      html.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
      menuButton.current?.focus({ preventScroll: true });
    };
  }, [mobileOpen]);

  function go(id: Page) {
    setMobileOpen(false);
    onNavigate(id, !compact);
  }

  const item = (id: Page, label: string, Icon: LucideIcon, nested = false) => <button key={id} className={`${page === id ? 'nav-item active' : 'nav-item'}${nested ? ' nav-subitem' : ''}`} aria-current={page === id ? 'page' : undefined} onClick={() => go(id)}>
    {page === id && <span className="nav-indicator" aria-hidden/>}
    <Icon size={17} aria-hidden/><span>{label}</span>
  </button>;

  const group = (entry: NavGroup) => {
    const expanded = openGroups.has(entry.id);
    const active = entry.items.some(child => child.id === page);
    const GroupIcon = entry.icon;
    return <div className={`nav-group ${active ? 'active' : ''}`} key={entry.id}>
      <button className={`nav-item nav-group-toggle ${active ? 'active' : ''}`} onClick={() => setOpenGroups(current => { const next = new Set(current); if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id); return next; })} aria-expanded={expanded}>
        <GroupIcon size={17} aria-hidden/><span>{entry.label}</span><ChevronDown className="nav-chevron" size={15} aria-hidden/>
      </button>
      {expanded && <div className="nav-submenu">{entry.items.map(child => item(child.id, child.label, child.icon, true))}</div>}
    </div>;
  };

  return <div className="app-shell">
    <div className={`sidebar-backdrop ${mobileOpen ? 'open' : ''}`} onClick={() => setMobileOpen(false)} aria-hidden/>
    <aside id="app-sidebar" ref={sidebar} className={`sidebar ${mobileOpen ? 'open' : ''}`} inert={compact && !mobileOpen ? true : undefined} role={compact ? 'dialog' : undefined} aria-modal={compact && mobileOpen ? true : undefined} aria-label={compact ? 'Glavna navigacija' : undefined}>
      <div className="sidebar-head">
        <BrandMark small morph={!compact}/>
        <div><strong>SalesBoard</strong><small>{subtitle}</small></div>
        <button className="icon-button mobile-close" onClick={() => setMobileOpen(false)} aria-label="Zatvori izbornik"><X size={18} aria-hidden/></button>
      </div>
      <nav aria-label="Glavna navigacija">
        {navigation.map(section => <section className="nav-section" key={section.label}><span className="nav-section-label">{section.label}</span>{section.entries.map(entry => 'items' in entry ? group(entry) : item(entry.id, entry.label, entry.icon))}</section>)}
      </nav>
      <div className="sidebar-bottom">
        {user && <div className="sidebar-user"><span className="avatar">{initials(user.displayName)}</span><div><strong>{user.displayName}</strong><small>{user.role === 'employee' ? 'Zaposlenik' : user.role === 'manager' ? 'Voditelj' : 'Superadmin'}</small></div></div>}
        {user && item('racun', 'Moj račun', KeyRound)}
        <button className="nav-item" onClick={onToggleTheme}>{dark ? <Sun size={17} aria-hidden/> : <Moon size={17} aria-hidden/>}<span>{dark ? 'Svijetli način' : 'Tamni način'}</span></button>
        <button className="nav-item logout" onClick={onLogout}><LogOut size={17} aria-hidden/><span>Odjava</span></button>
      </div>
    </aside>
    <div className="main-area">
      <header className="topbar">
        <button ref={menuButton} className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Otvori izbornik" aria-expanded={mobileOpen} aria-controls="app-sidebar"><Menu size={20} aria-hidden/></button>
        <div className="crumb">
          {compact && <BrandMark small morph/>}
          <span className="crumb-root">SalesBoard</span><ChevronRight size={14} aria-hidden className="crumb-root"/>
          <strong key={current}>{current}</strong>
        </div>
        <div className="top-actions">
          <span className="live-dot" aria-hidden/> <span className="tiny muted status-text">Podaci su zaštićeni</span>
          {canUseTv && <button className="icon-button" onClick={() => go('tv')} aria-label="Otvori TV Mode" title="TV Mode"><CalendarDays size={17} aria-hidden/></button>}
          <button className="icon-button theme-toggle" onClick={onToggleTheme} aria-label={dark ? 'Svijetli način' : 'Tamni način'} title={dark ? 'Svijetli način' : 'Tamni način'}>
            <span key={dark ? 'sun' : 'moon'} className="theme-icon">{dark ? <Sun size={17} aria-hidden/> : <Moon size={17} aria-hidden/>}</span>
          </button>
        </div>
      </header>
      <main className="content" id="content">{children}</main>
    </div>
  </div>;
}

function Dashboard({ data, month, setMonth, onRefresh, loading, setPage }: ReportProps & { setPage: (page: Page) => void }) {
  const tokens = useChartTheme();
  const canSeeIndividualResults = data.viewer?.role !== 'employee' || data.leaderboardVisibility === 'full';
  const top = canSeeIndividualResults ? data.leaderboard[0] : null;
  const bars = canSeeIndividualResults ? data.leaderboard.slice(0, 6) : [];
  const negativeDaily = hasNegative(data.daily, 'value');
  return <>
    <PeriodBar month={month} setMonth={setMonth} onRefresh={onRefresh} loading={loading}/>
    <section className="metric-grid">
      <Card label="Ukupna prodaja poslovnice" value={hrMoney(data.total)} detail="ukupna neto vrijednost poslovnice" icon={BarChart3} tone={data.total < 0 ? 'negative' : 'accent'} size="hero"/>
      <Card label="Prodano usluga" value={hrNumber(data.quantity)} detail="ukupno u poslovnici" icon={Activity}/>
      <Card label="Prosječna vrijednost" value={data.quantity ? hrMoney(data.total / data.quantity) : '—'} detail="po usluzi poslovnice" icon={CalendarDays}/>
      {canSeeIndividualResults
        ? <Card label="Najbolji prodavač" value={top?.name ?? '—'} detail={top ? `${hrMoney(top.value)} neto prodaja` : 'Nema podataka'} icon={Trophy} size="wide" textValue/>
        : <Card label="Prikaz poslovnice" value={data.branch?.name ?? 'Poslovnica'} detail="bez pojedinačnih rezultata djelatnika" icon={Shield} size="wide" textValue/>}
      <Card label="Dani s podacima" value={hrNumber(data.daily.length)} detail="u odabranom mjesecu" icon={CalendarDays}/>
      <Card label="Zadnje ažuriranje" value={data.latestImport ? new Intl.DateTimeFormat('hr-HR', { day: '2-digit', month: 'short' }).format(new Date(data.latestImport.imported_at)) : '—'} detail={data.latestImport ? new Intl.DateTimeFormat('hr-HR', { timeStyle: 'short', timeZone: 'Europe/Zagreb' }).format(new Date(data.latestImport.imported_at)) : 'Još nema uvoza'} icon={RefreshCw}/>
    </section>
    <section className="chart-grid">
      <article className="panel chart-panel wide">
        <div className="panel-head"><div><span className="eyebrow">TREND</span><h3>Dnevna prodaja</h3></div><span className="panel-note">Neto vrijednost</span></div>
        {data.daily.length ? <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data.daily} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
            <defs><linearGradient id="salesFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={tokens.series1} stopOpacity={tokens.fillOpacity}/><stop offset="100%" stopColor={tokens.series1} stopOpacity={0}/></linearGradient></defs>
            <CartesianGrid stroke={tokens.grid} vertical={false}/>
            <XAxis dataKey="date" tickFormatter={date => date.slice(8)} tickLine={false} axisLine={false} tick={axisTick(tokens)} tickMargin={8} minTickGap={12}/>
            <YAxis tickFormatter={compactEuro} tickLine={false} axisLine={false} width={64} tick={axisTick(tokens)}/>
            {negativeDaily && <ReferenceLine y={0} stroke={tokens.negative} strokeOpacity={0.5}/>}
            <Tooltip content={<ChartTip/>} cursor={tooltipCursor(tokens)} isAnimationActive={false}/>
            <Area type="monotone" dataKey="value" name="Prodaja" stroke={tokens.series1} strokeWidth={2} fill="url(#salesFill)" activeDot={{ r: 4.5, strokeWidth: 2, stroke: tokens.surface, fill: tokens.series1 }} {...seriesMotion()}/>
          </AreaChart>
        </ResponsiveContainer> : <Empty/>}
      </article>
      {canSeeIndividualResults && <article className="panel chart-panel">
        <div className="panel-head"><div><span className="eyebrow">RASPOVJETA</span><h3>Po djelatniku</h3></div><button className="text-button" onClick={() => setPage('poredak')}>Poredak <ChevronRight size={15} aria-hidden/></button></div>
        {bars.length ? <ResponsiveContainer width="100%" height={Math.min(280, Math.max(168, bars.length * 52))}>
          <BarChart data={bars} layout="vertical" margin={{ left: 0, right: 64, top: 0, bottom: 0 }} barCategoryGap={12}>
            <XAxis type="number" hide domain={[dataMin => Math.min(0, dataMin), 'auto']}/>
            <YAxis type="category" dataKey="name" width={118} tickLine={false} axisLine={false} tick={{ ...axisTick(tokens), fill: tokens.label, fontSize: 12 }}/>
            <Tooltip content={<ChartTip/>} cursor={{ fill: tokens.track }} isAnimationActive={false}/>
            <Bar dataKey="value" name="Prodaja" radius={[0, 4, 4, 0]} maxBarSize={22} background={{ fill: tokens.track, radius: 4 }} {...seriesMotion()}>
              {bars.map((employee, index) => <Cell key={employee.id} fill={employee.value < 0 ? tokens.negative : index === 0 ? tokens.series1 : tokens.series1Muted}/>)}
              <LabelList dataKey="value" position="right" formatter={value => compactEuro(Number(value))} style={{ fill: tokens.label, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}/>
            </Bar>
          </BarChart>
        </ResponsiveContainer> : <Empty/>}
      </article>}
    </section>
    <section className="panel insight">
      <div className="insight-icon"><Activity size={18} aria-hidden/></div>
      {/* monthName already ends with "." in hr-HR, so the sentence must not add a second one. */}
      <div><span className="eyebrow">BRZI UVID</span>{canSeeIndividualResults
        ? <><h3>{top ? `${top.name} vodi poredak u ${monthName(month).replace(/\.$/, '')}.` : 'Spremno za prvi izvještaj.'}</h3><p>{top ? `${top.name} ostvaruje ${hrMoney(top.value)} neto prodaje i ${hrNumber(top.quantity)} usluga. Usporedbe se računaju samo iz uvezenih podataka.` : 'Nakon administratorskog uvoza statistika će se pojaviti ovdje.'}</p></>
        : <><h3>Poslovnica je u {monthName(month).replace(/\.$/, '')} ostvarila {hrMoney(data.total)}.</h3><p>Prikazan je ukupni rezultat poslovnice bez pojedinačnih iznosa drugih djelatnika.</p></>}
      </div>
    </section>
  </>;
}

function TargetSummary({ data }: { data: Analytics }) {
  const target = data.target;
  if (!target) return null;
  return <section className="metric-grid target-metrics">
    <Card label="Mjesečni target jamstava" value={target.configured ? hrMoney(target.targetCents / 100) : 'Nije zadan'} detail={target.configured ? `${target.workingDaysTotal} radnih dana` : 'Voditelj unosi plan'} icon={Target} tone="accent" size="wide"/>
    <Card label="Ostvareno jamstava" value={hrMoney(target.achievedCents / 100)} detail={target.configured ? `${Math.round(target.progress * 100)} % mjesečnog targeta` : 'evidentirana jamstva'} icon={TrendingUp} tone="accent"/>
    <Card label="Dnevni target" value={target.configured ? hrMoney(target.dailyTargetCents / 100) : '—'} detail="mjesečni target ÷ radni dani" icon={Gauge}/>
    <Card label="Preostalo do targeta" value={target.configured ? hrMoney(target.remainingCents / 100) : '—'} detail={target.configured ? `${target.remainingWorkingDays} procijenjenih radnih dana` : 'target nije konfiguriran'} icon={CalendarDays}/>
    <Card label="Potrebno po danu" value={target.configured ? hrMoney(target.requiredDailyCents / 100) : '—'} detail="za ostvarenje do kraja mjeseca" icon={Activity}/>
    <Card label="Napredak" value={target.configured ? `${Math.round(target.progress * 100)} %` : '—'} detail={target.progress >= 1 ? 'Target je ostvaren' : 'prema mjesečnom planu'} icon={Trophy} tone={target.progress >= 1 ? 'accent' : 'neutral'}/>
  </section>;
}

function Leaderboard({ data, month, setMonth, onRefresh, loading, morphId, onOpen }: ReportProps & { morphId: number | null; onOpen: (employee: Employee) => void }) {
  const [sort, setSort] = useState<SortKey>('cents');
  const list = [...data.leaderboard].sort((a, b) => sort === 'quantity' ? b.quantity - a.quantity || b.cents - a.cents : sort === 'avg' ? (b.avg ?? -Infinity) - (a.avg ?? -Infinity) || b.cents - a.cents : b.cents - a.cents || b.quantity - a.quantity || a.name.localeCompare(b.name, 'hr'));
  const rankOnlyView = data.viewer?.role === 'employee' && data.leaderboardVisibility === 'rank';
  return <>
    <PeriodBar month={month} setMonth={setMonth} onRefresh={onRefresh} loading={loading}/>
    <div className="section-title">
      <div><span className="eyebrow">REZULTATI TRGOVINE</span><h1>Poredak djelatnika</h1><p>Deterministički poredak: prodaja, zatim količina, pa abecedni red.</p></div>
      <Segmented label="Sortiranje poretka" options={sortOptions} value={sort} onChange={setSort}/>
    </div>
    <div className="panel table-panel">
      <div className="table-wrap">
        <table className="leaderboard-table">
          <thead><tr><th className="col-rank">#</th><th>Djelatnik</th><th className="num col-share">Udio</th><th className="num col-optional">Usluge</th><th className="num col-optional">Prosjek</th><th className="num right">Neto prodaja</th></tr></thead>
          <tbody>{list.map((employee, index) => {
            const names = morphId === employee.id ? morphNames(employee.id) : null;
            const displayedRank = rankOnlyView ? employee.rank : index + 1;
            return <tr key={employee.id} onClick={() => onOpen(employee)} className={sort === 'cents' ? '' : 'resorted'}>
              <td className="col-rank"><span className={`rank ${displayedRank <= 3 ? 'medal' : ''}`}>{displayedRank}</span></td>
              <td><div className="person">
                <span className="avatar" style={vtName(names?.avatar, 'emp-avatar')}>{initials(employee.name)}</span>
                <div className="person-text">
                  <button className="row-link" type="button"><strong style={vtName(names?.name, 'emp-name')}>{employee.name}</strong></button>
                  <span className="person-meta">{hrNumber(employee.quantity)} usluga · {shareText(employee.share)}</span>
                </div>
              </div></td>
              <td className="num col-share"><div className="share-cell"><div className="mini-bar"><i className={(employee.share ?? 0) < 0 ? 'negative' : ''} style={{ width: `${Math.min(Math.abs(employee.share ?? 0) * 100, 100)}%` }}/></div><span>{shareText(employee.share)}</span></div></td>
              <td className="num col-optional">{hrNumber(employee.quantity)}</td>
              <td className="num col-optional">{hrMoney(employee.avg)}</td>
              <td className="num right"><strong className={employee.value < 0 ? 'negative-text' : ''}>{hrMoney(employee.value)}</strong></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {!list.length && <Empty/>}
    </div>
  </>;
}

function EmployeePage({ data, month, setMonth, onRefresh, loading, selected, morphId, onOpen, onBack }: ReportProps & {
  selected: Employee | null;
  morphId: number | null;
  onOpen: (employee: Employee) => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = data.employees.filter((e: Employee) => e.name.toLocaleLowerCase('hr').includes(query.toLocaleLowerCase('hr')));
  return <>
    <PeriodBar month={month} setMonth={setMonth} onRefresh={onRefresh} loading={loading}/>
    {selected ? <EmployeeDetail employee={selected} onBack={onBack}/> : <>
      <div className="section-title">
        <div><span className="eyebrow">TIM</span><h1>Djelatnici</h1><p>Odaberite profil za detaljniju analizu učinka.</p></div>
        <label className="search-box"><Search size={16} aria-hidden/><input type="search" aria-label="Pretraži djelatnika" placeholder="Pretraži djelatnika" value={query} onChange={e => setQuery(e.target.value)}/></label>
      </div>
      <div className="employee-grid">{filtered.map((employee: Employee) => {
        const names = morphId === employee.id ? morphNames(employee.id) : null;
        return <button className="employee-card" key={employee.id} onClick={() => onOpen(employee)} style={vtName(names?.card, 'emp-card')}>
          <div className="person">
            <span className="avatar large" style={vtName(names?.avatar, 'emp-avatar')}>{initials(employee.name)}</span>
            <div><strong style={vtName(names?.name, 'emp-name')}>{employee.name}</strong><small>{employee.rank}. mjesto · {hrNumber(employee.quantity)} usluga</small></div>
          </div>
          <div className="employee-value"><strong className={employee.value < 0 ? 'negative-text' : ''}>{hrMoney(employee.value)}</strong><ChevronRight size={16} aria-hidden/></div>
        </button>;
      })}</div>
      {!filtered.length && <Empty/>}
    </>}
  </>;
}

function EmployeeDetail({ employee, onBack }: { employee: Employee; onBack: () => void }) {
  const tokens = useChartTheme();
  const daily = employee.days;
  const best = [...daily].sort((a, b) => b.cents - a.cents)[0];
  const names = morphNames(employee.id);
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => { back.current?.focus({ preventScroll: true }); }, [employee.id]);
  return <>
    <button ref={back} className="back-button" onClick={onBack}>← Svi djelatnici</button>
    <div className="profile-head" style={vtName(names.card, 'emp-card')}>
      <div className="avatar huge" style={vtName(names.avatar, 'emp-avatar')}>{initials(employee.name)}</div>
      <div className="profile-name"><span className="eyebrow">PROFIL DJELATNIKA</span><h1><span style={vtName(names.name, 'emp-name')}>{employee.name}</span></h1><p>{employee.rank}. mjesto u odabranom razdoblju</p></div>
      <div className="profile-total"><span>Neto prodaja</span><strong className={employee.value < 0 ? 'negative-text' : ''}>{hrMoney(employee.value)}</strong></div>
    </div>
    <div className="metric-grid compact reveal">
      <Card label="Usluge" value={hrNumber(employee.quantity)} icon={Activity}/>
      <Card label="Prosječna usluga" value={hrMoney(employee.avg)} icon={BarChart3}/>
      <Card label="Udio trgovine" value={shareText(employee.share)} icon={Trophy}/>
      <Card label="Najbolji dan" value={best ? hrMoney(best.value) : '—'} detail={best ? hrDate(best.date) : 'Nema podataka'} icon={CalendarDays} tone="accent"/>
    </div>
    <article className="panel chart-panel reveal">
      <div className="panel-head"><div><span className="eyebrow">UČINAK KROZ VRIJEME</span><h3>Dnevna prodaja</h3></div></div>
      {daily.length ? <ResponsiveContainer width="100%" height={290}>
        <AreaChart data={daily} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
          <defs><linearGradient id="profileFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={tokens.series1} stopOpacity={tokens.fillOpacity}/><stop offset="100%" stopColor={tokens.series1} stopOpacity={0}/></linearGradient></defs>
          <CartesianGrid stroke={tokens.grid} vertical={false}/>
          <XAxis dataKey="date" tickFormatter={d => d.slice(8)} tickLine={false} axisLine={false} tick={axisTick(tokens)} tickMargin={8} minTickGap={12}/>
          <YAxis tickFormatter={compactEuro} tickLine={false} axisLine={false} width={64} tick={axisTick(tokens)}/>
          {hasNegative(daily, 'value') && <ReferenceLine y={0} stroke={tokens.negative} strokeOpacity={0.5}/>}
          <Tooltip content={<ChartTip/>} cursor={tooltipCursor(tokens)} isAnimationActive={false}/>
          <Area type="monotone" dataKey="value" name="Prodaja" stroke={tokens.series1} fill="url(#profileFill)" strokeWidth={2} activeDot={{ r: 4.5, strokeWidth: 2, stroke: tokens.surface, fill: tokens.series1 }} {...seriesMotion()}/>
        </AreaChart>
      </ResponsiveContainer> : <Empty text="Za djelatnika nema zapisa u odabranom razdoblju."/>}
    </article>
  </>;
}

function History({ data, month, setMonth, onRefresh, loading }: ReportProps) {
  const months = data.daily.length ? [...new Set(data.daily.map(row => row.date.slice(0, 7)))] : [];
  const days = data.daily.slice().sort((a, b) => b.cents - a.cents).slice(0, 8);
  const max = Math.max(...days.map(day => Math.abs(day.value)), 1);
  return <>
    <PeriodBar month={month} setMonth={setMonth} onRefresh={onRefresh} loading={loading}/>
    <div className="section-title"><div><span className="eyebrow">KONTINUITET</span><h1>Povijest i analitika</h1><p>Podaci se čuvaju po izvještajnom danu; prazni dani nisu umjetno popunjeni.</p></div></div>
    <section className="history-grid">
      <article className="panel">
        <div className="panel-head"><div><span className="eyebrow">DNEVNI REZULTATI</span><h3>Najuspješniji dani</h3></div></div>
        {days.map((day, index) => <div className="history-row" key={day.date}>
          <span className="history-rank">{index + 1}</span>
          <span className="history-date">{hrDate(day.date)}<i className="history-bar" style={{ width: `${(Math.abs(day.value) / max) * 100}%` }}/></span>
          <strong className={day.value < 0 ? 'negative-text' : ''}>{hrMoney(day.value)}</strong>
          <small>{hrNumber(day.quantity)} usluga</small>
        </div>)}
        {!data.daily.length && <Empty/>}
      </article>
      <article className="panel">
        <div className="panel-head"><div><span className="eyebrow">DOSTUPNI MJESECI</span><h3>Uvezeni periodi</h3></div></div>
        {months.map(m => <div className={`month-row ${m === month ? 'current' : ''}`} key={m}><CalendarDays size={16} aria-hidden/><span>{monthName(m)}</span><strong>{m === month ? 'Odabrano' : ''}</strong></div>)}
        {!months.length && <Empty text="Povijesni periodi pojavit će se nakon prvog uvoza."/>}
      </article>
    </section>
  </>;
}

function TvMode({ data, onExit }: { data: Analytics; onExit: () => void }) {
  const tokens = chartTokens.dark;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onExit(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);
  return <div className="tv-mode" data-theme="dark">
    <div className="tv-top">
      <div><div className="brand-line"><BrandMark small/><strong>SalesBoard</strong></div><span><i className="live-dot" aria-hidden/>CCOW · uživo</span></div>
      <button className="icon-button outlined" onClick={onExit} aria-label="Izađi iz TV načina"><X size={20} aria-hidden/></button>
    </div>
    <div className="tv-content">
      <span className="eyebrow">DANAS · ZADNJE AŽURIRANJE {data.latestImport ? new Intl.DateTimeFormat('hr-HR', { timeStyle: 'short', timeZone: 'Europe/Zagreb' }).format(new Date(data.latestImport.imported_at)) : '—'}</span>
      <h1>{hrMoney(data.total)}</h1>
      <p>ukupna neto prodaja · {hrNumber(data.quantity)} usluga</p>
      <div className="tv-grid">
        <div><span className="eyebrow">POREDAK</span>{data.leaderboard.slice(0, 5).map((e: Employee, i: number) => <div className={`tv-rank ${i === 0 ? 'leader' : ''}`} key={e.id}><strong>{String(i + 1).padStart(2, '0')}</strong><span>{e.name}</span><b>{hrMoney(e.value)}</b></div>)}</div>
        <div className="tv-chart">
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={data.daily} margin={{ top: 8, right: 20, left: 20, bottom: 0 }}>
              <defs><linearGradient id="tvFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={tokens.series1} stopOpacity={0.32}/><stop offset="1" stopColor={tokens.series1} stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid stroke={tokens.grid} vertical={false}/>
              <XAxis dataKey="date" tickFormatter={d => d.slice(8)} axisLine={false} tickLine={false} tick={{ fill: tokens.axis, fontSize: 14 }} tickMargin={10} interval="preserveStartEnd"/>
              <YAxis hide/>
              <Area type="monotone" dataKey="value" stroke={tokens.series1} fill="url(#tvFill)" strokeWidth={3} {...seriesMotion()}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  </div>;
}

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

  if (!admin) return <>
    <div className="section-title"><div><span className="eyebrow">ZAŠTIĆENA ZONA</span><h1>Administracija</h1><p>Unesite zasebnu administratorsku lozinku za uvoz i povijest.</p></div></div>
    <form className="admin-login panel" onSubmit={event => { event.preventDefault(); void login(); }}>
      <span className="admin-icon"><Shield size={20} aria-hidden/></span>
      <h3>Administrator</h3>
      <input className={`field ${error ? 'invalid' : ''}`} type="password" aria-label="Administratorska lozinka" placeholder="Administratorska lozinka" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} aria-invalid={Boolean(error)}/>
      <button className="primary-button" type="submit">Otključaj administraciju <ChevronRight size={16} aria-hidden/></button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  </>;
  return <>
    <div className="section-title"><div><span className="eyebrow">UPRAVLJANJE PODACIMA</span><h1>Administracija</h1><p>Uvoz valjanog izvještaja odmah osvježava statistiku za sve korisnike.</p></div></div>
    <section className="admin-grid">
      <article className="panel upload-panel">
        <div className={`dropzone ${file ? 'has-file' : ''}`}>
          <span className="dropzone-icon"><FileSpreadsheet size={24} aria-hidden/></span>
          <h3>Uvezi Excel izvještaj</h3>
          <p>Dodajte .xlsx datoteku do 10 MB. Preklapajući periodi obrađuju se idempotentno.</p>
          <label className="secondary-button file-button"><Upload size={16} aria-hidden/> <span className="file-name">{file ? file.name : 'Odaberi datoteku'}</span><input className="visually-hidden" type="file" accept=".xlsx" onChange={e => setFile(e.target.files?.[0] ?? null)}/></label>
          {file && <button className={`primary-button ${busy ? 'is-loading' : ''}`} disabled={busy} aria-busy={busy} onClick={upload}>{busy ? 'Uvoz u tijeku…' : 'Pokreni uvoz'} <ChevronRight size={16} aria-hidden/></button>}
          {message && <p className="success-message" role="status"><Check size={16} aria-hidden/> {message}</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
      </article>
      <article className="panel">
        <div className="panel-head"><div><span className="eyebrow">ZADNJIH 50</span><h3>Povijest uvoza</h3></div><button className="icon-button outlined" onClick={loadImports} aria-label="Osvježi povijest uvoza"><RefreshCw size={15} aria-hidden/></button></div>
        {imports.map(item => <div className="import-row" key={item.id}><div><strong>{item.file_name}</strong><small>{item.date_from ?? '—'} – {item.date_to ?? '—'} · {item.updated_records} zapisa</small></div><span className={`status ${item.status}`}>{item.status === 'success' ? 'Uspješno' : item.status}</span></div>)}
        {!imports.length && <Empty text="Povijest će se prikazati nakon prvog uvoza."/>}
      </article>
    </section>
  </>;
}

function LegacyApp() {
  const [authenticated, setAuthenticated] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [page, setPage] = useState<Page>('pregled');
  const [month, setMonth] = useState(getReportingMonth);
  // Dark is the primary theme; an explicit 'light' preference in localStorage is still respected.
  const [dark, setDark] = useState(() => localStorage.getItem('sb-theme') !== 'light');
  const [data, setData] = useState<Analytics | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [morphId, setMorphId] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(false);
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

  function navigate(next: Page, animate: boolean) {
    if (next === page) return;
    const update = () => { setPage(next); window.scrollTo(0, 0); };
    if (animate) withViewTransition(update, 'page');
    else update();
  }

  function openProfile(employee: Employee) {
    // Tag the clicked entry first so the old snapshot already carries its view-transition-names.
    flushSync(() => setMorphId(employee.id));
    withViewTransition(() => { selectEmployee(employee); setPage('djelatnici'); window.scrollTo(0, 0); }, 'profile-open');
  }

  function closeProfile() {
    withViewTransition(() => selectEmployee(null), 'profile-close');
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
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#070A11' : '#F5F7FB');
  }, [dark]);

  useEffect(() => {
    if (!authenticated) return;
    const request = new AbortController();
    const { from, to } = getMonthRange(month);

    async function load() {
      setLoading(true);
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
      } finally {
        if (!request.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => request.abort();
  }, [authenticated, month, refreshCount]);

  const tokens = dark ? chartTokens.dark : chartTokens.light;
  const toggleTheme = () => withViewTransition(() => setDark(value => !value), 'theme');

  if (!authenticated) return <Login onLogin={() => withViewTransition(() => setAuthenticated(true), 'login')}/>;
  if (!data && offline) {
    return <main className="offline">
      <span className="state-icon"><CloudOff size={26} aria-hidden/></span><h2>Veza je privremeno nedostupna</h2>
      <p>Podaci se nisu mogli učitati. Provjerite mrežu i pokušajte ponovno.</p>
      <button className="primary-button" onClick={refresh}>Pokušaj ponovno <RefreshCw size={16} aria-hidden/></button>
    </main>;
  }
  if (data && page === 'tv') return <TvMode data={data} onExit={() => navigate('pregled', true)}/>;

  const selected = data?.employees.find(employee => employee.id === selectedId) ?? null;
  const report = data && { data, month, setMonth: selectMonth, onRefresh: refresh, loading };
  return <ChartThemeContext.Provider value={tokens}>
    <Shell page={page} onNavigate={navigate} dark={dark} onToggleTheme={toggleTheme} onLogout={logout} navigation={legacyNavigation} canUseTv>
      {!report ? <Skeleton/> : <div className="page">
        {page === 'pregled' && <Dashboard {...report} setPage={next => navigate(next, true)}/>}
        {page === 'poredak' && <Leaderboard {...report} morphId={morphId} onOpen={openProfile}/>}
        {page === 'djelatnici' && <EmployeePage {...report} selected={selected} morphId={morphId} onOpen={openProfile} onBack={closeProfile}/>}
        {page === 'usporedba' && <ComparisonView {...report}/>}
        {page === 'povijest' && <History {...report}/>}
        {page === 'admin' && <Admin admin={admin} setAdmin={setAdmin} onRefresh={refresh}/>}
      </div>}
    </Shell>
  </ChartThemeContext.Provider>;
}

export default function App() {
  const [sessionMode, setSessionMode] = useState<'user' | 'legacy' | null>(null);
  const [user, setUser] = useState<PortalUser | null>(null);
  const [admin, setAdmin] = useState(false);
  const [page, setPage] = useState<Page>('pregled');
  const [month, setMonth] = useState(getReportingMonth);
  const [dark, setDark] = useState(() => localStorage.getItem('sb-theme') !== 'light');
  const [data, setData] = useState<Analytics | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [morphId, setMorphId] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const [bootstrapping, setBootstrapping] = useState(true);
  const authenticated = sessionMode !== null;

  function selectMonth(value: string) {
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value) && !value.startsWith('0000-')) setMonth(value);
  }

  function refresh() {
    setRefreshCount(count => count + 1);
  }

  function navigate(next: Page, animate: boolean) {
    if (next === page) return;
    const update = () => { setPage(next); window.scrollTo(0, 0); };
    if (animate) withViewTransition(update, 'page');
    else update();
  }

  function openProfile(employee: Employee) {
    flushSync(() => setMorphId(employee.id));
    withViewTransition(() => { setSelectedId(employee.id); setPage('djelatnici'); window.scrollTo(0, 0); }, 'profile-open');
  }

  function closeProfile() {
    withViewTransition(() => setSelectedId(null), 'profile-close');
  }

  function logout() {
    const endpoint = sessionMode === 'user' ? '/api/user/logout' : '/api/logout';
    setSessionMode(null);
    setUser(null);
    setAdmin(false);
    setData(null);
    setOffline(false);
    setPage('pregled');
    if (!demoMode) void api(endpoint, { method: 'POST' }).catch(() => {});
  }

  useEffect(() => {
    localStorage.setItem('sb-theme', dark ? 'dark' : 'light');
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#070A11' : '#F5F7FB');
  }, [dark]);

  useEffect(() => {
    if (demoMode) { setBootstrapping(false); return; }
    let active = true;
    async function restore() {
      try {
        const result = await api<{ user: PortalUser }>('/api/me');
        if (active) { setUser(result.user); setSessionMode('user'); }
      } catch {
        try {
          const { from, to } = getMonthRange(month);
          const result = await api<Analytics>(`/api/bootstrap?from=${from}&to=${to}`);
          if (active) { setData(result); setSessionMode('legacy'); }
        } catch {
          // No active session is the expected first-visit state.
        }
      } finally {
        if (active) setBootstrapping(false);
      }
    }
    void restore();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    const request = new AbortController();
    const { from, to } = getMonthRange(month);
    async function load() {
      setLoading(true);
      try {
        const result = demoMode
          ? (await import('./demo')).createDemoAnalytics(from, to)
          : await api<Analytics>(`${sessionMode === 'user' ? '/api/portal/analytics' : '/api/analytics'}?from=${from}&to=${to}`, { signal: request.signal });
        if (!request.signal.aborted) {
          setData(result);
          if (sessionMode === 'user' && result.viewer) setUser(result.viewer);
          setOffline(false);
        }
      } catch {
        if (!request.signal.aborted) setOffline(true);
      } finally {
        if (!request.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => request.abort();
  }, [authenticated, sessionMode, month, refreshCount]);

  const tokens = dark ? chartTokens.dark : chartTokens.light;
  const toggleTheme = () => withViewTransition(() => setDark(value => !value), 'theme');

  if (bootstrapping) return <main className="loading"><span className="spinner"/><span>Provjera prijave…</span></main>;
  if (!authenticated) return <AccessScreen onUserLogin={loggedIn => withViewTransition(() => { setUser(loggedIn); setSessionMode('user'); setPage('pregled'); }, 'login')} onLegacyLogin={() => withViewTransition(() => { setUser(null); setSessionMode('legacy'); setPage('pregled'); }, 'login')}/>;
  if (!data && offline) return <main className="offline"><span className="state-icon"><CloudOff size={26} aria-hidden/></span><h2>Veza je privremeno nedostupna</h2><p>Podaci se nisu mogli učitati. Provjerite mrežu i pokušajte ponovno.</p><button className="primary-button" onClick={refresh}>Pokušaj ponovno <RefreshCw size={16} aria-hidden/></button></main>;
  if (data && page === 'tv') return <TvMode data={data} onExit={() => navigate('pregled', true)}/>;

  const isEmployee = user?.role === 'employee';
  const fullLeaderboard = !isEmployee || user?.leaderboardVisibility === 'full';
  const maySeePosition = !isEmployee || user?.leaderboardVisibility !== 'own';
  const resultPages: Page[] = [
    ...(maySeePosition ? ['poredak' as Page] : []),
    ...(fullLeaderboard ? ['djelatnici' as Page, 'usporedba' as Page, 'povijest' as Page] : [])
  ];
  const navigation: NavSection[] = sessionMode === 'legacy' ? legacyNavigation : [
    { label: 'GLAVNO', entries: [
      navEntry('pregled'),
      ...(resultPages.length ? [navGroup('results', 'Rezultati', BarChart3, resultPages)] : []),
      navEntry('jamstva'),
      ...(isEmployee ? [navEntry('smjene')] : [])
    ] },
    ...(!isEmployee ? [{ label: 'VODITELJ', entries: [navGroup('branch-management', 'Poslovnica', Settings2, ['targeti', 'uvoz', 'vidljivost', 'smjene'])] }] : []),
    ...(user?.role === 'superadmin' ? [{ label: 'ADMINISTRACIJA', entries: [navGroup('administration', 'Administracija', Shield, ['registracije', 'poslovnice', 'admin-uvoz'])] }] : [])
  ];
  const selected = data?.employees.find(employee => employee.id === selectedId) ?? null;
  const report = data && { data, month, setMonth: selectMonth, onRefresh: refresh, loading };
  const subtitle = user?.branch.name ?? 'Big Bang Zagreb CCO West';

  return <ChartThemeContext.Provider value={tokens}>
    <Shell page={page} onNavigate={navigate} dark={dark} onToggleTheme={toggleTheme} onLogout={logout} navigation={navigation} canUseTv={sessionMode === 'legacy' || !isEmployee} subtitle={subtitle} user={user}>
      {!report ? <Skeleton/> : <div className="page">
        {page === 'pregled' && <><TargetSummary data={data}/><Dashboard {...report} setPage={next => navigate(next, true)}/></>}
        {page === 'poredak' && <Leaderboard {...report} morphId={morphId} onOpen={openProfile}/>}
        {page === 'djelatnici' && <EmployeePage {...report} selected={selected} morphId={morphId} onOpen={openProfile} onBack={closeProfile}/>}
        {page === 'usporedba' && <ComparisonView {...report}/>}
        {page === 'povijest' && <History {...report}/>}
        {page === 'jamstva' && user && <WarrantyCenter/>}
        {page === 'smjene' && user && <ShiftCenter user={user}/>}
        {page === 'targeti' && user && <ManagerCenter user={user} month={month} onUpdated={refresh} section="target"/>}
        {page === 'uvoz' && user && <ManagerCenter user={user} month={month} onUpdated={refresh} section="import"/>}
        {page === 'vidljivost' && user && <ManagerCenter user={user} month={month} onUpdated={refresh} section="visibility"/>}
        {page === 'racun' && user && <AccountCenter user={user}/>}
        {page === 'admin' && sessionMode === 'legacy' && <><Admin admin={admin} setAdmin={setAdmin} onRefresh={refresh}/>{admin && <AdminPortalTools month={month} onUpdated={refresh}/>}</>}
        {page === 'registracije' && user?.role === 'superadmin' && <AdminPortalTools month={month} onUpdated={refresh} section="registrations"/>}
        {page === 'poslovnice' && user?.role === 'superadmin' && <AdminPortalTools month={month} onUpdated={refresh} section="branches"/>}
        {page === 'admin-uvoz' && user?.role === 'superadmin' && <AdminPortalTools month={month} onUpdated={refresh} section="import"/>}
      </div>}
    </Shell>
  </ChartThemeContext.Provider>;
}
