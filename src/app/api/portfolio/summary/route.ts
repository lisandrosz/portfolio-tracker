import getDb from "@/lib/db";
import { getCurrentBlue } from "@/lib/dolar-api";
import { usdCents, netInvestedUsd, grossInvestedUsd } from "@/lib/portfolio";
import { isCashType } from "@/lib/constants";
import type { Asset } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getDb();
  const blue = await getCurrentBlue();

  const assets = (await db.prepare("SELECT * FROM assets").all()) as Asset[];

  // Net invested capital per asset (USD cents), from all transactions.
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
  const investedByAsset = new Map<number, number>();
  const grossByAsset = new Map<number, number>();
  for (const [assetId, rows] of grouped) {
    investedByAsset.set(assetId, netInvestedUsd(rows));
    grossByAsset.set(assetId, grossInvestedUsd(rows));
  }

  let totalValue = 0; // net worth (investments + cash)
  let liquidity = 0; // cash only
  let investedValue = 0; // non-cash value
  let investedCapital = 0; // non-cash net invested
  let investedGross = 0; // non-cash gross invested (for %)
  const allocationByType: Record<string, number> = {};

  const assetsWithValue = assets
    .map((asset) => {
      const nativeValue = Math.round(asset.quantity * asset.current_price);
      const currentValue = usdCents(nativeValue, asset.currency, blue);
      const netInvested = investedByAsset.get(asset.id) ?? 0;
      const grossInvested = grossByAsset.get(asset.id) ?? 0;
      const profitLoss = currentValue - netInvested;
      // % return is on gross capital deployed, so it stays correct even after
      // withdrawing more than was put in (net invested <= 0).
      const profitLossPct = grossInvested > 0 ? (profitLoss / grossInvested) * 100 : 0;

      return {
        ...asset,
        current_value: currentValue,
        net_invested: netInvested,
        profit_loss: profitLoss,
        profit_loss_pct: profitLossPct,
        allocation_pct: 0,
      };
    })
    // Keep active holdings and positions that still carry realized P&L.
    .filter((a) => a.current_value > 0 || Math.abs(a.net_invested) > 0);

  for (const a of assetsWithValue) {
    totalValue += a.current_value;
    allocationByType[a.type] = (allocationByType[a.type] || 0) + a.current_value;
    if (isCashType(a.type)) {
      // Cash = liquidity: counts toward net worth, NOT toward performance.
      liquidity += a.current_value;
    } else {
      investedValue += a.current_value;
      investedCapital += a.net_invested;
      investedGross += grossByAsset.get(a.id) ?? 0;
    }
  }

  for (const a of assetsWithValue) {
    a.allocation_pct = totalValue > 0 ? (a.current_value / totalValue) * 100 : 0;
  }

  const totalProfitLoss = investedValue - investedCapital;
  const totalProfitLossPct =
    investedGross > 0 ? (totalProfitLoss / investedGross) * 100 : 0;

  return Response.json({
    data: {
      total_value: totalValue,
      total_invested: investedCapital,
      liquidity,
      total_profit_loss: totalProfitLoss,
      total_profit_loss_pct: totalProfitLossPct,
      dolar_blue: blue,
      assets: assetsWithValue.sort((a, b) => b.current_value - a.current_value),
      allocation_by_type: allocationByType,
    },
  });
}
