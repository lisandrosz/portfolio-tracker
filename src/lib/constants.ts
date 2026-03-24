export const ASSET_TYPES = {
  crypto: "Crypto",
  cedear: "CEDEAR",
  plazo_fijo: "Plazo Fijo",
  cash_usd: "Cash USD",
  cash_ars: "Cash ARS",
  other: "Otro",
} as const;

export type AssetType = keyof typeof ASSET_TYPES;

export const TRANSACTION_TYPES = {
  buy: "Compra",
  sell: "Venta",
  deposit: "Deposito",
  withdrawal: "Retiro",
  interest: "Interes",
  dividend: "Dividendo",
} as const;

export type TransactionType = keyof typeof TRANSACTION_TYPES;

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
