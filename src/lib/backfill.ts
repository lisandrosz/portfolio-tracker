import getDb from "./db";
import { fetchDailyPrices } from "./coingecko";
import { autoSnapshot } from "./snapshot";
import { INFLOW_TYPES, OUTFLOW_TYPES } from "./constants";
import type { Asset } from "@/types";

interface Tx {
  asset_id: number;
  type: string;
  quantity: number;
  total_usd: number;
  date: string;
}

function dateOnly(d: string): string {
  return d.split("T")[0];
}

/** Inclusive list of YYYY-MM-DD strings from `from` to `to`. */
function enumerateDates(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  let guard = 0;
  while (cur <= end && guard < 4000) {
    out.push(cur.toISOString().split("T")[0]);
    cur.setUTCDate(cur.getUTCDate() + 1);
    guard++;
  }
  return out;
}

/**
 * Rebuild daily portfolio snapshots from transaction history.
 * - Crypto: real historical USD prices (CoinGecko daily series).
 * - FCI / box accounts (BingX, plazo, cash): value = net invested over time
 *   (no historical market value available; "today" gets live values via autoSnapshot).
 */
export async function rebuildHistory(): Promise<{ days: number }> {
  const db = getDb();
  const assets = db.prepare("SELECT * FROM assets").all() as Asset[];
  const txns = db
    .prepare("SELECT asset_id, type, quantity, total_usd, date FROM transactions ORDER BY date ASC")
    .all() as Tx[];

  // No transactions left -> clear the whole history (chart goes empty).
  if (txns.length === 0) {
    db.prepare("DELETE FROM portfolio_snapshots").run();
    return { days: 0 };
  }

  const firstDate = dateOnly(txns[0].date);
  const today = new Date().toISOString().split("T")[0];
  const dates = enumerateDates(firstDate, today);
  if (dates.length === 0) return { days: 0 };

  // Group transactions by asset (already date-sorted).
  const txByAsset = new Map<number, Tx[]>();
  for (const t of txns) {
    if (!txByAsset.has(t.asset_id)) txByAsset.set(t.asset_id, []);
    txByAsset.get(t.asset_id)!.push({ ...t, date: dateOnly(t.date) });
  }

  // Pre-fetch & forward-fill daily USD prices for each crypto asset.
  const cryptoPrices = new Map<number, Map<string, number>>();
  for (const a of assets) {
    if (a.type === "crypto" && a.coingecko_id) {
      const raw = await fetchDailyPrices(a.coingecko_id, firstDate);
      const filled = new Map<string, number>();
      let last = 0;
      for (const d of dates) {
        if (raw.has(d)) last = raw.get(d)!;
        if (last > 0) filled.set(d, last);
      }
      cryptoPrices.set(a.id, filled);
    }
  }

  const upsert = db.prepare(
    `INSERT INTO portfolio_snapshots (total_value, total_cost, date, breakdown)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET total_value = ?, total_cost = ?, breakdown = ?`
  );

  const run = db.transaction(() => {
    // Authoritative rebuild: drop stale rows (e.g. dates before the new
    // earliest transaction) and recompute the full range from scratch.
    db.prepare("DELETE FROM portfolio_snapshots").run();
    for (const D of dates) {
      let totalValue = 0;
      let totalCost = 0;
      const breakdown: Record<string, number> = {};

      for (const a of assets) {
        const ats = txByAsset.get(a.id) ?? [];
        let invested = 0;
        let qty = 0;
        for (const t of ats) {
          if (t.date <= D) {
            if ((INFLOW_TYPES as string[]).includes(t.type)) invested += t.total_usd;
            else if ((OUTFLOW_TYPES as string[]).includes(t.type)) invested -= t.total_usd;
            qty += t.quantity;
          }
        }

        let valueUsd: number;
        if (a.type === "crypto") {
          const price = cryptoPrices.get(a.id)?.get(D);
          valueUsd = price != null ? Math.round(qty * price * 100) : invested;
        } else {
          // FCI / box: no historical market value -> track contributed capital.
          valueUsd = invested;
        }
        if (valueUsd < 0) valueUsd = 0;

        totalValue += valueUsd;
        totalCost += invested;
        if (valueUsd > 0) breakdown[a.type] = (breakdown[a.type] || 0) + valueUsd;
      }

      const json = JSON.stringify(breakdown);
      upsert.run(totalValue, totalCost, D, json, totalValue, totalCost, json);
    }
  });
  run();

  // Overwrite today's row with live values (real box balances + current prices).
  await autoSnapshot();

  return { days: dates.length };
}
