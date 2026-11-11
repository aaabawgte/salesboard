export const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS branches (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))` ,
  `CREATE TABLE IF NOT EXISTS employees (id INTEGER PRIMARY KEY AUTOINCREMENT, display_name TEXT NOT NULL, normalized_key TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))` ,
  `CREATE TABLE IF NOT EXISTS import_batches (id INTEGER PRIMARY KEY AUTOINCREMENT, file_name TEXT NOT NULL, fingerprint TEXT NOT NULL UNIQUE, imported_at TEXT NOT NULL DEFAULT (datetime('now')), date_from TEXT, date_to TEXT, rows_processed INTEGER NOT NULL DEFAULT 0, employees_count INTEGER NOT NULL DEFAULT 0, updated_records INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, warnings_json TEXT NOT NULL DEFAULT '[]', error_message TEXT, restored_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS employee_aliases (id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE, alias TEXT NOT NULL, alias_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now')))` ,
  `CREATE TABLE IF NOT EXISTS sales_daily (id INTEGER PRIMARY KEY AUTOINCREMENT, branch_id INTEGER NOT NULL REFERENCES branches(id), employee_id INTEGER NOT NULL REFERENCES employees(id), sale_date TEXT NOT NULL, quantity REAL NOT NULL DEFAULT 0, value_cents INTEGER NOT NULL DEFAULT 0, source_import_id INTEGER REFERENCES import_batches(id), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(branch_id, employee_id, sale_date))`,
  `CREATE TABLE IF NOT EXISTS import_changes (id INTEGER PRIMARY KEY AUTOINCREMENT, import_id INTEGER NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE, branch_id INTEGER NOT NULL REFERENCES branches(id), employee_id INTEGER NOT NULL REFERENCES employees(id), sale_date TEXT NOT NULL, before_quantity REAL, before_value_cents INTEGER, after_quantity REAL, after_value_cents INTEGER, was_inserted INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))` ,
  `CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, details_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')))` ,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))` ,
  `CREATE INDEX IF NOT EXISTS idx_sales_daily_date ON sales_daily(sale_date)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_daily_employee ON sales_daily(employee_id, sale_date)`,
  `CREATE INDEX IF NOT EXISTS idx_import_changes_import ON import_changes(import_id)`,
  `INSERT OR IGNORE INTO branches (code, name) VALUES ('CCOW', 'City Center One West')`
];
