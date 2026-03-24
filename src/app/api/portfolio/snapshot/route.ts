import getDb from "@/lib/db";
import { autoSnapshot } from "@/lib/snapshot";

// Auto-snapshot: creates one for this month if it doesn't exist
export async function GET() {
  const db = getDb();
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const existing = db
    .prepare("SELECT * FROM portfolio_snapshots WHERE date LIKE ?")
    .get(`${monthKey}%`);

  if (existing) {
    return Response.json({ data: { created: false, snapshot: existing } });
  }

  autoSnapshot();

  const today = now.toISOString().split("T")[0];
  const snapshot = db
    .prepare("SELECT * FROM portfolio_snapshots WHERE date = ?")
    .get(today);

  return Response.json({ data: { created: true, snapshot } });
}

export async function POST() {
  autoSnapshot();

  const db = getDb();
  const today = new Date().toISOString().split("T")[0];
  const snapshot = db
    .prepare("SELECT * FROM portfolio_snapshots WHERE date = ?")
    .get(today);

  return Response.json({ data: snapshot });
}
