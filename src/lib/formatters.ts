export function centsToUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function centsToNumber(cents: number): number {
  return cents / 100;
}

/** A BTC amount (not cents): 0.01234567 -> "0.01234567 BTC". */
export function formatBtc(amount: number): string {
  return `${amount.toLocaleString("en-US", { maximumFractionDigits: 8 })} BTC`;
}

/**
 * Format cents in a given native currency.
 *
 * BTC never reaches here: a bitcoin balance is an amount, not cents, so it goes
 * through formatBtc. Falling back to USD keeps a stray call readable instead of
 * printing a number off by eight decimal places.
 */
export function formatMoney(cents: number, currency: "USD" | "ARS" | "BTC" = "USD"): string {
  if (currency === "ARS") {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(cents / 100);
  }
  return centsToUsd(cents);
}

export function numberToCents(value: number): number {
  return Math.round(value * 100);
}

/** ARS per USD as a plain rate (not cents): 1485.5 -> "$ 1.486". */
export function formatRate(rate: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(rate);
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatQuantity(value: number): string {
  if (value >= 1) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-AR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-AR", {
    month: "short",
    day: "numeric",
  });
}
