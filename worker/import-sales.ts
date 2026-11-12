import { aggregateRows, normalizeEmployeeName, parseWorkbook } from '../src/lib/importer';

type Env = { DB: any };
type ImportScope = {
  branchCode?: string;
  actor: { kind: 'legacy-admin' | 'manager' | 'superadmin'; id?: number };
};
type BranchRecord = { id: number; code: string; name: string };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const bad = (message: string, status = 400) => json({ error: message }, status);
const nowIso = () => new Date().toISOString();

async function digest(input: ArrayBuffer) {
  const bytes = await crypto.subtle.digest('SHA-256', input);
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function importSalesWorkbook(request: Request, env: Env, scope: ImportScope) {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 10 * 1024 * 1024) return bad('Datoteka je prevelika. Maksimalna veličina je 10 MB.', 413);

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return bad('Odaberite XLSX datoteku.', 400);
  if (!file.name.toLowerCase().endsWith('.xlsx')) return bad('Podržane su samo .xlsx datoteke.', 415);

  const buffer = await file.arrayBuffer();
  const scopeKey = scope.branchCode ?? 'ALL';
  const fingerprint = `${await digest(buffer)}:${scopeKey}`;
  const duplicate = await env.DB.prepare("SELECT id, imported_at FROM import_batches WHERE fingerprint = ? AND status = 'success'").bind(fingerprint).first();
  if (duplicate) return json({ duplicate: true, message: 'Ova je datoteka već uvezena za odabranu poslovnicu.', importId: duplicate.id, importedAt: duplicate.imported_at }, 409);

  let parsed;
  try {
    parsed = parseWorkbook(buffer);
  } catch (error) {
    return bad((error as Error).message, 422);
  }

  const selectedRows = scope.branchCode ? parsed.rows.filter(row => row.branchCode === scope.branchCode) : parsed.rows;
  if (!selectedRows.length) {
    return bad(scope.branchCode
      ? 'Excel datoteka ne sadrži valjane retke za vašu poslovnicu.'
      : 'Excel datoteka ne sadrži valjane retke za podržane poslovnice.', 422);
  }

  const aggregate = aggregateRows(selectedRows);
  const dates = selectedRows.map(row => row.date).sort();
  const dateFrom = dates[0];
  const dateTo = dates[dates.length - 1];
  const employeeNames = new Map(selectedRows.map(row => [row.employeeKey, row.employee]));

  const branchResult = await env.DB.prepare('SELECT id, code, name FROM branches').all();
  const branches = new Map<string, BranchRecord>((branchResult.results ?? []).map((branch: any): [string, BranchRecord] => [String(branch.code), {
    id: Number(branch.id),
    code: String(branch.code),
    name: String(branch.name)
  }]));
  const affectedCodes = [...new Set(aggregate.map(row => row.branchCode))];
  const missingBranch = affectedCodes.find(code => !branches.has(code));
  if (missingBranch) return bad(`Poslovnica ${missingBranch} nije inicijalizirana u bazi.`, 500);

  try {
    const existingEmployees = await env.DB.prepare('SELECT id, normalized_key FROM employees').all();
    const aliases = await env.DB.prepare('SELECT employee_id, alias_key FROM employee_aliases').all();
    const employeeIds = new Map<string, number>();
    for (const employee of existingEmployees.results ?? []) employeeIds.set(String(employee.normalized_key), Number(employee.id));
    for (const alias of aliases.results ?? []) employeeIds.set(String(alias.alias_key), Number(alias.employee_id));

    const missingEmployees = [...employeeNames.entries()].filter(([key]) => !employeeIds.has(key));
    if (missingEmployees.length) {
      const marks = missingEmployees.map(() => '(?, ?)').join(', ');
      await env.DB.prepare(`INSERT INTO employees (normalized_key, display_name) VALUES ${marks} ON CONFLICT(normalized_key) DO NOTHING`)
        .bind(...missingEmployees.flatMap(([key, name]) => [key, normalizeEmployeeName(name)])).run();
      const refreshed = await env.DB.prepare('SELECT id, normalized_key FROM employees').all();
      for (const employee of refreshed.results ?? []) employeeIds.set(String(employee.normalized_key), Number(employee.id));
    }

    const beforeByKey = new Map<string, any>();
    for (const code of affectedCodes) {
      const branch = branches.get(code)!;
      const existing = await env.DB.prepare('SELECT employee_id, sale_date, quantity, value_cents FROM sales_daily WHERE branch_id = ? AND sale_date BETWEEN ? AND ?')
        .bind(branch.id, dateFrom, dateTo).all();
      for (const row of existing.results ?? []) beforeByKey.set(`${branch.id}|${row.employee_id}|${row.sale_date}`, row);
    }

    await env.DB.prepare(`INSERT INTO import_batches (file_name, fingerprint, date_from, date_to, rows_processed, employees_count, status, warnings_json)
      VALUES (?, ?, ?, ?, ?, ?, 'failed', ?)
      ON CONFLICT(fingerprint) DO UPDATE SET file_name = excluded.file_name, date_from = excluded.date_from, date_to = excluded.date_to,
      rows_processed = excluded.rows_processed, employees_count = excluded.employees_count, status = 'failed', warnings_json = excluded.warnings_json,
      error_message = NULL, restored_at = NULL`)
      .bind(file.name, fingerprint, dateFrom, dateTo, selectedRows.length, employeeNames.size, JSON.stringify(parsed.warnings)).run();
    const batch = await env.DB.prepare('SELECT id FROM import_batches WHERE fingerprint = ?').bind(fingerprint).first();
    const importId = Number(batch.id);

    const changes = aggregate.map(row => {
      const branch = branches.get(row.branchCode)!;
      const employeeId = employeeIds.get(row.employeeKey);
      if (!employeeId) throw new Error(`Djelatnik ${row.employee} nije moguće povezati.`);
      return {
        ...row,
        branchId: branch.id,
        branchName: branch.name,
        employeeId,
        before: beforeByKey.get(`${branch.id}|${employeeId}|${row.date}`)
      };
    });

    const statements: any[] = [];
    const chunkSize = 100;
    for (let start = 0; start < changes.length; start += chunkSize) {
      const chunk = changes.slice(start, start + chunkSize);
      const sales = chunk.map(row => [row.branchId, row.employeeId, row.date, row.quantity, row.cents, importId, nowIso()]);
      const revisions = chunk.map(row => [importId, row.branchId, row.employeeId, row.date, row.before?.quantity ?? null, row.before?.value_cents ?? null, row.quantity, row.cents, row.before ? 0 : 1]);
      statements.push(env.DB.prepare(`INSERT INTO sales_daily (branch_id, employee_id, sale_date, quantity, value_cents, source_import_id, updated_at)
        SELECT json_extract(value,'$[0]'), json_extract(value,'$[1]'), json_extract(value,'$[2]'), json_extract(value,'$[3]'), json_extract(value,'$[4]'), json_extract(value,'$[5]'), json_extract(value,'$[6]') FROM json_each(?) WHERE 1=1
        ON CONFLICT(branch_id, employee_id, sale_date) DO UPDATE SET quantity = excluded.quantity, value_cents = excluded.value_cents, source_import_id = excluded.source_import_id, updated_at = excluded.updated_at`)
        .bind(JSON.stringify(sales)));
      statements.push(env.DB.prepare(`INSERT INTO import_changes (import_id, branch_id, employee_id, sale_date, before_quantity, before_value_cents, after_quantity, after_value_cents, was_inserted)
        SELECT json_extract(value,'$[0]'), json_extract(value,'$[1]'), json_extract(value,'$[2]'), json_extract(value,'$[3]'), json_extract(value,'$[4]'), json_extract(value,'$[5]'), json_extract(value,'$[6]'), json_extract(value,'$[7]'), json_extract(value,'$[8]') FROM json_each(?)`)
        .bind(JSON.stringify(revisions)));
    }

    const branchSummary = affectedCodes.map(code => {
      const branch = branches.get(code)!;
      const rows = selectedRows.filter(row => row.branchCode === code);
      const records = changes.filter(row => row.branchCode === code);
      return {
        code,
        name: branch.name,
        rows: rows.length,
        records: records.length,
        employees: new Set(rows.map(row => row.employeeKey)).size
      };
    });
    statements.push(env.DB.prepare("UPDATE import_batches SET status = 'success', updated_records = ?, error_message = NULL WHERE id = ?").bind(aggregate.length, importId));
    statements.push(env.DB.prepare('INSERT INTO audit_logs (action, details_json) VALUES (?, ?)').bind('import.success', JSON.stringify({
      importId,
      fileName: file.name,
      scope: scopeKey,
      actor: scope.actor,
      branches: branchSummary
    })));
    await env.DB.batch(statements);

    return json({
      ok: true,
      importId,
      fileName: file.name,
      dateFrom,
      dateTo,
      rows: selectedRows.length,
      records: aggregate.length,
      employees: employeeNames.size,
      branches: branchSummary,
      warnings: parsed.warnings
    });
  } catch (error) {
    console.error('import_failed', { error: String(error), scope: scopeKey, actor: scope.actor });
    await env.DB.prepare("UPDATE import_batches SET status = 'failed', error_message = ? WHERE fingerprint = ? AND status != 'success'")
      .bind((error as Error).message, fingerprint).run();
    return bad(`Uvoz nije dovršen: ${(error as Error).message}`, 422);
  }
}
