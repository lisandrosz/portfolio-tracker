import type { Db } from "./db";
import { INFLOW_TYPES, OUTFLOW_TYPES } from "./constants";

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
