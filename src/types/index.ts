import type { AssetType, TransactionType } from "@/lib/constants";

export interface Asset {
  id: number;
  name: string;
  symbol: string;
  type: AssetType;
  coingecko_id: string | null;
  fund_name: string | null; // ArgentinaDatos fund name for FCI auto-pricing
  currency: "USD" | "ARS"; // native currency of current_price / balance
  quantity: number; // units (unit assets) or 1 (box assets)
  avg_cost: number; // USD cents per unit (informational)
  current_price: number; // native-currency cents: price per unit, or balance for box assets
  change_24h: number | null; // 24h % change (crypto only)
  price_updated_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetWithValue extends Asset {
  current_value: number; // USD cents
  net_invested: number; // USD cents (deposits/buys - withdrawals/sells)
  profit_loss: number; // USD cents (current_value - net_invested)
  profit_loss_pct: number; // percentage
  allocation_pct: number; // percentage of total portfolio
}

export interface Transaction {
  id: number;
  asset_id: number;
  type: TransactionType;
  quantity: number;
  price: number; // native cents per unit
  total: number; // native cents
  total_usd: number; // USD cents, frozen at transaction date
  fee: number; // native cents
  currency: "USD" | "ARS";
  date: string;
  notes: string | null;
  created_at: string;
  asset_name?: string;
  asset_symbol?: string;
}

export interface PortfolioSummary {
  total_value: number; // USD cents — net worth (investments + cash)
  total_invested: number; // USD cents — net capital in investments (excludes cash)
  liquidity: number; // USD cents — cash / liquidity (excluded from performance)
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
  date: string;
  breakdown: Record<string, number>;
  created_at: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}
