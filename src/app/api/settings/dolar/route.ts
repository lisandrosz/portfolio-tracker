import { NextRequest } from "next/server";
import { getUsdRate, setManualRate } from "@/lib/dolar-api";
import { autoSnapshot } from "@/lib/snapshot";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * The ARS/USD rate the portfolio converts at: read it, override it, or drop the
 * override and go back to following the published blue.
 */
export async function GET() {
  return Response.json({ data: await getUsdRate() });
}

// Wide enough to outlive a lot of inflation, tight enough to catch a fat finger
// (typing the amount of pesos instead of the rate).
const rateSchema = z.object({ rate: z.number().positive().max(10_000_000) });

export async function POST(request: NextRequest) {
  try {
    const { rate } = rateSchema.parse(await request.json());
    await setManualRate(rate);
    // Today's snapshot was computed at the old rate. Restating it keeps the
    // chart from carrying a step that never happened to the portfolio.
    await autoSnapshot();
    return Response.json({ data: await getUsdRate() });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE() {
  await setManualRate(null);
  await autoSnapshot();
  return Response.json({ data: await getUsdRate() });
}
