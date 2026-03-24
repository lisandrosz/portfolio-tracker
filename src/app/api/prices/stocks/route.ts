import getDb from "@/lib/db";
import { fetchStockPrices } from "@/lib/yahoo-finance";
import { numberToCents } from "@/lib/formatters";
import type { Asset } from "@/types";

export async function POST() {
  const db = getDb();

  const stockAssets = db
    .prepare("SELECT * FROM assets WHERE yahoo_symbol IS NOT NULL AND yahoo_symbol != ''")
    .all() as Asset[];

  if (stockAssets.length === 0) {
    return Response.json({ data: { updated: 0 } });
  }

  const symbols = stockAssets.map((a) => a.yahoo_symbol!);
  const prices = await fetchStockPrices(symbols);

  const today = new Date().toISOString().split("T")[0];
  let updated = 0;

  const updateStmt = db.prepare(
    "UPDATE assets SET current_price = ?, price_updated_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
  );
  const historyStmt = db.prepare(
    "INSERT INTO price_history (asset_id, price, date) VALUES (?, ?, ?) ON CONFLICT(asset_id, date) DO UPDATE SET price = ?"
  );

  const updateAll = db.transaction(() => {
    for (const asset of stockAssets) {
      const price = prices[asset.yahoo_symbol!];
      if (price) {
        const priceCents = numberToCents(price);
        updateStmt.run(priceCents, asset.id);
        historyStmt.run(asset.id, priceCents, today, priceCents);
        updated++;
      }
    }
  });

  updateAll();

  return Response.json({ data: { updated } });
}
