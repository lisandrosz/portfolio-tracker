import { NextRequest } from "next/server";
import getDb from "@/lib/db";
import { fetchBingxEquity } from "@/lib/bingx";
import { z } from "zod";

function getSetting(db: ReturnType<typeof getDb>, key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function setSetting(db: ReturnType<typeof getDb>, key: string, value: string) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?"
  ).run(key, value, value);
}

// Status only — never returns the secret.
export async function GET() {
  const db = getDb();
  const apiKey = getSetting(db, "bingx_api_key");
  const apiSecret = getSetting(db, "bingx_api_secret");
  return Response.json({
    data: {
      configured: !!(apiKey && apiSecret),
      api_key_preview: apiKey ? `${apiKey.slice(0, 6)}…${apiKey.slice(-4)}` : null,
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

    const db = getDb();
    setSetting(db, "bingx_api_key", data.api_key);
    setSetting(db, "bingx_api_secret", data.api_secret);

    return Response.json({ data: { configured: true, equity: check.equity } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE() {
  const db = getDb();
  db.prepare("DELETE FROM settings WHERE key IN ('bingx_api_key', 'bingx_api_secret')").run();
  return Response.json({ data: { configured: false } });
}
