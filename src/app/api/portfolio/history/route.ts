import { NextRequest } from "next/server";
import getDb from "@/lib/db";
import { PERIODS } from "@/lib/constants";
import type { Period } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const period = (request.nextUrl.searchParams.get("period") || "ALL") as Period;
  const days = PERIODS[period] || 9999;

  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const snapshots = db
    .prepare(
      "SELECT * FROM portfolio_snapshots WHERE date >= ? ORDER BY date ASC"
    )
    .all(cutoff.toISOString().split("T")[0]);

  return Response.json({ data: snapshots });
}
