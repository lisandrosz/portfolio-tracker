import { rebuildHistory } from "@/lib/backfill";

export const dynamic = "force-dynamic";

// Reconstructs the daily history from transactions + historical prices.
// Called by the client after assets/transactions change.
export async function POST() {
  try {
    const result = await rebuildHistory();
    return Response.json({ data: result });
  } catch (err) {
    console.error("rebuild failed:", err);
    return Response.json({ error: "No se pudo reconstruir el historial" }, { status: 500 });
  }
}
