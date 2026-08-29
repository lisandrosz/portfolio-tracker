import getDb from "@/lib/db";
import { fetchBingxEquity } from "@/lib/bingx";
import { autoSnapshot } from "@/lib/snapshot";
import { numberToCents } from "@/lib/formatters";
import {
  getSetting,
  listManagedAccounts,
  resolveBingxAccount,
} from "@/lib/settings";

// Sync the BingX copytrading equity into the managed account it belongs to.
export async function POST() {
  const db = await getDb();
  const apiKey = await getSetting(db, "bingx_api_key");
  const apiSecret = await getSetting(db, "bingx_api_secret");

  if (!apiKey || !apiSecret) {
    return Response.json(
      { error: "BingX no está configurado. Cargá tus API keys en Ajustes." },
      { status: 400 }
    );
  }

  const managed = await listManagedAccounts(db);
  if (managed.length === 0) {
    return Response.json({ error: "No hay cuenta administrada para sincronizar" }, { status: 400 });
  }

  // Resolved before the request so a missing target is reported with the equity
  // in hand: the number is still worth showing even when it can't be written.
  const target = await resolveBingxAccount(db, managed);

  const result = await fetchBingxEquity(apiKey, apiSecret);
  if (result.error || result.equity == null) {
    return Response.json({ error: result.error || "Sin datos" }, { status: 502 });
  }

  const cents = numberToCents(result.equity);

  // BingX does NOT expose copytrading positions value via API (it returns 0).
  // Never overwrite the manual balance with 0 — keep what the user set.
  if (cents <= 0) {
    return Response.json({
      data: {
        equity: result.equity,
        updated: 0,
        breakdown: result.breakdown,
        message:
          "BingX no expone el saldo de copytrading vía API (devolvió 0). Se mantiene el valor manual.",
      },
    });
  }

  if (!target) {
    return Response.json({
      data: {
        equity: result.equity,
        updated: 0,
        breakdown: result.breakdown,
        message: `BingX informa un equity único (${result.equity}) y hay ${managed.length} cuentas administradas. Elegí en Ajustes cuál sincroniza; las demás quedan manuales.`,
      },
    });
  }

  await db
    .prepare(
      "UPDATE assets SET current_price = ?, price_updated_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    )
    .run(cents, target.id);

  await autoSnapshot();

  return Response.json({
    data: {
      equity: result.equity,
      updated: 1,
      account: target.symbol,
      breakdown: result.breakdown,
    },
  });
}
