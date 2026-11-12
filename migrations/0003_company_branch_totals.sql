CREATE TABLE IF NOT EXISTS branch_daily_totals (
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  sale_date TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  value_cents INTEGER NOT NULL DEFAULT 0,
  source_import_id INTEGER REFERENCES import_batches(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(branch_id, sale_date)
);

CREATE TABLE IF NOT EXISTS branch_total_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id INTEGER NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  sale_date TEXT NOT NULL,
  before_quantity REAL,
  before_value_cents INTEGER,
  after_quantity REAL NOT NULL,
  after_value_cents INTEGER NOT NULL,
  was_inserted INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_branch_daily_totals_date ON branch_daily_totals(sale_date, branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_total_changes_import ON branch_total_changes(import_id);
