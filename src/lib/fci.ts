const BASE = "https://api.argentinadatos.com/v1/finanzas/fci";
const CATEGORIES = ["mercadoDinero", "rentaFija", "rentaVariable", "otros"];

export interface FciFund {
  fondo: string; // fund name (used as the stable identifier)
  vcp: number; // valor cuotaparte, in ARS
  categoria: string;
  fecha?: string;
}

interface RawFund {
  fondo: string;
  vcp: number;
  fecha?: string;
}

/** Fetch the latest cuotaparte values across all FCI categories. */
export async function fetchAllFunds(): Promise<FciFund[]> {
  const results = await Promise.all(
    CATEGORIES.map(async (cat) => {
      try {
        const res = await fetch(`${BASE}/${cat}/ultimo`, {
          next: { revalidate: 3600 }, // cache 1h
        });
        if (!res.ok) return [];
        const data = (await res.json()) as RawFund[];
        return data
          .filter((f) => f.fondo && typeof f.vcp === "number")
          .map((f) => ({ fondo: f.fondo, vcp: f.vcp, categoria: cat, fecha: f.fecha }));
      } catch {
        return [];
      }
    })
  );
  return results.flat();
}

/** Search funds by name substring (e.g. "cocos"). */
export async function searchFunds(query: string): Promise<FciFund[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const all = await fetchAllFunds();
  return all
    .filter((f) => f.fondo.toLowerCase().includes(q))
    .sort((a, b) => a.fondo.localeCompare(b.fondo))
    .slice(0, 25);
}

/** Latest cuotaparte (ARS) for an exact fund name. Null if not found. */
export async function fetchFundVcp(fundName: string): Promise<number | null> {
  const all = await fetchAllFunds();
  const match = all.find((f) => f.fondo === fundName);
  return match ? match.vcp : null;
}
