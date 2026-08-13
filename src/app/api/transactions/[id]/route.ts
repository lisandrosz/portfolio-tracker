import { NextRequest } from "next/server";
import getDb from "@/lib/db";
import { autoSnapshot } from "@/lib/snapshot";
import {
  recalcUnitAsset,
  applyBoxFlow,
  recalcInstallmentAsset,
  recalcDebtAsset,
} from "@/lib/portfolio";
import { isBoxType, isInstallmentType, isDebtType } from "@/lib/constants";
import type { Asset } from "@/types";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = await getDb();

  const tx = (await db.prepare("SELECT * FROM transactions WHERE id = ?").get(id)) as
    | { asset_id: number; type: string; total: number }
    | undefined;
  if (!tx) return Response.json({ error: "Not found" }, { status: 404 });

  const asset = (await db
    .prepare("SELECT * FROM assets WHERE id = ?")
    .get(tx.asset_id)) as Asset | undefined;

  await db.prepare("DELETE FROM transactions WHERE id = ?").run(id);

  if (asset && isInstallmentType(asset.type)) {
    // Derived from the remaining cuotas, so the debt heals itself.
    await recalcInstallmentAsset(db, tx.asset_id);
  } else if (asset && isDebtType(asset.type)) {
    await recalcDebtAsset(db, tx.asset_id);
  } else if (asset && isBoxType(asset.type)) {
    // Reverse the deposit/withdrawal effect on the balance.
    const delta = tx.type === "deposit" ? -tx.total : tx.total;
    await applyBoxFlow(db, tx.asset_id, delta);
  } else {
    await recalcUnitAsset(db, tx.asset_id);
  }

  await autoSnapshot();

  return Response.json({ data: { deleted: true } });
}
