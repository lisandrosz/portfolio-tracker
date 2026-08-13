import { NextRequest } from "next/server";
import { fetchDolarBlue, getBlueForDate } from "@/lib/dolar-api";

export async function GET(request: NextRequest) {
  // ?date=YYYY-MM-DD returns the rate for that day, so a form can suggest the
  // rate a past payment would be frozen at before it is saved.
  const date = request.nextUrl.searchParams.get("date");
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return Response.json({ error: "Fecha inválida" }, { status: 400 });
    }
    const venta = await getBlueForDate(date);
    if (venta == null) {
      return Response.json({ error: "Could not fetch dolar price" }, { status: 502 });
    }
    return Response.json({ data: { venta, date } });
  }

  const dolar = await fetchDolarBlue();

  if (!dolar) {
    return Response.json(
      { error: "Could not fetch dolar price" },
      { status: 502 }
    );
  }

  return Response.json({ data: dolar });
}
