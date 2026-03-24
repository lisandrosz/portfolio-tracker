import getDb from "./db";
import type { Asset } from "@/types";

export function autoSnapshot() {
  const db = getDb();
  const assets = db
    .prepare("SELECT * FROM assets WHERE quantity > 0")
    .all() as Asset[];

  let totalValue = 0;
  let totalCost = 0;
  const breakdown: Record<string, number> = {};

  for (const asset of assets) {
    const value = Math.round(asset.quantity * asset.current_price);
    const cost = Math.round(asset.quantity * asset.avg_cost);
    totalValue += value;
    totalCost += cost;
    breakdown[asset.type] = (breakdown[asset.type] || 0) + value;
  }

  if (totalValue === 0) return;

  const today = new Date().toISOString().split("T")[0];

  db.prepare(
    `INSERT INTO portfolio_snapshots (total_value, total_cost, date, breakdown)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET total_value = ?, total_cost = ?, breakdown = ?`
  ).run(
    totalValue,
    totalCost,
    today,
    JSON.stringify(breakdown),
    totalValue,
    totalCost,
    JSON.stringify(breakdown)
  );
}
