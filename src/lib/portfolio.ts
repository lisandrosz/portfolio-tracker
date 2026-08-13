import type { Db } from "./db";
import { INFLOW_TYPES, OUTFLOW_TYPES } from "./constants";
import type { Asset, InstallmentStats } from "@/types";

type DB = Db;

/**
 * Convert an amount in an asset's native currency (cents) to USD cents.
 * `blue` is ARS per USD (dolar blue venta). Returns 0 if ARS and no rate.
 */
export function usdCents(
  nativeCents: number,
  currency: string,
  blue: number | null
): number {
  if (currency === "ARS") {
    return blue && blue > 0 ? Math.round(nativeCents / blue) : 0;
  }
  return nativeCents;
}

interface TxRow {
  type: string;
  quantity: number;
  total: number;
  total_usd: number;
}

/**
 * Net contributed capital for an asset, in USD cents.
 * Inflows (buy/deposit) add, outflows (sell/withdrawal) subtract.
 * total_usd already includes fees (frozen at the transaction date).
 */
export function netInvestedUsd(txns: TxRow[]): number {
  let net = 0;
  for (const t of txns) {
    if ((INFLOW_TYPES as string[]).includes(t.type)) net += t.total_usd;
    else if ((OUTFLOW_TYPES as string[]).includes(t.type)) net -= t.total_usd;
    // ignore unknown/legacy types (e.g. old interest/dividend rows)
  }
  return net;
}

/**
 * Gross capital deployed (USD cents): sum of inflows only (buys + deposits).
 * Used as the % return denominator so it stays meaningful even when you've
 * withdrawn more than you put in (net invested <= 0).
 */
export function grossInvestedUsd(txns: TxRow[]): number {
  let gross = 0;
  for (const t of txns) {
    if ((INFLOW_TYPES as string[]).includes(t.type)) gross += t.total_usd;
  }
  return gross;
}

/**
 * Recompute quantity and avg_cost for a UNIT asset (crypto / fci) from its
 * transactions. Quantity is stored signed in transactions (sells are negative).
 * Box assets keep quantity = 1 and are not touched here.
 */
export async function recalcUnitAsset(db: DB, assetId: number) {
  const txns = (await db
    .prepare("SELECT type, quantity, total, total_usd FROM transactions WHERE asset_id = ?")
    .all(assetId)) as TxRow[];

  let qty = 0;
  let buyQty = 0;
  let buyCostUsd = 0;

  for (const t of txns) {
    qty += t.quantity;
    if (t.type === "buy" && t.quantity > 0) {
      buyQty += t.quantity;
      buyCostUsd += t.total_usd;
    }
  }

  const avgCost = buyQty > 0 ? Math.round(buyCostUsd / buyQty) : 0;

  await db
    .prepare(
      "UPDATE assets SET quantity = ?, avg_cost = ?, updated_at = datetime('now') WHERE id = ?"
    )
    .run(Math.max(0, qty), avgCost, assetId);
}

/**
 * Apply a deposit/withdrawal to a BOX asset's balance (current_price), in the
 * asset's native cents. `delta` is positive for inflow, negative for outflow.
 */
export async function applyBoxFlow(db: DB, assetId: number, deltaNative: number) {
  await db
    .prepare(
      "UPDATE assets SET current_price = MAX(0, current_price + ?), price_updated_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    )
    .run(deltaNative, assetId);
}

/** Asset fields installmentStats needs. Keeps callers free to pass a full Asset. */
type InstallmentAsset = Pick<
  Asset,
  "purchase_total" | "purchase_total_usd" | "installments_total"
>;

/**
 * Derived figures for an installment asset (terreno).
 *
 * The asset is valued at `purchase_total_usd`, an appraisal FROZEN in USD at the
 * purchase-day rate, while the debt still owed is converted at TODAY's rate. That
 * split is deliberate: the land keeps its dollar value while an ARS-denominated
 * debt melts away with devaluation, which is the real economic gain.
 *
 * Everything already paid sums the per-transaction frozen `total_usd` — never a
 * fresh conversion — so the answer to "how much did this cost me in dollars"
 * cannot drift after the fact.
 */
export function installmentStats(
  asset: InstallmentAsset,
  txns: TxRow[],
  blue: number | null
): InstallmentStats {
  let paidNative = 0;
  let paidUsd = 0;
  let expensesNative = 0;
  let expensesUsd = 0;
  let installmentsPaid = 0;

  for (const t of txns) {
    if (t.type === "cuota") {
      paidNative += t.total;
      paidUsd += t.total_usd;
      installmentsPaid++;
    } else if (t.type === "gasto") {
      expensesNative += t.total;
      expensesUsd += t.total_usd;
    }
  }

  // Expenses are a real outlay but they don't buy down the debt.
  const remainingNative = Math.max(0, asset.purchase_total - paidNative);
  const totalPaidNative = paidNative + expensesNative;
  const totalPaidUsd = paidUsd + expensesUsd;

  return {
    value: asset.purchase_total_usd,
    liability: usdCents(remainingNative, "ARS", blue),
    paidNative,
    paidUsd,
    expensesNative,
    expensesUsd,
    totalPaidNative,
    totalPaidUsd,
    remainingNative,
    remainingUsd: usdCents(remainingNative, "ARS", blue),
    installmentsPaid,
    installmentsTotal: asset.installments_total,
    progressPct: asset.purchase_total > 0 ? (paidNative / asset.purchase_total) * 100 : 0,
    // Derived from the frozen totals, so it reflects the rates actually paid.
    avgFxRate: totalPaidUsd > 0 ? totalPaidNative / totalPaidUsd : null,
  };
}

/**
 * Outstanding balance of a DEBT asset (USD cents) from its ledger: altas raise
 * it, pagos settle it. Never negative — overpaying closes the debt, it doesn't
 * flip it into the other direction.
 */
export function debtBalance(txns: TxRow[]): number {
  let balance = 0;
  for (const t of txns) {
    if (t.type === "alta") balance += t.total_usd;
    else if (t.type === "pago") balance -= t.total_usd;
  }
  return Math.max(0, balance);
}

/**
 * Recompute a DEBT asset's outstanding balance from its transactions.
 * Derived rather than incremented, so deleting a mistyped payment self-heals.
 */
export async function recalcDebtAsset(db: DB, assetId: number) {
  const txns = (await db
    .prepare("SELECT type, quantity, total, total_usd FROM transactions WHERE asset_id = ?")
    .all(assetId)) as TxRow[];

  await db
    .prepare(
      "UPDATE assets SET current_price = ?, price_updated_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    )
    .run(debtBalance(txns), assetId);
}

/**
 * Recompute an INSTALLMENT asset's paid-in balance from its transactions.
 * `current_price` holds cuotas paid in native cents (expenses excluded, since
 * they don't reduce the debt). Mirrors recalcUnitAsset: derive, never increment,
 * so deleting a transaction self-heals.
 */
export async function recalcInstallmentAsset(db: DB, assetId: number) {
  const row = (await db
    .prepare(
      "SELECT COALESCE(SUM(total), 0) AS paid FROM transactions WHERE asset_id = ? AND type = 'cuota'"
    )
    .get(assetId)) as { paid: number } | undefined;

  await db
    .prepare(
      "UPDATE assets SET current_price = ?, price_updated_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    )
    .run(row?.paid ?? 0, assetId);
}
