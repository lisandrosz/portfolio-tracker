import getDb from "./db";
import { today } from "./dates";
import { getUsdRate } from "./dolar-api";
import { usdCents, netInvestedUsd, debtBalance } from "./portfolio";
import {
  isDebtType,
  isPayableType,
  isNonPerformingType,
  isOffBalanceType,
} from "./constants";
import type { Asset } from "@/types";

/**
 * Recompute the portfolio total (USD) and store today's snapshot.
 * total_value = gross holdings in USD; total_cost = net invested capital;
 * total_liabilities = debt still owed (por_pagar).
 */
export async function autoSnapshot(blueArg?: number | null) {
  const db = await getDb();
  const blue = blueArg ?? (await getUsdRate()).rate;
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
  let totalLiabilities = 0;
  // Performance is measured over holdings that can actually return something,
  // matching the summary endpoint. Cash and debts move net worth without ever
  // producing a gain.
  let investedValue = 0;
  let investedLiabilities = 0;
  let investedCapital = 0;
  const breakdown: Record<string, number> = {};

  for (const asset of assets) {
    // Ledger-only holdings never reach the chart: they have no value to plot.
    if (isOffBalanceType(asset.type)) continue;

    const txns = grouped.get(asset.id) ?? [];
    let value: number;
    let liability = 0;

    if (isDebtType(asset.type)) {
      const balance = debtBalance(txns);
      value = isPayableType(asset.type) ? 0 : balance;
      if (isPayableType(asset.type)) liability = balance;
    } else {
      const nativeValue = Math.round(asset.quantity * asset.current_price);
      value = usdCents(nativeValue, asset.currency, blue);
    }

    totalValue += value;
    totalLiabilities += liability;
    if (!isNonPerformingType(asset.type)) {
      investedValue += value;
      investedLiabilities += liability;
      investedCapital += netInvestedUsd(txns);
    }
    if (value > 0) breakdown[asset.type] = (breakdown[asset.type] || 0) + value;
  }

  // Stored so the chart's value - liabilities - cost equals the real gain.
  // Summing raw contributed capital instead would let a cash withdrawal that
  // funds a loan read as profit: the capital leaves, the value just moves.
  const gain = investedValue - investedLiabilities - investedCapital;
  const totalCost = totalValue - totalLiabilities - gain;

  if (totalValue === 0 && totalCost === 0 && totalLiabilities === 0) return;

  const day = today();

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
      day,
      JSON.stringify(breakdown),
      totalValue,
      totalCost,
      totalLiabilities,
      JSON.stringify(breakdown)
    );
}
