import getDb from "./db";

export interface DolarPrice {
  compra: number;
  venta: number;
}

/** Fetch the current dolar blue (compra/venta in ARS per USD). */
export async function fetchDolarBlue(): Promise<DolarPrice | null> {
  try {
    const res = await fetch("https://dolarapi.com/v1/dolares/blue", {
      next: { revalidate: 600 }, // cache 10 min
    });
    if (!res.ok) {
      console.error("DolarApi error:", res.status);
      return null;
    }
    const data = await res.json();
    return { compra: data.compra, venta: data.venta };
  } catch (err) {
    console.error("DolarApi fetch failed:", err);
    return null;
  }
}

/**
 * Current blue (venta) used to convert ARS -> USD across the app.
 * Caches the last known value in settings so the portfolio still renders
 * if the API is temporarily down.
 */
export async function getCurrentBlue(): Promise<number | null> {
  const db = getDb();
  const price = await fetchDolarBlue();
  if (price?.venta) {
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('dolar_blue', ?) ON CONFLICT(key) DO UPDATE SET value = ?"
    ).run(String(price.venta), String(price.venta));
    return price.venta;
  }
  const cached = db.prepare("SELECT value FROM settings WHERE key = 'dolar_blue'").get() as
    | { value: string }
    | undefined;
  return cached ? Number(cached.value) : null;
}

/**
 * Blue (venta) for a specific past date, best-effort via ArgentinaDatos.
 * Falls back to the current blue if the historical value is unavailable.
 */
export async function getBlueForDate(date: string): Promise<number | null> {
  try {
    const [y, m, d] = date.split("-");
    const res = await fetch(
      `https://api.argentinadatos.com/v1/cotizaciones/dolares/blue/${y}/${m}/${d}`,
      { next: { revalidate: 86400 } }
    );
    if (res.ok) {
      const data = await res.json();
      if (data?.venta) return data.venta;
    }
  } catch {
    /* fall through to current */
  }
  return getCurrentBlue();
}
