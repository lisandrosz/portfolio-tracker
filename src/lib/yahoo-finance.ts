const BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

export async function fetchStockPrice(
  symbol: string
): Promise<number | null> {
  try {
    const res = await fetch(`${BASE_URL}/${encodeURIComponent(symbol)}?interval=1d&range=1d`, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!res.ok) {
      console.error("Yahoo Finance API error:", res.status, symbol);
      return null;
    }

    const data = await res.json();
    const price =
      data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
    return price;
  } catch (err) {
    console.error("Yahoo Finance fetch failed:", symbol, err);
    return null;
  }
}

export async function fetchStockPrices(
  symbols: string[]
): Promise<Record<string, number>> {
  const results: Record<string, number> = {};

  // Fetch sequentially to avoid rate limiting
  for (const symbol of symbols) {
    const price = await fetchStockPrice(symbol);
    if (price !== null) {
      results[symbol] = price;
    }
  }

  return results;
}
