import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { BadgeCheck, Calculator, CalendarClock, Check, ChevronRight, CircleX, Clock3, Plus, RefreshCw, Save, ShieldCheck, Trash2, UserRoundCheck, UsersRound } from 'lucide-react';
import { api } from './api';
import type { Branch, PortalUser, TargetProgress } from './api';
import { calculateWarranty, euroToCents } from './lib/warranty';

const money = (cents: number | null | undefined) => cents == null ? '—' : new Intl.NumberFormat('hr-HR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const dateLabel = (date: string) => new Intl.DateTimeFormat('hr-HR', { dateStyle: 'medium' }).format(new Date(`${date}T12:00:00`));
const today = () => new Date().toISOString().slice(0, 10);
const nextMonday = () => {
  const date = new Date();
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? 1 : 8 - day));
  return date.toISOString().slice(0, 10);
};

export function AccessScreen({ onUserLogin, onLegacyLogin }: {
  onUserLogin: (user: PortalUser) => void;
  onLegacyLogin: () => void;
}) {
  const [role, setRole] = useState<'employee' | 'manager'>('employee');
  const [mode, setMode] = useState<'login' | 'register' | 'legacy'>('login');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [branchId, setBranchId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<{ branches: Branch[] }>('/api/branches').then(result => {
      setBranches(result.branches);
      setBranchId(current => current || String(result.branches.find(branch => branch.code === 'CCOW')?.id ?? result.branches[0]?.id ?? ''));
    }).catch(error => setError((error as Error).message));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'legacy') {
        await api('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
        onLegacyLogin();
      } else if (mode === 'register') {
        const result = await api<{ message: string }>('/api/register', {
          method: 'POST',
          headers: { 'content-type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({ username, displayName, password, branchId: Number(branchId), role })
        });
        setMessage(result.message);
        setPassword('');
      } else {
        const result = await api<{ user: PortalUser }>('/api/user/login', { method: 'POST', body: JSON.stringify({ username, password, expectedRole: role }) });
        onUserLogin(result.user);
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <main className="login-shell portal-login"><div className="login-orb orb-one"/><div className="login-orb orb-two"/><section className="login-card portal-login-card"><div className="brand-mark"><span>SB</span></div><p className="eyebrow">BIG BANG · PRODAJNA ANALITIKA</p><h1>SalesBoard</h1><p className="login-copy">Rezultati, jamstva i smjene na jednom mjestu.</p>{mode !== 'legacy' && <div className="role-switch"><button type="button" className={role === 'employee' ? 'active' : ''} onClick={() => setRole('employee')}><UsersRound size={17}/><span>Zaposlenik</span></button><button type="button" className={role === 'manager' ? 'active' : ''} onClick={() => setRole('manager')}><ShieldCheck size={17}/><span>Voditelj</span></button></div>}<div className="auth-tabs"><button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Prijava</button><button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Registracija</button></div><form key={mode} onSubmit={submit} autoComplete={mode === 'register' ? 'off' : 'on'}>{mode !== 'legacy' && <><label htmlFor="username">Korisničko ime</label><input id="username" name={mode === 'register' ? 'registration-handle' : 'username'} autoFocus value={username} onChange={event => setUsername(event.target.value)} placeholder="ime.prezime" autoComplete={mode === 'register' ? 'off' : 'username'} autoCapitalize="none" spellCheck={false} data-form-type={mode === 'register' ? 'other' : undefined}/></>}{mode === 'register' && <><label htmlFor="display-name">Ime i prezime</label><input id="display-name" name="registration-display-name" value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="Ime Prezime" autoComplete="off"/><label htmlFor="branch">Maloprodajna jedinica</label><select id="branch" value={branchId} onChange={event => setBranchId(event.target.value)}>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></>}<label htmlFor="password">{mode === 'legacy' ? 'Interna pristupna lozinka' : 'Lozinka'}</label><input id="password" name={mode === 'register' ? 'registration-password' : 'password'} type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === 'register' ? 'Najmanje 8 znakova' : 'Unesite lozinku'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'}/><button className="primary-button full" disabled={busy} type="submit">{busy ? 'Pričekajte…' : mode === 'register' ? 'Pošalji zahtjev' : 'Prijava'} <ChevronRight size={17}/></button>{message && <p className="success-message"><Check size={16}/> {message}</p>}{error && <p className="form-error">{error}</p>}</form><button className="legacy-link" type="button" onClick={() => { setMode(mode === 'legacy' ? 'login' : 'legacy'); setError(''); }}>{mode === 'legacy' ? 'Natrag na korisničku prijavu' : 'Interni pristup i administracija'}</button><p className="muted tiny">Novi račun aktivira se tek nakon administratorskog odobrenja.</p></section></main>;
}

type WarrantyRule = { id: number; code: string; product_group: 'A' | 'B' | 'MOBILE' | 'BIKE'; name: string; rate_basis_points: number };
type WarrantySale = { id: number; product_name: string; sold_at: string; original_price_cents: number; discounted_price_cents: number; warranty_cents: number; total_cents: number; installments: number; warranty_name: string; product_group: string; rate_basis_points: number };
type WarrantySummary = { user_id: number; display_name: string; quantity: number; warranty_cents: number };
type Draft = { key: string; productName: string; group: WarrantyRule['product_group']; warrantyRuleId: string; originalPrice: string; discountType: 'none' | 'percent' | 'fixed'; discountValue: string; installments: string };

const blankDraft = (): Draft => ({ key: crypto.randomUUID(), productName: '', group: 'A', warrantyRuleId: '', originalPrice: '', discountType: 'none', discountValue: '', installments: '1' });
const groupLabels = { A: 'Grupa A', B: 'Grupa B', MOBILE: 'Mobiteli', BIKE: 'Bicikli' };

export function WarrantyCenter({ user, onSaved }: { user: PortalUser; onSaved: () => void }) {
  const [rules, setRules] = useState<WarrantyRule[]>([]);
  const [sales, setSales] = useState<WarrantySale[]>([]);
  const [branchSummary, setBranchSummary] = useState<WarrantySummary[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([blankDraft()]);
  const [soldAt, setSoldAt] = useState(today());
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const [ruleResult, saleResult] = await Promise.all([
      api<{ rules: WarrantyRule[] }>('/api/warranty-rules'),
      api<{ sales: WarrantySale[] }>('/api/warranties')
    ]);
    setRules(ruleResult.rules);
    setSales(saleResult.sales);
    if (user.role === 'manager' || user.role === 'superadmin') {
      const managerResult = await api<{ summary: WarrantySummary[] }>(`/api/manage/warranties?month=${soldAt.slice(0, 7)}`);
      setBranchSummary(managerResult.summary);
    }
    setDrafts(current => current.map(draft => draft.warrantyRuleId ? draft : { ...draft, warrantyRuleId: String(ruleResult.rules.find(rule => rule.product_group === draft.group)?.id ?? '') }));
  }

  useEffect(() => { void load().catch(error => setError((error as Error).message)); }, []);

  function update(key: string, change: Partial<Draft>) {
    setDrafts(current => current.map(draft => draft.key === key ? { ...draft, ...change } : draft));
  }

  const calculations = useMemo(() => drafts.map(draft => {
    const rule = rules.find(item => item.id === Number(draft.warrantyRuleId));
    const originalPriceCents = euroToCents(draft.originalPrice);
    const discountValue = draft.discountType === 'percent' ? Math.round(Number(String(draft.discountValue).replace(',', '.')) * 100) : euroToCents(draft.discountValue);
    return calculateWarranty({ originalPriceCents, discountType: draft.discountType, discountValue, rateBasisPoints: rule?.rate_basis_points ?? 0, installments: Number(draft.installments) });
  }), [drafts, rules]);

  const totals = calculations.reduce((sum, item) => ({ price: sum.price + item.discountedPriceCents, warranty: sum.warranty + item.warrantyCents, total: sum.total + item.totalCents }), { price: 0, warranty: 0, total: 0 });

  async function save() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (drafts.some(draft => !draft.productName.trim() || !Number(draft.warrantyRuleId) || euroToCents(draft.originalPrice) <= 0)) throw new Error('Za svaki proizvod unesite naziv, cijenu i vrstu jamstva.');
      const result = await api<{ count: number; warrantyCents: number }>('/api/warranties', { method: 'POST', body: JSON.stringify({ items: drafts.map(draft => ({
        productName: draft.productName,
        warrantyRuleId: Number(draft.warrantyRuleId),
        originalPriceCents: euroToCents(draft.originalPrice),
        discountType: draft.discountType,
        discountValue: draft.discountType === 'percent' ? Math.round(Number(String(draft.discountValue).replace(',', '.')) * 100) : euroToCents(draft.discountValue),
        installments: Number(draft.installments),
        soldAt
      })) }) });
      setMessage(`Spremljeno: ${result.count} proizvoda i ${money(result.warrantyCents)} jamstava.`);
      setDrafts([blankDraft()]);
      await load();
      onSaved();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <><div className="section-title"><div><span className="eyebrow">JAMSTVA</span><h1>Kalkulator i evidencija</h1><p>Jamstvo se računa na originalnu cijenu prije popusta. Sve vrijednosti su u eurima.</p></div><div className="calculator-date"><label>Datum prodaje</label><input type="date" value={soldAt} onChange={event => setSoldAt(event.target.value)}/></div></div><div className="warranty-layout"><section className="warranty-products">{drafts.map((draft, index) => { const groupRules = rules.filter(rule => rule.product_group === draft.group); const calculation = calculations[index]; return <article className="panel warranty-item" key={draft.key}><div className="panel-head"><div><span className="eyebrow">PROIZVOD {index + 1}</span><h3>{draft.productName || 'Novi proizvod'}</h3></div>{drafts.length > 1 && <button className="icon-button danger" onClick={() => setDrafts(current => current.filter(item => item.key !== draft.key))}><Trash2 size={16}/></button>}</div><div className="form-grid"><label className="wide">Naziv proizvoda<input value={draft.productName} onChange={event => update(draft.key, { productName: event.target.value })} placeholder="npr. Samsung OLED TV"/></label><label>Grupa<select value={draft.group} onChange={event => { const group = event.target.value as Draft['group']; update(draft.key, { group, warrantyRuleId: String(rules.find(rule => rule.product_group === group)?.id ?? '') }); }}>{Object.entries(groupLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Vrsta jamstva<select value={draft.warrantyRuleId} onChange={event => update(draft.key, { warrantyRuleId: event.target.value })}>{groupRules.map(rule => <option key={rule.id} value={rule.id}>{rule.name} · {rule.rate_basis_points / 100}%</option>)}</select></label><label>Originalna cijena (€)<input inputMode="decimal" value={draft.originalPrice} onChange={event => update(draft.key, { originalPrice: event.target.value })} placeholder="0,00"/></label><label>Popust<select value={draft.discountType} onChange={event => update(draft.key, { discountType: event.target.value as Draft['discountType'], discountValue: '' })}><option value="none">Bez popusta</option><option value="percent">Postotak (%)</option><option value="fixed">Fiksno (€)</option></select></label>{draft.discountType !== 'none' && <label>Vrijednost popusta<input inputMode="decimal" value={draft.discountValue} onChange={event => update(draft.key, { discountValue: event.target.value })} placeholder="0"/></label>}<label>Rate<select value={draft.installments} onChange={event => update(draft.key, { installments: event.target.value })}>{[1, 2, 3, 6, 12, 18, 24, 36].map(value => <option value={value} key={value}>{value === 1 ? 'Odjednom' : `${value} rata`}</option>)}</select></label></div><div className="calculation-strip"><span>Proizvod nakon popusta <strong>{money(calculation.discountedPriceCents)}</strong></span><span>Jamstvo <strong>{money(calculation.warrantyCents)}</strong></span><span>Ukupno <strong>{money(calculation.totalCents)}</strong></span><span>Po rati <strong>{money(calculation.installmentCents)}</strong></span></div></article>; })}<button className="add-product" onClick={() => setDrafts(current => [...current, blankDraft()])}><Plus size={17}/> Dodaj još jedan proizvod</button></section><aside className="panel warranty-summary"><Calculator size={24}/><span className="eyebrow">SAŽETAK PONUDE</span><div><small>Proizvodi nakon popusta</small><strong>{money(totals.price)}</strong></div><div><small>Jamstva</small><strong>{money(totals.warranty)}</strong></div><div className="summary-total"><small>Ukupno</small><strong>{money(totals.total)}</strong></div><button className="primary-button full" disabled={busy} onClick={save}><Save size={16}/> {busy ? 'Spremanje…' : 'Spremi prodaju'}</button>{message && <p className="success-message"><Check size={16}/> {message}</p>}{error && <p className="form-error">{error}</p>}</aside></div><section className="panel table-panel portal-history"><div className="panel-head"><div><span className="eyebrow">MOJA EVIDENCIJA</span><h3>Zadnja jamstva</h3></div><button className="icon-button outlined" onClick={() => void load()}><RefreshCw size={16}/></button></div><div className="table-wrap"><table><thead><tr><th>Datum</th><th>Proizvod</th><th>Jamstvo</th><th>Originalna cijena</th><th className="right">Iznos jamstva</th></tr></thead><tbody>{sales.map(sale => <tr key={sale.id}><td>{dateLabel(sale.sold_at)}</td><td><strong>{sale.product_name}</strong></td><td>{sale.warranty_name}</td><td>{money(sale.original_price_cents)}</td><td className="right"><strong>{money(sale.warranty_cents)}</strong></td></tr>)}</tbody></table></div>{!sales.length && <p className="portal-empty">Još nema spremljenih jamstava za korisnika {user.displayName}.</p>}</section>{(user.role === 'manager' || user.role === 'superadmin') && <section className="panel table-panel portal-history"><div className="panel-head"><div><span className="eyebrow">POSLOVNICA</span><h3>Jamstva po djelatniku</h3></div></div><div className="table-wrap"><table><thead><tr><th>#</th><th>Djelatnik</th><th>Količina</th><th className="right">Iznos jamstava</th></tr></thead><tbody>{branchSummary.map((row, index) => <tr key={row.user_id}><td>{index + 1}</td><td><strong>{row.display_name}</strong></td><td>{row.quantity}</td><td className="right"><strong>{money(row.warranty_cents)}</strong></td></tr>)}</tbody></table></div>{!branchSummary.length && <p className="portal-empty">Još nema aktivnih djelatnika u poslovnici.</p>}</section>}</>;
}

type ShiftRequest = { id: number; request_date: string; request_type: 'morning' | 'afternoon' | 'off'; reason: string; status: 'pending' | 'approved' | 'rejected' | 'withdrawn'; manager_note: string; display_name?: string; username?: string };
const shiftLabels = { morning: 'Jutarnja smjena', afternoon: 'Popodnevna smjena', off: 'Slobodan dan' };
const statusLabels = { pending: 'Na čekanju', approved: 'Odobreno', rejected: 'Odbijeno', withdrawn: 'Povučeno' };

export function ShiftCenter({ user }: { user: PortalUser }) {
  const isManager = user.role === 'manager' || user.role === 'superadmin';
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [managed, setManaged] = useState<ShiftRequest[]>([]);
  const [week, setWeek] = useState(nextMonday());
  const [requestDate, setRequestDate] = useState(nextMonday());
  const [requestType, setRequestType] = useState<ShiftRequest['request_type']>('morning');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    const own = await api<{ requests: ShiftRequest[] }>('/api/shifts');
    setRequests(own.requests);
    if (isManager) {
      const result = await api<{ requests: ShiftRequest[] }>(`/api/manage/shifts?week=${week}`);
      setManaged(result.requests);
    }
  }

  useEffect(() => { void load().catch(error => setError((error as Error).message)); }, [week]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('');
    try {
      await api('/api/shifts', { method: 'POST', body: JSON.stringify({ requestDate, requestType, reason }) });
      setMessage('Zahtjev je poslan voditelju.'); setReason(''); await load();
    } catch (error) { setError((error as Error).message); }
  }

  async function withdraw(id: number) {
    try { await api(`/api/shifts/${id}`, { method: 'DELETE' }); await load(); } catch (error) { setError((error as Error).message); }
  }

  async function decide(id: number, status: 'approved' | 'rejected') {
    try { await api(`/api/manage/shifts/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await load(); } catch (error) { setError((error as Error).message); }
  }

  return <><div className="section-title"><div><span className="eyebrow">RASPORED</span><h1>Zahtjevi za smjene</h1><p>Zaposlenik prati svoje zahtjeve, a voditelj obrađuje zahtjeve poslovnice.</p></div></div><section className="shift-layout"><article className="panel"><div className="panel-head"><div><span className="eyebrow">NOVI ZAHTJEV</span><h3>Pošalji želju za smjenu</h3></div><CalendarClock size={20}/></div><form className="shift-form" onSubmit={submit}><label>Datum<input type="date" min={today()} value={requestDate} onChange={event => setRequestDate(event.target.value)}/></label><label>Vrsta<select value={requestType} onChange={event => setRequestType(event.target.value as ShiftRequest['request_type'])}><option value="morning">Jutarnja smjena</option><option value="afternoon">Popodnevna smjena</option><option value="off">Slobodan dan</option></select></label><label className="wide">Napomena<textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="Kratko obrazloženje (nije obavezno)" maxLength={500}/></label><button className="primary-button" type="submit">Pošalji zahtjev <ChevronRight size={16}/></button></form>{message && <p className="success-message"><Check size={16}/> {message}</p>}{error && <p className="form-error">{error}</p>}</article><article className="panel"><div className="panel-head"><div><span className="eyebrow">MOJI ZAHTJEVI</span><h3>Status zahtjeva</h3></div><Clock3 size={20}/></div><div className="request-list">{requests.map(request => <div className="request-row" key={request.id}><div><strong>{dateLabel(request.request_date)}</strong><small>{shiftLabels[request.request_type]}{request.reason ? ` · ${request.reason}` : ''}</small></div><span className={`request-status ${request.status}`}>{statusLabels[request.status]}</span>{request.status === 'pending' && <button className="icon-button danger" title="Povuci zahtjev" onClick={() => void withdraw(request.id)}><Trash2 size={15}/></button>}</div>)}{!requests.length && <p className="portal-empty">Još nema poslanih zahtjeva.</p>}</div></article></section>{isManager && <section className="panel manager-requests"><div className="panel-head"><div><span className="eyebrow">VODITELJSKI PREGLED</span><h3>Zahtjevi poslovnice za odabrani tjedan</h3></div><input type="date" value={week} onChange={event => setWeek(event.target.value)}/></div><div className="request-list">{managed.map(request => <div className="request-row manager" key={request.id}><div><strong>{request.display_name}</strong><small>{dateLabel(request.request_date)} · {shiftLabels[request.request_type]}{request.reason ? ` · ${request.reason}` : ''}</small></div><span className={`request-status ${request.status}`}>{statusLabels[request.status]}</span>{request.status === 'pending' && <div className="decision-actions"><button className="approve" onClick={() => void decide(request.id, 'approved')}><BadgeCheck size={16}/> Odobri</button><button className="reject" onClick={() => void decide(request.id, 'rejected')}><CircleX size={16}/> Odbij</button></div>}</div>)}{!managed.length && <p className="portal-empty">Za odabrani tjedan nema zahtjeva.</p>}</div></section>}</>;
}

export function ManagerCenter({ user, month, onUpdated }: { user: PortalUser; month: string; onUpdated: () => void }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState(String(user.branch.id));
  const [days, setDays] = useState('22');
  const [target, setTarget] = useState('');
  const [visibility, setVisibility] = useState<'own' | 'rank' | 'full'>(user.leaderboardVisibility);
  const [progress, setProgress] = useState<TargetProgress | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const query = user.role === 'superadmin' ? `&branchId=${branchId}` : '';

  async function load() {
    const [targetResult, visibilityResult, branchResult] = await Promise.all([
      api<{ target: TargetProgress }>(`/api/manage/target?month=${month}${query}`),
      api<{ leaderboardVisibility: 'own' | 'rank' | 'full' }>(`/api/manage/visibility?branchId=${branchId}`),
      api<{ branches: Branch[] }>('/api/branches')
    ]);
    setBranches(branchResult.branches);
    setProgress(targetResult.target);
    if (targetResult.target.configured) {
      setDays(String(targetResult.target.workingDaysTotal));
      setTarget(String(targetResult.target.targetCents / 100));
    }
    setVisibility(visibilityResult.leaderboardVisibility);
  }

  useEffect(() => { void load().catch(error => setError((error as Error).message)); }, [month, branchId]);

  async function save() {
    setError(''); setMessage('');
    try {
      await Promise.all([
        api(`/api/manage/target?branchId=${branchId}`, { method: 'PUT', body: JSON.stringify({ month, workingDaysTotal: Number(days), warrantyTargetCents: euroToCents(target) }) }),
        api(`/api/manage/visibility?branchId=${branchId}`, { method: 'PUT', body: JSON.stringify({ leaderboardVisibility: visibility }) })
      ]);
      setMessage('Postavke poslovnice su spremljene.'); await load(); onUpdated();
    } catch (error) { setError((error as Error).message); }
  }

  return <><div className="section-title"><div><span className="eyebrow">VODITELJSKE POSTAVKE</span><h1>Targeti i vidljivost</h1><p>Target jamstava je isključivo u eurima i vrijedi za cijelu poslovnicu.</p></div></div><section className="manager-settings"><article className="panel"><div className="panel-head"><div><span className="eyebrow">MJESEČNI PLAN</span><h3>Target jamstava</h3></div><ShieldCheck size={20}/></div><div className="form-grid">{user.role === 'superadmin' && <label className="wide">Poslovnica<select value={branchId} onChange={event => setBranchId(event.target.value)}>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}<label>Broj radnih dana<input type="number" min="1" max="31" value={days} onChange={event => setDays(event.target.value)}/></label><label>Mjesečni target (€)<input inputMode="decimal" value={target} onChange={event => setTarget(event.target.value)} placeholder="0,00"/></label><label className="wide">Što zaposlenici vide<select value={visibility} onChange={event => setVisibility(event.target.value as typeof visibility)}><option value="own">Samo vlastite rezultate</option><option value="rank">Vlastite rezultate i poziciju</option><option value="full">Cijeli poredak poslovnice</option></select></label></div><button className="primary-button" onClick={() => void save()}><Save size={16}/> Spremi postavke</button>{message && <p className="success-message"><Check size={16}/> {message}</p>}{error && <p className="form-error">{error}</p>}</article><article className="panel target-preview"><span className="eyebrow">TRENUTNI IZRAČUN</span><div><small>Mjesečni target</small><strong>{money(progress?.targetCents)}</strong></div><div><small>Dnevni target</small><strong>{money(progress?.dailyTargetCents)}</strong></div><div><small>Ostvareno</small><strong>{money(progress?.achievedCents)}</strong></div><div><small>Potrebno po preostalom danu</small><strong>{money(progress?.requiredDailyCents)}</strong></div>{progress && <div className="target-progress"><i style={{ width: `${Math.min(progress.progress * 100, 100)}%` }}/><span>{Math.round(progress.progress * 100)}%</span></div>}</article></section></>;
}

type AdminBranch = Branch & { leaderboard_visibility: 'own' | 'rank' | 'full'; pending_users: number };
type Registration = { id: number; username: string; display_name: string; role: 'employee' | 'manager'; status: string; created_at: string; branch_id: number; branch_name: string };

export function AdminPortalTools({ month, onUpdated }: { month: string; onUpdated: () => void }) {
  const [branches, setBranches] = useState<AdminBranch[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [branchId, setBranchId] = useState('');
  const [days, setDays] = useState('22');
  const [target, setTarget] = useState('');
  const [visibility, setVisibility] = useState<'own' | 'rank' | 'full'>('own');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const [branchResult, registrationResult] = await Promise.all([
      api<{ branches: AdminBranch[] }>('/api/admin/branches'),
      api<{ users: Registration[] }>('/api/admin/registrations?status=pending')
    ]);
    setBranches(branchResult.branches);
    setRegistrations(registrationResult.users);
    setBranchId(current => current || String(branchResult.branches.find(branch => branch.code === 'CCOW')?.id ?? branchResult.branches[0]?.id ?? ''));
  }

  useEffect(() => { void load().catch(error => setError((error as Error).message)); }, []);
  useEffect(() => {
    const branch = branches.find(item => item.id === Number(branchId));
    if (branch) setVisibility(branch.leaderboard_visibility);
    if (branchId) void api<{ target: TargetProgress }>(`/api/admin/target?branchId=${branchId}&month=${month}`).then(result => {
      if (result.target.configured) { setDays(String(result.target.workingDaysTotal)); setTarget(String(result.target.targetCents / 100)); }
      else { setDays('22'); setTarget(''); }
    }).catch(error => setError((error as Error).message));
  }, [branchId, month, branches.length]);

  async function decide(id: number, action: 'approve' | 'reject', role?: 'employee' | 'manager' | 'superadmin') {
    try { await api(`/api/admin/registrations/${id}`, { method: 'PATCH', body: JSON.stringify({ action, role }) }); await load(); setMessage(action === 'approve' ? 'Korisnik je odobren.' : 'Zahtjev je odbijen.'); } catch (error) { setError((error as Error).message); }
  }

  async function saveSettings() {
    setError(''); setMessage('');
    try {
      await Promise.all([
        api('/api/admin/target', { method: 'PUT', body: JSON.stringify({ branchId: Number(branchId), month, workingDaysTotal: Number(days), warrantyTargetCents: euroToCents(target) }) }),
        api('/api/admin/visibility', { method: 'PUT', body: JSON.stringify({ branchId: Number(branchId), leaderboardVisibility: visibility }) })
      ]);
      setMessage('Target i vidljivost su spremljeni.'); await load(); onUpdated();
    } catch (error) { setError((error as Error).message); }
  }

  return <section className="portal-admin-tools"><article className="panel"><div className="panel-head"><div><span className="eyebrow">REGISTRACIJE</span><h3>Zahtjevi na čekanju</h3></div><span className="pending-count">{registrations.length}</span></div><div className="registration-list">{registrations.map(registration => <div className="registration-row" key={registration.id}><div className="person"><span className="avatar">{registration.display_name.split(' ').map(part => part[0]).join('').slice(0, 2)}</span><div><strong>{registration.display_name}</strong><small>{registration.username} · {registration.branch_name} · {registration.role === 'manager' ? 'traži voditelja' : 'zaposlenik'}</small></div></div><div className="registration-actions"><button className="approve" onClick={() => void decide(registration.id, 'approve', 'employee')}><UserRoundCheck size={15}/> Zaposlenik</button><button className="approve manager" onClick={() => void decide(registration.id, 'approve', 'manager')}><ShieldCheck size={15}/> Voditelj</button><button className="approve superadmin" onClick={() => void decide(registration.id, 'approve', 'superadmin')}><ShieldCheck size={15}/> Superadmin</button><button className="reject" onClick={() => void decide(registration.id, 'reject')}><CircleX size={15}/> Odbij</button></div></div>)}{!registrations.length && <p className="portal-empty">Nema novih zahtjeva za registraciju.</p>}</div></article><article className="panel"><div className="panel-head"><div><span className="eyebrow">POSLOVNICE</span><h3>Mjesečni target i prikaz</h3></div><ShieldCheck size={20}/></div><div className="form-grid"><label className="wide">Poslovnica<select value={branchId} onChange={event => setBranchId(event.target.value)}>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label>Broj radnih dana<input type="number" min="1" max="31" value={days} onChange={event => setDays(event.target.value)}/></label><label>Target jamstava (€)<input inputMode="decimal" value={target} onChange={event => setTarget(event.target.value)} placeholder="0,00"/></label><label className="wide">Vidljivost rezultata<select value={visibility} onChange={event => setVisibility(event.target.value as typeof visibility)}><option value="own">Samo vlastiti rezultati</option><option value="rank">Vlastiti rezultat i pozicija</option><option value="full">Cijeli poredak</option></select></label></div><button className="primary-button" onClick={() => void saveSettings()}><Save size={16}/> Spremi postavke</button></article>{message && <p className="success-message"><Check size={16}/> {message}</p>}{error && <p className="form-error">{error}</p>}</section>;
}
