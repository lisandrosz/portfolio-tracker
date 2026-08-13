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
  const db = await getDb();
  const price = await fetchDolarBlue();
  if (price?.venta) {
    await db
      .prepare(
        "INSERT INTO settings (key, value) VALUES ('dolar_blue', ?) ON CONFLICT(key) DO UPDATE SET value = ?"
      )
      .run(String(price.venta), String(price.venta));
    return price.venta;
  }
  const cached = (await db
    .prepare("SELECT value FROM settings WHERE key = 'dolar_blue'")
    .get()) as { value: string } | undefined;
  return cached ? Number(cached.value) : null;
}

/**
 * Full daily blue series (venta) keyed by YYYY-MM-DD, in one request.
 * Gaps are forward-filled from the last quoted day, so weekends and holidays
 * resolve to the previous business day instead of falling through to today.
 */
export async function fetchBlueSeries(): Promise<Map<string, number> | null> {
  try {
    const res = await fetch("https://api.argentinadatos.com/v1/cotizaciones/dolares/blue", {
      next: { revalidate: 86400 },
    });
    if (!res.ok) {
      console.error("ArgentinaDatos blue series error:", res.status);
      return null;
    }
    const rows = (await res.json()) as Array<{ fecha: string; venta: number }>;
    if (!Array.isArray(rows) || rows.length === 0) return null;

    const series = new Map<string, number>();
    for (const r of rows) {
      if (r?.fecha && r?.venta) series.set(r.fecha, r.venta);
    }
    return series;
  } catch (err) {
    console.error("ArgentinaDatos blue series fetch failed:", err);
    return null;
  }
}

/**
 * Look a date up in a series, walking back to the last quoted day (weekends,
 * holidays). Gives up after 10 days rather than scanning the whole history.
 */
export function blueFromSeries(series: Map<string, number>, date: string): number | null {
  const d = new Date(`${date}T00:00:00Z`);
  for (let i = 0; i < 10; i++) {
    const key = d.toISOString().split("T")[0];
    const hit = series.get(key);
    if (hit) return hit;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return null;
}

/**
 * Blue (venta) for a specific date, best-effort via ArgentinaDatos.
 *
 * Order matters, and it differs for today vs the past. ArgentinaDatos publishes
 * with a lag, so the per-day endpoint 404s for today — for today (or a future
 * date) the live rate is the right answer, and reaching into the series would
 * freeze the payment at yesterday's close instead. For past dates the series is
 * the correct fallback, since the live rate has nothing to do with them.
 *
 * This matters permanently: a transaction's frozen USD is never recomputed.
 */
export async function getBlueForDate(date: string): Promise<number | null> {
  const today = new Date().toISOString().split("T")[0];
  if (date >= today) return getCurrentBlue();

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
    /* fall through to the series */
  }

  // Gaps in the per-day endpoint: walk back to the last quoted day.
  const series = await fetchBlueSeries();
  if (series) {
    const nearby = blueFromSeries(series, date);
    if (nearby) return nearby;
  }

  return getCurrentBlue();
}
