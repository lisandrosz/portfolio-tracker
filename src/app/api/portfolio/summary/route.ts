import getDb from "@/lib/db";
import { getUsdRate } from "@/lib/dolar-api";
import { usdCents, netInvestedUsd, grossInvestedUsd, installmentStats } from "@/lib/portfolio";
import {
  isBoxType,
  isCashType,
  isInstallmentType,
  isDebtType,
  isPayableType,
  isNonPerformingType,
  isOffBalanceType,
} from "@/lib/constants";
import type { Asset } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getDb();
  // `blue` is whatever ARS converts at right now — the published blue, or the
  // manual override when one is set.
  const { rate: blue, blue: publishedBlue, source: rateSource } = await getUsdRate();

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

  let totalValue = 0; // gross assets (investments + cash), before debt
  let totalLiabilities = 0; // debt still owed, at today's rate
  let liquidity = 0; // cash only
  let receivables = 0; // money others owe me
  let payables = 0; // money I owe (a subset of totalLiabilities)
  let investedValue = 0; // non-cash value
  let investedLiabilities = 0; // non-cash debt
  let investedCapital = 0; // non-cash net invested
  let investedGross = 0; // non-cash gross invested (for %)
  const allocationByType: Record<string, number> = {};

  const assetsWithValue = assets
    .map((asset) => {
      let currentValue: number;
      let liability = 0;
      let installmentsPaid = 0;

      if (isInstallmentType(asset.type)) {
        // Ledger only: no value and no debt, so the terreno can't move net worth
        // in either direction. The row still carries what has been paid.
        const stats = installmentStats(asset, grouped.get(asset.id) ?? []);
        currentValue = 0;
        installmentsPaid = stats.installmentsPaid;
      } else if (isDebtType(asset.type)) {
        // current_price is the outstanding balance, derived from the ledger.
        // Which side of the balance sheet it lands on is the only difference.
        if (isPayableType(asset.type)) liability = asset.current_price;
        currentValue = isPayableType(asset.type) ? 0 : asset.current_price;
      } else {
        const nativeValue = Math.round(asset.quantity * asset.current_price);
        currentValue = usdCents(nativeValue, asset.currency, blue);
      }

      // Debts carry no invested capital and no return: USD lent against USD
      // repaid. Reporting a P&L for them would be noise.
      const netInvested = isDebtType(asset.type) ? 0 : investedByAsset.get(asset.id) ?? 0;
      const grossInvested = isDebtType(asset.type) ? 0 : grossByAsset.get(asset.id) ?? 0;
      const equity = currentValue - liability;
      // Ledger-only holdings report no gain either: net_invested is what they
      // have cost so far, and there is no value to measure it against.
      const profitLoss =
        isDebtType(asset.type) || isOffBalanceType(asset.type) ? 0 : equity - netInvested;
      // % return is on gross capital deployed, so it stays correct even after
      // withdrawing more than was put in (net invested <= 0).
      const profitLossPct = grossInvested > 0 ? (profitLoss / grossInvested) * 100 : 0;

      return {
        ...asset,
        current_value: currentValue,
        liability,
        equity,
        installments_paid: installmentsPaid,
        net_invested: netInvested,
        gross_invested: grossInvested,
        profit_loss: profitLoss,
        profit_loss_pct: profitLossPct,
        allocation_pct: 0,
      };
    })
    // Keep active holdings and positions that still carry realized P&L or debt.
    //
    // Accounts and ledger-only rows always stay, whatever their balance. An
    // account is something you keep, not a position that closes: one opened with
    // no money in it yet has to be visible to load movements into, and one you
    // emptied should read as $0.00 rather than silently disappear. Same reason a
    // terreno with no cuota paid yet stays on screen.
    .filter(
      (a) =>
        isOffBalanceType(a.type) ||
        isBoxType(a.type) ||
        a.current_value > 0 ||
        a.liability > 0 ||
        Math.abs(a.net_invested) > 0
    );

  for (const a of assetsWithValue) {
    // Off the balance sheet entirely: no total, no allocation slice.
    if (isOffBalanceType(a.type)) continue;
    totalValue += a.current_value;
    totalLiabilities += a.liability;
    allocationByType[a.type] = (allocationByType[a.type] || 0) + a.current_value;
    if (isCashType(a.type)) liquidity += a.current_value;
    if (isDebtType(a.type)) {
      if (isPayableType(a.type)) payables += a.liability;
      else receivables += a.current_value;
    }
    // Cash and debts count toward net worth but not toward performance.
    if (!isNonPerformingType(a.type)) {
      investedValue += a.current_value;
      investedLiabilities += a.liability;
      investedCapital += a.net_invested;
      investedGross += grossByAsset.get(a.id) ?? 0;
    }
  }

  for (const a of assetsWithValue) {
    a.allocation_pct = totalValue > 0 ? (a.current_value / totalValue) * 100 : 0;
  }

  const totalProfitLoss = investedValue - investedLiabilities - investedCapital;
  const totalProfitLossPct =
    investedGross > 0 ? (totalProfitLoss / investedGross) * 100 : 0;

  return Response.json({
    data: {
      total_value: totalValue,
      total_liabilities: totalLiabilities,
      net_worth: totalValue - totalLiabilities,
      total_invested: investedCapital,
      liquidity,
      receivables,
      payables,
      total_profit_loss: totalProfitLoss,
      total_profit_loss_pct: totalProfitLossPct,
      dolar_blue: publishedBlue,
      usd_rate: blue,
      usd_rate_source: rateSource,
      assets: assetsWithValue.sort((a, b) => b.current_value - a.current_value),
      allocation_by_type: allocationByType,
    },
  });
}
