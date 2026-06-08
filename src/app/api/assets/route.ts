import { NextRequest } from "next/server";
import getDb from "@/lib/db";
import { autoSnapshot } from "@/lib/snapshot";
import { getBlueForDate } from "@/lib/dolar-api";
import { recalcUnitAsset, applyBoxFlow } from "@/lib/portfolio";
import { numberToCents } from "@/lib/formatters";
import { isBoxType, ASSET_CURRENCY, type AssetType } from "@/lib/constants";
import type { Asset } from "@/types";
import { z } from "zod";

const createAssetSchema = z.object({
  name: z.string().min(1),
  symbol: z.string().min(1),
  type: z.enum(["crypto", "fci", "managed", "plazo_fijo", "cash_usd", "cash_ars"]),
  coingecko_id: z.string().nullable().optional(),
  fund_name: z.string().nullable().optional(),
  quantity: z.number().default(0), // units (unit assets)
  price: z.number().default(0), // native: price per unit, or opening balance (box)
  date: z.string().optional(),
  notes: z.string().nullable().optional(),
});

export async function GET() {
  const db = getDb();
  const assets = db.prepare("SELECT * FROM assets ORDER BY type, name").all();
  return Response.json({ data: assets });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = createAssetSchema.parse(body);

    const db = getDb();
    const symbol = data.symbol.toUpperCase();
    const type = data.type as AssetType;
    const currency = ASSET_CURRENCY[type];
    const box = isBoxType(type);
    const priceCents = numberToCents(data.price || 0);
    const date = data.date || new Date().toISOString().split("T")[0];

    const existing = db
      .prepare("SELECT * FROM assets WHERE symbol = ? AND type = ?")
      .get(symbol, type) as Asset | undefined;

    let assetId: number;
    if (existing) {
      assetId = existing.id;
      // For unit assets keep the latest market price up to date.
      if (!box && priceCents > 0) {
        db.prepare(
          "UPDATE assets SET current_price = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(priceCents, assetId);
      }
    } else {
      const result = db
        .prepare(
          `INSERT INTO assets (name, symbol, type, coingecko_id, fund_name, currency, quantity, current_price, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          data.name,
          symbol,
          type,
          type === "crypto" ? data.coingecko_id ?? null : null,
          type === "fci" ? data.fund_name ?? null : null,
          currency,
          box ? 1 : 0,
          box ? priceCents : priceCents, // box: opening balance; unit: current price
          data.notes ?? null,
          `${date}T00:00:00`
        );
      assetId = result.lastInsertRowid as number;
    }

    // Freeze USD value of the opening transaction.
    const blue = currency === "ARS" ? await getBlueForDate(date) : null;
    const toUsd = (native: number) =>
      currency === "ARS" ? (blue && blue > 0 ? Math.round(native / blue) : 0) : native;

    if (box && data.price > 0) {
      // Opening contribution (deposit).
      const totalNative = priceCents;
      db.prepare(
        `INSERT INTO transactions (asset_id, type, quantity, price, total, total_usd, currency, fee, date, notes)
         VALUES (?, 'deposit', 0, 0, ?, ?, ?, 0, ?, ?)`
      ).run(assetId, totalNative, toUsd(totalNative), currency, date, data.notes || "Saldo inicial");
      // New asset already has the balance set; existing one must be bumped.
      if (existing) applyBoxFlow(db, assetId, totalNative);
    } else if (!box && data.quantity > 0 && data.price > 0) {
      // Opening buy.
      const totalNative = Math.round(data.quantity * priceCents);
      db.prepare(
        `INSERT INTO transactions (asset_id, type, quantity, price, total, total_usd, currency, fee, date, notes)
         VALUES (?, 'buy', ?, ?, ?, ?, ?, 0, ?, ?)`
      ).run(
        assetId,
        data.quantity,
        priceCents,
        totalNative,
        toUsd(totalNative),
        currency,
        date,
        data.notes || "Compra inicial"
      );
      recalcUnitAsset(db, assetId);
    }

    const asset = db.prepare("SELECT * FROM assets WHERE id = ?").get(assetId);
    await autoSnapshot(blue);

    return Response.json({ data: asset }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
