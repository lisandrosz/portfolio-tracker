import getDb, { type SqlArg } from "@/lib/db";
import { fetchCryptoPrices } from "@/lib/coingecko";
import { fetchAllFunds } from "@/lib/fci";
import { autoSnapshot } from "@/lib/snapshot";
import { numberToCents } from "@/lib/formatters";
import type { Asset } from "@/types";

export const dynamic = "force-dynamic";

/**
 * Daily cron (Vercel): refresh auto-priced assets (crypto + FCI) and store
 * today's portfolio snapshot, so the history curve advances even on days the
 * user never opens the app.
 *
 * Secured with CRON_SECRET: Vercel sends it as `Authorization: Bearer <secret>`.
 * Required in production; in local dev (no secret set) it's open for testing.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret) {
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "CRON_SECRET no configurado" }, { status: 401 });
  }

  const db = await getDb();
  const today = new Date().toISOString().split("T")[0];
  const updateSql =
    "UPDATE assets SET current_price = ?, price_updated_at = datetime('now'), updated_at = datetime('now') WHERE id = ?";
  const historySql =
    "INSERT INTO price_history (asset_id, price, date) VALUES (?, ?, ?) ON CONFLICT(asset_id, date) DO UPDATE SET price = ?";

  // 1) Crypto prices (most volatile). Failures fall back to last-known values.
  try {
    const cryptos = (await db
      .prepare("SELECT * FROM assets WHERE type = 'crypto' AND coingecko_id IS NOT NULL")
      .all()) as Asset[];
    if (cryptos.length) {
      const prices = await fetchCryptoPrices(cryptos.map((a) => a.coingecko_id!));
      if (prices) {
        const stmts: { sql: string; args: SqlArg[] }[] = [];
        for (const a of cryptos) {
          const pd = prices[a.coingecko_id!];
          if (pd?.usd) {
            const c = numberToCents(pd.usd);
            stmts.push({
              sql: "UPDATE assets SET current_price = ?, change_24h = ?, price_updated_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
              args: [c, pd.usd_24h_change ?? null, a.id],
            });
            stmts.push({ sql: historySql, args: [a.id, c, today, c] });
          }
        }
        await db.batch(stmts);
      }
    }
  } catch (e) {
    console.error("cron: crypto refresh failed", e);
  }

  // 2) FCI cuotaparte (slow-moving).
  try {
    const fcis = (await db
      .prepare("SELECT * FROM assets WHERE type = 'fci' AND fund_name IS NOT NULL")
      .all()) as Asset[];
    if (fcis.length) {
      const funds = await fetchAllFunds();
      const byName = new Map(funds.map((f) => [f.fondo, f.vcp]));
      const stmts: { sql: string; args: SqlArg[] }[] = [];
      for (const a of fcis) {
        const vcp = byName.get(a.fund_name!);
        if (vcp) {
          const c = numberToCents(vcp);
          stmts.push({ sql: updateSql, args: [c, a.id] });
          stmts.push({ sql: historySql, args: [a.id, c, today, c] });
        }
      }
      await db.batch(stmts);
    }
  } catch (e) {
    console.error("cron: fci refresh failed", e);
  }

  // 3) Store today's portfolio snapshot with the refreshed values.
  await autoSnapshot();

  return Response.json({ data: { ok: true, date: today } });
}
