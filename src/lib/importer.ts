import * as XLSX from 'xlsx';

export type ParsedSale = {
  date: string;
  branch: string;
  branchCode: string;
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
  return branchCode(value) === 'CCOW';
}

const branchAliases: Record<string, string[]> = {
  ARENA_PARK: ['Big Bang Zagreb Arena Park'],
  SES_ARENA: ['Arena Samsung Experience Store', 'Samsung Experience Store Arena'],
  CCOE: ['Big Bang Zagreb CCO East', 'Big Bang CCO East', 'CCOE', 'City Center One East'],
  CCOW: ['Big Bang Zagreb CCO West', 'Big Bang CCOW', 'CCOW', 'City Center One West', 'City Center One Zapad', 'City Center One Zagreb Zapad'],
  SVETA_NEDELJA: ['Big Bang Sveta Nedelja'],
  OSIJEK_GACKA: ['Big Bang Osijek Gacka', 'Big Bang Osijek, Gacka'],
  RIJEKA_MARTI: ['Big Bang Rijeka Marti'],
  SPLIT_CCO: ['Big Bang Split CCO'],
  ZADAR_CITY_PARK: ['Big Bang Zadar City Park'],
  VARAZDIN: ['Big Bang Varaždin Green Park', 'Big Bang Varaždin']
};

const branchCodeByAlias = new Map(Object.entries(branchAliases).flatMap(([code, aliases]) => aliases.map(alias => [key(alias), code])));

export function branchCode(value: string): string | null {
  return branchCodeByAlias.get(key(value)) ?? null;
}

export function parseWorkbook(input: ArrayBuffer | Uint8Array): ImportParseResult {
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(input, { type: 'array', cellDates: true, raw: true }); }
  catch { throw new Error('Excel datoteka nije moguće pročitati. Provjerite je li XLSX datoteka neoštećena.'); }
  if (!workbook.SheetNames.length) throw new Error('Excel datoteka nema radne listove.');
  const rows: ParsedSale[] = [];
  const warnings: string[] = [];
  const branches = new Set<string>();
  const ignoredBranches = new Map<string, number>();
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
      if (!branch) { ignoredBranches.set('(bez poslovnice)', (ignoredBranches.get('(bez poslovnice)') ?? 0) + 1); return; }
      branches.add(branch);
      const mappedBranchCode = branchCode(branch);
      if (!mappedBranchCode) { ignoredBranches.set(branch, (ignoredBranches.get(branch) ?? 0) + 1); return; }
      const sourceEmployee = normalizeEmployeeName(strip(record[fields.komercijalist!]));
      if (!sourceEmployee) { warnings.push(`Redak ${rowNumber} na listu "${sheetName}" nema djelatnika.`); return; }
      try {
        const date = toIsoDate(record[fields.datum!]);
        const quantity = parseDecimal(record[fields.količina!]);
        const value = parseDecimal(record[fields.vrednost!]);
        if (!Number.isInteger(Math.round(value * 100))) throw new Error('novčana vrijednost nije precizna');
        const normalizedKey = employeeKey(sourceEmployee);
        employeeNames.set(normalizedKey, employeeNames.get(normalizedKey) ?? sourceEmployee);
        rows.push({ date, branch, branchCode: mappedBranchCode, employee: employeeNames.get(normalizedKey)!, employeeKey: normalizedKey, quantity, cents: Math.round(value * 100), sourceRow: rowNumber });
      } catch (error) { warnings.push(`Redak ${rowNumber} na listu "${sheetName}" preskočen: ${(error as Error).message}`); }
    });
  }
  for (const [branch, count] of ignoredBranches) warnings.push(`Poslovnica "${branch}" preskočena: ${count} redaka.`);
  if (!rows.length) throw new Error(`Datoteka ne sadrži valjane retke za podržane poslovnice. ${warnings.join(' ')}`.trim());
  const dates = rows.map(row => row.date).sort();
  return { rows, warnings, dateFrom: dates[0], dateTo: dates[dates.length - 1], employees: [...employeeNames.values()].sort((a, b) => a.localeCompare(b, 'hr')), branches: [...branches], sheets: workbook.SheetNames };
}

export function aggregateRows(rows: ParsedSale[]) {
  const map = new Map<string, { branchCode: string; date: string; employee: string; employeeKey: string; quantity: number; cents: number }>();
  for (const row of rows) {
    const id = `${row.branchCode}|${row.date}|${row.employeeKey}`;
    const current = map.get(id) ?? { branchCode: row.branchCode, date: row.date, employee: row.employee, employeeKey: row.employeeKey, quantity: 0, cents: 0 };
    current.quantity += row.quantity; current.cents += row.cents; map.set(id, current);
  }
  return [...map.values()];
}

export function aggregateBranchTotals(rows: ParsedSale[]) {
  const map = new Map<string, { branchCode: string; date: string; quantity: number; cents: number }>();
  for (const row of rows) {
    const id = `${row.branchCode}|${row.date}`;
    const current = map.get(id) ?? { branchCode: row.branchCode, date: row.date, quantity: 0, cents: 0 };
    current.quantity += row.quantity;
    current.cents += row.cents;
    map.set(id, current);
  }
  return [...map.values()];
}
