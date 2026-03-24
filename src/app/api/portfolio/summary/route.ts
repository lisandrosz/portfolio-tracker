import getDb from "@/lib/db";
import type { Asset } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const assets = db.prepare("SELECT * FROM assets WHERE quantity > 0").all() as Asset[];

  let totalValue = 0;
  let totalCost = 0;
  const allocationByType: Record<string, number> = {};

  const assetsWithValue = assets.map((asset) => {
    const currentValue = Math.round(asset.quantity * asset.current_price);
    const assetTotalCost = Math.round(asset.quantity * asset.avg_cost);
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
