import { NextRequest } from "next/server";
import getDb from "@/lib/db";
import { autoSnapshot } from "@/lib/snapshot";
import { z } from "zod";

const createAssetSchema = z.object({
  name: z.string().min(1),
  symbol: z.string().min(1),
  type: z.enum(["crypto", "cedear", "plazo_fijo", "cash_usd", "cash_ars", "other"]),
  coingecko_id: z.string().nullable().optional(),
  yahoo_symbol: z.string().nullable().optional(),
  quantity: z.number().default(0),
  current_price: z.number().default(0), // in cents
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

    // Check if asset with same symbol and type already exists
    const existing = db
      .prepare("SELECT * FROM assets WHERE symbol = ? AND type = ?")
      .get(symbol, data.type) as { id: number; quantity: number; current_price: number } | undefined;

    let assetId: number;

    if (existing) {
      // Add to existing asset
      assetId = existing.id;

      // Update current price if provided
      if (data.current_price > 0) {
        db.prepare(
          "UPDATE assets SET current_price = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(data.current_price, assetId);
      }
    } else {
      // Create new asset
      const result = db
        .prepare(
          `INSERT INTO assets (name, symbol, type, coingecko_id, yahoo_symbol, quantity, current_price, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          data.name,
          symbol,
          data.type,
          data.coingecko_id ?? null,
          data.yahoo_symbol ?? null,
          data.quantity,
          data.current_price,
          data.notes ?? null,
          data.date ? `${data.date}T00:00:00` : new Date().toISOString()
        );

      assetId = result.lastInsertRowid as number;
    }

    // Auto-create a buy transaction if quantity > 0
    if (data.quantity > 0 && data.current_price > 0) {
      const total = Math.round(data.quantity * data.current_price);
      const txDate = data.date || new Date().toISOString().split("T")[0];

      db.prepare(
        `INSERT INTO transactions (asset_id, type, quantity, price, total, fee, date, notes)
         VALUES (?, 'buy', ?, ?, ?, 0, ?, ?)`
      ).run(
        assetId,
        data.quantity,
        data.current_price,
        total,
        txDate,
        data.notes || "Compra inicial"
      );

      // Recalculate quantity and avg_cost from all transactions
      const txns = db
        .prepare("SELECT * FROM transactions WHERE asset_id = ?")
        .all(assetId) as Array<{ type: string; quantity: number; price: number; total: number }>;

      let totalQty = 0;
      let totalCost = 0;
      let buyQty = 0;

      for (const tx of txns) {
        totalQty += tx.quantity;
        if (["buy", "deposit", "interest", "dividend"].includes(tx.type) && tx.quantity > 0) {
          totalCost += Math.abs(tx.total);
          buyQty += tx.quantity;
        }
      }

      const avgCost = buyQty > 0 ? Math.round(totalCost / buyQty) : 0;

      db.prepare(
        "UPDATE assets SET quantity = ?, avg_cost = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(Math.max(0, totalQty), avgCost, assetId);
    }

    const asset = db
      .prepare("SELECT * FROM assets WHERE id = ?")
      .get(assetId);

    autoSnapshot();

    return Response.json({ data: asset }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
