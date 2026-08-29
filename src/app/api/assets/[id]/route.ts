import { NextRequest } from "next/server";
import getDb from "@/lib/db";
import { autoSnapshot } from "@/lib/snapshot";
import { isInstallmentType, isDebtType, isBtcDenominated } from "@/lib/constants";
import { z } from "zod";

const updateAssetSchema = z.object({
  name: z.string().min(1).optional(),
  symbol: z.string().min(1).optional(),
  type: z
    .enum([
      "crypto",
      "fci",
      "terreno",
      "managed",
      "plazo_fijo",
      "cash_usd",
      "cash_ars",
      "por_cobrar",
      "por_pagar",
    ])
    .optional(),
  coingecko_id: z.string().nullable().optional(),
  fund_name: z.string().nullable().optional(),
  group_name: z.string().nullable().optional(), // roll-up label
  current_price: z.number().optional(), // native cents (manual balance / valuation for box assets)
  // BTC accounts only: the balance is a bitcoin amount, not cents.
  quantity: z.number().min(0).optional(),
  // Installment assets. `current_price` is deliberately not editable for them:
  // it is derived from the cuota ledger and a manual write would desync it.
  purchase_total: z.number().optional(), // native cents — agreed price
  purchase_total_usd: z.number().optional(), // USD cents — frozen appraisal
  installments_total: z.number().int().min(0).optional(),
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
    const existing = (await db.prepare("SELECT * FROM assets WHERE id = ?").get(id)) as
      | { type: string; currency: string }
      | undefined;
    if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

    const btc = isBtcDenominated(existing.currency);
    // On a BTC account current_price is the market price of a bitcoin, refreshed
    // from CoinGecko every poll. Accepting a manual write would look like it
    // worked and be gone within the minute; the balance is `quantity`.
    if (data.current_price !== undefined && btc) {
      return Response.json(
        { error: "El saldo de una cuenta en BTC se edita en bitcoin, no en dólares" },
        { status: 400 }
      );
    }
    if (data.quantity !== undefined && !btc) {
      return Response.json(
        { error: "Solo las cuentas en BTC llevan el saldo en cantidad" },
        { status: 400 }
      );
    }

    if (data.current_price !== undefined && isInstallmentType(existing.type)) {
      return Response.json(
        { error: "El saldo pagado de un terreno se deriva de las cuotas" },
        { status: 400 }
      );
    }
    if (data.current_price !== undefined && isDebtType(existing.type)) {
      return Response.json(
        { error: "El saldo de una deuda se deriva de sus altas y pagos" },
        { status: 400 }
      );
    }

    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        if (key === "symbol" && typeof value === "string") values.push(value.toUpperCase());
        // Blank means "no group", not a group literally named "".
        else if (key === "group_name" && typeof value === "string")
          values.push(value.trim() || null);
        else values.push(value);
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
