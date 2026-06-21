/**
 * Edge Middleware — host capability-URL redemption (F-01 fix).
 *
 * The host magic link has the shape:
 *   /host/<eventId>/<hostToken>          (console)
 *   /host/<eventId>/<hostToken>/summary  (summary — also redeems)
 *
 * When a request arrives at a 3+-segment /host path (i.e. the hostToken
 * segment is present), this middleware:
 *   1. Stores the raw hostToken in an httpOnly, SameSite=Strict cookie
 *      `pulse_host_<eventId>` (NO HMAC — raw token only).
 *   2. 307-redirects to the tokenless path:
 *      /host/<eventId>          (console)
 *      /host/<eventId>/summary  (summary)
 *
 * After redemption the raw token no longer appears in the URL — it lives only
 * in the httpOnly cookie, invisible to browser history, server access logs,
 * referrer headers, and shared-screen.
 *
 * Authorization (token-hash comparison via verifyToken) stays in the
 * server-side route handlers and Server Components which run on Node.js.
 * This middleware is EDGE-ONLY and must NEVER import node:crypto or any
 * module that transitively imports it.
 *
 * Paths NOT touched by this middleware:
 *   - /host/<eventId>           (tokenless console — already redeemed)
 *   - /host/<eventId>/summary   (tokenless summary — already redeemed)
 *   - All other paths
 *
 * NFR-03.4 / F-01 / PLAN §1.2.
 */

import { NextRequest, NextResponse } from "next/server";
import { hostSessionCookieName } from "./lib/auth/hostCookie";

export const config = {
  /**
   * Match /host/[eventId]/[hostToken] and /host/[eventId]/[hostToken]/anything.
   * The hostToken segment must be present (3 or more path segments after /host/).
   * We do NOT match the already-tokenless /host/[eventId] (2 segments).
   *
   * Pattern: /host/  <something>  /  <something>  (with optional trailing)
   */
  matcher: ["/host/:eventId/:hostToken/:rest*"],
};

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  // Split path into segments, e.g. ["", "host", eventId, hostToken, ...]
  const segments = pathname.split("/");

  // segments[0] = ""
  // segments[1] = "host"
  // segments[2] = eventId
  // segments[3] = hostToken
  // segments[4+] = optional sub-paths ("summary", etc.)

  const eventId = segments[2];
  const hostToken = segments[3];

  // Safety guard: should always be truthy given the matcher pattern above,
  // but if somehow we reach here without a token segment, pass through.
  if (!eventId || !hostToken) {
    return NextResponse.next();
  }

  // Determine the tokenless redirect target, preserving any sub-path after the token.
  // e.g. /host/abc/TOKEN/summary  →  /host/abc/summary
  const subPath = segments.slice(4).join("/");
  const tokenlessPath = subPath
    ? `/host/${eventId}/${subPath}`
    : `/host/${eventId}`;

  const cookieName = hostSessionCookieName(eventId);

  // 307-redirect to the tokenless URL so the token does not persist in history.
  const redirectUrl = req.nextUrl.clone();
  redirectUrl.pathname = tokenlessPath;

  const response = NextResponse.redirect(redirectUrl, 307);

  // Set the httpOnly session cookie with the RAW token value.
  // - httpOnly: not accessible from JS, preventing XSS exfiltration.
  // - SameSite=Strict: not sent on cross-site navigations.
  // - Secure in production: only sent over HTTPS.
  // - path="/": site-wide so the cookie is sent to /api/events/... routes.
  //   The cookie name is already event-scoped (pulse_host_<eventId>), so
  //   different events cannot cross-contaminate. Path-scoping to /host/<eventId>
  //   would prevent the cookie from reaching /api/... endpoints.
  // - No HMAC: the raw token is the credential; verification happens in
  //   Node.js route handlers via verifyToken(rawToken, event.hostTokenHash).
  response.cookies.set(cookieName, hostToken, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // No explicit maxAge — session cookie; expires when browser is closed.
  });

  return response;
}
