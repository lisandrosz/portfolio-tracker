import { NextRequest } from "next/server";
import { searchFunds } from "@/lib/fci";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") || "";
  const funds = await searchFunds(q);
  return Response.json({ data: funds });
}
