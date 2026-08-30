import { NextRequest } from "next/server";
import getDb from "@/lib/db";
import { autoSnapshot } from "@/lib/snapshot";
import { applyBoxFlow, recalcUnitAsset } from "@/lib/portfolio";
import { getRateForDate } from "@/lib/dolar-api";
import { fetchHistoricalPrice } from "@/lib/coingecko";
import { numberToCents, formatMoney, formatBtc } from "@/lib/formatters";
import {
  isBoxType,
  transferUnit,
  transferCoinId,
  BTC_COINGECKO_ID,
} from "@/lib/constants";
import type { Asset } from "@/types";
import { z } from "zod";

const transferSchema = z.object({
  from_asset_id: z.number(),
  to_asset_id: z.number(),
  amount: z.number().positive(), // decimal, in the shared unit
  date: z.string(),
  usd_rate: z.number().positive().optional(), // ARS accounts only
  coin_price: z.number().positive().optional(), // coin transfers only
  notes: z.string().nullable().optional(),
});

/** How much of the shared unit a holding has on hand. */
function available(asset: Asset, isCoin: boolean): number {
  // Both a crypto holding and a BTC account keep the amount in `quantity`; a
  // fiat account keeps its balance in `current_price`, as cents.
  return isCoin ? asset.quantity : asset.current_price;
}

function describeBalance(asset: Asset, unit: string): string {
  const coin = transferCoinId(unit);
  if (!coin) return formatMoney(asset.current_price, asset.currency);
  return coin === BTC_COINGECKO_ID
    ? formatBtc(asset.quantity)
    : `${asset.quantity} ${asset.symbol}`;
}

/**
 * Move an amount between two holdings counted in the same unit — reallocating
 * between copytrading strategies, or sending bitcoin from a wallet into an
 * account that keeps its balance in bitcoin.
 *
 * It writes both legs — a withdrawal from the origin and a deposit into the
 * destination — so the pair can't be left half-recorded, which would look like a
 * loss on one side and a windfall on the other. Because each leg moves value and
 * contributed capital by the same amount, neither holding's P&L changes: the
 * transfer is reallocation, not performance.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = transferSchema.parse(body);

    if (data.from_asset_id === data.to_asset_id) {
      return Response.json({ error: "Origen y destino son el mismo activo" }, { status: 400 });
    }

    const db = await getDb();
    const [from, to] = (await Promise.all([
      db.prepare("SELECT * FROM assets WHERE id = ?").get(data.from_asset_id),
      db.prepare("SELECT * FROM assets WHERE id = ?").get(data.to_asset_id),
    ])) as [Asset | undefined, Asset | undefined];

    if (!from || !to) return Response.json({ error: "Activo no encontrado" }, { status: 404 });

    const fromUnit = transferUnit(from);
    const toUnit = transferUnit(to);

    if (!fromUnit || !toUnit) {
      const bad = !fromUnit ? from : to;
      return Response.json(
        {
          error: `${bad.symbol} no admite transferencias: su saldo no es un monto que se pueda mover (FCI, terreno o deuda).`,
        },
        { status: 400 }
      );
    }

    // Different units means a conversion at some rate, not a transfer. Refuse
    // rather than invent one — the same rule that keeps ARS out of a USD account.
    if (fromUnit !== toUnit) {
      // Naming the unit rather than just "cripto": two coin holdings are still
      // different things, and "bitcoin → solana" says so on its own.
      const name = (unit: string) => transferCoinId(unit) ?? unit;
      return Response.json(
        {
          error: `No se puede transferir entre unidades distintas (${from.symbol} en ${name(
            fromUnit
          )} → ${to.symbol} en ${name(toUnit)}). Cargá un retiro y un aporte por separado.`,
        },
        { status: 400 }
      );
    }

    const coinId = transferCoinId(fromUnit);
    const isCoin = coinId !== null;
    // Coin amounts are decimals; fiat balances are integer cents.
    const moved = isCoin ? data.amount : numberToCents(data.amount);

    // Float amounts can land a hair over an exactly-equal balance.
    if (moved > available(from, isCoin) + (isCoin ? 1e-9 : 0)) {
      return Response.json(
        { error: `Saldo insuficiente en ${from.symbol} (${describeBalance(from, fromUnit)})` },
        { status: 400 }
      );
    }

    const rate =
      from.currency === "ARS" ? data.usd_rate ?? (await getRateForDate(data.date)) : null;

    // What the moved amount was worth, frozen on both legs. It must be the real
    // figure, not zero: each leg moves value and contributed capital together,
    // and only matching amounts leave both holdings' P&L untouched.
    let priceCents = 0;
    if (isCoin) {
      const price = data.coin_price ?? (await fetchHistoricalPrice(coinId, data.date));
      if (!price || price <= 0) {
        return Response.json(
          { error: `No se pudo obtener el precio de ${from.symbol} para esa fecha` },
          { status: 502 }
        );
      }
      priceCents = numberToCents(price);
    }

    const totalNative = isCoin ? Math.round(data.amount * priceCents) : moved;
    const totalUsd =
      from.currency === "ARS" ? (rate && rate > 0 ? Math.round(totalNative / rate) : 0) : totalNative;
    const note = data.notes || `Transferencia ${from.symbol} → ${to.symbol}`;

    // One id on both rows, so deleting either leg takes the pair with it.
    const linkId = crypto.randomUUID();
    const insertSql = `INSERT INTO transactions (asset_id, type, quantity, price, total, total_usd, fx_rate, currency, fee, date, notes, link_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`;

    // Signed by direction on each leg, so deleting the pair unwinds cleanly and a
    // crypto holding's quantity replays correctly from its ledger.
    const outQty = isCoin ? -data.amount : 0;
    const inQty = isCoin ? data.amount : 0;

    await db.batch([
      {
        sql: insertSql,
        args: [from.id, "withdrawal", outQty, priceCents, totalNative, totalUsd, rate, from.currency, data.date, note, linkId],
      },
      {
        sql: insertSql,
        args: [to.id, "deposit", inQty, priceCents, totalNative, totalUsd, rate, to.currency, data.date, note, linkId],
      },
    ]);

    // A box balance is adjusted directly; a crypto holding's quantity is derived
    // from its transactions, so replaying the ledger is what moves it.
    for (const [asset, delta] of [
      [from, -moved],
      [to, moved],
    ] as const) {
      if (isBoxType(asset.type)) await applyBoxFlow(db, asset.id, delta, asset.currency);
      else await recalcUnitAsset(db, asset.id);
    }

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
