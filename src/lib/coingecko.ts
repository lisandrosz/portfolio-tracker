const BASE_URL = "https://api.coingecko.com/api/v3";

export interface CoinPrice {
  [coinId: string]: {
    usd: number;
    usd_24h_change?: number;
  };
}

export async function fetchCryptoPrices(
  coinIds: string[]
): Promise<CoinPrice | null> {
  if (coinIds.length === 0) return null;

  try {
    const ids = coinIds.join(",");
    const res = await fetch(
      `${BASE_URL}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
      { next: { revalidate: 25 } } // cache ~25s (works with 30s polling)
    );

    if (!res.ok) {
      console.error("CoinGecko API error:", res.status);
      return null;
    }

    return (await res.json()) as CoinPrice;
  } catch (err) {
    console.error("CoinGecko fetch failed:", err);
    return null;
  }
}

export async function fetchHistoricalPrice(
  coinId: string,
  date: string // YYYY-MM-DD
): Promise<number | null> {
  try {
    // CoinGecko expects dd-mm-yyyy
    const [y, m, d] = date.split("-");
    const formatted = `${d}-${m}-${y}`;
    const res = await fetch(
      `${BASE_URL}/coins/${coinId}/history?date=${formatted}&localization=false`,
      { next: { revalidate: 86400 } }
    );

    if (!res.ok) {
      console.error("CoinGecko history API error:", res.status);
      return null;
    }

    const data = await res.json();
    return data?.market_data?.current_price?.usd ?? null;
  } catch (err) {
    console.error("CoinGecko history fetch failed:", err);
    return null;
  }
}

/**
 * Daily USD prices for a coin from `fromDate` (YYYY-MM-DD) to today.
 * Returns a map of date -> usd price. One API call covers the whole range.
 */
export async function fetchDailyPrices(
  coinId: string,
  fromDate: string
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const from = Math.floor(new Date(`${fromDate}T00:00:00Z`).getTime() / 1000);
    const to = Math.floor(Date.now() / 1000);
    const res = await fetch(
      `${BASE_URL}/coins/${coinId}/market_chart/range?vs_currency=usd&from=${from}&to=${to}`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) {
      console.error("CoinGecko market_chart error:", res.status, coinId);
      return out;
    }
    const data = await res.json();
    const prices: Array<[number, number]> = data?.prices ?? [];
    // Keep the last price seen per calendar day (UTC).
    for (const [ts, price] of prices) {
      const date = new Date(ts).toISOString().split("T")[0];
      out.set(date, price);
    }
  } catch (err) {
    console.error("CoinGecko market_chart failed:", coinId, err);
  }
  return out;
}
