import * as XLSX from 'xlsx';

export type ParsedSale = {
  date: string;
  branch: string;
  employee: string;
  employeeKey: string;
  quantity: number;
  cents: number;
  sourceRow: number;
};

export type ImportParseResult = {
  rows: ParsedSale[];
  warnings: string[];
  dateFrom: string | null;
  dateTo: string | null;
  employees: string[];
  branches: string[];
  sheets: string[];
};

const required = ['datum', 'poslovnica', 'komercijalist', 'količina', 'vrednost'];
const strip = (value: unknown) => String(value ?? '').trim();
const key = (value: string) => strip(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('hr-HR').replace(/\s+/g, ' ');

export function normalizeEmployeeName(value: string): string {
  const clean = strip(value).replace(/\s+/g, ' ');
  if (!clean) return '';
  // Reports occasionally alternate between "Prezime Ime" and "Ime Prezime".
  // We preserve the source display value and use a token-sorted key for matching.
  return clean.split(' ').map(part => part.charAt(0).toLocaleUpperCase('hr-HR') + part.slice(1).toLocaleLowerCase('hr-HR')).join(' ');
}

export function employeeKey(value: string): string {
  return key(normalizeEmployeeName(value).split(' ').sort((a, b) => a.localeCompare(b, 'hr')).join(' '));
}

export function parseDecimal(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  let text = strip(value).replace(/\s/g, '').replace(/€/g, '');
  if (!text) return 0;
  // Croatian exports use 1.234,56 while some Excel exports use 1234.56.
  if (text.includes(',') && text.includes('.')) text = text.lastIndexOf(',') > text.lastIndexOf('.') ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  else if (text.includes(',')) text = text.replace(',', '.');
  const parsed = Number(text.replace(/[^0-9+\-.]/g, ''));
  if (!Number.isFinite(parsed)) throw new Error(`Vrijednost "${value}" nije valjan broj.`);
  return parsed;
}

export function toIsoDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
  }
  const text = strip(value);
  const cro = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (cro) return `${cro[3]}-${cro[2].padStart(2, '0')}-${cro[1].padStart(2, '0')}`;
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  throw new Error(`Datum "${value}" nije valjan datum.`);
}

function findField(headers: string[], wanted: string): string | undefined {
  const normalizedWanted = key(wanted).replace(/Đ/g, 'D');
  return headers.find(header => key(header).replace(/Đ/g, 'D') === normalizedWanted);
}

export function isCCOWBranch(value: string): boolean {
  const normalized = key(value);
  return normalized.includes('CCOW') || normalized.includes('CCO WEST') || normalized.includes('CITY CENTER ONE WEST') || normalized.includes('CITY CENTER ONE ZAPAD') || normalized.includes('CITY CENTER ONE ZAGREB ZAPAD');
}

export function parseWorkbook(input: ArrayBuffer | Uint8Array): ImportParseResult {
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(input, { type: 'array', cellDates: true, raw: true }); }
  catch { throw new Error('Excel datoteka nije moguće pročitati. Provjerite je li XLSX datoteka neoštećena.'); }
  if (!workbook.SheetNames.length) throw new Error('Excel datoteka nema radne listove.');
  const rows: ParsedSale[] = [];
  const warnings: string[] = [];
  const branches = new Set<string>();
  const employeeNames = new Map<string, string>();
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
    if (!raw.length) continue;
    const headers = Object.keys(raw[0]);
    const fields = Object.fromEntries(required.map(field => [field, findField(headers, field)]));
    const missing = required.filter(field => !fields[field]);
    if (missing.length) {
      warnings.push(`List "${sheetName}" preskočen: nedostaju stupci ${missing.join(', ')}.`);
      continue;
    }
    raw.forEach((record, index) => {
      const rowNumber = index + 2;
      const branch = strip(record[fields.poslovnica!]);
      if (!branch) { warnings.push(`Redak ${rowNumber} na listu "${sheetName}" nema poslovnicu.`); return; }
      branches.add(branch);
      if (!isCCOWBranch(branch)) return;
      const sourceEmployee = normalizeEmployeeName(strip(record[fields.komercijalist!]));
      if (!sourceEmployee) { warnings.push(`Redak ${rowNumber} na listu "${sheetName}" nema djelatnika.`); return; }
      try {
        const date = toIsoDate(record[fields.datum!]);
        const quantity = parseDecimal(record[fields.količina!]);
        const value = parseDecimal(record[fields.vrednost!]);
        if (!Number.isInteger(Math.round(value * 100))) throw new Error('novčana vrijednost nije precizna');
        const normalizedKey = employeeKey(sourceEmployee);
        employeeNames.set(normalizedKey, employeeNames.get(normalizedKey) ?? sourceEmployee);
        rows.push({ date, branch, employee: employeeNames.get(normalizedKey)!, employeeKey: normalizedKey, quantity, cents: Math.round(value * 100), sourceRow: rowNumber });
      } catch (error) { warnings.push(`Redak ${rowNumber} na listu "${sheetName}" preskočen: ${(error as Error).message}`); }
    });
  }
  if (!rows.length && branches.size && [...branches].some(isCCOWBranch)) throw new Error(`Nema valjanih CCOW redaka. ${warnings.join(' ')}`);
  if (!rows.length) throw new Error('Datoteka ne sadrži valjane retke za poslovnicu CCOW.');
  const dates = rows.map(row => row.date).sort();
  return { rows, warnings, dateFrom: dates[0], dateTo: dates[dates.length - 1], employees: [...employeeNames.values()].sort((a, b) => a.localeCompare(b, 'hr')), branches: [...branches], sheets: workbook.SheetNames };
}

export function aggregateRows(rows: ParsedSale[]) {
  const map = new Map<string, { date: string; employee: string; employeeKey: string; quantity: number; cents: number }>();
  for (const row of rows) {
    const id = `${row.date}|${row.employeeKey}`;
    const current = map.get(id) ?? { date: row.date, employee: row.employee, employeeKey: row.employeeKey, quantity: 0, cents: 0 };
    current.quantity += row.quantity; current.cents += row.cents; map.set(id, current);
  }
  return [...map.values()];
}
