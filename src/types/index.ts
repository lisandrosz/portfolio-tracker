import type { AssetType, TransactionType } from "@/lib/constants";

export interface Asset {
  id: number;
  name: string;
  symbol: string;
  type: AssetType;
  coingecko_id: string | null;
  fund_name: string | null; // ArgentinaDatos fund name for FCI auto-pricing
  group_name: string | null; // roll-up label (e.g. several BingX strategies under one heading)
  currency: "USD" | "ARS"; // native currency of current_price / balance
  quantity: number; // units (unit assets) or 1 (box assets)
  avg_cost: number; // USD cents per unit (informational)
  current_price: number; // native-currency cents: price per unit, balance for box assets, or cuotas paid for installment assets
  change_24h: number | null; // 24h % change (crypto only)
  // Installment assets (terreno) only:
  purchase_total: number; // native cents — agreed total price
  purchase_total_usd: number; // USD cents — appraised value, FROZEN at the purchase-day rate
  installments_total: number; // number of cuotas agreed (0 = not tracked)
  price_updated_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetWithValue extends Asset {
  current_value: number; // USD cents
  liability: number; // USD cents — debt still owed (installment assets; 0 for everything else)
  equity: number; // USD cents (current_value - liability)
  installments_paid: number; // count of cuotas paid (installment assets; 0 otherwise)
  net_invested: number; // USD cents (deposits/buys - withdrawals/sells)
  gross_invested: number; // USD cents (sum of inflows only — % denominator)
  profit_loss: number; // USD cents (equity - net_invested)
  profit_loss_pct: number; // percentage
  allocation_pct: number; // percentage of total portfolio
}

/**
 * Derived figures for an installment asset (terreno).
 * The USD amounts split into two kinds, and the difference is the whole point:
 * anything "paid" sums the per-transaction FROZEN total_usd, while anything
 * "remaining" is converted at today's rate.
 */
export interface InstallmentStats {
  value: number; // USD cents — frozen appraisal
  liability: number; // USD cents — remaining debt at TODAY's rate
  paidNative: number; // ARS cents — cuotas only
  paidUsd: number; // USD cents — cuotas only, frozen
  expensesNative: number; // ARS cents — administrative expenses
  expensesUsd: number; // USD cents — administrative expenses, frozen
  totalPaidNative: number; // ARS cents — cuotas + expenses
  totalPaidUsd: number; // USD cents — cuotas + expenses, frozen
  remainingNative: number; // ARS cents — agreed price - cuotas paid
  remainingUsd: number; // USD cents — remaining at today's rate
  installmentsPaid: number; // count of cuota transactions
  installmentsTotal: number; // agreed cuota count (0 = not tracked)
  progressPct: number; // percentage paid, by money
  avgFxRate: number | null; // ARS per USD actually paid on average
}

export interface Transaction {
  id: number;
  asset_id: number;
  type: TransactionType;
  quantity: number;
  price: number; // native cents per unit
  total: number; // native cents
  total_usd: number; // USD cents, frozen at transaction date — never recalculated
  fx_rate: number | null; // ARS per USD used to freeze total_usd (null for USD assets)
  fee: number; // native cents
  currency: "USD" | "ARS";
  date: string;
  notes: string | null;
  created_at: string;
  asset_name?: string;
  asset_symbol?: string;
}

export interface PortfolioSummary {
  total_value: number; // USD cents — gross assets (investments + cash), before debt
  total_liabilities: number; // USD cents — debt still owed, at today's rate
  net_worth: number; // USD cents (total_value - total_liabilities)
  total_invested: number; // USD cents — net capital in investments (excludes cash and debts)
  liquidity: number; // USD cents — cash / liquidity (excluded from performance)
  receivables: number; // USD cents — money others owe me (asset, excluded from performance)
  payables: number; // USD cents — money I owe (part of total_liabilities)
  total_profit_loss: number; // USD cents — investments only
  total_profit_loss_pct: number; // % on invested capital (excludes cash)
  dolar_blue: number | null;
  assets: AssetWithValue[];
  allocation_by_type: Record<string, number>;
}

export interface PortfolioSnapshot {
  id: number;
  total_value: number; // USD cents
  total_cost: number; // USD cents (net invested)
  total_liabilities: number; // USD cents (debt at that date's rate)
  date: string;
  breakdown: Record<string, number>;
  created_at: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}
