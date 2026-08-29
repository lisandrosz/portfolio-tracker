export const ASSET_TYPES = {
  crypto: "Cripto",
  fci: "Fondo FCI",
  terreno: "Terreno",
  managed: "Cuenta administrada",
  plazo_fijo: "Plazo Fijo",
  cash_usd: "Efectivo USD",
  cash_ars: "Efectivo ARS",
  por_cobrar: "Me deben",
  por_pagar: "Debo",
} as const;

export type AssetType = keyof typeof ASSET_TYPES;

// "unit" assets track quantity x auto-fetched price.
// "box" assets track a single balance that grows with gains.
// "installment" assets are bought in cuotas: they carry a fixed appraised value
// (frozen in USD at purchase) plus a shrinking ARS debt.
// "debt" assets are plain balances owed in either direction, settled by payments.
export const UNIT_TYPES: AssetType[] = ["crypto", "fci"];
export const BOX_TYPES: AssetType[] = ["managed", "plazo_fijo", "cash_usd", "cash_ars"];
export const INSTALLMENT_TYPES: AssetType[] = ["terreno"];
export const DEBT_TYPES: AssetType[] = ["por_cobrar", "por_pagar"];

export function isBoxType(type: string): boolean {
  return (BOX_TYPES as string[]).includes(type);
}

export function isInstallmentType(type: string): boolean {
  return (INSTALLMENT_TYPES as string[]).includes(type);
}

/** Money owed, in either direction (por_cobrar = they owe me, por_pagar = I owe). */
export function isDebtType(type: string): boolean {
  return (DEBT_TYPES as string[]).includes(type);
}

/** A debt I owe: contributes to liabilities instead of to asset value. */
export function isPayableType(type: string): boolean {
  return type === "por_pagar";
}

// Cash / liquidity: counts toward net worth but NOT toward invested capital or
// performance (standard "cash drag" handling).
export const CASH_TYPES: AssetType[] = ["cash_usd", "cash_ars"];

export function isCashType(type: string): boolean {
  return (CASH_TYPES as string[]).includes(type);
}

/**
 * Kept as a plain ledger, off the balance sheet: it records what you paid and
 * nothing else. No value, no debt, no P&L, no allocation.
 *
 * A terreno en cuotas is priced in ARS but paid with dollars bought at the
 * crypto rate, so any single conversion is wrong: valuing it swung net worth by
 * the ARS/USD spread, not by anything that happened to the land.
 */
export function isOffBalanceType(type: string): boolean {
  return isInstallmentType(type);
}

/**
 * Holdings that count toward net worth but not toward performance.
 * Cash has no return to measure; debts are USD against USD, so lending 500 and
 * being repaid 500 is a 0% "return" that would only dilute the real one.
 * Ledger-only holdings don't reach net worth either — they're here so every
 * accounting loop that filters on this predicate also skips them.
 */
export function isNonPerformingType(type: string): boolean {
  return isCashType(type) || isDebtType(type) || isOffBalanceType(type);
}

export type Currency = "USD" | "ARS" | "BTC";

/** CoinGecko id backing a BTC-denominated account. */
export const BTC_COINGECKO_ID = "bitcoin";

/**
 * Denominated in bitcoin: the balance is a BTC amount kept in `quantity`, and
 * `current_price` holds the USD price of one BTC, refreshed like any crypto.
 * Value then falls out of the same `quantity * current_price` every other asset
 * already uses.
 *
 * The balance cannot live in `current_price` the way USD and ARS balances do:
 * money is stored as integer cents, and 0.01234567 BTC does not survive that.
 * `quantity` is REAL, so it carries all eight decimals.
 */
export function isBtcDenominated(currency: string): boolean {
  return currency === "BTC";
}

/**
 * Currencies a managed account can be opened in. Copytrading margined in BTC is
 * a balance in bitcoin, not a dollar balance that happens to trade bitcoin, and
 * the two revalue differently.
 */
export const MANAGED_CURRENCIES: Currency[] = ["USD", "BTC"];

// Default currency of each asset type. Managed accounts can override it (see
// MANAGED_CURRENCIES), which is why creation takes a currency instead of always
// deriving it from the type.
export const ASSET_CURRENCY: Record<AssetType, Currency> = {
  crypto: "USD",
  fci: "ARS",
  terreno: "ARS",
  managed: "USD",
  plazo_fijo: "ARS",
  cash_usd: "USD",
  cash_ars: "ARS",
  por_cobrar: "USD",
  por_pagar: "USD",
};

export const TRANSACTION_TYPES = {
  buy: "Compra",
  sell: "Venta",
  deposit: "Aporte",
  withdrawal: "Retiro",
  cuota: "Cuota",
  gasto: "Gasto administrativo",
  alta: "Alta de deuda",
  pago: "Pago",
} as const;

export type TransactionType = keyof typeof TRANSACTION_TYPES;

// Money that enters (+) or leaves (-) a holding. Used for net invested capital.
// Cuotas and gastos are both real outlays, so both count as contributed capital;
// only cuotas pay down the debt (see installmentStats).
// `alta`/`pago` are deliberately in NEITHER list: a debt is not invested capital,
// so netInvestedUsd ignores them and the P&L of a debt stays 0.
export const INFLOW_TYPES: TransactionType[] = ["buy", "deposit", "cuota", "gasto"];
export const OUTFLOW_TYPES: TransactionType[] = ["sell", "withdrawal"];

// Debt movements: `alta` raises the outstanding balance, `pago` settles it.
// For por_cobrar that reads as "lent more" / "they paid me"; for por_pagar as
// "borrowed more" / "I paid them".
export const DEBT_UP_TYPE = "alta";
export const DEBT_DOWN_TYPE = "pago";

/**
 * Which way money moves in the account backing a debt movement. Lending more or
 * paying what you owe take money out of an account; being repaid or borrowing
 * more bring it in.
 *
 * Recording only the debt side is what makes net worth jump: cancelling a
 * receivable without banking the cash looks exactly like losing the money.
 */
export function debtCounterLegType(
  debtType: string,
  movement: string
): "deposit" | "withdrawal" {
  const inflow = isPayableType(debtType)
    ? movement === DEBT_UP_TYPE
    : movement === DEBT_DOWN_TYPE;
  return inflow ? "deposit" : "withdrawal";
}

/** Note left on the account leg, so the movement reads on its own in the list. */
export function debtCounterLegNote(
  debtType: string,
  movement: string,
  name: string
): string {
  if (isPayableType(debtType)) {
    return movement === DEBT_UP_TYPE ? `Préstamo recibido de ${name}` : `Pago a ${name}`;
  }
  return movement === DEBT_UP_TYPE ? `Préstamo a ${name}` : `Cobro de ${name}`;
}

export const PERIODS = {
  "1W": 7,
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
