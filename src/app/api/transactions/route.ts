import { NextRequest } from "next/server";
import getDb from "@/lib/db";
import { autoSnapshot } from "@/lib/snapshot";
import { getBlueForDate } from "@/lib/dolar-api";
import {
  recalcUnitAsset,
  applyBoxFlow,
  recalcInstallmentAsset,
  recalcDebtAsset,
} from "@/lib/portfolio";
import { numberToCents, formatMoney } from "@/lib/formatters";
import { isBoxType, isInstallmentType, isDebtType } from "@/lib/constants";
import type { Asset } from "@/types";
import { z } from "zod";

// All monetary fields are plain decimals in the asset's native currency.
const createTransactionSchema = z.object({
  asset_id: z.number(),
  type: z.enum(["buy", "sell", "deposit", "withdrawal", "cuota", "gasto", "alta", "pago"]),
  quantity: z.number().optional(), // units, for buy/sell
  price: z.number().optional(), // native per unit, for buy/sell
  amount: z.number().optional(), // native total, for deposit/withdrawal/cuota/gasto/alta/pago
  fee: z.number().default(0),
  date: z.string(),
  // ARS per USD to freeze this transaction with. Overrides the published blue
  // for the date, because the rate actually paid is often not the published one.
  usd_rate: z.number().positive().optional(),
  notes: z.string().nullable().optional(),
});

/** Which transaction types make sense for each asset shape. */
const TYPES_BY_SHAPE = {
  installment: ["cuota", "gasto"],
  debt: ["alta", "pago"],
  box: ["deposit", "withdrawal"],
  unit: ["buy", "sell"],
} as const;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const assetId = searchParams.get("asset_id");
  const type = searchParams.get("type");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = searchParams.get("limit") || "100";

  const db = await getDb();
  let query =
    "SELECT t.*, a.name as asset_name, a.symbol as asset_symbol FROM transactions t JOIN assets a ON t.asset_id = a.id WHERE 1=1";
  const params: (string | number)[] = [];

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

  const transactions = await db.prepare(query).all(...params);
  return Response.json({ data: transactions });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = createTransactionSchema.parse(body);

    const db = await getDb();
    const asset = (await db
      .prepare("SELECT * FROM assets WHERE id = ?")
      .get(data.asset_id)) as Asset | undefined;
    if (!asset) return Response.json({ error: "Asset not found" }, { status: 404 });

    const installment = isInstallmentType(asset.type);
    const debt = isDebtType(asset.type);
    const box = isBoxType(asset.type);
    const shape = installment ? "installment" : debt ? "debt" : box ? "box" : "unit";
    const feeCents = numberToCents(data.fee || 0);

    if (!(TYPES_BY_SHAPE[shape] as readonly string[]).includes(data.type)) {
      return Response.json(
        { error: `No se puede registrar "${data.type}" sobre ${asset.symbol}` },
        { status: 400 }
      );
    }

    let qty = 0;
    let priceCents = 0;
    let totalNative = 0;

    if (installment) {
      // cuota / gasto: a single amount paid on a date.
      if (data.amount == null || data.amount <= 0) {
        return Response.json({ error: "Falta el monto" }, { status: 400 });
      }
      totalNative = numberToCents(data.amount);

      // Only cuotas pay down the debt, so only they can overshoot it.
      if (data.type === "cuota" && asset.purchase_total > 0) {
        const remaining = asset.purchase_total - asset.current_price;
        if (totalNative > remaining) {
          return Response.json(
            {
              error: `La cuota supera el saldo restante (${formatMoney(remaining, asset.currency)})`,
            },
            { status: 400 }
          );
        }
      }
    } else if (debt) {
      // alta / pago: a single amount raises or settles the outstanding balance.
      if (data.amount == null || data.amount <= 0) {
        return Response.json({ error: "Falta el monto" }, { status: 400 });
      }
      totalNative = numberToCents(data.amount);

      if (data.type === "pago" && totalNative > asset.current_price) {
        return Response.json(
          {
            error: `El pago supera el saldo pendiente (${formatMoney(asset.current_price, asset.currency)})`,
          },
          { status: 400 }
        );
      }
    } else if (box) {
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

    // Freeze the USD value at the transaction date. Written once, here, and never
    // recalculated afterwards — that permanence is the point for ARS holdings.
    // A caller-supplied rate wins over the published blue.
    const rate =
      asset.currency === "ARS"
        ? data.usd_rate ?? (await getBlueForDate(data.date))
        : null;
    const totalUsd =
      asset.currency === "ARS" ? (rate && rate > 0 ? Math.round(totalNative / rate) : 0) : totalNative;

    const result = await db
      .prepare(
        `INSERT INTO transactions (asset_id, type, quantity, price, total, total_usd, fx_rate, currency, fee, date, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.asset_id,
        data.type,
        qty,
        priceCents,
        totalNative,
        totalUsd,
        rate,
        asset.currency,
        feeCents,
        data.date,
        data.notes ?? null
      );

    if (installment) {
      await recalcInstallmentAsset(db, data.asset_id);
    } else if (debt) {
      await recalcDebtAsset(db, data.asset_id);
    } else if (box) {
      const delta = data.type === "deposit" ? totalNative : -totalNative;
      await applyBoxFlow(db, data.asset_id, delta);
    } else {
      await recalcUnitAsset(db, data.asset_id);
    }

    // No rate argument: `rate` belongs to the transaction's date (and may be a
    // hand-entered value), so passing it would revalue today's whole snapshot at it.
    await autoSnapshot();

    const transaction = await db
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
