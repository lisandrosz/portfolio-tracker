import getDb from "./db";
import { today } from "./dates";

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

const MANUAL_RATE_KEY = "usd_rate_manual";

/**
 * Hand-set ARS per USD, or null when the app follows the published blue.
 *
 * The blue is a quote for buying notes on the street; it is not necessarily the
 * rate this portfolio actually transacts at (dollars bought against crypto run a
 * couple of points off it). Converting pesos at a rate you never got quietly
 * misstates every ARS holding, so the rate is something you can set.
 */
export async function getManualRate(): Promise<number | null> {
  const db = await getDb();
  const row = (await db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(MANUAL_RATE_KEY)) as { value: string } | undefined;
  const rate = row ? Number(row.value) : NaN;
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/** Set the manual rate, or pass null to go back to following the blue. */
export async function setManualRate(rate: number | null): Promise<void> {
  const db = await getDb();
  if (rate == null) {
    await db.prepare("DELETE FROM settings WHERE key = ?").run(MANUAL_RATE_KEY);
    return;
  }
  const value = String(rate);
  await db
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?"
    )
    .run(MANUAL_RATE_KEY, value, value);
}

export interface UsdRate {
  rate: number | null; // effective ARS per USD — what conversions actually use
  blue: number | null; // published blue, kept for reference/comparison
  manual: number | null; // the override, when one is set
  source: "manual" | "blue";
}

/**
 * The rate the app converts ARS at today, plus where it came from.
 *
 * The blue is fetched even when an override is set: the UI shows both so the
 * override can be judged against the market instead of drifting unnoticed.
 */
export async function getUsdRate(): Promise<UsdRate> {
  const [manual, blue] = await Promise.all([getManualRate(), getCurrentBlue()]);
  return {
    rate: manual ?? blue,
    blue,
    manual,
    source: manual != null ? "manual" : "blue",
  };
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
 * ARS per USD to freeze a transaction dated `date` at, best-effort.
 *
 * Today (or later) resolves to the effective rate, so a manual override applies
 * to what you load now — that override IS "the rate I am getting today". Past
 * dates always resolve to the blue actually published then: a rate typed today
 * says nothing about a payment made in March, and a transaction's frozen USD is
 * never recomputed, so guessing there would be permanent.
 *
 * Order matters for the past too. ArgentinaDatos publishes with a lag, so the
 * per-day endpoint 404s for recent days; the series is the fallback, walked back
 * to the last quoted day for weekends and holidays.
 */
export async function getRateForDate(date: string): Promise<number | null> {
  if (date >= today()) return (await getUsdRate()).rate;

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

  // Nothing historical available. Stay on the published blue rather than the
  // override: a hand-set rate describes today, not the day being backfilled.
  return getCurrentBlue();
}
