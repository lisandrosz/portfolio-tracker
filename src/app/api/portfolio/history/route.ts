import { NextRequest } from "next/server";
import getDb from "@/lib/db";
import { PERIODS } from "@/lib/constants";
import type { Period } from "@/lib/constants";
import { daysAgo } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const period = (request.nextUrl.searchParams.get("period") || "ALL") as Period;
  const days = PERIODS[period] || 9999;

  const db = await getDb();

  const snapshots = await db
    .prepare(
      "SELECT * FROM portfolio_snapshots WHERE date >= ? ORDER BY date ASC"
    )
    .all(daysAgo(days));

  return Response.json({ data: snapshots });
}
