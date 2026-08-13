import { NextRequest } from "next/server";
import getDb from "@/lib/db";
import { autoSnapshot } from "@/lib/snapshot";
import { applyBoxFlow } from "@/lib/portfolio";
import { getBlueForDate } from "@/lib/dolar-api";
import { numberToCents, formatMoney } from "@/lib/formatters";
import { isBoxType } from "@/lib/constants";
import type { Asset } from "@/types";
import { z } from "zod";

const transferSchema = z.object({
  from_asset_id: z.number(),
  to_asset_id: z.number(),
  amount: z.number().positive(), // decimal, in the shared native currency
  date: z.string(),
  usd_rate: z.number().positive().optional(), // ARS accounts only
  notes: z.string().nullable().optional(),
});

/**
 * Move money between two box accounts (e.g. reallocating between BingX
 * copytrading strategies) as a single operation.
 *
 * It writes both legs — a withdrawal from the origin and a deposit into the
 * destination — so the pair can't be left half-recorded, which would look like a
 * loss on one side and a windfall on the other. Because each leg moves value and
 * contributed capital by the same amount, neither account's P&L changes: the
 * transfer is reallocation, not performance.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = transferSchema.parse(body);

    if (data.from_asset_id === data.to_asset_id) {
      return Response.json({ error: "Origen y destino son la misma cuenta" }, { status: 400 });
    }

    const db = await getDb();
    const [from, to] = (await Promise.all([
      db.prepare("SELECT * FROM assets WHERE id = ?").get(data.from_asset_id),
      db.prepare("SELECT * FROM assets WHERE id = ?").get(data.to_asset_id),
    ])) as [Asset | undefined, Asset | undefined];

    if (!from || !to) return Response.json({ error: "Cuenta no encontrada" }, { status: 404 });

    if (!isBoxType(from.type) || !isBoxType(to.type)) {
      return Response.json(
        { error: "Solo se puede transferir entre cuentas de saldo (administradas, plazo fijo, efectivo)" },
        { status: 400 }
      );
    }

    // A cross-currency transfer is really a conversion at some rate; refuse
    // rather than invent one.
    if (from.currency !== to.currency) {
      return Response.json(
        {
          error: `No se puede transferir entre monedas distintas (${from.currency} → ${to.currency}). Cargá un retiro y un aporte por separado.`,
        },
        { status: 400 }
      );
    }

    const totalNative = numberToCents(data.amount);
    if (totalNative > from.current_price) {
      return Response.json(
        { error: `Saldo insuficiente en ${from.symbol} (${formatMoney(from.current_price, from.currency)})` },
        { status: 400 }
      );
    }

    // Both legs share one frozen USD value. It must be the real one, not zero:
    // each leg moves value and contributed capital together, and only matching
    // amounts leave both accounts' P&L untouched.
    const rate =
      from.currency === "ARS" ? data.usd_rate ?? (await getBlueForDate(data.date)) : null;
    const totalUsd =
      from.currency === "ARS" ? (rate && rate > 0 ? Math.round(totalNative / rate) : 0) : totalNative;
    const note = data.notes || `Transferencia ${from.symbol} → ${to.symbol}`;

    const insertSql = `INSERT INTO transactions (asset_id, type, quantity, price, total, total_usd, fx_rate, currency, fee, date, notes)
       VALUES (?, ?, 0, 0, ?, ?, ?, ?, 0, ?, ?)`;

    await db.batch([
      {
        sql: insertSql,
        args: [from.id, "withdrawal", totalNative, totalUsd, rate, from.currency, data.date, note],
      },
      {
        sql: insertSql,
        args: [to.id, "deposit", totalNative, totalUsd, rate, to.currency, data.date, note],
      },
    ]);

    await applyBoxFlow(db, from.id, -totalNative);
    await applyBoxFlow(db, to.id, totalNative);
    await autoSnapshot();

    return Response.json(
      { data: { from: from.symbol, to: to.symbol, amount: data.amount } },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
