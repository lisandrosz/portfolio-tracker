import { NextRequest } from "next/server";
import { searchSymbols } from "@/lib/yahoo-finance";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");

  if (!q || q.length < 1) {
    return Response.json({ data: [] });
  }

  const results = await searchSymbols(q);
  return Response.json({ data: results });
}
