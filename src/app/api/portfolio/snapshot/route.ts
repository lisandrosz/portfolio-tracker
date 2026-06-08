import getDb from "@/lib/db";
import { autoSnapshot } from "@/lib/snapshot";

// Auto-snapshot: creates one for this month if it doesn't exist
export async function GET() {
  const db = await getDb();
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const existing = await db
    .prepare("SELECT * FROM portfolio_snapshots WHERE date LIKE ?")
    .get(`${monthKey}%`);

  if (existing) {
    return Response.json({ data: { created: false, snapshot: existing } });
  }

  await autoSnapshot();

  const today = now.toISOString().split("T")[0];
  const snapshot = await db
    .prepare("SELECT * FROM portfolio_snapshots WHERE date = ?")
    .get(today);

  return Response.json({ data: { created: true, snapshot } });
}

export async function POST() {
  await autoSnapshot();

  const db = await getDb();
  const today = new Date().toISOString().split("T")[0];
  const snapshot = await db
    .prepare("SELECT * FROM portfolio_snapshots WHERE date = ?")
    .get(today);

  return Response.json({ data: snapshot });
}
