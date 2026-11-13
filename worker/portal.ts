import { employeeKey, normalizeEmployeeName } from '../src/lib/importer';
import { calculateTargetProgress, estimateElapsedWorkingDays } from '../src/lib/targets';
import { importSalesWorkbook } from './import-sales';

type Env = { DB: any };
type UserRole = 'employee' | 'manager' | 'superadmin';
type PortalUser = {
  id: number;
  username: string;
  display_name: string;
  role: UserRole;
  status: string;
  branch_id: number;
  branch_code: string;
  branch_name: string;
  employee_id: number | null;
  leaderboard_visibility: 'own' | 'rank' | 'full';
};
type Helpers = {
  json: (body: unknown, status?: number, headers?: Record<string, string>) => Response;
  bad: (message: string, status?: number) => Response;
  requireAdmin: (request: Request, env: any) => Promise<boolean>;
};

export const USER_SESSION_HEADER = 'x-salesboard-user-session';
const USER_SESSION_DAYS = 30;
export const PASSWORD_PBKDF2_ITERATIONS = 100_000;
const REGISTRATION_RETURN_URL = 'https://aaabawgte.github.io/salesboard/';
const validDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''));
const validMonth = (value: unknown) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value ?? ''));
const nowIso = () => new Date().toISOString();
const text = (value: unknown) => String(value ?? '').trim();
const integer = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
};

async function registrationBody(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    return Object.fromEntries(await request.formData());
  }
  return request.json().catch(() => ({}));
}

function registrationRedirect(error = '') {
  const url = new URL(REGISTRATION_RETURN_URL);
  if (error) url.searchParams.set('registrationError', error);
  else url.searchParams.set('registration', 'sent');
  return Response.redirect(url.toString(), 303);
}

function base64(bytes: ArrayBuffer | Uint8Array) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes instanceof ArrayBuffer ? bytes : bytes.buffer)));
}

function decode64(value: string) {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password: string) {
  const iterations = PASSWORD_PBKDF2_ITERATIONS;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return `pbkdf2$sha256$${iterations}$${base64(salt)}$${base64(derived)}`;
}

function employeeIdentityKey(value: unknown) {
  return employeeKey(String(value ?? '')).split(/\s+/).filter(Boolean).sort((left, right) => left.localeCompare(right, 'hr')).join(' ');
}

async function matchingEmployee(env: Env, displayName: string) {
  const result = await env.DB.prepare('SELECT id, normalized_key FROM employees').all();
  const identity = employeeIdentityKey(displayName);
  return (result.results ?? []).find((employee: any) => employeeIdentityKey(employee.normalized_key) === identity) ?? null;
}

async function verifyPassword(input: string, encoded: string) {
  if (!encoded?.startsWith('pbkdf2$')) return false;
  const [, algorithm, iterationsText, salt64, expected64] = encoded.split('$');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(input), { name: 'PBKDF2' }, false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: decode64(salt64), iterations: Number(iterationsText), hash: algorithm.toLowerCase() === 'sha256' ? 'SHA-256' : algorithm.toUpperCase() }, key, 256);
  const actual = new Uint8Array(derived);
  const expected = decode64(expected64);
  if (actual.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < actual.length; index += 1) mismatch |= actual[index] ^ expected[index];
  return mismatch === 0;
}

function publicUser(user: PortalUser) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
    status: user.status,
    employeeId: user.employee_id,
    leaderboardVisibility: user.leaderboard_visibility,
    branch: { id: user.branch_id, code: user.branch_code, name: user.branch_name }
  };
}

async function userFromRequest(request: Request, env: Env): Promise<PortalUser | null> {
  const token = request.headers.get(USER_SESSION_HEADER);
  if (!token) return null;
  const row = await env.DB.prepare(`SELECT u.id, u.username, u.display_name, u.role, u.status, u.branch_id, u.employee_id,
      b.code AS branch_code, b.name AS branch_name, COALESCE(bs.leaderboard_visibility, 'own') AS leaderboard_visibility
    FROM user_sessions s
    JOIN users u ON u.id = s.user_id
    JOIN branches b ON b.id = u.branch_id
    LEFT JOIN branch_settings bs ON bs.branch_id = u.branch_id
    WHERE s.token_hash = ? AND s.expires_at > ?`).bind(await digest(token), nowIso()).first();
  if (!row || row.status !== 'active') return null;
  return {
    ...row,
    id: Number(row.id),
    branch_id: Number(row.branch_id),
    employee_id: row.employee_id == null ? null : Number(row.employee_id)
  } as PortalUser;
}

async function createUserSession(env: Env, userId: number) {
  const token = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + USER_SESSION_DAYS * 86_400_000).toISOString();
  await env.DB.prepare('INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(await digest(token), userId, expiresAt).run();
  return token;
}

async function audit(env: Env, action: string, details: unknown) {
  await env.DB.prepare('INSERT INTO audit_logs (action, details_json) VALUES (?, ?)').bind(action, JSON.stringify(details)).run();
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const end = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(end).padStart(2, '0')}` };
}

function requestPeriod(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  return {
    from: validDate(from) ? String(from) : '1900-01-01',
    to: validDate(to) ? String(to) : '2999-12-31'
  };
}

async function targetForMonth(env: Env, branchId: number, month: string) {
  const target = await env.DB.prepare('SELECT working_days_total, warranty_target_cents FROM monthly_targets WHERE branch_id = ? AND month = ?').bind(branchId, month).first();
  const { from, to } = monthRange(month);
  const achieved = await env.DB.prepare('SELECT COALESCE(SUM(value_cents), 0) AS cents FROM sales_daily WHERE branch_id = ? AND sale_date BETWEEN ? AND ?').bind(branchId, from, to).first();
  const achievedCents = Number(achieved?.cents ?? 0);
  if (!target) return { configured: false, ...calculateTargetProgress(0, achievedCents, 1, 0) };
  const workingDaysTotal = Number(target.working_days_total);
  return {
    configured: true,
    ...calculateTargetProgress(Number(target.warranty_target_cents), achievedCents, workingDaysTotal, estimateElapsedWorkingDays(month, workingDaysTotal))
  };
}

async function portalAnalytics(request: Request, env: Env, user: PortalUser) {
  const { from, to } = requestPeriod(request);
  const result = await env.DB.prepare(`SELECT s.sale_date AS date, s.quantity, s.value_cents AS cents, e.id AS employee_id, e.display_name AS employee
    FROM sales_daily s JOIN employees e ON e.id = s.employee_id
    WHERE s.branch_id = ? AND s.sale_date BETWEEN ? AND ? ORDER BY s.sale_date, e.display_name`).bind(user.branch_id, from, to).all();
  const rows = (result.results ?? []).map((row: any) => ({ ...row, cents: Number(row.cents), value: Number(row.cents) / 100, quantity: Number(row.quantity), employee_id: Number(row.employee_id) }));
  const branchByEmployee = new Map<number, any>();
  for (const row of rows) {
    const employee = branchByEmployee.get(row.employee_id) ?? { id: row.employee_id, name: row.employee, quantity: 0, cents: 0, days: [] };
    employee.quantity += row.quantity;
    employee.cents += row.cents;
    employee.days.push({ date: row.date, quantity: row.quantity, cents: row.cents, value: row.value });
    branchByEmployee.set(employee.id, employee);
  }
  const branchTotalCents = [...branchByEmployee.values()].reduce((sum, employee) => sum + employee.cents, 0);
  const fullLeaderboard = [...branchByEmployee.values()]
    .filter(employee => employee.cents !== 0 || employee.quantity !== 0)
    .sort((a, b) => b.cents - a.cents || b.quantity - a.quantity || a.name.localeCompare(b.name, 'hr'))
    .map((employee, index) => ({ ...employee, rank: index + 1, value: employee.cents / 100, avg: employee.quantity ? Math.round(employee.cents / employee.quantity) / 100 : null, share: branchTotalCents ? employee.cents / branchTotalCents : null }));

  const employeeView = user.role === 'employee';
  const maySeeFull = !employeeView || user.leaderboard_visibility === 'full';
  const visibleIds = maySeeFull ? null : new Set(user.employee_id == null ? [] : [user.employee_id]);
  const visibleRows = visibleIds ? rows.filter((row: any) => visibleIds.has(row.employee_id)) : rows;
  const leaderboard = maySeeFull ? fullLeaderboard : fullLeaderboard.filter(employee => visibleIds?.has(employee.id));
  // The overview always shows branch-wide aggregates. Row-level and employee-level
  // data remain filtered below, so employees cannot infer a colleague's result.
  const byDay = new Map<string, any>();
  for (const row of rows) {
    const day = byDay.get(row.date) ?? { date: row.date, quantity: 0, cents: 0 };
    day.quantity += row.quantity;
    day.cents += row.cents;
    byDay.set(row.date, day);
  }
  const daily = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map(day => ({ ...day, value: day.cents / 100 }));
  const totalCents = branchTotalCents;
  const latestImport = await env.DB.prepare(`SELECT ib.imported_at, ib.file_name FROM import_batches ib
    WHERE ib.status = 'success' AND EXISTS (SELECT 1 FROM sales_daily s WHERE s.source_import_id = ib.id AND s.branch_id = ?)
    ORDER BY ib.imported_at DESC LIMIT 1`).bind(user.branch_id).first();
  const month = from.slice(0, 7);
  const ownRank = user.employee_id == null ? null : fullLeaderboard.find(employee => employee.id === user.employee_id)?.rank ?? null;
  return {
    from,
    to,
    totalCents,
    total: totalCents / 100,
    quantity: rows.reduce((sum: number, row: any) => sum + row.quantity, 0),
    leaderboard,
    employees: leaderboard,
    daily,
    rows: visibleRows,
    latestImport: latestImport ?? null,
    target: await targetForMonth(env, user.branch_id, month),
    branch: { id: user.branch_id, code: user.branch_code, name: user.branch_name },
    viewer: { ...publicUser(user), ownRank },
    leaderboardVisibility: user.leaderboard_visibility
  };
}

function nextMonday() {
  const date = new Date();
  const day = date.getUTCDay();
  const distance = day === 0 ? 1 : 8 - day;
  date.setUTCDate(date.getUTCDate() + distance);
  return date.toISOString().slice(0, 10);
}

function addDays(dateText: string, days: number) {
  const date = new Date(`${dateText}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function managerBranch(request: Request, user: PortalUser) {
  const requested = Number(new URL(request.url).searchParams.get('branchId'));
  return user.role === 'superadmin' && Number.isInteger(requested) && requested > 0 ? requested : user.branch_id;
}

export async function handlePortalRequest(request: Request, env: Env, helpers: Helpers): Promise<Response | null> {
  const { json, bad } = helpers;
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/branches' && request.method === 'GET') {
    const branches = await env.DB.prepare('SELECT id, code, name FROM branches ORDER BY name').all();
    return json({ branches: branches.results ?? [] });
  }

  if ((path === '/api/register' || path === '/api/register/form') && request.method === 'POST') {
    const browserForm = path === '/api/register/form';
    const fail = (message: string, status = 422) => browserForm ? registrationRedirect(message) : bad(message, status);
    const body: any = await registrationBody(request);
    const username = text(body.username).toLocaleLowerCase('hr');
    const displayName = normalizeEmployeeName(body.displayName);
    const password = text(body.password);
    const branchId = integer(body.branchId);
    const role = body.role === 'manager' ? 'manager' : 'employee';
    if (!/^[a-z0-9čćžšđ]+\.[a-z0-9čćžšđ.-]+$/i.test(username) || username.length > 64) return fail('Korisničko ime mora biti u obliku ime.prezime.');
    if (displayName.length < 3 || displayName.length > 80) return fail('Unesite ime i prezime.');
    if (password.length < 8 || password.length > 128) return fail('Lozinka mora imati najmanje 8 znakova.');
    const branch = await env.DB.prepare('SELECT id FROM branches WHERE id = ?').bind(branchId).first();
    if (!branch) return fail('Odaberite valjanu maloprodajnu jedinicu.');
    const employee = await matchingEmployee(env, displayName);
    try {
      await env.DB.prepare(`INSERT INTO users (username, display_name, password_hash, role, status, branch_id, employee_id)
        VALUES (?, ?, ?, ?, 'pending', ?, ?)`).bind(username, displayName, await hashPassword(password), role, branchId, employee?.id ?? null).run();
      await audit(env, 'user.registered', { username, branchId, role });
      return browserForm ? registrationRedirect() : json({ ok: true, status: 'pending', message: 'Zahtjev je poslan. Prijava će biti moguća nakon odobrenja administratora.' }, 201);
    } catch (error) {
      if (String(error).toLowerCase().includes('unique')) return fail('To korisničko ime već postoji.', 409);
      if (browserForm) {
        console.error('registration_form_failed', error);
        return registrationRedirect('Registracija trenutno nije dostupna. Pokušajte ponovno.');
      }
      throw error;
    }
  }

  if (path === '/api/user/login' && request.method === 'POST') {
    const body: any = await request.json().catch(() => ({}));
    const username = text(body.username).toLocaleLowerCase('hr');
    const row = await env.DB.prepare(`SELECT u.*, b.code AS branch_code, b.name AS branch_name, COALESCE(bs.leaderboard_visibility, 'own') AS leaderboard_visibility
      FROM users u JOIN branches b ON b.id = u.branch_id LEFT JOIN branch_settings bs ON bs.branch_id = u.branch_id WHERE u.username = ?`).bind(username).first();
    if (!row || !(await verifyPassword(text(body.password), row.password_hash))) return bad('Korisničko ime ili lozinka nisu ispravni.', 401);
    if (row.status === 'pending') return bad('Registracija još čeka odobrenje administratora.', 403);
    if (row.status !== 'active') return bad('Korisnički račun nije aktivan.', 403);
    if (body.expectedRole && row.role !== body.expectedRole && row.role !== 'superadmin') return bad('Odabrana vrsta prijave ne odgovara ovom računu.', 403);
    const user = { ...row, id: Number(row.id), branch_id: Number(row.branch_id), employee_id: row.employee_id == null ? null : Number(row.employee_id) } as PortalUser;
    const token = await createUserSession(env, user.id);
    await env.DB.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').bind(nowIso(), nowIso(), user.id).run();
    return json({ ok: true, token, user: publicUser(user) });
  }

  if (path === '/api/user/logout' && request.method === 'POST') {
    const token = request.headers.get(USER_SESSION_HEADER);
    if (token) await env.DB.prepare('DELETE FROM user_sessions WHERE token_hash = ?').bind(await digest(token)).run();
    return json({ ok: true });
  }

  const user = await userFromRequest(request, env);
  if (path === '/api/me' && request.method === 'GET') return user ? json({ user: publicUser(user) }) : bad('Prijava je potrebna.', 401);

  if (path === '/api/user/password' && request.method === 'PATCH') {
    if (!user) return bad('Prijava je potrebna.', 401);
    const body: any = await request.json().catch(() => ({}));
    const currentPassword = text(body.currentPassword);
    const newPassword = text(body.newPassword);
    if (newPassword.length < 8 || newPassword.length > 128) return bad('Nova lozinka mora imati između 8 i 128 znakova.', 422);
    if (currentPassword === newPassword) return bad('Nova lozinka mora biti različita od trenutne.', 422);
    const credentials = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first();
    if (!credentials || !(await verifyPassword(currentPassword, credentials.password_hash))) return bad('Trenutna lozinka nije ispravna.', 401);
    await env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').bind(await hashPassword(newPassword), nowIso(), user.id).run();
    await audit(env, 'user.password-changed', { userId: user.id });
    return json({ ok: true, message: 'Lozinka je promijenjena.' });
  }

  if (path === '/api/portal/analytics' && request.method === 'GET') {
    if (!user) return bad('Prijava je potrebna.', 401);
    return json(await portalAnalytics(request, env, user));
  }

  if (path === '/api/warranty-rules' && request.method === 'GET') {
    if (!user) return bad('Prijava je potrebna.', 401);
    const rules = await env.DB.prepare('SELECT id, code, product_group, name, rate_basis_points FROM warranty_rules WHERE active = 1 ORDER BY sort_order, name').all();
    return json({ rules: rules.results ?? [] });
  }

  if (path === '/api/shifts' && request.method === 'GET') {
    if (!user) return bad('Prijava je potrebna.', 401);
    const requests = await env.DB.prepare(`SELECT id, request_date, request_type, reason, status, manager_note, created_at, updated_at
      FROM shift_requests WHERE user_id = ? ORDER BY request_date DESC LIMIT 100`).bind(user.id).all();
    return json({ requests: requests.results ?? [] });
  }

  if (path === '/api/shifts' && request.method === 'POST') {
    if (!user) return bad('Prijava je potrebna.', 401);
    const body: any = await request.json().catch(() => ({}));
    const requestDate = text(body.requestDate);
    const requestType = text(body.requestType);
    const today = new Date().toISOString().slice(0, 10);
    const latest = addDays(today, 120);
    if (!validDate(requestDate) || requestDate <= today || requestDate > latest) return bad('Zahtjev mora biti za budući datum unutar idućih 120 dana.', 422);
    if (!['morning', 'afternoon', 'off'].includes(requestType)) return bad('Odaberite vrstu zahtjeva.', 422);
    try {
      await env.DB.prepare('INSERT INTO shift_requests (branch_id, user_id, request_date, request_type, reason) VALUES (?, ?, ?, ?, ?)').bind(user.branch_id, user.id, requestDate, requestType, text(body.reason).slice(0, 500)).run();
      await audit(env, 'shift.requested', { userId: user.id, branchId: user.branch_id, requestDate, requestType });
      return json({ ok: true }, 201);
    } catch (error) {
      if (String(error).toLowerCase().includes('unique')) return bad('Za taj datum već postoji zahtjev.', 409);
      throw error;
    }
  }

  const ownShiftMatch = path.match(/^\/api\/shifts\/(\d+)$/);
  if (ownShiftMatch && request.method === 'DELETE') {
    if (!user) return bad('Prijava je potrebna.', 401);
    const result = await env.DB.prepare("UPDATE shift_requests SET status = 'withdrawn', updated_at = ? WHERE id = ? AND user_id = ? AND status = 'pending'").bind(nowIso(), Number(ownShiftMatch[1]), user.id).run();
    if (!result.meta?.changes) return bad('Moguće je povući samo vlastiti zahtjev na čekanju.', 409);
    return json({ ok: true });
  }

  if (path === '/api/manage/shifts' && request.method === 'GET') {
    if (!user || !['manager', 'superadmin'].includes(user.role)) return bad('Voditeljska autorizacija je potrebna.', 403);
    const week = validDate(url.searchParams.get('week')) ? String(url.searchParams.get('week')) : nextMonday();
    const requests = await env.DB.prepare(`SELECT sr.id, sr.request_date, sr.request_type, sr.reason, sr.status, sr.manager_note, sr.created_at, u.display_name, u.username
      FROM shift_requests sr JOIN users u ON u.id = sr.user_id
      WHERE sr.branch_id = ? AND sr.request_date BETWEEN ? AND ? ORDER BY sr.request_date, u.display_name`).bind(managerBranch(request, user), week, addDays(week, 6)).all();
    return json({ week, weekEnd: addDays(week, 6), requests: requests.results ?? [] });
  }

  const manageShiftMatch = path.match(/^\/api\/manage\/shifts\/(\d+)$/);
  if (manageShiftMatch && request.method === 'PATCH') {
    if (!user || !['manager', 'superadmin'].includes(user.role)) return bad('Voditeljska autorizacija je potrebna.', 403);
    const body: any = await request.json().catch(() => ({}));
    if (!['approved', 'rejected'].includes(body.status)) return bad('Status mora biti odobren ili odbijen.', 422);
    const result = await env.DB.prepare(`UPDATE shift_requests SET status = ?, manager_note = ?, processed_by = ?, processed_at = ?, updated_at = ?
      WHERE id = ? AND branch_id = ? AND status = 'pending'`).bind(body.status, text(body.managerNote).slice(0, 500), user.id, nowIso(), nowIso(), Number(manageShiftMatch[1]), managerBranch(request, user)).run();
    if (!result.meta?.changes) return bad('Zahtjev nije pronađen ili je već obrađen.', 409);
    await audit(env, `shift.${body.status}`, { requestId: Number(manageShiftMatch[1]), managerId: user.id });
    return json({ ok: true });
  }

  if (path === '/api/manage/target' && request.method === 'GET') {
    if (!user || !['manager', 'superadmin'].includes(user.role)) return bad('Voditeljska autorizacija je potrebna.', 403);
    const month = validMonth(url.searchParams.get('month')) ? String(url.searchParams.get('month')) : new Date().toISOString().slice(0, 7);
    return json({ month, target: await targetForMonth(env, managerBranch(request, user), month) });
  }

  if (path === '/api/manage/target' && request.method === 'PUT') {
    if (!user || !['manager', 'superadmin'].includes(user.role)) return bad('Voditeljska autorizacija je potrebna.', 403);
    const body: any = await request.json().catch(() => ({}));
    const month = text(body.month);
    const workingDays = integer(body.workingDaysTotal);
    const targetCents = integer(body.warrantyTargetCents);
    if (!validMonth(month) || workingDays < 1 || workingDays > 31 || targetCents < 0) return bad('Provjerite mjesec, broj radnih dana i target.', 422);
    const branchId = managerBranch(request, user);
    await env.DB.prepare(`INSERT INTO monthly_targets (branch_id, month, working_days_total, warranty_target_cents, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(branch_id, month) DO UPDATE SET working_days_total = excluded.working_days_total, warranty_target_cents = excluded.warranty_target_cents, updated_by = excluded.updated_by, updated_at = excluded.updated_at`).bind(branchId, month, workingDays, targetCents, user.id, nowIso()).run();
    await audit(env, 'target.updated', { branchId, month, workingDays, targetCents, userId: user.id });
    return json({ ok: true, target: await targetForMonth(env, branchId, month) });
  }

  if (path === '/api/manage/visibility' && request.method === 'GET') {
    if (!user || !['manager', 'superadmin'].includes(user.role)) return bad('Voditeljska autorizacija je potrebna.', 403);
    const branchId = managerBranch(request, user);
    const setting = await env.DB.prepare('SELECT leaderboard_visibility FROM branch_settings WHERE branch_id = ?').bind(branchId).first();
    return json({ leaderboardVisibility: setting?.leaderboard_visibility ?? 'own' });
  }

  if (path === '/api/manage/visibility' && request.method === 'PUT') {
    if (!user || !['manager', 'superadmin'].includes(user.role)) return bad('Voditeljska autorizacija je potrebna.', 403);
    const body: any = await request.json().catch(() => ({}));
    if (!['own', 'rank', 'full'].includes(body.leaderboardVisibility)) return bad('Odaberite valjanu razinu vidljivosti.', 422);
    const branchId = managerBranch(request, user);
    await env.DB.prepare(`INSERT INTO branch_settings (branch_id, leaderboard_visibility, updated_by, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(branch_id) DO UPDATE SET leaderboard_visibility = excluded.leaderboard_visibility, updated_by = excluded.updated_by, updated_at = excluded.updated_at`).bind(branchId, body.leaderboardVisibility, user.id, nowIso()).run();
    await audit(env, 'visibility.updated', { branchId, leaderboardVisibility: body.leaderboardVisibility, userId: user.id });
    return json({ ok: true });
  }

  if (path === '/api/manage/import' && request.method === 'POST') {
    if (!user || !['manager', 'superadmin'].includes(user.role)) return bad('Voditeljska autorizacija je potrebna.', 403);
    const branchId = managerBranch(request, user);
    const branch = await env.DB.prepare('SELECT code FROM branches WHERE id = ?').bind(branchId).first();
    if (!branch) return bad('Poslovnica nije pronađena.', 404);
    return importSalesWorkbook(request, env, {
      branchCode: String(branch.code),
      actor: { kind: user.role === 'superadmin' ? 'superadmin' : 'manager', id: user.id }
    });
  }

  const isAdminRoute = path.startsWith('/api/admin/registrations') || path === '/api/admin/branches' || path === '/api/admin/target' || path === '/api/admin/visibility' || path === '/api/admin/import';
  if (isAdminRoute && user?.role !== 'superadmin' && !(await helpers.requireAdmin(request, env))) return bad('Administratorska autorizacija je potrebna.', 403);

  if (path === '/api/admin/import' && request.method === 'POST') {
    return importSalesWorkbook(request, env, { actor: { kind: user?.role === 'superadmin' ? 'superadmin' : 'legacy-admin', id: user?.id } });
  }

  if (path === '/api/admin/branches' && request.method === 'GET') {
    const branches = await env.DB.prepare(`SELECT b.id, b.code, b.name, COALESCE(bs.leaderboard_visibility, 'own') AS leaderboard_visibility,
      (SELECT COUNT(*) FROM users u WHERE u.branch_id = b.id AND u.status = 'pending') AS pending_users
      FROM branches b LEFT JOIN branch_settings bs ON bs.branch_id = b.id ORDER BY b.name`).all();
    return json({ branches: branches.results ?? [] });
  }

  if (path === '/api/admin/registrations' && request.method === 'GET') {
    const status = ['pending', 'active', 'rejected', 'suspended'].includes(String(url.searchParams.get('status'))) ? String(url.searchParams.get('status')) : 'pending';
    const users = await env.DB.prepare(`SELECT u.id, u.username, u.display_name, u.role, u.status, u.employee_id, u.created_at, b.id AS branch_id, b.name AS branch_name
      FROM users u JOIN branches b ON b.id = u.branch_id WHERE u.status = ? ORDER BY u.created_at`).bind(status).all();
    return json({ users: users.results ?? [] });
  }

  const registrationMatch = path.match(/^\/api\/admin\/registrations\/(\d+)$/);
  if (registrationMatch && request.method === 'PATCH') {
    const body: any = await request.json().catch(() => ({}));
    const registration = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(Number(registrationMatch[1])).first();
    if (!registration) return bad('Korisnički zahtjev nije pronađen.', 404);
    if (body.action === 'reject') {
      await env.DB.prepare("UPDATE users SET status = 'rejected', approved_by = 'legacy-admin', approved_at = ?, updated_at = ? WHERE id = ?").bind(nowIso(), nowIso(), registration.id).run();
      await audit(env, 'user.rejected', { userId: Number(registration.id) });
      return json({ ok: true });
    }
    if (body.action !== 'approve') return bad('Nepoznata administratorska radnja.', 422);
    const role = ['employee', 'manager', 'superadmin'].includes(body.role) ? body.role : registration.role;
    let employeeId = body.employeeId ? integer(body.employeeId) : registration.employee_id;
    if (!employeeId) {
      const key = employeeKey(registration.display_name);
      await env.DB.prepare('INSERT INTO employees (normalized_key, display_name) VALUES (?, ?) ON CONFLICT(normalized_key) DO NOTHING').bind(key, normalizeEmployeeName(registration.display_name)).run();
      employeeId = (await env.DB.prepare('SELECT id FROM employees WHERE normalized_key = ?').bind(key).first())?.id ?? null;
    }
    await env.DB.prepare(`UPDATE users SET status = 'active', role = ?, employee_id = ?, approved_by = 'legacy-admin', approved_at = ?, updated_at = ? WHERE id = ?`).bind(role, employeeId, nowIso(), nowIso(), registration.id).run();
    await audit(env, 'user.approved', { userId: Number(registration.id), role, employeeId });
    return json({ ok: true });
  }

  if (path === '/api/admin/target' && request.method === 'GET') {
    const branchId = integer(url.searchParams.get('branchId'));
    const month = String(url.searchParams.get('month') ?? '');
    if (!branchId || !validMonth(month)) return bad('Odaberite poslovnicu i mjesec.', 422);
    return json({ month, target: await targetForMonth(env, branchId, month) });
  }

  if (path === '/api/admin/target' && request.method === 'PUT') {
    const body: any = await request.json().catch(() => ({}));
    const branchId = integer(body.branchId);
    const month = text(body.month);
    const workingDays = integer(body.workingDaysTotal);
    const targetCents = integer(body.warrantyTargetCents);
    if (!branchId || !validMonth(month) || workingDays < 1 || workingDays > 31 || targetCents < 0) return bad('Provjerite postavke targeta.', 422);
    await env.DB.prepare(`INSERT INTO monthly_targets (branch_id, month, working_days_total, warranty_target_cents, updated_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(branch_id, month) DO UPDATE SET working_days_total = excluded.working_days_total, warranty_target_cents = excluded.warranty_target_cents, updated_at = excluded.updated_at`).bind(branchId, month, workingDays, targetCents, nowIso()).run();
    await audit(env, 'target.updated.admin', { branchId, month, workingDays, targetCents });
    return json({ ok: true, target: await targetForMonth(env, branchId, month) });
  }

  if (path === '/api/admin/visibility' && request.method === 'PUT') {
    const body: any = await request.json().catch(() => ({}));
    const branchId = integer(body.branchId);
    if (!branchId || !['own', 'rank', 'full'].includes(body.leaderboardVisibility)) return bad('Provjerite postavku vidljivosti.', 422);
    await env.DB.prepare(`INSERT INTO branch_settings (branch_id, leaderboard_visibility, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(branch_id) DO UPDATE SET leaderboard_visibility = excluded.leaderboard_visibility, updated_at = excluded.updated_at`).bind(branchId, body.leaderboardVisibility, nowIso()).run();
    await audit(env, 'visibility.updated.admin', { branchId, leaderboardVisibility: body.leaderboardVisibility });
    return json({ ok: true });
  }

  return null;
}
