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

interface TxLeg {
  id: number;
  asset_id: number;
  type: string;
  total: number;
  link_id: string | null;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = await getDb();

  const tx = (await db.prepare("SELECT * FROM transactions WHERE id = ?").get(id)) as
    | TxLeg
    | undefined;
  if (!tx) return Response.json({ error: "Not found" }, { status: 404 });

  // Paired operations — a transfer, or a debt movement and the account it moved
  // through — are deleted together. Dropping one side would leave the other
  // stranded: money out of an account with nothing to show for it.
  const legs = tx.link_id
    ? ((await db
        .prepare("SELECT * FROM transactions WHERE link_id = ?")
        .all(tx.link_id)) as TxLeg[])
    : [tx];

  if (tx.link_id) {
    await db.prepare("DELETE FROM transactions WHERE link_id = ?").run(tx.link_id);
  } else {
    await db.prepare("DELETE FROM transactions WHERE id = ?").run(id);
  }

  for (const leg of legs) {
    const asset = (await db
      .prepare("SELECT * FROM assets WHERE id = ?")
      .get(leg.asset_id)) as Asset | undefined;

    if (asset && isInstallmentType(asset.type)) {
      // Derived from the remaining cuotas, so the debt heals itself.
      await recalcInstallmentAsset(db, leg.asset_id);
    } else if (asset && isDebtType(asset.type)) {
      await recalcDebtAsset(db, leg.asset_id);
    } else if (asset && isBoxType(asset.type)) {
      // Reverse the deposit/withdrawal effect on the balance.
      const delta = leg.type === "deposit" ? -leg.total : leg.total;
      await applyBoxFlow(db, leg.asset_id, delta);
    } else {
      await recalcUnitAsset(db, leg.asset_id);
    }
  }

  await autoSnapshot();

  return Response.json({ data: { deleted: legs.length } });
}
