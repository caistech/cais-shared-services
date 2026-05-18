/**
 * Admin auth — cookie-token middleware.
 *
 * /admin/* is gated by a single shared secret (ADMIN_TOKEN env var). The
 * caller bootstraps the cookie by visiting /admin?token=<secret> once; the
 * middleware sets an httpOnly cookie and redirects to a clean URL. After
 * that, the cookie carries the session for 30 days. No password form, no
 * DB users — this is a single-operator dashboard.
 */

import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "cais_admin";
const COOKIE_TTL_SECONDS = 60 * 60 * 24 * 30;

export function middleware(req: NextRequest): NextResponse {
  if (!req.nextUrl.pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    return new NextResponse(
      "Admin is disabled — ADMIN_TOKEN is not set on this deployment.",
      { status: 503, headers: { "Content-Type": "text/plain" } },
    );
  }

  const cookieValue = req.cookies.get(COOKIE)?.value;
  if (cookieValue && timingSafeEqual(cookieValue, token)) {
    return NextResponse.next();
  }

  const queryToken = req.nextUrl.searchParams.get("token");
  if (queryToken && timingSafeEqual(queryToken, token)) {
    const url = req.nextUrl.clone();
    url.searchParams.delete("token");
    const res = NextResponse.redirect(url);
    res.cookies.set(COOKIE, token, {
      httpOnly: true,
      secure: req.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_TTL_SECONDS,
    });
    return res;
  }

  return new NextResponse(
    "Not authorised. Append ?token=<your admin token> to this URL to sign in.",
    { status: 401, headers: { "Content-Type": "text/plain" } },
  );
}

export const config = {
  matcher: ["/admin/:path*"],
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
