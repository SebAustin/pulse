/**
 * Unit tests for src/lib/dynamo/keys.ts
 *
 * Tests: key builder round-trips, GSI key correctness, sk parsers.
 */

import { describe, it, expect } from "vitest";
import {
  eventMetaKey,
  codeKey,
  gsi1Key,
  momentKey,
  momentSk,
  voteSk,
  counterShardSk,
  counterPrefix,
  reactionKey,
  wordSk,
  wordPrefix,
  lbSk,
  gsi2Pk,
  gsi2Sk,
  gsi2Keys,
  userSk,
  connSk,
  opsWritesKey,
  opsWritesSk,
  parseMomentSk,
  parseUserSk,
  parseConnSk,
  skType,
  USER_PREFIX,
  CONN_PREFIX,
  OPS_WRITES_PREFIX,
} from "../../src/lib/dynamo/keys";

describe("eventMetaKey", () => {
  it("builds correct pk and sk", () => {
    const key = eventMetaKey("EVT123");
    expect(key.pk).toBe("EVENT#EVT123");
    expect(key.sk).toBe("METADATA");
  });
});

describe("codeKey", () => {
  it("uppercases the code", () => {
    const key = codeKey("abc123");
    expect(key.pk).toBe("CODE#ABC123");
    expect(key.sk).toBe("EVENT");
  });

  it("is idempotent for already-uppercase codes", () => {
    const key = codeKey("XYZ789");
    expect(key.pk).toBe("CODE#XYZ789");
  });
});

describe("gsi1Key", () => {
  it("returns correct GSI1 keys for code lookup", () => {
    const key = gsi1Key("ABC123");
    expect(key.gsi1pk).toBe("CODE#ABC123");
    expect(key.gsi1sk).toBe("EVENT");
  });
});

describe("momentKey / momentSk", () => {
  it("builds MOMENT# sk", () => {
    const sk = momentSk("m_abc");
    expect(sk).toBe("MOMENT#m_abc");
  });

  it("builds full key for a moment", () => {
    const key = momentKey("EVT1", "m_abc");
    expect(key.pk).toBe("EVENT#EVT1");
    expect(key.sk).toBe("MOMENT#m_abc");
  });

  it("round-trips through parseMomentSk", () => {
    const sk = momentSk("m_xyz");
    expect(parseMomentSk(sk)).toBe("m_xyz");
  });
});

describe("voteSk / voteKey", () => {
  it("builds VOTE# sk", () => {
    const sk = voteSk("m_01", "u_abc");
    expect(sk).toBe("VOTE#m_01#u_abc");
  });

  it("different participants produce different sks", () => {
    const sk1 = voteSk("m_01", "u_aaa");
    const sk2 = voteSk("m_01", "u_bbb");
    expect(sk1).not.toBe(sk2);
  });

  it("same participant + moment always produces same sk (idempotent dedup key)", () => {
    expect(voteSk("m_01", "u_abc")).toBe(voteSk("m_01", "u_abc"));
  });
});

describe("counterShardKey / counterShardSk", () => {
  it("builds COUNTER# sk with shard suffix", () => {
    const sk = counterShardSk("m_01", "optA", 3);
    expect(sk).toBe("COUNTER#m_01#optA#3");
  });

  it("different shards produce different sks", () => {
    const sk0 = counterShardSk("m_01", "optA", 0);
    const sk9 = counterShardSk("m_01", "optA", 9);
    expect(sk0).not.toBe(sk9);
  });

  it("counterPrefix is a valid query prefix", () => {
    const prefix = counterPrefix("m_01");
    expect("COUNTER#m_01#optA#0".startsWith(prefix)).toBe(true);
    expect("COUNTER#m_01#optB#5".startsWith(prefix)).toBe(true);
    expect("MOMENT#m_01".startsWith(prefix)).toBe(false);
  });
});

describe("reactionKey", () => {
  it("embeds timestamp in sk", () => {
    const key = reactionKey("EVT1", 1718900200123, "r_xyz");
    expect(key.sk).toBe("REACTION#1718900200123#r_xyz");
  });
});

describe("wordKey / wordSk", () => {
  it("builds WORD# sk per participant", () => {
    const sk = wordSk("m_02", "u_abc");
    expect(sk).toBe("WORD#m_02#u_abc");
  });

  it("wordPrefix is correct query prefix", () => {
    const prefix = wordPrefix("m_02");
    expect("WORD#m_02#u_abc".startsWith(prefix)).toBe(true);
    expect("WORD#m_03#u_abc".startsWith(prefix)).toBe(false);
  });
});

describe("lbKey / gsi2", () => {
  it("builds LB# sk", () => {
    expect(lbSk("u_abc")).toBe("LB#u_abc");
  });

  it("gsi2Pk is correct", () => {
    expect(gsi2Pk("EVT1")).toBe("LBEVENT#EVT1");
  });

  it("gsi2Sk zero-pads score to 10 digits", () => {
    expect(gsi2Sk(42, "u_abc")).toBe("0000000042#u_abc");
    expect(gsi2Sk(1000000000, "u_abc")).toBe("1000000000#u_abc");
    expect(gsi2Sk(0, "u_abc")).toBe("0000000000#u_abc");
  });

  it("higher score produces lexicographically greater gsi2sk", () => {
    const low = gsi2Sk(100, "u_abc");
    const high = gsi2Sk(900, "u_abc");
    expect(high > low).toBe(true);
  });

  it("gsi2Keys returns both partition and sort key", () => {
    const keys = gsi2Keys("EVT1", 500, "u_abc");
    expect(keys.gsi2pk).toBe("LBEVENT#EVT1");
    expect(keys.gsi2sk).toBe("0000000500#u_abc");
  });
});

describe("userKey", () => {
  it("builds USER# sk", () => {
    expect(userSk("u_abc")).toBe("USER#u_abc");
  });

  it("round-trips through parseUserSk", () => {
    expect(parseUserSk(userSk("u_xyz"))).toBe("u_xyz");
  });

  it("USER_PREFIX is correct", () => {
    expect(userSk("u_abc").startsWith(USER_PREFIX)).toBe(true);
  });
});

describe("connKey", () => {
  it("builds CONN# sk", () => {
    expect(connSk("c_9f2")).toBe("CONN#c_9f2");
  });

  it("round-trips through parseConnSk", () => {
    expect(parseConnSk(connSk("c_xyz"))).toBe("c_xyz");
  });

  it("CONN_PREFIX is correct", () => {
    expect(connSk("c_abc").startsWith(CONN_PREFIX)).toBe(true);
  });
});

describe("opsWritesKey", () => {
  it("builds OPS#WRITES# sk with epoch second", () => {
    const key = opsWritesKey("EVT1", 1718900200);
    expect(key.sk).toBe("OPS#WRITES#1718900200");
  });

  it("OPS_WRITES_PREFIX is correct query prefix", () => {
    expect(opsWritesSk(1718900200).startsWith(OPS_WRITES_PREFIX)).toBe(true);
  });
});

describe("skType", () => {
  it("extracts entity type from sk", () => {
    expect(skType("METADATA")).toBe("METADATA");
    expect(skType("MOMENT#m_01")).toBe("MOMENT");
    expect(skType("VOTE#m_01#u_abc")).toBe("VOTE");
    expect(skType("COUNTER#m_01#optA#3")).toBe("COUNTER");
    expect(skType("USER#u_abc")).toBe("USER");
    expect(skType("CONN#c_9f2")).toBe("CONN");
  });
});
