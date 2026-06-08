import { NextRequest } from "next/server";
import getDb from "@/lib/db";
import { autoSnapshot } from "@/lib/snapshot";
import { z } from "zod";

const updateAssetSchema = z.object({
  name: z.string().min(1).optional(),
  symbol: z.string().min(1).optional(),
  type: z.enum(["crypto", "fci", "managed", "plazo_fijo", "cash_usd", "cash_ars"]).optional(),
  coingecko_id: z.string().nullable().optional(),
  fund_name: z.string().nullable().optional(),
  current_price: z.number().optional(), // native cents (manual balance / valuation for box assets)
  notes: z.string().nullable().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = await getDb();
  const asset = await db.prepare("SELECT * FROM assets WHERE id = ?").get(id);
  if (!asset) return Response.json({ error: "Not found" }, { status: 404 });

  const transactions = await db
    .prepare("SELECT * FROM transactions WHERE asset_id = ? ORDER BY date DESC")
    .all(id);

  return Response.json({ data: { ...asset, transactions } });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const data = updateAssetSchema.parse(body);

    const db = await getDb();
    const existing = await db.prepare("SELECT * FROM assets WHERE id = ?").get(id);
    if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(key === "symbol" && typeof value === "string" ? value.toUpperCase() : value);
      }
    }

    if (data.current_price !== undefined) {
      fields.push("price_updated_at = datetime('now')");
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      values.push(id);
      await db.prepare(`UPDATE assets SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    }

    const updated = await db.prepare("SELECT * FROM assets WHERE id = ?").get(id);
    await autoSnapshot();
    return Response.json({ data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = await getDb();
  const existing = await db.prepare("SELECT id FROM assets WHERE id = ?").get(id);
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  // Delete children explicitly (don't rely on FK cascade persisting across
  // libSQL/Turso connections), then the asset — atomically.
  await db.batch([
    { sql: "DELETE FROM transactions WHERE asset_id = ?", args: [id] },
    { sql: "DELETE FROM price_history WHERE asset_id = ?", args: [id] },
    { sql: "DELETE FROM assets WHERE id = ?", args: [id] },
  ]);
  await autoSnapshot();
  return Response.json({ data: { deleted: true } });
}
