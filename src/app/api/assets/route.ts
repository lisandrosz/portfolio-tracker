import { NextRequest } from "next/server";
import getDb from "@/lib/db";
import { autoSnapshot } from "@/lib/snapshot";
import { getBlueForDate } from "@/lib/dolar-api";
import {
  recalcUnitAsset,
  applyBoxFlow,
  recalcInstallmentAsset,
  recalcDebtAsset,
  counterAccountError,
  writeDebtCounterLeg,
} from "@/lib/portfolio";
import { numberToCents } from "@/lib/formatters";
import {
  isBoxType,
  isInstallmentType,
  isDebtType,
  ASSET_CURRENCY,
  type AssetType,
} from "@/lib/constants";
import type { Asset } from "@/types";
import { z } from "zod";

const createAssetSchema = z.object({
  name: z.string().min(1),
  symbol: z.string().min(1),
  type: z.enum([
    "crypto",
    "fci",
    "terreno",
    "managed",
    "plazo_fijo",
    "cash_usd",
    "cash_ars",
    "por_cobrar",
    "por_pagar",
  ]),
  coingecko_id: z.string().nullable().optional(),
  fund_name: z.string().nullable().optional(),
  group_name: z.string().nullable().optional(), // roll-up label
  quantity: z.number().default(0), // units (unit assets)
  price: z.number().default(0), // native: price per unit, opening balance (box), or down payment (installment)
  purchase_total: z.number().default(0), // native: agreed total price (installment)
  installments_total: z.number().int().min(0).default(0), // cuota count (installment)
  // ARS per USD to freeze with; overrides the published blue for `date`.
  usd_rate: z.number().positive().optional(),
  // Account the opening balance of a debt moved through (debts only).
  counter_asset_id: z.number().nullable().optional(),
  date: z.string().optional(),
  notes: z.string().nullable().optional(),
});

export async function GET() {
  const db = await getDb();
  const assets = await db.prepare("SELECT * FROM assets ORDER BY type, name").all();
  return Response.json({ data: assets });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = createAssetSchema.parse(body);

    const db = await getDb();
    const symbol = data.symbol.toUpperCase();
    const type = data.type as AssetType;
    const currency = ASSET_CURRENCY[type];
    const box = isBoxType(type);
    const installment = isInstallmentType(type);
    const debt = isDebtType(type);
    const priceCents = numberToCents(data.price || 0);
    const purchaseTotalCents = numberToCents(data.purchase_total || 0);
    const date = data.date || new Date().toISOString().split("T")[0];

    // Freeze USD at the purchase/opening date. A caller-supplied rate wins over
    // the published blue, and the result is stored, never recomputed later.
    const rate =
      currency === "ARS" ? data.usd_rate ?? (await getBlueForDate(date)) : null;
    const toUsd = (native: number) =>
      currency === "ARS" ? (rate && rate > 0 ? Math.round(native / rate) : 0) : native;

    // Account the money moved through, when the debt opens with a balance.
    // Checked before the asset is created, so a bad account can't leave a debt
    // recorded with no money behind it.
    let counter: Asset | undefined;
    if (data.counter_asset_id != null && debt && data.price > 0) {
      counter = (await db
        .prepare("SELECT * FROM assets WHERE id = ?")
        .get(data.counter_asset_id)) as Asset | undefined;
      const counterError = counterAccountError(counter, currency);
      if (counterError) return Response.json({ error: counterError }, { status: 400 });
    }

    const existing = (await db
      .prepare("SELECT * FROM assets WHERE symbol = ? AND type = ?")
      .get(symbol, type)) as Asset | undefined;

    let assetId: number;
    if (existing) {
      assetId = existing.id;
      // For unit assets keep the latest market price up to date.
      if (!box && !installment && !debt && priceCents > 0) {
        await db
          .prepare(
            "UPDATE assets SET current_price = ?, updated_at = datetime('now') WHERE id = ?"
          )
          .run(priceCents, assetId);
      }
    } else {
      const result = await db
        .prepare(
          `INSERT INTO assets (name, symbol, type, coingecko_id, fund_name, group_name, currency, quantity, current_price, purchase_total, purchase_total_usd, installments_total, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          data.name,
          symbol,
          type,
          type === "crypto" ? data.coingecko_id ?? null : null,
          type === "fci" ? data.fund_name ?? null : null,
          data.group_name?.trim() || null,
          currency,
          box || installment || debt ? 1 : 0,
          // installment / debt: balance is derived from the ledger written below
          installment || debt ? 0 : priceCents,
          installment ? purchaseTotalCents : 0,
          installment ? toUsd(purchaseTotalCents) : 0,
          installment ? data.installments_total : 0,
          data.notes ?? null,
          `${date}T00:00:00`
        );
      assetId = result.lastInsertRowid as number;
    }

    if (installment && data.price > 0) {
      // Down payment / seña at signing, recorded as the first cuota.
      await db
        .prepare(
          `INSERT INTO transactions (asset_id, type, quantity, price, total, total_usd, fx_rate, currency, fee, date, notes)
         VALUES (?, 'cuota', 0, 0, ?, ?, ?, ?, 0, ?, ?)`
        )
        .run(assetId, priceCents, toUsd(priceCents), rate, currency, date, data.notes || "Anticipo");
      await recalcInstallmentAsset(db, assetId);
    } else if (debt && data.price > 0) {
      // Opening balance of the debt, recorded as the first alta.
      const linkId = counter ? crypto.randomUUID() : null;
      await db
        .prepare(
          `INSERT INTO transactions (asset_id, type, quantity, price, total, total_usd, fx_rate, currency, fee, date, notes, link_id)
         VALUES (?, 'alta', 0, 0, ?, ?, ?, ?, 0, ?, ?, ?)`
        )
        .run(
          assetId,
          priceCents,
          toUsd(priceCents),
          rate,
          currency,
          date,
          data.notes || "Saldo inicial",
          linkId
        );
      await recalcDebtAsset(db, assetId);

      // The other half: money leaving the account you lent it from, or landing in
      // the one you borrowed into.
      if (counter && linkId) {
        await writeDebtCounterLeg(db, {
          debt: { type, name: existing?.name ?? data.name },
          counter,
          movement: "alta",
          totalNative: priceCents,
          totalUsd: toUsd(priceCents),
          rate,
          date,
          linkId,
          notes: data.notes,
        });
      }
    } else if (box && data.price > 0) {
      // Opening contribution (deposit).
      const totalNative = priceCents;
      await db
        .prepare(
          `INSERT INTO transactions (asset_id, type, quantity, price, total, total_usd, fx_rate, currency, fee, date, notes)
         VALUES (?, 'deposit', 0, 0, ?, ?, ?, ?, 0, ?, ?)`
        )
        .run(
          assetId,
          totalNative,
          toUsd(totalNative),
          rate,
          currency,
          date,
          data.notes || "Saldo inicial"
        );
      // New asset already has the balance set; existing one must be bumped.
      if (existing) await applyBoxFlow(db, assetId, totalNative);
    } else if (!box && !installment && !debt && data.quantity > 0 && data.price > 0) {
      // Opening buy.
      const totalNative = Math.round(data.quantity * priceCents);
      await db
        .prepare(
          `INSERT INTO transactions (asset_id, type, quantity, price, total, total_usd, fx_rate, currency, fee, date, notes)
         VALUES (?, 'buy', ?, ?, ?, ?, ?, ?, 0, ?, ?)`
        )
        .run(
          assetId,
          data.quantity,
          priceCents,
          totalNative,
          toUsd(totalNative),
          rate,
          currency,
          date,
          data.notes || "Compra inicial"
        );
      await recalcUnitAsset(db, assetId);
    }

    const asset = await db.prepare("SELECT * FROM assets WHERE id = ?").get(assetId);
    // No rate argument: `rate` belongs to the purchase date and may be hand-entered.
    await autoSnapshot();

    return Response.json({ data: asset }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
