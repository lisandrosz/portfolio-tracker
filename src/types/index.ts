import type { AssetType, TransactionType } from "@/lib/constants";

export interface Asset {
  id: number;
  name: string;
  symbol: string;
  type: AssetType;
  coingecko_id: string | null;
  yahoo_symbol: string | null;
  quantity: number;
  avg_cost: number; // stored as cents
  current_price: number; // stored as cents
  price_updated_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetWithValue extends Asset {
  current_value: number; // quantity * current_price (cents)
  total_cost: number; // quantity * avg_cost (cents)
  profit_loss: number; // current_value - total_cost (cents)
  profit_loss_pct: number; // percentage
  allocation_pct: number; // percentage of total portfolio
}

export interface Transaction {
  id: number;
  asset_id: number;
  type: TransactionType;
  quantity: number;
  price: number; // cents
  total: number; // cents
  fee: number; // cents
  date: string;
  notes: string | null;
  created_at: string;
  asset_name?: string;
  asset_symbol?: string;
}

export interface PortfolioSummary {
  total_value: number; // cents
  total_cost: number; // cents
  total_profit_loss: number; // cents
  total_profit_loss_pct: number;
  assets: AssetWithValue[];
  allocation_by_type: Record<string, number>;
}

export interface PortfolioSnapshot {
  id: number;
  total_value: number; // cents
  date: string;
  breakdown: Record<string, number>;
  created_at: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}
