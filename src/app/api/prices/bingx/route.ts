import getDb from "@/lib/db";
import { fetchBingxEquity } from "@/lib/bingx";
import { autoSnapshot } from "@/lib/snapshot";
import { numberToCents } from "@/lib/formatters";
import type { Asset } from "@/types";

function getSetting(db: ReturnType<typeof getDb>, key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

// Sync BingX futures equity into all "managed" assets (copytrading balance).
export async function POST() {
  const db = getDb();
  const apiKey = getSetting(db, "bingx_api_key");
  const apiSecret = getSetting(db, "bingx_api_secret");

  if (!apiKey || !apiSecret) {
    return Response.json(
      { error: "BingX no está configurado. Cargá tus API keys en Ajustes." },
      { status: 400 }
    );
  }

  const managed = db
    .prepare("SELECT * FROM assets WHERE type = 'managed'")
    .all() as Asset[];
  if (managed.length === 0) {
    return Response.json({ error: "No hay cuenta administrada para sincronizar" }, { status: 400 });
  }

  const result = await fetchBingxEquity(apiKey, apiSecret);
  if (result.error || result.equity == null) {
    return Response.json({ error: result.error || "Sin datos" }, { status: 502 });
  }

  const cents = numberToCents(result.equity);

  // BingX does NOT expose copytrading positions value via API (it returns 0).
  // Never overwrite the manual balance with 0 — keep what the user set.
  if (cents <= 0) {
    return Response.json({
      data: {
        equity: result.equity,
        updated: 0,
        breakdown: result.breakdown,
        message:
          "BingX no expone el saldo de copytrading vía API (devolvió 0). Se mantiene el valor manual.",
      },
    });
  }

  const stmt = db.prepare(
    "UPDATE assets SET current_price = ?, price_updated_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
  );
  for (const a of managed) stmt.run(cents, a.id);

  await autoSnapshot();

  return Response.json({ data: { equity: result.equity, updated: managed.length, breakdown: result.breakdown } });
}
