import { NextRequest } from "next/server";
import getDb from "@/lib/db";
import { autoSnapshot } from "@/lib/snapshot";
import { getBlueForDate } from "@/lib/dolar-api";
import { recalcUnitAsset, applyBoxFlow } from "@/lib/portfolio";
import { numberToCents } from "@/lib/formatters";
import { isBoxType } from "@/lib/constants";
import type { Asset } from "@/types";
import { z } from "zod";

// All monetary fields are plain decimals in the asset's native currency.
const createTransactionSchema = z.object({
  asset_id: z.number(),
  type: z.enum(["buy", "sell", "deposit", "withdrawal"]),
  quantity: z.number().optional(), // units, for buy/sell
  price: z.number().optional(), // native per unit, for buy/sell
  amount: z.number().optional(), // native total, for deposit/withdrawal
  fee: z.number().default(0),
  date: z.string(),
  notes: z.string().nullable().optional(),
});

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const assetId = searchParams.get("asset_id");
  const type = searchParams.get("type");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = searchParams.get("limit") || "100";

  const db = getDb();
  let query =
    "SELECT t.*, a.name as asset_name, a.symbol as asset_symbol FROM transactions t JOIN assets a ON t.asset_id = a.id WHERE 1=1";
  const params: unknown[] = [];

  if (assetId) {
    query += " AND t.asset_id = ?";
    params.push(assetId);
  }
  if (type) {
    query += " AND t.type = ?";
    params.push(type);
  }
  if (from) {
    query += " AND t.date >= ?";
    params.push(from);
  }
  if (to) {
    query += " AND t.date <= ?";
    params.push(to);
  }

  query += " ORDER BY t.date DESC, t.created_at DESC LIMIT ?";
  params.push(parseInt(limit));

  const transactions = db.prepare(query).all(...params);
  return Response.json({ data: transactions });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = createTransactionSchema.parse(body);

    const db = getDb();
    const asset = db
      .prepare("SELECT * FROM assets WHERE id = ?")
      .get(data.asset_id) as Asset | undefined;
    if (!asset) return Response.json({ error: "Asset not found" }, { status: 404 });

    const box = isBoxType(asset.type);
    const feeCents = numberToCents(data.fee || 0);

    let qty = 0;
    let priceCents = 0;
    let totalNative = 0;

    if (box) {
      // deposit / withdrawal: a single amount moves in or out of the balance.
      if (data.amount == null || data.amount <= 0) {
        return Response.json({ error: "Falta el monto" }, { status: 400 });
      }
      totalNative = numberToCents(data.amount);
    } else {
      // buy / sell: quantity x price.
      if (data.quantity == null || data.quantity <= 0 || data.price == null) {
        return Response.json({ error: "Falta cantidad o precio" }, { status: 400 });
      }
      const absQty = Math.abs(data.quantity);
      priceCents = numberToCents(data.price);
      const base = Math.round(absQty * priceCents);

      if (data.type === "sell") {
        if (absQty > asset.quantity + 1e-9) {
          return Response.json(
            { error: "No podés vender más de lo que tenés" },
            { status: 400 }
          );
        }
        qty = -absQty;
        totalNative = base - feeCents;
      } else {
        qty = absQty;
        totalNative = base + feeCents;
      }
    }

    // Freeze the USD value at the transaction date.
    const blue = asset.currency === "ARS" ? await getBlueForDate(data.date) : null;
    const totalUsd =
      asset.currency === "ARS"
        ? blue && blue > 0
          ? Math.round(totalNative / blue)
          : 0
        : totalNative;

    const result = db
      .prepare(
        `INSERT INTO transactions (asset_id, type, quantity, price, total, total_usd, currency, fee, date, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.asset_id,
        data.type,
        qty,
        priceCents,
        totalNative,
        totalUsd,
        asset.currency,
        feeCents,
        data.date,
        data.notes ?? null
      );

    if (box) {
      const delta = data.type === "deposit" ? totalNative : -totalNative;
      applyBoxFlow(db, data.asset_id, delta);
    } else {
      recalcUnitAsset(db, data.asset_id);
    }

    await autoSnapshot(blue);

    const transaction = db
      .prepare(
        "SELECT t.*, a.name as asset_name, a.symbol as asset_symbol FROM transactions t JOIN assets a ON t.asset_id = a.id WHERE t.id = ?"
      )
      .get(result.lastInsertRowid);

    return Response.json({ data: transaction }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
