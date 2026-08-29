import getDb from "@/lib/db";
import { autoSnapshot } from "@/lib/snapshot";
import { currentMonth, today } from "@/lib/dates";

// Auto-snapshot: creates one for this month if it doesn't exist
export async function GET() {
  const db = await getDb();
  const monthKey = currentMonth();

  const existing = await db
    .prepare("SELECT * FROM portfolio_snapshots WHERE date LIKE ?")
    .get(`${monthKey}%`);

  if (existing) {
    return Response.json({ data: { created: false, snapshot: existing } });
  }

  await autoSnapshot();

  const snapshot = await db
    .prepare("SELECT * FROM portfolio_snapshots WHERE date = ?")
    .get(today());

  return Response.json({ data: { created: true, snapshot } });
}

export async function POST() {
  await autoSnapshot();

  const db = await getDb();
  const snapshot = await db
    .prepare("SELECT * FROM portfolio_snapshots WHERE date = ?")
    .get(today());

  return Response.json({ data: snapshot });
}
