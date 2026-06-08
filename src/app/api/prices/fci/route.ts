import getDb, { type SqlArg } from "@/lib/db";
import { fetchAllFunds } from "@/lib/fci";
import { autoSnapshot } from "@/lib/snapshot";
import { numberToCents } from "@/lib/formatters";
import type { Asset } from "@/types";

// Refresh cuotaparte (vcp, in ARS) for all FCI assets that have a fund_name.
export async function POST() {
  const db = await getDb();
  const fciAssets = (await db
    .prepare("SELECT * FROM assets WHERE type = 'fci' AND fund_name IS NOT NULL")
    .all()) as Asset[];

  if (fciAssets.length === 0) return Response.json({ data: { updated: 0 } });

  const funds = await fetchAllFunds();
  if (funds.length === 0) {
    return Response.json({ error: "No se pudieron obtener los fondos" }, { status: 502 });
  }
  const byName = new Map(funds.map((f) => [f.fondo, f.vcp]));

  const today = new Date().toISOString().split("T")[0];
  const updateSql =
    "UPDATE assets SET current_price = ?, price_updated_at = datetime('now'), updated_at = datetime('now') WHERE id = ?";
  const historySql =
    "INSERT INTO price_history (asset_id, price, date) VALUES (?, ?, ?) ON CONFLICT(asset_id, date) DO UPDATE SET price = ?";

  let updated = 0;
  const stmts: { sql: string; args: SqlArg[] }[] = [];
  for (const asset of fciAssets) {
    const vcp = byName.get(asset.fund_name!);
    if (vcp) {
      const cents = numberToCents(vcp); // ARS cents per cuotaparte
      stmts.push({ sql: updateSql, args: [cents, asset.id] });
      stmts.push({ sql: historySql, args: [asset.id, cents, today, cents] });
      updated++;
    }
  }
  await db.batch(stmts);

  await autoSnapshot();

  return Response.json({ data: { updated } });
}
