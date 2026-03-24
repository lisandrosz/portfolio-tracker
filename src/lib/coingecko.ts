const BASE_URL = "https://api.coingecko.com/api/v3";

export interface CoinPrice {
  [coinId: string]: {
    usd: number;
  };
}

export async function fetchCryptoPrices(
  coinIds: string[]
): Promise<CoinPrice | null> {
  if (coinIds.length === 0) return null;

  try {
    const ids = coinIds.join(",");
    const res = await fetch(
      `${BASE_URL}/simple/price?ids=${ids}&vs_currencies=usd`,
      { next: { revalidate: 300 } } // cache 5 min
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
      `${BASE_URL}/coins/${coinId}/history?date=${formatted}&localization=false`
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
