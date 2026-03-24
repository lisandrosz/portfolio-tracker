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

export function numberToCents(value: number): number {
  return Math.round(value * 100);
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
