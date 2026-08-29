import { NextRequest } from "next/server";
import getDb from "@/lib/db";
import { autoSnapshot } from "@/lib/snapshot";
import { applyBoxFlow } from "@/lib/portfolio";
import { getRateForDate } from "@/lib/dolar-api";
import { numberToCents, formatMoney, formatBtc } from "@/lib/formatters";
import { isBoxType, isBtcDenominated, BTC_COINGECKO_ID } from "@/lib/constants";
import { fetchHistoricalPrice } from "@/lib/coingecko";
import type { Asset } from "@/types";
import { z } from "zod";

const transferSchema = z.object({
  from_asset_id: z.number(),
  to_asset_id: z.number(),
  amount: z.number().positive(), // decimal, in the shared native currency
  date: z.string(),
  usd_rate: z.number().positive().optional(), // ARS accounts only
  btc_price: z.number().positive().optional(), // BTC accounts only
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

    // On a BTC account the amount is bitcoin and the balance lives in quantity;
    // everywhere else both are native cents.
    const btc = isBtcDenominated(from.currency);
    const moved = btc ? data.amount : numberToCents(data.amount);
    const available = btc ? from.quantity : from.current_price;
    if (moved > available + (btc ? 1e-9 : 0)) {
      return Response.json(
        {
          error: `Saldo insuficiente en ${from.symbol} (${
            btc ? formatBtc(from.quantity) : formatMoney(from.current_price, from.currency)
          })`,
        },
        { status: 400 }
      );
    }

    // Both legs share one frozen USD value. It must be the real one, not zero:
    // each leg moves value and contributed capital together, and only matching
    // amounts leave both accounts' P&L untouched.
    const rate =
      from.currency === "ARS" ? data.usd_rate ?? (await getRateForDate(data.date)) : null;

    // What the moved amount was worth, frozen on both legs. For bitcoin that is
    // the amount times the day's price; refuse rather than book the move at zero.
    let btcPriceCents = 0;
    if (btc) {
      const btcPrice =
        data.btc_price ?? (await fetchHistoricalPrice(BTC_COINGECKO_ID, data.date));
      if (!btcPrice || btcPrice <= 0) {
        return Response.json(
          { error: "No se pudo obtener el precio de BTC para esa fecha" },
          { status: 502 }
        );
      }
      btcPriceCents = numberToCents(btcPrice);
    }

    const totalNative = btc ? Math.round(data.amount * btcPriceCents) : moved;
    const totalUsd =
      from.currency === "ARS" ? (rate && rate > 0 ? Math.round(totalNative / rate) : 0) : totalNative;
    const note = data.notes || `Transferencia ${from.symbol} → ${to.symbol}`;

    // One id on both rows, so deleting either leg takes the pair with it.
    const linkId = crypto.randomUUID();
    const insertSql = `INSERT INTO transactions (asset_id, type, quantity, price, total, total_usd, fx_rate, currency, fee, date, notes, link_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`;

    // Signed by direction on each leg, so deleting the pair unwinds cleanly.
    const outQty = btc ? -data.amount : 0;
    const inQty = btc ? data.amount : 0;

    await db.batch([
      {
        sql: insertSql,
        args: [from.id, "withdrawal", outQty, btcPriceCents, totalNative, totalUsd, rate, from.currency, data.date, note, linkId],
      },
      {
        sql: insertSql,
        args: [to.id, "deposit", inQty, btcPriceCents, totalNative, totalUsd, rate, to.currency, data.date, note, linkId],
      },
    ]);

    await applyBoxFlow(db, from.id, -moved, from.currency);
    await applyBoxFlow(db, to.id, moved, to.currency);
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
