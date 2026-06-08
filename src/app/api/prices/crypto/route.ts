import getDb from "@/lib/db";
import { fetchCryptoPrices } from "@/lib/coingecko";
import { autoSnapshot } from "@/lib/snapshot";
import { numberToCents } from "@/lib/formatters";
import type { Asset } from "@/types";

export async function POST() {
  const db = getDb();

  // Check rate limit
  const lastFetch = db
    .prepare("SELECT value FROM settings WHERE key = 'last_crypto_update'")
    .get() as { value: string } | undefined;

  if (lastFetch) {
    const elapsed = Date.now() - new Date(lastFetch.value).getTime();
    if (elapsed < 20_000) {
      // 20s cooldown (CoinGecko response is cached ~25s anyway)
      return Response.json({
        data: { updated: 0, message: "Rate limited, try again later" },
      });
    }
  }

  const cryptoAssets = db
    .prepare("SELECT * FROM assets WHERE type = 'crypto' AND coingecko_id IS NOT NULL")
    .all() as Asset[];

  if (cryptoAssets.length === 0) {
    return Response.json({ data: { updated: 0 } });
  }

  const coinIds = cryptoAssets.map((a) => a.coingecko_id!);
  const prices = await fetchCryptoPrices(coinIds);

  if (!prices) {
    return Response.json(
      { error: "Failed to fetch prices from CoinGecko" },
      { status: 502 }
    );
  }

  const today = new Date().toISOString().split("T")[0];
  let updated = 0;

  const updateStmt = db.prepare(
    "UPDATE assets SET current_price = ?, change_24h = ?, price_updated_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
  );
  const historyStmt = db.prepare(
    "INSERT INTO price_history (asset_id, price, date) VALUES (?, ?, ?) ON CONFLICT(asset_id, date) DO UPDATE SET price = ?"
  );

  const updateAll = db.transaction(() => {
    for (const asset of cryptoAssets) {
      const priceData = prices[asset.coingecko_id!];
      if (priceData?.usd) {
        const priceCents = numberToCents(priceData.usd);
        const change = priceData.usd_24h_change ?? null;
        updateStmt.run(priceCents, change, asset.id);
        historyStmt.run(asset.id, priceCents, today, priceCents);
        updated++;
      }
    }
  });

  updateAll();

  // Update last fetch timestamp
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('last_crypto_update', ?) ON CONFLICT(key) DO UPDATE SET value = ?"
  ).run(new Date().toISOString(), new Date().toISOString());

  await autoSnapshot();

  return Response.json({ data: { updated } });
}
