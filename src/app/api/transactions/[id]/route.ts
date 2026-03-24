import { NextRequest } from "next/server";
import getDb from "@/lib/db";
import { autoSnapshot } from "@/lib/snapshot";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const tx = db.prepare("SELECT * FROM transactions WHERE id = ?").get(id) as
    | { asset_id: number }
    | undefined;
  if (!tx) return Response.json({ error: "Not found" }, { status: 404 });

  db.prepare("DELETE FROM transactions WHERE id = ?").run(id);

  // Recalculate asset
  const txns = db
    .prepare("SELECT * FROM transactions WHERE asset_id = ?")
    .all(tx.asset_id) as Array<{
    type: string;
    quantity: number;
    total: number;
    fee: number;
  }>;

  let totalQty = 0;
  let totalCost = 0;
  let buyQty = 0;

  for (const t of txns) {
    totalQty += t.quantity;
    if (["buy", "deposit"].includes(t.type) && t.quantity > 0) {
      totalCost += Math.abs(t.total) + (t.fee || 0);
      buyQty += t.quantity;
    }
  }

  const avgCost = buyQty > 0 ? Math.round(totalCost / buyQty) : 0;
  db.prepare(
    "UPDATE assets SET quantity = ?, avg_cost = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(Math.max(0, totalQty), avgCost, tx.asset_id);

  autoSnapshot();

  return Response.json({ data: { deleted: true } });
}
