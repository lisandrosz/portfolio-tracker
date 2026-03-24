import { fetchDolarBlue } from "@/lib/dolar-api";

export async function GET() {
  const dolar = await fetchDolarBlue();

  if (!dolar) {
    return Response.json(
      { error: "Could not fetch dolar price" },
      { status: 502 }
    );
  }

  return Response.json({ data: dolar });
}
