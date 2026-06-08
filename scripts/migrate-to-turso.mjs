// One-off migration: copy the local SQLite DB (data/portfolio.db) into Turso.
//
// Usage (from the project root, with Turso creds in the environment):
//   $env:TURSO_DATABASE_URL="libsql://...";
//   $env:TURSO_AUTH_TOKEN="...";
//   node scripts/migrate-to-turso.mjs
//
// Safe to re-run: it recreates the schema and replaces all rows each time.
// IDs are preserved so foreign keys (transactions.asset_id -> assets.id) stay intact.

import { createClient } from "@libsql/client";
import path from "path";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error(
    "Faltan TURSO_DATABASE_URL y/o TURSO_AUTH_TOKEN en el entorno. Abortando."
  );
  process.exit(1);
}

const localUrl = "file:" + path.join(process.cwd(), "data", "portfolio.db");
const local = createClient({ url: localUrl, intMode: "number" });
const remote = createClient({ url, authToken, intMode: "number" });

// Insert order respects FKs; delete order is the reverse.
const TABLES = ["settings", "assets", "transactions", "price_history", "portfolio_snapshots"];
const CHUNK = 200;

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function main() {
  console.log("Origen local :", localUrl);
  console.log("Destino Turso:", url);

  // 1) Recreate schema from the local DB's own definitions (no DDL drift).
  const schema = await local.execute(
    "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND type IN ('table','index') AND name NOT LIKE 'sqlite_%'"
  );
  for (const row of schema.rows) {
    let sql = String(row.sql);
    sql = sql
      .replace(/^CREATE TABLE /i, "CREATE TABLE IF NOT EXISTS ")
      .replace(/^CREATE INDEX /i, "CREATE INDEX IF NOT EXISTS ")
      .replace(/^CREATE UNIQUE INDEX /i, "CREATE UNIQUE INDEX IF NOT EXISTS ");
    await remote.execute(sql);
  }
  console.log(`Schema: ${schema.rows.length} objetos creados/verificados en Turso.`);

  // 2) Clear remote rows (children first), then copy each table (parents first).
  for (const t of [...TABLES].reverse()) {
    await remote.execute(`DELETE FROM ${t}`);
  }

  const counts = {};
  for (const table of TABLES) {
    const rs = await local.execute(`SELECT * FROM ${table}`);
    const cols = rs.columns;
    if (rs.rows.length === 0) {
      counts[table] = 0;
      continue;
    }
    const placeholders = cols.map(() => "?").join(", ");
    const sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`;
    const stmts = rs.rows.map((row) => ({
      sql,
      args: cols.map((c) => row[c]),
    }));
    for (const part of chunk(stmts, CHUNK)) {
      await remote.batch(part, "write");
    }
    counts[table] = rs.rows.length;
  }

  // 3) Verify counts match between local and remote.
  console.log("\nTabla                  local  ->  turso");
  let allOk = true;
  for (const table of TABLES) {
    const r = await remote.execute(`SELECT COUNT(*) AS n FROM ${table}`);
    const remoteN = Number(r.rows[0].n);
    const localN = counts[table];
    const ok = remoteN === localN;
    if (!ok) allOk = false;
    console.log(
      `  ${table.padEnd(20)} ${String(localN).padStart(5)}  ->  ${String(remoteN).padStart(5)}  ${ok ? "OK" : "MISMATCH!"}`
    );
  }

  console.log(allOk ? "\n✅ Migración completa." : "\n⚠️  Hay diferencias de conteo, revisá arriba.");
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error("Error en la migración:", err);
  process.exit(1);
});
