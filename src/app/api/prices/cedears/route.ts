import { NextRequest } from "next/server";
import getDb from "@/lib/db";
import { z } from "zod";

const updateSchema = z.object({
  prices: z.array(
    z.object({
      asset_id: z.number(),
      price: z.number(), // cents
    })
  ),
});

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { prices } = updateSchema.parse(body);

    const db = getDb();
    const today = new Date().toISOString().split("T")[0];
    let updated = 0;

    const updateStmt = db.prepare(
      "UPDATE assets SET current_price = ?, price_updated_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    );
    const historyStmt = db.prepare(
      "INSERT INTO price_history (asset_id, price, date) VALUES (?, ?, ?) ON CONFLICT(asset_id, date) DO UPDATE SET price = ?"
    );

    const updateAll = db.transaction(() => {
      for (const { asset_id, price } of prices) {
        updateStmt.run(price, asset_id);
        historyStmt.run(asset_id, price, today, price);
        updated++;
      }
    });

    updateAll();
    return Response.json({ data: { updated } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
