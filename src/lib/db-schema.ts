import type Database from "better-sqlite3";

export function initializeSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL,
      symbol          TEXT NOT NULL,
      type            TEXT NOT NULL,
      coingecko_id    TEXT,
      fund_name       TEXT,
      currency        TEXT NOT NULL DEFAULT 'USD',
      change_24h      REAL,
      quantity        REAL NOT NULL DEFAULT 0,
      avg_cost        INTEGER NOT NULL DEFAULT 0,
      current_price   INTEGER NOT NULL DEFAULT 0,
      price_updated_at TEXT,
      notes           TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id    INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      type        TEXT NOT NULL,
      quantity    REAL NOT NULL,
      price       INTEGER NOT NULL,
      total       INTEGER NOT NULL,
      total_usd   INTEGER NOT NULL DEFAULT 0,
      currency    TEXT NOT NULL DEFAULT 'USD',
      fee         INTEGER NOT NULL DEFAULT 0,
      date        TEXT NOT NULL,
      notes       TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id    INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      price       INTEGER NOT NULL,
      date        TEXT NOT NULL,
      UNIQUE(asset_id, date)
    );

    CREATE TABLE IF NOT EXISTS portfolio_snapshots (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      total_value INTEGER NOT NULL,
      date        TEXT NOT NULL UNIQUE,
      breakdown   TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_asset_id ON transactions(asset_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_price_history_asset_date ON price_history(asset_id, date);
    CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_date ON portfolio_snapshots(date);
  `);

  // --- Migrations for existing databases ---
  const assetCols = db.prepare("PRAGMA table_info(assets)").all() as Array<{ name: string }>;
  const hasAssetCol = (n: string) => assetCols.some((c) => c.name === n);
  if (!hasAssetCol("fund_name")) {
    db.exec("ALTER TABLE assets ADD COLUMN fund_name TEXT");
  }
  if (!hasAssetCol("currency")) {
    db.exec("ALTER TABLE assets ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD'");
  }
  if (!hasAssetCol("change_24h")) {
    db.exec("ALTER TABLE assets ADD COLUMN change_24h REAL");
  }

  const txCols = db.prepare("PRAGMA table_info(transactions)").all() as Array<{ name: string }>;
  const hasTxCol = (n: string) => txCols.some((c) => c.name === n);
  if (!hasTxCol("currency")) {
    db.exec("ALTER TABLE transactions ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD'");
  }
  if (!hasTxCol("total_usd")) {
    db.exec("ALTER TABLE transactions ADD COLUMN total_usd INTEGER NOT NULL DEFAULT 0");
    // Backfill: existing rows were stored in USD cents already.
    db.exec("UPDATE transactions SET total_usd = total WHERE total_usd = 0");
  }

  // Migration: add total_cost column to portfolio_snapshots
  const snapshotCols = db.prepare("PRAGMA table_info(portfolio_snapshots)").all() as Array<{ name: string }>;
  if (!snapshotCols.some((c) => c.name === "total_cost")) {
    db.exec("ALTER TABLE portfolio_snapshots ADD COLUMN total_cost INTEGER NOT NULL DEFAULT 0");
  }
}
