import { aggregateRows, employeeKey, normalizeEmployeeName, parseWorkbook } from '../src/lib/importer';
import * as XLSX from 'xlsx';
import { schemaStatements } from './schema';
import { handlePortalRequest, USER_SESSION_HEADER } from './portal';

type Env = { DB: any; DASHBOARD_PASSWORD_HASH: string; ADMIN_PASSWORD_HASH: string; SESSION_SECRET: string };
const COOKIE_DASHBOARD = 'sb_session';
const COOKIE_ADMIN = 'sb_admin';
const HEADER_DASHBOARD = 'x-salesboard-session';
const HEADER_ADMIN = 'x-salesboard-admin-session';
const GITHUB_PAGES_ORIGIN = 'https://aaabawgte.github.io';
const attempts = new Map<string, { count: number; reset: number }>();
let schemaReady: Promise<void> | null = null;
async function ensureSchema(db: any) {
  if (!schemaReady) schemaReady = db.batch(schemaStatements.map(statement => db.prepare(statement))).then(() => undefined);
  return schemaReady;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const bad = (message: string, status = 400) => json({ error: message }, status);
const nowIso = () => new Date().toISOString();
const normalize = (value: unknown) => String(value ?? '').trim();

function cookie(request: Request, name: string) {
  const raw = request.headers.get('cookie') ?? '';
  return raw.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}

async function digest(value: string | ArrayBuffer) {
  const bytes = await crypto.subtle.digest('SHA-256', typeof value === 'string' ? new TextEncoder().encode(value) : value);
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function base64(bytes: ArrayBuffer | Uint8Array) { return btoa(String.fromCharCode(...new Uint8Array(bytes instanceof ArrayBuffer ? bytes : bytes.buffer))); }
function decode64(value: string) { return Uint8Array.from(atob(value), char => char.charCodeAt(0)); }

async function verifyPassword(input: string, encoded: string | undefined) {
  if (!encoded?.startsWith('pbkdf2$')) return false;
  const [, algorithm, iterationsText, salt64, expected64] = encoded.split('$');
  const salt = decode64(salt64);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(input), { name: 'PBKDF2' }, false, ['deriveBits']);
  const hash = algorithm.toLowerCase() === 'sha256' ? 'SHA-256' : algorithm.toUpperCase();
  const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: Number(iterationsText), hash }, key, 256);
  const actual = new Uint8Array(derived); const expected = decode64(expected64);
  if (actual.length !== expected.length) return false;
  let mismatch = 0; for (let i = 0; i < actual.length; i++) mismatch |= actual[i] ^ expected[i];
  return mismatch === 0;
}

function rateLimited(ip: string) {
  const current = attempts.get(ip); const time = Date.now();
  if (!current || current.reset < time) { attempts.set(ip, { count: 1, reset: time + 15 * 60_000 }); return false; }
  current.count += 1; return current.count > 12;
}

async function createSession(db: any, kind: 'dashboard' | 'admin') {
  const raw = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  const tokenHash = await digest(raw);
  const expires = new Date(Date.now() + 30 * 86400_000).toISOString();
  await db.prepare('INSERT INTO sessions (token_hash, kind, expires_at) VALUES (?, ?, ?)').bind(tokenHash, kind, expires).run();
  return {
    token: raw,
    cookie: `${kind === 'admin' ? COOKIE_ADMIN : COOKIE_DASHBOARD}=${raw}; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax`
  };
}

async function session(request: Request, env: Env, kind: 'dashboard' | 'admin') {
  const raw = request.headers.get(kind === 'admin' ? HEADER_ADMIN : HEADER_DASHBOARD)
    ?? cookie(request, kind === 'admin' ? COOKIE_ADMIN : COOKIE_DASHBOARD);
  if (!raw) return false;
  const row = await env.DB.prepare('SELECT kind FROM sessions WHERE token_hash = ? AND expires_at > ?').bind(await digest(raw), nowIso()).first();
  return row?.kind === kind;
}

async function requireDashboard(request: Request, env: Env) { return session(request, env, 'dashboard'); }
async function requireAdmin(request: Request, env: Env) { return session(request, env, 'admin'); }

function money(valueCents: number) { return valueCents / 100; }
function period(request: Request) {
  const url = new URL(request.url); const from = url.searchParams.get('from'); const to = url.searchParams.get('to');
  return { from: from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : '1900-01-01', to: to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : '2999-12-31' };
}

async function analytics(request: Request, env: Env) {
  const { from, to } = period(request);
  const result = await env.DB.prepare(`SELECT s.sale_date AS date, s.quantity, s.value_cents AS cents, e.id AS employee_id, e.display_name AS employee
    FROM sales_daily s JOIN employees e ON e.id = s.employee_id WHERE s.sale_date BETWEEN ? AND ? ORDER BY s.sale_date, e.display_name`).bind(from, to).all();
  const rows = (result.results ?? []).map((row: any) => ({ ...row, value: money(Number(row.cents)), cents: Number(row.cents), quantity: Number(row.quantity) }));
  const byEmployee = new Map<number, any>(); const byDay = new Map<string, any>();
  for (const row of rows) {
    const employee = byEmployee.get(Number(row.employee_id)) ?? { id: Number(row.employee_id), name: row.employee, quantity: 0, cents: 0, days: [] };
    employee.quantity += row.quantity; employee.cents += row.cents;
    const day = byDay.get(row.date) ?? { date: row.date, quantity: 0, cents: 0 }; day.quantity += row.quantity; day.cents += row.cents; byDay.set(row.date, day);
    employee.days.push({ date: row.date, quantity: row.quantity, cents: row.cents, value: row.value }); byEmployee.set(employee.id, employee);
  }
  const totalCents = [...byEmployee.values()].reduce((sum, employee) => sum + employee.cents, 0);
  // A person with no net sales and no net services in the selected period is
  // not ranked. Keep negative results visible because they are real corrections.
  const leaderboard = [...byEmployee.values()].filter(employee => employee.cents !== 0 || employee.quantity !== 0).sort((a, b) => b.cents - a.cents || b.quantity - a.quantity || a.name.localeCompare(b.name, 'hr')).map((employee, index) => ({ ...employee, rank: index + 1, value: money(employee.cents), avg: employee.quantity ? money(Math.round(employee.cents / employee.quantity)) : null, share: totalCents ? employee.cents / totalCents : null }));
  const daily = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map(day => ({ ...day, value: money(day.cents) }));
  return { from, to, totalCents, total: money(totalCents), quantity: rows.reduce((sum: number, row: any) => sum + row.quantity, 0), leaderboard, daily, rows, employees: leaderboard, latestImport: (await env.DB.prepare("SELECT imported_at, file_name FROM import_batches WHERE status = 'success' ORDER BY imported_at DESC LIMIT 1").first()) ?? null };
}

async function handleImport(request: Request, env: Env) {
  if (!(await requireAdmin(request, env))) return bad('Administratorska autorizacija je potrebna.', 403);
  const contentLength = Number(request.headers.get('content-length') ?? 0); if (contentLength > 10 * 1024 * 1024) return bad('Datoteka je prevelika. Maksimalna veličina je 10 MB.', 413);
  const form = await request.formData(); const file = form.get('file');
  if (!(file instanceof File)) return bad('Odaberite XLSX datoteku.', 400);
  if (!file.name.toLowerCase().endsWith('.xlsx')) return bad('Podržane su samo .xlsx datoteke.', 415);
  const buffer = await file.arrayBuffer(); const fingerprint = await digest(buffer);
  const duplicate = await env.DB.prepare("SELECT id, imported_at FROM import_batches WHERE fingerprint = ? AND status = 'success'").bind(fingerprint).first();
  if (duplicate) return json({ duplicate: true, message: 'Ova je datoteka već uvezena.', importId: duplicate.id, importedAt: duplicate.imported_at }, 409);
  let parsed; try { parsed = parseWorkbook(buffer); } catch (error) { return bad((error as Error).message, 422); }
  const aggregate = aggregateRows(parsed.rows); const branch = await env.DB.prepare("SELECT id FROM branches WHERE code = 'CCOW'").first();
  if (!branch) return bad('Baza nije inicijalizirana. Primijenite D1 migraciju prije uvoza.', 500);
  try {
    const existingEmployees = await env.DB.prepare('SELECT id, normalized_key FROM employees').all();
    const aliases = await env.DB.prepare('SELECT employee_id, alias_key FROM employee_aliases').all();
    const employeeIds = new Map<string, number>();
    for (const employee of existingEmployees.results ?? []) employeeIds.set(employee.normalized_key, Number(employee.id));
    for (const alias of aliases.results ?? []) employeeIds.set(alias.alias_key, Number(alias.employee_id));
    const missing = [...new Map(aggregate.filter(row => !employeeIds.has(row.employeeKey)).map(row => [row.employeeKey, row.employee])).entries()];
    if (missing.length) {
      const marks = missing.map(() => '(?, ?)').join(', ');
      await env.DB.prepare(`INSERT INTO employees (normalized_key, display_name) VALUES ${marks} ON CONFLICT(normalized_key) DO NOTHING`).bind(...missing.flatMap(([key, name]) => [key, normalizeEmployeeName(name)])).run();
      const refreshed = await env.DB.prepare('SELECT id, normalized_key FROM employees').all();
      for (const employee of refreshed.results ?? []) employeeIds.set(employee.normalized_key, Number(employee.id));
    }
    const existing = await env.DB.prepare('SELECT employee_id, sale_date, quantity, value_cents FROM sales_daily WHERE branch_id = ? AND sale_date BETWEEN ? AND ?').bind(branch.id, parsed.dateFrom, parsed.dateTo).all();
    const beforeByKey = new Map((existing.results ?? []).map((row: any) => [`${row.employee_id}|${row.sale_date}`, row]));
    await env.DB.prepare(`INSERT INTO import_batches (file_name, fingerprint, date_from, date_to, rows_processed, employees_count, status, warnings_json) VALUES (?, ?, ?, ?, ?, ?, 'failed', ?)
      ON CONFLICT(fingerprint) DO UPDATE SET file_name = excluded.file_name, date_from = excluded.date_from, date_to = excluded.date_to, rows_processed = excluded.rows_processed, employees_count = excluded.employees_count, status = 'failed', warnings_json = excluded.warnings_json, error_message = NULL`)
      .bind(file.name, fingerprint, parsed.dateFrom, parsed.dateTo, parsed.rows.length, parsed.employees.length, JSON.stringify(parsed.warnings)).run();
    const batch = await env.DB.prepare('SELECT id FROM import_batches WHERE fingerprint = ?').bind(fingerprint).first();
    const importId = Number(batch.id);
    const changes = aggregate.map(row => {
      const employeeId = employeeIds.get(row.employeeKey);
      if (!employeeId) throw new Error(`Djelatnik ${row.employee} nije moguće povezati.`);
      return { ...row, employeeId, before: beforeByKey.get(`${employeeId}|${row.date}`) as any };
    });
    const statements: any[] = [];
    const chunkSize = 100;
    for (let start = 0; start < changes.length; start += chunkSize) {
      const chunk = changes.slice(start, start + chunkSize);
      const sales = chunk.map(row => [branch.id, row.employeeId, row.date, row.quantity, row.cents, importId, nowIso()]);
      const revisions = chunk.map(row => [importId, branch.id, row.employeeId, row.date, row.before?.quantity ?? null, row.before?.value_cents ?? null, row.quantity, row.cents, row.before ? 0 : 1]);
      statements.push(env.DB.prepare(`INSERT INTO sales_daily (branch_id, employee_id, sale_date, quantity, value_cents, source_import_id, updated_at)
        SELECT json_extract(value,'$[0]'), json_extract(value,'$[1]'), json_extract(value,'$[2]'), json_extract(value,'$[3]'), json_extract(value,'$[4]'), json_extract(value,'$[5]'), json_extract(value,'$[6]') FROM json_each(?) WHERE 1=1
        ON CONFLICT(branch_id, employee_id, sale_date) DO UPDATE SET quantity = excluded.quantity, value_cents = excluded.value_cents, source_import_id = excluded.source_import_id, updated_at = excluded.updated_at`)
        .bind(JSON.stringify(sales)));
      statements.push(env.DB.prepare(`INSERT INTO import_changes (import_id, branch_id, employee_id, sale_date, before_quantity, before_value_cents, after_quantity, after_value_cents, was_inserted)
        SELECT json_extract(value,'$[0]'), json_extract(value,'$[1]'), json_extract(value,'$[2]'), json_extract(value,'$[3]'), json_extract(value,'$[4]'), json_extract(value,'$[5]'), json_extract(value,'$[6]'), json_extract(value,'$[7]'), json_extract(value,'$[8]') FROM json_each(?)`)
        .bind(JSON.stringify(revisions)));
    }
    statements.push(env.DB.prepare("UPDATE import_batches SET status = 'success', updated_records = ?, error_message = NULL WHERE id = ?").bind(aggregate.length, importId));
    statements.push(env.DB.prepare('INSERT INTO audit_logs (action, details_json) VALUES (?, ?)').bind('import.success', JSON.stringify({ importId, fileName: file.name })));
    await env.DB.batch(statements);
    return json({ ok: true, importId, fileName: file.name, dateFrom: parsed.dateFrom, dateTo: parsed.dateTo, rows: parsed.rows.length, records: aggregate.length, employees: parsed.employees.length, warnings: parsed.warnings });
  } catch (error) {
    console.error('import_failed', error);
    await env.DB.prepare("UPDATE import_batches SET status = 'failed', error_message = ? WHERE fingerprint = ? AND status != 'success'").bind((error as Error).message, fingerprint).run();
    return bad(`Uvoz nije dovršen: ${(error as Error).message}`, 422);
  }
}

async function restore(request: Request, env: Env, id: string) {
  if (!(await requireAdmin(request, env))) return bad('Administratorска autorizacija je potrebna.', 403);
  const changes = await env.DB.prepare('SELECT * FROM import_changes WHERE import_id = ? ORDER BY id DESC').bind(Number(id)).all();
  if (!changes.results?.length) return bad('Za ovaj uvoz nema spremljenog stanja za vraćanje.', 404);
  const writes = changes.results.map((change: any) => change.was_inserted
    ? env.DB.prepare('DELETE FROM sales_daily WHERE branch_id = ? AND employee_id = ? AND sale_date = ?').bind(change.branch_id, change.employee_id, change.sale_date)
    : env.DB.prepare('UPDATE sales_daily SET quantity = ?, value_cents = ?, updated_at = ? WHERE branch_id = ? AND employee_id = ? AND sale_date = ?').bind(change.before_quantity, change.before_value_cents, nowIso(), change.branch_id, change.employee_id, change.sale_date));
  await env.DB.batch(writes);
  await env.DB.prepare("UPDATE import_batches SET status = 'restored', restored_at = ? WHERE id = ?").bind(nowIso(), Number(id)).run();
  await env.DB.prepare('INSERT INTO audit_logs (action, details_json) VALUES (?, ?)').bind('import.restore', JSON.stringify({ importId: id })).run();
  return json({ ok: true });
}

async function handle(request: Request, env: Env) {
  const url = new URL(request.url); const path = url.pathname;
  if (path === '/api/health') return json({ ok: true, service: 'salesboard', databaseConfigured: Boolean(env.DB), dashboardSecretConfigured: Boolean(env.DASHBOARD_PASSWORD_HASH), adminSecretConfigured: Boolean(env.ADMIN_PASSWORD_HASH) });
  if (path.startsWith('/api/')) {
    try { await ensureSchema(env.DB); }
    catch (error) { console.error('database_bootstrap_failed', error); return bad('Baza podataka trenutno nije dostupna. Provjerite D1 binding i migraciju.', 503); }
  }
  const portalResponse = await handlePortalRequest(request, env, { json, bad, requireAdmin });
  if (portalResponse) return portalResponse;
  if (path === '/api/login' && request.method === 'POST') {
    try {
      const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'; if (rateLimited(ip)) return bad('Previše pokušaja. Pričekajte 15 minuta.', 429);
      const body = await request.json().catch(() => ({})); const password = normalize(body.password);
      if (!(await verifyPassword(password, env.DASHBOARD_PASSWORD_HASH))) return bad('Lozinka nije ispravna.', 401);
      const created = await createSession(env.DB, 'dashboard');
      return json({ ok: true, token: created.token }, 200, { 'set-cookie': created.cookie });
    } catch (error) { console.error('dashboard_login_failed', error); return bad('Prijava trenutno nije dostupna.', 500); }
  }
  if (path === '/api/admin/login' && request.method === 'POST') {
    try {
      const ip = `${request.headers.get('cf-connecting-ip') ?? 'unknown'}-admin`; if (rateLimited(ip)) return bad('Previše pokušaja. Pričekajte 15 minuta.', 429);
      const body = await request.json().catch(() => ({}));
      if (!(await verifyPassword(normalize(body.password), env.ADMIN_PASSWORD_HASH))) return bad('Administratorska lozinka nije ispravna.', 401);
      const created = await createSession(env.DB, 'admin');
      return json({ ok: true, token: created.token }, 200, { 'set-cookie': created.cookie });
    } catch (error) { console.error('admin_login_failed', error); return bad('Administratorska prijava trenutno nije dostupna.', 500); }
  }
  if (path === '/api/logout' && request.method === 'POST') return json({ ok: true }, 200, { 'set-cookie': `${COOKIE_DASHBOARD}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`, 'set-cookie-2': `${COOKIE_ADMIN}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax` });
  if (path === '/api/bootstrap') { if (!(await requireDashboard(request, env))) return bad('Prijava je potrebna.', 401); return json({ ok: true, ...(await analytics(request, env)) }); }
  if (path === '/api/analytics') { if (!(await requireDashboard(request, env))) return bad('Prijava je potrebna.', 401); return json(await analytics(request, env)); }
  if (path === '/api/import' && request.method === 'POST') return handleImport(request, env);
  if (path === '/api/imports') { if (!(await requireAdmin(request, env))) return bad('Administratorска autorizacija je potrebna.', 403); return json(await env.DB.prepare('SELECT * FROM import_batches ORDER BY imported_at DESC LIMIT 50').all()); }
  if (path.match(/^\/api\/imports\/\d+\/restore$/) && request.method === 'POST') return restore(request, env, path.split('/')[3]);
  if (path === '/api/settings' && request.method === 'GET') { if (!(await requireAdmin(request, env))) return bad('Administratorска autorizacija je potrebna.', 403); return json(await env.DB.prepare('SELECT key, value FROM settings ORDER BY key').all()); }
  if (path === '/api/settings' && request.method === 'PUT') { if (!(await requireAdmin(request, env))) return bad('Administratorска autorizacija je potrebna.', 403); const body = await request.json(); for (const [key, value] of Object.entries(body)) await env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(key, String(value), nowIso()).run(); return json({ ok: true }); }
  if (path === '/api/aliases' && request.method === 'GET') { if (!(await requireAdmin(request, env))) return bad('Administratorска autorizacija je potrebna.', 403); return json(await env.DB.prepare('SELECT a.id, a.alias, e.display_name AS employee FROM employee_aliases a JOIN employees e ON e.id = a.employee_id ORDER BY e.display_name').all()); }
  if (path === '/api/aliases' && request.method === 'POST') { if (!(await requireAdmin(request, env))) return bad('Administratorска autorizacija je potrebna.', 403); const body = await request.json(); const emp = await env.DB.prepare('SELECT id FROM employees WHERE id = ?').bind(Number(body.employeeId)).first(); if (!emp) return bad('Djelatnik nije pronađen.', 404); await env.DB.prepare('INSERT INTO employee_aliases (employee_id, alias, alias_key) VALUES (?, ?, ?)').bind(emp.id, normalizeEmployeeName(body.alias), employeeKey(body.alias)).run(); return json({ ok: true }); }
  if (path.startsWith('/api/')) return bad('Ruta nije pronađena.', 404);
  return serveAsset(request);
}

function withCors(response: Response) {
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', GITHUB_PAGES_ORIGIN);
  headers.set('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  headers.set('access-control-allow-headers', `content-type, ${HEADER_DASHBOARD}, ${HEADER_ADMIN}, ${USER_SESSION_HEADER}`);
  headers.set('access-control-max-age', '86400');
  headers.append('vary', 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function app(request: Request, env: Env) {
  const url = new URL(request.url);
  const fromGithubPages = request.headers.get('origin') === GITHUB_PAGES_ORIGIN;
  if (fromGithubPages && request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
    return withCors(new Response(null, { status: 204 }));
  }
  const response = await handle(request, env);
  return fromGithubPages && url.pathname.startsWith('/api/') ? withCors(response) : response;
}

// scripts/build.mjs embeds the built client in the Worker bundle.
declare const __SALESBOARD_ASSETS__: Record<string, string>;

function serveAsset(request: Request) {
  const assets = __SALESBOARD_ASSETS__;
  const { pathname } = new URL(request.url);
  const key = pathname in assets ? pathname : '/index.html';
  const types: Record<string, string> = {
    js: 'text/javascript',
    css: 'text/css',
    webmanifest: 'application/manifest+json'
  };
  const type = types[key.split('.').pop() ?? ''] ?? 'text/html';
  return new Response(assets[key], {
    headers: {
      'content-type': `${type}; charset=utf-8`,
      'cache-control': key === '/index.html' ? 'no-store' : 'public, max-age=31536000, immutable'
    }
  });
}

export default { fetch: app };
