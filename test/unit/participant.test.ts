/**
 * Unit tests for src/lib/auth/participant.ts
 *
 * Tests: signParticipant, verifyParticipant, participantCookieName
 * Covers: valid round-trip, tampered HMAC, wrong event, missing cookie,
 *         malformed cookie (F-02 / SC-identity).
 */

import { describe, it, expect } from "vitest";
import {
  signParticipant,
  verifyParticipant,
  participantCookieName,
} from "../../src/lib/auth/participant";

const EVENT_A = "EVT_AAAA";
const EVENT_B = "EVT_BBBB";
const PARTICIPANT = "u_abc123def456";

// ---------------------------------------------------------------------------
// signParticipant
// ---------------------------------------------------------------------------

describe("signParticipant", () => {
  it("returns a non-empty string containing a separator", () => {
    const value = signParticipant(EVENT_A, PARTICIPANT);
    expect(typeof value).toBe("string");
    expect(value.length).toBeGreaterThan(0);
    // Format: <participantId>.<base64url>
    expect(value.includes(".")).toBe(true);
  });

  it("starts with the participantId", () => {
    const value = signParticipant(EVENT_A, PARTICIPANT);
    expect(value.startsWith(PARTICIPANT + ".")).toBe(true);
  });

  it("produces different values for different events (HMAC is event-scoped)", () => {
    const cookieA = signParticipant(EVENT_A, PARTICIPANT);
    const cookieB = signParticipant(EVENT_B, PARTICIPANT);
    expect(cookieA).not.toBe(cookieB);
  });

  it("produces different values for different participants", () => {
    const cookieA = signParticipant(EVENT_A, "u_alice");
    const cookieB = signParticipant(EVENT_A, "u_bob");
    expect(cookieA).not.toBe(cookieB);
  });

  it("is deterministic — same inputs produce same output", () => {
    const first = signParticipant(EVENT_A, PARTICIPANT);
    const second = signParticipant(EVENT_A, PARTICIPANT);
    expect(first).toBe(second);
  });
});

// ---------------------------------------------------------------------------
// verifyParticipant — valid case
// ---------------------------------------------------------------------------

describe("verifyParticipant — valid cookie", () => {
  it("returns the participantId for a valid cookie signed for the same event", () => {
    const cookie = signParticipant(EVENT_A, PARTICIPANT);
    const result = verifyParticipant(EVENT_A, cookie);
    expect(result).toBe(PARTICIPANT);
  });

  it("returns the participantId for multiple different participants", () => {
    for (const pid of ["u_alice", "u_bob", "u_charlie"]) {
      const cookie = signParticipant(EVENT_A, pid);
      expect(verifyParticipant(EVENT_A, cookie)).toBe(pid);
    }
  });
});

// ---------------------------------------------------------------------------
// verifyParticipant — wrong event (replay attack)
// ---------------------------------------------------------------------------

describe("verifyParticipant — wrong event", () => {
  it("returns null when the cookie was signed for a different event", () => {
    // Sign for event A, verify against event B → null (prevents cross-event replay)
    const cookieForA = signParticipant(EVENT_A, PARTICIPANT);
    const result = verifyParticipant(EVENT_B, cookieForA);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// verifyParticipant — tampered HMAC
// ---------------------------------------------------------------------------

describe("verifyParticipant — tampered cookie", () => {
  it("returns null when the HMAC suffix is changed", () => {
    const cookie = signParticipant(EVENT_A, PARTICIPANT);
    // Flip the last character of the HMAC
    const tampered = cookie.slice(0, -1) + (cookie.endsWith("A") ? "B" : "A");
    expect(verifyParticipant(EVENT_A, tampered)).toBeNull();
  });

  it("returns null when the participantId is changed but HMAC is kept", () => {
    const cookie = signParticipant(EVENT_A, PARTICIPANT);
    const dotIndex = cookie.indexOf(".");
    const hmacPart = cookie.slice(dotIndex); // includes the "."
    // Forge a different participantId with the original HMAC
    const forged = "u_attacker" + hmacPart;
    expect(verifyParticipant(EVENT_A, forged)).toBeNull();
  });

  it("returns null for a completely fabricated cookie", () => {
    expect(verifyParticipant(EVENT_A, "u_fake.notavalidhmac")).toBeNull();
  });

  it("returns null for a cookie with no separator", () => {
    expect(verifyParticipant(EVENT_A, "nodotinhere")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// verifyParticipant — missing / empty cookie
// ---------------------------------------------------------------------------

describe("verifyParticipant — missing cookie", () => {
  it("returns null for undefined", () => {
    expect(verifyParticipant(EVENT_A, undefined)).toBeNull();
  });

  it("returns null for null", () => {
    expect(verifyParticipant(EVENT_A, null)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(verifyParticipant(EVENT_A, "")).toBeNull();
  });

  it("returns null for a whitespace-only string", () => {
    expect(verifyParticipant(EVENT_A, "   ")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// participantCookieName
// ---------------------------------------------------------------------------

describe("participantCookieName", () => {
  it("returns a string containing the eventId", () => {
    const name = participantCookieName(EVENT_A);
    expect(name).toContain(EVENT_A);
  });

  it("prefixes with pulse_pt_", () => {
    const name = participantCookieName(EVENT_A);
    expect(name).toBe(`pulse_pt_${EVENT_A}`);
  });

  it("produces different names for different events", () => {
    expect(participantCookieName(EVENT_A)).not.toBe(participantCookieName(EVENT_B));
  });
});
