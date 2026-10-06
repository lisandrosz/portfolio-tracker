import getDb, { type SqlArg } from "./db";
import { today } from "./dates";
import { fetchDailyPrices } from "./coingecko";
import { autoSnapshot } from "./snapshot";
import {
  INFLOW_TYPES,
  OUTFLOW_TYPES,
  isDebtType,
  isPayableType,
  isNonPerformingType,
  isOffBalanceType,
} from "./constants";
import type { Asset } from "@/types";

interface Tx {
  asset_id: number;
  type: string;
  quantity: number;
  total: number;
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
 * - Terreno: skipped. It's a cuota ledger, not a holding — see isOffBalanceType.
 * - Debts (por_cobrar / por_pagar): outstanding USD balance replayed from altas
 *   and pagos; payables land in liabilities instead of value.
 * - FCI / box accounts (BingX, plazo, cash): no historical market value, so
 *   value = net invested over time plus the gain the asset had on that day, as
 *   recorded by the snapshot being replaced (carried forward across gaps). The
 *   gain is what a contribution can't change, so a backdated deposit moves the
 *   curve by the deposit and nothing else. Without it every rebuild wiped the
 *   earnings off the past and the whole lot reappeared as a cliff on today.
 *   "Today" gets live values via autoSnapshot.
 */
export async function rebuildHistory(): Promise<{ days: number }> {
  const db = await getDb();
  const assets = (await db.prepare("SELECT * FROM assets").all()) as Asset[];
  const txns = (await db
    .prepare(
      "SELECT asset_id, type, quantity, total, total_usd, date FROM transactions ORDER BY date ASC"
    )
    .all()) as Tx[];

  // No transactions left -> clear the whole history (chart goes empty).
  if (txns.length === 0) {
    await db.prepare("DELETE FROM portfolio_snapshots").run();
    return { days: 0 };
  }

  const firstDate = dateOnly(txns[0].date);
  const lastDate = today();
  const dates = enumerateDates(firstDate, lastDate);
  if (dates.length === 0) return { days: 0 };

  // Drop anything dated past today. The rebuild only upserts the days it walks,
  // so a snapshot stamped with a date that never arrived would otherwise sit on
  // the chart untouched until the calendar caught up with it. Earlier versions
  // resolved "today" in UTC, which produced exactly that between 21:00 and
  // midnight local.
  await db.prepare("DELETE FROM portfolio_snapshots WHERE date > ?").run(lastDate);

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


  // Gains recorded by the snapshots about to be replaced, by date then asset.
  const priorGains = new Map<string, Record<string, number>>();
  const prior = (await db
    .prepare("SELECT date, asset_gains FROM portfolio_snapshots WHERE asset_gains IS NOT NULL")
    .all()) as Array<{ date: string; asset_gains: string }>;
  for (const row of prior) {
    try {
      priorGains.set(row.date, JSON.parse(row.asset_gains));
    } catch {
      // A corrupt row just means no gain on record for that day.
    }
  }
  // Last known gain per asset, carried forward day by day.
  const carried = new Map<number, number>();

  const upsertSql = `INSERT INTO portfolio_snapshots (total_value, total_cost, total_liabilities, date, breakdown, asset_gains)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET total_value = ?, total_cost = ?, total_liabilities = ?, breakdown = ?, asset_gains = ?`;

  // Authoritative rebuild: drop stale rows (e.g. dates before the new earliest
  // transaction) and recompute the full range from scratch, atomically in one batch.
  const stmts: { sql: string; args: SqlArg[] }[] = [
    { sql: "DELETE FROM portfolio_snapshots", args: [] },
  ];

  for (const D of dates) {
    let totalValue = 0;
    let totalLiabilities = 0;
    let investedValue = 0;
    let investedLiabilities = 0;
    let investedCapital = 0;
    const breakdown: Record<string, number> = {};
    const assetGains: Record<number, number> = {};
    const recorded = priorGains.get(D);

    for (const a of assets) {
      if (isOffBalanceType(a.type)) continue;
      if (!isDebtType(a.type)) {
        const g = recorded?.[a.id];
        if (g != null) carried.set(a.id, g);
      }

      const ats = txByAsset.get(a.id) ?? [];
      let invested = 0;
      let qty = 0;
      let owed = 0;
      for (const t of ats) {
        if (t.date <= D) {
          if ((INFLOW_TYPES as string[]).includes(t.type)) invested += t.total_usd;
          else if ((OUTFLOW_TYPES as string[]).includes(t.type)) invested -= t.total_usd;
          qty += t.quantity;
          if (t.type === "alta") owed += t.total_usd;
          else if (t.type === "pago") owed -= t.total_usd;
        }
      }
      if (owed < 0) owed = 0;

      // Only meaningful once the asset holds something: before its first
      // transaction there is nothing for a gain to sit on.
      const held = ats.length > 0 && ats[0].date <= D;
      const withGain = () => {
        const g = held ? (carried.get(a.id) ?? 0) : 0;
        if (held) assetGains[a.id] = g;
        return invested + g;
      };

      let valueUsd: number;
      let liabilityUsd = 0;
      if (a.type === "crypto") {
        const price = cryptoPrices.get(a.id)?.get(D);
        valueUsd = price != null ? Math.round(qty * price * 100) : withGain();
      } else if (isDebtType(a.type)) {
        // Already USD, so the balance replayed from the ledger is the value —
        // no rate conversion and no historical price to look up.
        valueUsd = isPayableType(a.type) ? 0 : owed;
        if (isPayableType(a.type)) liabilityUsd = owed;
      } else {
        // FCI / box: no historical market value -> contributed capital plus the
        // gain on record.
        valueUsd = withGain();
      }
      if (valueUsd < 0) valueUsd = 0;

      totalValue += valueUsd;
      totalLiabilities += liabilityUsd;
      if (!isNonPerformingType(a.type)) {
        investedValue += valueUsd;
        investedLiabilities += liabilityUsd;
        investedCapital += invested;
      }
      if (valueUsd > 0) breakdown[a.type] = (breakdown[a.type] || 0) + valueUsd;
    }

    // Same derivation as autoSnapshot: cost is whatever makes
    // value - liabilities - cost the real gain, so moving money between
    // holdings never reads as profit.
    const gain = investedValue - investedLiabilities - investedCapital;
    const totalCost = totalValue - totalLiabilities - gain;

    const json = JSON.stringify(breakdown);
    const gainsJson = JSON.stringify(assetGains);
    stmts.push({
      sql: upsertSql,
      args: [
        totalValue,
        totalCost,
        totalLiabilities,
        D,
        json,
        gainsJson,
        totalValue,
        totalCost,
        totalLiabilities,
        json,
        gainsJson,
      ],
    });
  }

  await db.batch(stmts);

  // Overwrite today's row with live values (real box balances + current prices).
  await autoSnapshot();

  return { days: dates.length };
}
