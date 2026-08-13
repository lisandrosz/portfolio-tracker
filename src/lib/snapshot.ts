import getDb from "./db";
import { getCurrentBlue } from "./dolar-api";
import { usdCents, netInvestedUsd, installmentStats, debtBalance } from "./portfolio";
import { isInstallmentType, isDebtType, isPayableType } from "./constants";
import type { Asset } from "@/types";

/**
 * Recompute the portfolio total (USD) and store today's snapshot.
 * total_value = gross holdings in USD; total_cost = net invested capital;
 * total_liabilities = debt still owed (installment assets).
 */
export async function autoSnapshot(blueArg?: number | null) {
  const db = await getDb();
  const blue = blueArg ?? (await getCurrentBlue());
  const assets = (await db.prepare("SELECT * FROM assets").all()) as Asset[];

  const txns = (await db
    .prepare("SELECT asset_id, type, quantity, total, total_usd FROM transactions")
    .all()) as Array<{
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
  let totalLiabilities = 0;
  const breakdown: Record<string, number> = {};

  for (const asset of assets) {
    const txns = grouped.get(asset.id) ?? [];
    let value: number;

    if (isInstallmentType(asset.type)) {
      // Frozen appraisal as the value; the ARS debt is tracked separately and
      // converted at today's rate.
      const stats = installmentStats(asset, txns, blue);
      value = stats.value;
      totalLiabilities += stats.liability;
    } else if (isDebtType(asset.type)) {
      const balance = debtBalance(txns);
      value = isPayableType(asset.type) ? 0 : balance;
      if (isPayableType(asset.type)) totalLiabilities += balance;
    } else {
      const nativeValue = Math.round(asset.quantity * asset.current_price);
      value = usdCents(nativeValue, asset.currency, blue);
    }

    const invested = netInvestedUsd(txns);
    totalValue += value;
    totalCost += invested;
    if (value > 0) breakdown[asset.type] = (breakdown[asset.type] || 0) + value;
  }

  if (totalValue === 0 && totalCost === 0 && totalLiabilities === 0) return;

  const today = new Date().toISOString().split("T")[0];

  await db
    .prepare(
      `INSERT INTO portfolio_snapshots (total_value, total_cost, total_liabilities, date, breakdown)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET total_value = ?, total_cost = ?, total_liabilities = ?, breakdown = ?`
    )
    .run(
      totalValue,
      totalCost,
      totalLiabilities,
      today,
      JSON.stringify(breakdown),
      totalValue,
      totalCost,
      totalLiabilities,
      JSON.stringify(breakdown)
    );
}
