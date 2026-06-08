export const ASSET_TYPES = {
  crypto: "Cripto",
  fci: "Fondo FCI",
  managed: "Cuenta administrada",
  plazo_fijo: "Plazo Fijo",
  cash_usd: "Efectivo USD",
  cash_ars: "Efectivo ARS",
} as const;

export type AssetType = keyof typeof ASSET_TYPES;

// "unit" assets track quantity x auto-fetched price.
// "box" assets track a single balance that grows with gains.
export const UNIT_TYPES: AssetType[] = ["crypto", "fci"];
export const BOX_TYPES: AssetType[] = ["managed", "plazo_fijo", "cash_usd", "cash_ars"];

export function isBoxType(type: string): boolean {
  return (BOX_TYPES as string[]).includes(type);
}

// Cash / liquidity: counts toward net worth but NOT toward invested capital or
// performance (standard "cash drag" handling).
export const CASH_TYPES: AssetType[] = ["cash_usd", "cash_ars"];

export function isCashType(type: string): boolean {
  return (CASH_TYPES as string[]).includes(type);
}

// Native currency of each asset type (used for blue conversion to USD).
export const ASSET_CURRENCY: Record<AssetType, "USD" | "ARS"> = {
  crypto: "USD",
  fci: "ARS",
  managed: "USD",
  plazo_fijo: "ARS",
  cash_usd: "USD",
  cash_ars: "ARS",
};

export const TRANSACTION_TYPES = {
  buy: "Compra",
  sell: "Venta",
  deposit: "Aporte",
  withdrawal: "Retiro",
} as const;

export type TransactionType = keyof typeof TRANSACTION_TYPES;

// Money that enters (+) or leaves (-) a holding. Used for net invested capital.
export const INFLOW_TYPES: TransactionType[] = ["buy", "deposit"];
export const OUTFLOW_TYPES: TransactionType[] = ["sell", "withdrawal"];

export const PERIODS = {
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
  ALL: 9999,
} as const;

export type Period = keyof typeof PERIODS;

export const POPULAR_CRYPTOS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  ADA: "cardano",
  DOT: "polkadot",
  MATIC: "matic-network",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  UNI: "uniswap",
  ATOM: "cosmos",
  XRP: "ripple",
  DOGE: "dogecoin",
  USDT: "tether",
  USDC: "usd-coin",
};
