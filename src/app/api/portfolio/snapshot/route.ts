import getDb from "@/lib/db";
import type { Asset } from "@/types";

export async function POST() {
  const db = getDb();
  const assets = db.prepare("SELECT * FROM assets WHERE quantity > 0").all() as Asset[];

  let totalValue = 0;
  const breakdown: Record<string, number> = {};

  for (const asset of assets) {
    const value = Math.round(asset.quantity * asset.current_price);
    totalValue += value;
    breakdown[asset.type] = (breakdown[asset.type] || 0) + value;
  }

  const today = new Date().toISOString().split("T")[0];

  db.prepare(
    `INSERT INTO portfolio_snapshots (total_value, date, breakdown)
     VALUES (?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET total_value = ?, breakdown = ?`
  ).run(totalValue, today, JSON.stringify(breakdown), totalValue, JSON.stringify(breakdown));

  const snapshot = db
    .prepare("SELECT * FROM portfolio_snapshots WHERE date = ?")
    .get(today);

  return Response.json({ data: snapshot });
}
