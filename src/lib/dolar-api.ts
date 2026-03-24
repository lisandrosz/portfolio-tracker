export interface DolarPrice {
  compra: number;
  venta: number;
}

export async function fetchDolarBlue(): Promise<DolarPrice | null> {
  try {
    const res = await fetch("https://dolarapi.com/v1/dolares/blue");
    if (!res.ok) {
      console.error("DolarApi error:", res.status);
      return null;
    }
    const data = await res.json();
    return { compra: data.compra, venta: data.venta };
  } catch (err) {
    console.error("DolarApi fetch failed:", err);
    return null;
  }
}
