import { NextRequest } from "next/server";
import { fetchHistoricalPrice } from "@/lib/coingecko";

export async function GET(request: NextRequest) {
  const coinId = request.nextUrl.searchParams.get("coin_id");
  const date = request.nextUrl.searchParams.get("date");

  if (!coinId || !date) {
    return Response.json(
      { error: "coin_id and date are required" },
      { status: 400 }
    );
  }

  const price = await fetchHistoricalPrice(coinId, date);

  if (price === null) {
    return Response.json(
      { error: "Could not fetch historical price" },
      { status: 502 }
    );
  }

  return Response.json({ data: { price } });
}
