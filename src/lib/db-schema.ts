import type { Client } from "@libsql/client";

/**
 * Add a column if it isn't there yet, tolerating the case where someone else
 * added it first.
 *
 * The PRAGMA check and the ALTER are two separate round trips, so on a serverless
 * deploy several cold starts can read "missing" at the same time and all try to
 * add it. Only one wins; the losers would otherwise throw "duplicate column name"
 * and fail the request that happened to trigger them.
 */
async function addColumn(db: Client, exists: boolean, ddl: string) {
  if (exists) return;
  try {
    await db.execute(ddl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/duplicate column/i.test(msg)) throw err;
  }
}

export async function initializeSchema(db: Client) {
  // Foreign keys (for ON DELETE CASCADE). Harmless on remote; the asset-delete
  // route also removes children explicitly so we don't depend on per-connection
  // pragma persistence.
  await db.execute("PRAGMA foreign_keys = ON");

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS assets (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL,
      symbol          TEXT NOT NULL,
      type            TEXT NOT NULL,
      coingecko_id    TEXT,
      fund_name       TEXT,
      group_name      TEXT,
      currency        TEXT NOT NULL DEFAULT 'USD',
      change_24h      REAL,
      quantity        REAL NOT NULL DEFAULT 0,
      avg_cost        INTEGER NOT NULL DEFAULT 0,
      current_price   INTEGER NOT NULL DEFAULT 0,
      purchase_total     INTEGER NOT NULL DEFAULT 0,
      purchase_total_usd INTEGER NOT NULL DEFAULT 0,
      installments_total INTEGER NOT NULL DEFAULT 0,
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
      fx_rate     REAL,
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
  const assetCols = (await db.execute("PRAGMA table_info(assets)")).rows as unknown as Array<{
    name: string;
  }>;
  const hasAssetCol = (n: string) => assetCols.some((c) => c.name === n);
  await addColumn(db, hasAssetCol("fund_name"), "ALTER TABLE assets ADD COLUMN fund_name TEXT");
  await addColumn(
    db,
    hasAssetCol("currency"),
    "ALTER TABLE assets ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD'"
  );
  await addColumn(db, hasAssetCol("change_24h"), "ALTER TABLE assets ADD COLUMN change_24h REAL");
  // Free-text grouping label: assets sharing one roll up under a single row
  // (e.g. several BingX copytrading strategies under "BingX Copytrading").
  await addColumn(db, hasAssetCol("group_name"), "ALTER TABLE assets ADD COLUMN group_name TEXT");
  // Installment assets (terreno): agreed price in ARS cents, appraised value
  // frozen in USD cents at the purchase-day rate, and the cuota count.
  await addColumn(
    db,
    hasAssetCol("purchase_total"),
    "ALTER TABLE assets ADD COLUMN purchase_total INTEGER NOT NULL DEFAULT 0"
  );
  await addColumn(
    db,
    hasAssetCol("purchase_total_usd"),
    "ALTER TABLE assets ADD COLUMN purchase_total_usd INTEGER NOT NULL DEFAULT 0"
  );
  await addColumn(
    db,
    hasAssetCol("installments_total"),
    "ALTER TABLE assets ADD COLUMN installments_total INTEGER NOT NULL DEFAULT 0"
  );

  const txCols = (await db.execute("PRAGMA table_info(transactions)")).rows as unknown as Array<{
    name: string;
  }>;
  const hasTxCol = (n: string) => txCols.some((c) => c.name === n);
  await addColumn(
    db,
    hasTxCol("currency"),
    "ALTER TABLE transactions ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD'"
  );
  if (!hasTxCol("total_usd")) {
    await addColumn(
      db,
      false,
      "ALTER TABLE transactions ADD COLUMN total_usd INTEGER NOT NULL DEFAULT 0"
    );
    // Backfill: existing rows were stored in USD cents already.
    await db.execute("UPDATE transactions SET total_usd = total WHERE total_usd = 0");
  }
  // ARS per USD used to freeze total_usd. Nullable: NULL for USD assets, and for
  // pre-existing ARS rows whose rate was never recorded.
  await addColumn(db, hasTxCol("fx_rate"), "ALTER TABLE transactions ADD COLUMN fx_rate REAL");

  // Migration: add total_cost column to portfolio_snapshots
  const snapshotCols = (
    await db.execute("PRAGMA table_info(portfolio_snapshots)")
  ).rows as unknown as Array<{ name: string }>;
  const hasSnapshotCol = (n: string) => snapshotCols.some((c) => c.name === n);
  await addColumn(
    db,
    hasSnapshotCol("total_cost"),
    "ALTER TABLE portfolio_snapshots ADD COLUMN total_cost INTEGER NOT NULL DEFAULT 0"
  );
  await addColumn(
    db,
    hasSnapshotCol("total_liabilities"),
    "ALTER TABLE portfolio_snapshots ADD COLUMN total_liabilities INTEGER NOT NULL DEFAULT 0"
  );
}
