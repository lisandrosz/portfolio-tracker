import getDb from "@/lib/db";
import { fetchAllFunds } from "@/lib/fci";
import { autoSnapshot } from "@/lib/snapshot";
import { numberToCents } from "@/lib/formatters";
import type { Asset } from "@/types";

// Refresh cuotaparte (vcp, in ARS) for all FCI assets that have a fund_name.
export async function POST() {
  const db = getDb();
  const fciAssets = db
    .prepare("SELECT * FROM assets WHERE type = 'fci' AND fund_name IS NOT NULL")
    .all() as Asset[];

  if (fciAssets.length === 0) return Response.json({ data: { updated: 0 } });

  const funds = await fetchAllFunds();
  if (funds.length === 0) {
    return Response.json({ error: "No se pudieron obtener los fondos" }, { status: 502 });
  }
  const byName = new Map(funds.map((f) => [f.fondo, f.vcp]));

  const today = new Date().toISOString().split("T")[0];
  const updateStmt = db.prepare(
    "UPDATE assets SET current_price = ?, price_updated_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
  );
  const historyStmt = db.prepare(
    "INSERT INTO price_history (asset_id, price, date) VALUES (?, ?, ?) ON CONFLICT(asset_id, date) DO UPDATE SET price = ?"
  );

  let updated = 0;
  const run = db.transaction(() => {
    for (const asset of fciAssets) {
      const vcp = byName.get(asset.fund_name!);
      if (vcp) {
        const cents = numberToCents(vcp); // ARS cents per cuotaparte
        updateStmt.run(cents, asset.id);
        historyStmt.run(asset.id, cents, today, cents);
        updated++;
      }
    }
  });
  run();

  await autoSnapshot();

  return Response.json({ data: { updated } });
}
