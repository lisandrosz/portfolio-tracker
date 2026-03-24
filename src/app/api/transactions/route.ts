import { NextRequest } from "next/server";
import getDb from "@/lib/db";
import { z } from "zod";

const createTransactionSchema = z.object({
  asset_id: z.number(),
  type: z.enum(["buy", "sell", "deposit", "withdrawal", "interest", "dividend"]),
  quantity: z.number(),
  price: z.number(), // cents
  fee: z.number().default(0),
  date: z.string(),
  notes: z.string().nullable().optional(),
});

function recalculateAsset(db: ReturnType<typeof getDb>, assetId: number) {
  const txns = db
    .prepare("SELECT * FROM transactions WHERE asset_id = ?")
    .all(assetId) as Array<{
    type: string;
    quantity: number;
    price: number;
    total: number;
  }>;

  let totalQty = 0;
  let totalCost = 0;

  for (const tx of txns) {
    totalQty += tx.quantity;
    if (["buy", "deposit", "interest", "dividend"].includes(tx.type) && tx.quantity > 0) {
      totalCost += Math.abs(tx.total);
    }
  }

  const buyQty = txns
    .filter((t) => ["buy", "deposit", "interest", "dividend"].includes(t.type) && t.quantity > 0)
    .reduce((sum, t) => sum + t.quantity, 0);

  const avgCost = buyQty > 0 ? Math.round(totalCost / buyQty) : 0;

  db.prepare(
    "UPDATE assets SET quantity = ?, avg_cost = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(Math.max(0, totalQty), avgCost, assetId);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const assetId = searchParams.get("asset_id");
  const type = searchParams.get("type");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = searchParams.get("limit") || "50";

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

    // Check asset exists
    const asset = db.prepare("SELECT * FROM assets WHERE id = ?").get(data.asset_id);
    if (!asset) return Response.json({ error: "Asset not found" }, { status: 404 });

    // For sell/withdrawal, quantity should be negative
    const qty =
      ["sell", "withdrawal"].includes(data.type)
        ? -Math.abs(data.quantity)
        : Math.abs(data.quantity);
    const total = Math.round(Math.abs(qty) * data.price);

    const result = db
      .prepare(
        `INSERT INTO transactions (asset_id, type, quantity, price, total, fee, date, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.asset_id,
        data.type,
        qty,
        data.price,
        total,
        data.fee,
        data.date,
        data.notes ?? null
      );

    recalculateAsset(db, data.asset_id);

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
