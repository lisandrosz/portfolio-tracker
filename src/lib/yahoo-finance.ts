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

export interface SymbolResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export async function searchSymbols(
  query: string
): Promise<SymbolResult[]> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
      }
    );

    if (!res.ok) {
      console.error("Yahoo Finance search error:", res.status);
      return [];
    }

    const data = await res.json();
    const quotes = data?.quotes || [];

    return quotes
      .filter((q: Record<string, string>) => q.quoteType === "EQUITY" || q.quoteType === "ETF")
      .map((q: Record<string, string>) => ({
        symbol: q.symbol,
        name: q.shortname || q.longname || q.symbol,
        exchange: q.exchange || "",
        type: q.quoteType || "",
      }));
  } catch (err) {
    console.error("Yahoo Finance search failed:", err);
    return [];
  }
}
