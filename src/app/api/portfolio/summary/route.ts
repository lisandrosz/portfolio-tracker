import getDb from "@/lib/db";
import type { Asset } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const assets = db.prepare("SELECT * FROM assets WHERE quantity > 0").all() as Asset[];

  let totalValue = 0;
  let totalCost = 0;
  const allocationByType: Record<string, number> = {};

  // Get interest/dividend income per asset
  const incomeByAsset = new Map<number, number>();
  const incomeTxns = db
    .prepare("SELECT asset_id, SUM(total) as total_income FROM transactions WHERE type IN ('interest', 'dividend') GROUP BY asset_id")
    .all() as Array<{ asset_id: number; total_income: number }>;
  for (const row of incomeTxns) {
    incomeByAsset.set(row.asset_id, row.total_income || 0);
  }

  const assetsWithValue = assets.map((asset) => {
    const currentValue = Math.round(asset.quantity * asset.current_price);
    const rawCost = Math.round(asset.quantity * asset.avg_cost);
    const interestIncome = incomeByAsset.get(asset.id) || 0;
    const assetTotalCost = rawCost - interestIncome;
    const profitLoss = currentValue - assetTotalCost;
    const profitLossPct = assetTotalCost > 0 ? (profitLoss / assetTotalCost) * 100 : 0;

    totalValue += currentValue;
    totalCost += assetTotalCost;
    allocationByType[asset.type] = (allocationByType[asset.type] || 0) + currentValue;

    return {
      ...asset,
      current_value: currentValue,
      total_cost: assetTotalCost,
      profit_loss: profitLoss,
      profit_loss_pct: profitLossPct,
      allocation_pct: 0, // calculated after totals
    };
  });

  // Calculate allocation percentages
  for (const a of assetsWithValue) {
    a.allocation_pct = totalValue > 0 ? (a.current_value / totalValue) * 100 : 0;
  }

  const totalProfitLoss = totalValue - totalCost;
  const totalProfitLossPct = totalCost > 0 ? (totalProfitLoss / totalCost) * 100 : 0;

  return Response.json({
    data: {
      total_value: totalValue,
      total_cost: totalCost,
      total_profit_loss: totalProfitLoss,
      total_profit_loss_pct: totalProfitLossPct,
      assets: assetsWithValue.sort((a, b) => b.current_value - a.current_value),
      allocation_by_type: allocationByType,
    },
  });
}
