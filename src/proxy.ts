import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

/**
 * Gate the whole app behind a session cookie. Auth is enforced ONLY when
 * AUTH_SECRET is configured (set on Vercel); without it (local dev) everything
 * passes through, so the local app keeps working exactly as before.
 *
 * (Next 16 renamed the `middleware` convention to `proxy`.)
 */
export async function proxy(req: NextRequest) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return NextResponse.next(); // auth disabled (local dev)

  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const authed = await verifySessionToken(secret, token);

  // Always allow the login page and the auth endpoints.
  const isAuthPath = pathname === "/login" || pathname.startsWith("/api/auth/");

  if (authed) {
    if (pathname === "/login") return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  }

  if (isAuthPath) return NextResponse.next();

  // Not authenticated: APIs get 401, pages get redirected to /login.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  // Run on everything except Next internals and static image assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)",
  ],
};
