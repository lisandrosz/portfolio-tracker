/**
 * Minimal stateless session auth. A signed cookie holds an expiry; the signature
 * is an HMAC-SHA256 over the payload using AUTH_SECRET. Uses Web Crypto so it
 * runs in BOTH the Edge middleware and Node route handlers.
 *
 * Auth is only enforced when AUTH_SECRET is set (so local dev stays open).
 */

export const SESSION_COOKIE = "pt_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days (seconds)

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Encode to a fresh ArrayBuffer-backed view so it satisfies BufferSource typing. */
function bytes(input: string | Uint8Array): Uint8Array<ArrayBuffer> {
  const u = typeof input === "string" ? enc.encode(input) : input;
  const buf = new ArrayBuffer(u.byteLength);
  const out = new Uint8Array(buf);
  out.set(u);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    bytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/** Build a signed session token valid for `maxAgeSec` seconds. */
export async function createSessionToken(
  secret: string,
  maxAgeSec: number = SESSION_MAX_AGE
): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ exp: Date.now() + maxAgeSec * 1000 })));
  const key = await hmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, bytes(payload)));
  return `${payload}.${b64url(sig)}`;
}

/** Verify signature + expiry of a session token. */
export async function verifySessionToken(
  secret: string,
  token: string | undefined | null
): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    const key = await hmacKey(secret);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      bytes(b64urlDecode(sig)),
      bytes(payload)
    );
    if (!valid) return false;
    const data = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
    return typeof data.exp === "number" && Date.now() < data.exp;
  } catch {
    return false;
  }
}

/** Constant-time string comparison (avoids leaking the password via timing). */
export function safeEqual(a: string, b: string): boolean {
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
}
