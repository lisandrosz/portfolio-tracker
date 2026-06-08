import crypto from "node:crypto";

const HOST = "https://open-api.bingx.com";

export interface BingxResult {
  equity?: number; // Copy Trading wallet balance in USDT (~USD)
  error?: string;
  breakdown?: Record<string, number>; // usdtBalance per account type
}

/**
 * Fetch BingX balances across ALL account types and return the Copy Trading
 * wallet balance. BingX keeps copytrading funds in a separate wallet from the
 * regular perpetual futures account, so /openApi/account/v1/allAccountBalance
 * is used (it lists copyTrading, spot, perp, standard, grid, etc.).
 * Requests are signed with HMAC-SHA256; key goes in the X-BX-APIKEY header.
 */
export async function fetchBingxEquity(
  apiKey: string,
  apiSecret: string
): Promise<BingxResult> {
  if (!apiKey || !apiSecret) return { error: "Faltan las API keys de BingX" };

  try {
    const query = `recvWindow=5000&timestamp=${Date.now()}`;
    const signature = crypto
      .createHmac("sha256", apiSecret)
      .update(query)
      .digest("hex");

    const url = `${HOST}/openApi/account/v1/allAccountBalance?${query}&signature=${signature}`;
    const res = await fetch(url, {
      headers: { "X-BX-APIKEY": apiKey },
      cache: "no-store",
    });

    if (!res.ok) return { error: `BingX HTTP ${res.status}` };

    const json = await res.json();
    if (json.code !== 0) return { error: json.msg || `BingX error code ${json.code}` };

    // data is expected to be an array of { accountType, usdtBalance }.
    const arr = Array.isArray(json.data)
      ? json.data
      : (json.data?.overview ?? json.data?.balances ?? json.data?.list ?? []);

    if (!Array.isArray(arr) || arr.length === 0) {
      return { error: "Respuesta de BingX sin cuentas" };
    }

    const breakdown: Record<string, number> = {};
    let copy: number | null = null;
    for (const it of arr) {
      const type = String(
        it.accountType ?? it.account ?? it.acco ?? it.type ?? ""
      ).toLowerCase();
      const bal = parseFloat(it.usdtBalance ?? it.balance ?? it.usdt ?? it.equity ?? "0");
      const value = isFinite(bal) ? bal : 0;
      if (type) breakdown[type] = value;
      if (type.includes("copy")) copy = value;
    }

    if (copy == null) {
      return {
        error: `No encontré la cuenta de copytrading. Cuentas: ${Object.keys(breakdown).join(", ")}`,
        breakdown,
      };
    }

    return { equity: copy, breakdown };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Fallo de conexion con BingX" };
  }
}
