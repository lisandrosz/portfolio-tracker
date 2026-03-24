import { NextRequest } from "next/server";
import { fetchStockPrice } from "@/lib/yahoo-finance";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");

  if (!symbol) {
    return Response.json({ error: "symbol is required" }, { status: 400 });
  }

  const price = await fetchStockPrice(symbol);

  if (price === null) {
    return Response.json(
      { error: "Could not fetch price" },
      { status: 502 }
    );
  }

  return Response.json({ data: { price } });
}
