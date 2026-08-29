import { NextRequest } from "next/server";
import getDb from "@/lib/db";
import { fetchBingxEquity } from "@/lib/bingx";
import {
  BINGX_ASSET_KEY,
  BINGX_ASSET_NONE,
  deleteSetting,
  getSetting,
  listManagedAccounts,
  resolveBingxAccount,
  setSetting,
} from "@/lib/settings";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Status only — never returns the secret.
export async function GET() {
  const db = await getDb();
  const apiKey = await getSetting(db, "bingx_api_key");
  const apiSecret = await getSetting(db, "bingx_api_secret");

  // Resolving here (not just in the sync route) means opening Ajustes is enough
  // to pin a lone managed account, before a second one can make it ambiguous.
  const accounts = await listManagedAccounts(db);
  const target = await resolveBingxAccount(db, accounts);
  const pinned = await getSetting(db, BINGX_ASSET_KEY);

  return Response.json({
    data: {
      configured: !!(apiKey && apiSecret),
      api_key_preview: apiKey ? `${apiKey.slice(0, 6)}…${apiKey.slice(-4)}` : null,
      asset_id: pinned === BINGX_ASSET_NONE ? BINGX_ASSET_NONE : target?.id ?? null,
      accounts: accounts.map((a) => ({ id: a.id, symbol: a.symbol, name: a.name })),
    },
  });
}

const saveSchema = z.object({
  api_key: z.string().min(1),
  api_secret: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = saveSchema.parse(body);

    // Verify the keys work before saving.
    const check = await fetchBingxEquity(data.api_key, data.api_secret);
    if (check.error) {
      return Response.json({ error: `No se pudo conectar: ${check.error}` }, { status: 400 });
    }

    const db = await getDb();
    await setSetting(db, "bingx_api_key", data.api_key);
    await setSetting(db, "bingx_api_secret", data.api_secret);

    return Response.json({ data: { configured: true, equity: check.equity } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Which managed account the equity is written into: an id, "none" to keep every
// account manual, or null to fall back to auto-picking a lone account.
const accountSchema = z.object({
  asset_id: z.union([z.number().int().positive(), z.literal(BINGX_ASSET_NONE), z.null()]),
});

export async function PUT(request: NextRequest) {
  try {
    const { asset_id } = accountSchema.parse(await request.json());
    const db = await getDb();

    if (asset_id === null) {
      await deleteSetting(db, BINGX_ASSET_KEY);
    } else if (asset_id === BINGX_ASSET_NONE) {
      await setSetting(db, BINGX_ASSET_KEY, BINGX_ASSET_NONE);
    } else {
      const accounts = await listManagedAccounts(db);
      if (!accounts.some((a) => a.id === asset_id)) {
        return Response.json({ error: "Esa cuenta no existe o no es administrada" }, { status: 400 });
      }
      await setSetting(db, BINGX_ASSET_KEY, String(asset_id));
    }

    return Response.json({ data: { asset_id } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE() {
  const db = await getDb();
  await db
    .prepare("DELETE FROM settings WHERE key IN ('bingx_api_key', 'bingx_api_secret')")
    .run();
  return Response.json({ data: { configured: false } });
}
