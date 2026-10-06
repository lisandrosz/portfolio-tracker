// Read-only: list the days where the chart's gain jumps, with what moved.
//
// Usage: npx tsx --env-file=.env.production.local scripts/inspect-history.ts
// Only SELECTs; nothing is written.

import getDb from "../src/lib/db";

const THRESHOLD = 300_00; // USD cents

(async () => {
  if (!process.env.TURSO_DATABASE_URL) {
    console.error("TURSO_DATABASE_URL está vacío. Abortando.");
    process.exit(1);
  }
  const db = await getDb();
  const assets = (await db.prepare("SELECT id, name, type, currency FROM assets").all()) as Array<{
    id: number;
    name: string;
    type: string;
    currency: string;
  }>;
  const nameOf = new Map(assets.map((a) => [String(a.id), `${a.name} [${a.type}/${a.currency}]`]));

  const rows = (await db
    .prepare(
      "SELECT date, total_value, total_cost, total_liabilities, breakdown, asset_gains FROM portfolio_snapshots ORDER BY date"
    )
    .all()) as Array<{
    date: string;
    total_value: number;
    total_cost: number;
    total_liabilities: number;
    breakdown: string;
    asset_gains: string | null;
  }>;

  const gain = (r: (typeof rows)[number]) => r.total_value - r.total_liabilities - r.total_cost;
  const usd = (c: number) => (c / 100).toFixed(0);

  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const cur = rows[i];
    const jump = gain(cur) - gain(prev);
    if (Math.abs(jump) < THRESHOLD) continue;

    console.log(`\n${prev.date} -> ${cur.date}: ganancia ${usd(gain(prev))} -> ${usd(gain(cur))} (${jump > 0 ? "+" : ""}${usd(jump)})`);
    console.log(`  valor ${usd(prev.total_value)} -> ${usd(cur.total_value)} | aportado ${usd(prev.total_cost)} -> ${usd(cur.total_cost)} | deudas ${usd(prev.total_liabilities)} -> ${usd(cur.total_liabilities)}`);
    console.log(`  por tipo antes : ${prev.breakdown}`);
    console.log(`  por tipo después: ${cur.breakdown}`);
    const ga = JSON.parse(prev.asset_gains || "{}");
    const gb = JSON.parse(cur.asset_gains || "{}");
    for (const id of new Set([...Object.keys(ga), ...Object.keys(gb)])) {
      const d = (gb[id] ?? 0) - (ga[id] ?? 0);
      if (Math.abs(d) >= 50_00) console.log(`  ganancia ${nameOf.get(id)}: ${usd(ga[id] ?? 0)} -> ${usd(gb[id] ?? 0)}`);
    }
    const txns = (await db
      .prepare(
        "SELECT t.date, a.name, a.type AS asset_type, t.type, t.quantity, t.total_usd, t.link_id FROM transactions t JOIN assets a ON a.id = t.asset_id WHERE substr(t.date, 1, 10) BETWEEN ? AND ? ORDER BY t.date"
      )
      .all(prev.date, cur.date)) as Array<Record<string, unknown>>;
    for (const t of txns) {
      console.log(`  mov ${String(t.date).slice(0, 10)} ${t.name} [${t.asset_type}] ${t.type} qty=${t.quantity} usd=${usd(t.total_usd as number)}${t.link_id ? " (vinculado)" : ""}`);
    }
  }

  console.log("\nPrimer movimiento por activo:");
  const firsts = (await db
    .prepare("SELECT asset_id, MIN(date) AS first FROM transactions GROUP BY asset_id")
    .all()) as Array<{ asset_id: number; first: string }>;
  for (const f of firsts) console.log(`  ${nameOf.get(String(f.asset_id))}: ${f.first.slice(0, 10)}`);
})();
