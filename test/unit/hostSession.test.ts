/**
 * Unit tests for the F-01 host-session cookie mechanism.
 *
 * Tests:
 *   - hostSessionCookieName (from hostCookie.ts) — cookie naming
 *   - extractHostTokenFromCookie (from hostToken.ts) — raw-value cookie extraction
 *
 * The HMAC layer (signHostSession / verifyHostSession) has been removed as part
 * of the F-01 fix: middleware now stores the RAW token in the httpOnly cookie
 * and route handlers verify it via verifyToken(rawToken, event.hostTokenHash).
 */

import { describe, it, expect } from "vitest";
import { hostSessionCookieName } from "../../src/lib/auth/hostCookie";
import { extractHostTokenFromCookie } from "../../src/lib/auth/hostToken";

const EVENT_A = "EVT_HOST_A";
const EVENT_B = "EVT_HOST_B";
const HOST_TOKEN = "some-128bit-host-token-value";

// ---------------------------------------------------------------------------
// hostSessionCookieName
// ---------------------------------------------------------------------------

describe("hostSessionCookieName", () => {
  it("returns a string containing the eventId", () => {
    const name = hostSessionCookieName(EVENT_A);
    expect(name).toContain(EVENT_A);
  });

  it("prefixes with pulse_host_", () => {
    const name = hostSessionCookieName(EVENT_A);
    expect(name).toBe(`pulse_host_${EVENT_A}`);
  });

  it("produces different names for different events", () => {
    expect(hostSessionCookieName(EVENT_A)).not.toBe(hostSessionCookieName(EVENT_B));
  });

  it("is deterministic — same input produces same output", () => {
    expect(hostSessionCookieName(EVENT_A)).toBe(hostSessionCookieName(EVENT_A));
  });

  it("does not import or use node:crypto", () => {
    // This is enforced structurally: hostCookie.ts has no imports.
    // The test documents the invariant.
    const name = hostSessionCookieName("test_event");
    expect(typeof name).toBe("string");
    expect(name).toBe("pulse_host_test_event");
  });
});

// ---------------------------------------------------------------------------
// extractHostTokenFromCookie — happy path
// ---------------------------------------------------------------------------

describe("extractHostTokenFromCookie — present cookie", () => {
  function makeRequest(cookieHeader: string): Request {
    return new Request("https://example.com/api/test", {
      headers: { cookie: cookieHeader },
    });
  }

  it("returns the raw token for a well-formed cookie", () => {
    const cookieName = hostSessionCookieName(EVENT_A);
    const req = makeRequest(`${cookieName}=${HOST_TOKEN}`);
    expect(extractHostTokenFromCookie(req, EVENT_A)).toBe(HOST_TOKEN);
  });

  it("returns the correct token when multiple cookies are present", () => {
    const cookieName = hostSessionCookieName(EVENT_A);
    const req = makeRequest(`other_cookie=xyz; ${cookieName}=${HOST_TOKEN}; another=abc`);
    expect(extractHostTokenFromCookie(req, EVENT_A)).toBe(HOST_TOKEN);
  });

  it("returns null for a different event's cookie", () => {
    const cookieNameA = hostSessionCookieName(EVENT_A);
    const req = makeRequest(`${cookieNameA}=${HOST_TOKEN}`);
    // Asking for EVENT_B's cookie — should not match EVENT_A's cookie
    expect(extractHostTokenFromCookie(req, EVENT_B)).toBeNull();
  });

  it("handles tokens with various safe characters", () => {
    for (const tok of ["abc123", "tok-abc_def", "ABCXYZ12345", "XyZ_0-9aB"]) {
      const cookieName = hostSessionCookieName(EVENT_A);
      const req = makeRequest(`${cookieName}=${tok}`);
      expect(extractHostTokenFromCookie(req, EVENT_A)).toBe(tok);
    }
  });
});

// ---------------------------------------------------------------------------
// extractHostTokenFromCookie — missing / empty cookie
// ---------------------------------------------------------------------------

describe("extractHostTokenFromCookie — missing cookie", () => {
  function makeRequest(cookieHeader?: string): Request {
    const headers: Record<string, string> = {};
    if (cookieHeader !== undefined) headers.cookie = cookieHeader;
    return new Request("https://example.com/api/test", { headers });
  }

  it("returns null when no Cookie header is present", () => {
    const req = makeRequest();
    expect(extractHostTokenFromCookie(req, EVENT_A)).toBeNull();
  });

  it("returns null when the Cookie header is empty", () => {
    const req = makeRequest("");
    expect(extractHostTokenFromCookie(req, EVENT_A)).toBeNull();
  });

  it("returns null when only unrelated cookies are present", () => {
    const req = makeRequest("session=abc; user_pref=dark");
    expect(extractHostTokenFromCookie(req, EVENT_A)).toBeNull();
  });

  it("returns null when cookie value is empty string", () => {
    const cookieName = hostSessionCookieName(EVENT_A);
    const req = makeRequest(`${cookieName}=`);
    expect(extractHostTokenFromCookie(req, EVENT_A)).toBeNull();
  });
});
