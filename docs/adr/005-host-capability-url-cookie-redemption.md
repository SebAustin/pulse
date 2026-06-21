# ADR-005: Host Capability-URL Redeemed into httpOnly Cookie

**Status:** Accepted  
**Date:** 2026-06-21 (fix for security finding F-01)

---

## Context

The original design placed the host token directly in the URL path: `/host/<eventId>/<hostToken>`. This is a _capability URL_ — possession of the URL is equivalent to host-level access. Keeping the token in the URL causes it to:

- Appear permanently in browser history.
- Appear in server access logs and CDN/proxy logs.
- Leak via `Referer` header to any third-party asset (analytics, fonts, CDN) loaded on host pages.
- Be visible on a shared screen or screen recording.

The security audit rated this **HIGH** (finding F-01).

---

## Decision

Add **Edge Middleware** (`src/middleware.ts`) that intercepts requests to `/host/<eventId>/<hostToken>` (and any sub-paths like `/host/<eventId>/<hostToken>/summary`), stores the raw token in an httpOnly cookie, and 307-redirects to the tokenless URL.

- Cookie name: `pulse_host_<eventId>` (event-scoped, so cookies from different events cannot cross-contaminate).
- Cookie attributes: `httpOnly; SameSite=Strict; Secure (on HTTPS); Path=/`.
- No HMAC is applied to the cookie value — the raw token is the credential. Authorization happens in Node.js route handlers and Server Components via `verifyToken(rawToken, event.hostTokenHash)` (SHA-256 comparison with `timingSafeEqual`).
- A reserved-path guard prevents the middleware from treating the literal string `"summary"` as a host token (which would clobber the real cookie and break navigation to the summary page after redemption).

After the 307 redirect, the host console loads at `/host/<eventId>` — the token no longer appears in the URL. All subsequent host API calls (`/api/events/[eventId]/ops`, etc.) send the cookie automatically.

---

## Consequences

**Positive:**

- The token leaves the URL on the very first request. Browser history, logs, and Referer headers see only `/host/<eventId>`.
- `httpOnly` prevents JavaScript from reading the cookie — XSS cannot exfiltrate the host token.
- `SameSite=Strict` prevents the cookie from being sent on cross-site navigations (CSRF protection).
- The redemption is transparent to the host — they navigate to the magic link and land on the console as before.

**Negative / trade-offs:**

- Residual: the token appears in the URL _during the initial redemption request_ (visible in server-side access logs for that one request). This is the standard capability-link caveat and is not avoidable without a separate out-of-band token delivery mechanism.
- The middleware runs at the Edge (no Node.js crypto available), so the token is stored raw rather than HMAC-signed. The security is provided by the httpOnly + SameSite cookie attributes rather than a MAC. This is acceptable because the route handlers independently verify the raw token against the stored SHA-256 hash.
- Session cookies (no `maxAge`) expire when the browser closes. The host must revisit the original magic link to re-authenticate if they close all browser sessions.
- Switching to a different hosting environment that does not support Edge Middleware would require porting the redemption logic to a server-side route.
