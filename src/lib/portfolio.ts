import type { Db } from "./db";
import {
  INFLOW_TYPES,
  OUTFLOW_TYPES,
  isBoxType,
  debtCounterLegType,
  debtCounterLegNote,
} from "./constants";
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
 * A pure record of what has been paid: ARS actually handed over, plus the USD
 * each payment cost, summed from the per-transaction frozen `total_usd` — never
 * a fresh conversion. So the answer to "how much did this cost me in dollars"
 * cannot drift after the fact.
 *
 * Nothing here is converted at today's rate, on purpose. The lot is priced in
 * ARS but paid with dollars bought at the crypto rate, so any live conversion
 * moved the numbers with the ARS/USD spread instead of with the deal.
 */
export function installmentStats(
  asset: InstallmentAsset,
  txns: TxRow[]
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
    paidNative,
    paidUsd,
    expensesNative,
    expensesUsd,
    totalPaidNative,
    totalPaidUsd,
    remainingNative,
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
 * Reject an account that can't back a debt movement honestly.
 *
 * Cross-currency is refused rather than converted at an invented rate — the same
 * rule transfers follow. Load a withdrawal and a deposit by hand instead.
 */
export function counterAccountError(
  counter: Asset | undefined,
  debtCurrency: string
): string | null {
  if (!counter) return "Cuenta no encontrada";
  if (!isBoxType(counter.type))
    return "La contrapartida tiene que ser una cuenta de saldo (administrada, plazo fijo, efectivo)";
  if (counter.currency !== debtCurrency)
    return `${counter.symbol} está en ${counter.currency} y la deuda en ${debtCurrency}. Cargá el movimiento de la cuenta por separado.`;
  return null;
}

/**
 * Write the account side of a debt movement: the money that actually left or
 * entered one of your balances, paired to the debt leg by `linkId` so deleting
 * either one takes both.
 *
 * Both legs share the frozen USD value. They can: counterAccountError has
 * already ruled out a currency mismatch, so the debt's amount IS the account's
 * amount, and net worth doesn't move on a settlement — which is the whole point.
 */
export async function writeDebtCounterLeg(
  db: DB,
  opts: {
    debt: Pick<Asset, "type" | "name">;
    counter: Asset;
    movement: string; // alta | pago
    totalNative: number;
    totalUsd: number;
    rate: number | null;
    date: string;
    linkId: string;
    notes?: string | null;
  }
) {
  const legType = debtCounterLegType(opts.debt.type, opts.movement);
  await db
    .prepare(
      `INSERT INTO transactions (asset_id, type, quantity, price, total, total_usd, fx_rate, currency, fee, date, notes, link_id)
       VALUES (?, ?, 0, 0, ?, ?, ?, ?, 0, ?, ?, ?)`
    )
    .run(
      opts.counter.id,
      legType,
      opts.totalNative,
      opts.totalUsd,
      opts.rate,
      opts.counter.currency,
      opts.date,
      opts.notes || debtCounterLegNote(opts.debt.type, opts.movement, opts.debt.name),
      opts.linkId
    );
  await applyBoxFlow(db, opts.counter.id, legType === "deposit" ? opts.totalNative : -opts.totalNative);
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
