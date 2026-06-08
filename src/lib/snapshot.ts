import getDb from "./db";
import { getCurrentBlue } from "./dolar-api";
import { usdCents, netInvestedUsd } from "./portfolio";
import type { Asset } from "@/types";

/**
 * Recompute the portfolio total (USD) and store today's snapshot.
 * total_value = sum of holdings in USD; total_cost = net invested capital.
 */
export async function autoSnapshot(blueArg?: number | null) {
  const db = getDb();
  const blue = blueArg ?? (await getCurrentBlue());
  const assets = db.prepare("SELECT * FROM assets").all() as Asset[];

  const txns = db
    .prepare("SELECT asset_id, type, quantity, total, total_usd FROM transactions")
    .all() as Array<{
    asset_id: number;
    type: string;
    quantity: number;
    total: number;
    total_usd: number;
  }>;
  const grouped = new Map<number, typeof txns>();
  for (const t of txns) {
    if (!grouped.has(t.asset_id)) grouped.set(t.asset_id, []);
    grouped.get(t.asset_id)!.push(t);
  }

  let totalValue = 0;
  let totalCost = 0;
  const breakdown: Record<string, number> = {};

  for (const asset of assets) {
    const nativeValue = Math.round(asset.quantity * asset.current_price);
    const value = usdCents(nativeValue, asset.currency, blue);
    const invested = netInvestedUsd(grouped.get(asset.id) ?? []);
    totalValue += value;
    totalCost += invested;
    if (value > 0) breakdown[asset.type] = (breakdown[asset.type] || 0) + value;
  }

  if (totalValue === 0 && totalCost === 0) return;

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
