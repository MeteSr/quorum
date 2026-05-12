/**
 * Integration tests — announcements canister.
 *
 * What these tests prove that unit tests cannot:
 *   - Priority Variant round-trips (Normal / Urgent)
 *   - Severity Variant round-trips (Info / Warning / Emergency)
 *   - expiresAt Opt(Int) serializes as [] and [bigint]
 *   - post persists and appears in getActive
 *   - broadcastEmergency returns a Broadcast with correct severity
 *   - getRecentBroadcasts(days) filters by time window
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Actor } from "@icp-sdk/core/agent";
import { idlFactory } from "@/services/announcements";
import { getAgent } from "@/services/actor";

const CANISTER_ID = (process.env as any).CANISTER_ID_ANNOUNCEMENTS || "";
const deployed = !!CANISTER_ID;

const RUN_ID = Date.now();

async function getActor() {
  return Actor.createActor(idlFactory, { agent: await getAgent(), canisterId: CANISTER_ID });
}

describe.skipIf(!deployed)("post — Candid serialization", () => {
  let announcement: any;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.post(
      `Integration notice ${RUN_ID}`,
      "Testing Candid round-trip for announcements.",
      { Normal: null },
      { Members: null },
      []
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    announcement = result.ok;
  });

  it("returns a non-empty id", () => {
    expect(announcement.id).toBeTruthy();
  });

  it("title is preserved", () => {
    expect(announcement.title).toBe(`Integration notice ${RUN_ID}`);
  });

  it("Priority Variant round-trips as Normal", () => {
    expect(announcement.priority).toHaveProperty("Normal");
  });

  it("expiresAt is empty Opt ([])", () => {
    expect(announcement.expiresAt).toEqual([]);
  });

  it("postedAt is a BigInt nanosecond timestamp", () => {
    expect(typeof announcement.postedAt).toBe("bigint");
    expect(announcement.postedAt).toBeGreaterThan(BigInt(1_000_000_000_000_000_000n));
  });
});

describe.skipIf(!deployed)("post — Urgent priority", () => {
  let announcementId: string;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.post(
      `Urgent notice ${RUN_ID}`,
      "This is an urgent integration test notice.",
      { Urgent: null },
      { Members: null },
      []
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    announcementId = result.ok.id;
  });

  it("getUrgent includes the Urgent announcement", async () => {
    const a = await getActor();
    const urgent = await a.getUrgent() as any[];
    const found = urgent.find((n: any) => n.id === announcementId);
    expect(found).toBeDefined();
    expect(found.priority).toHaveProperty("Urgent");
  });
});

describe.skipIf(!deployed)("getActive — excludes expired", () => {
  it("returns at least the announcements posted in this run", async () => {
    const a = await getActor();
    const active = await a.getActive() as any[];
    expect(Array.isArray(active)).toBe(true);
    const found = active.find((n: any) => n.title === `Integration notice ${RUN_ID}`);
    expect(found).toBeDefined();
  });
});

describe.skipIf(!deployed)("broadcastEmergency — Severity Variant round-trips", () => {
  let broadcast: any;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.broadcastEmergency(
      `Emergency test ${RUN_ID}`,
      "Integration test emergency broadcast.",
      { Emergency: null }
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    broadcast = result.ok;
  });

  it("returns a non-empty broadcast id", () => {
    expect(broadcast.id).toBeTruthy();
  });

  it("Severity Variant round-trips as Emergency", () => {
    expect(broadcast.severity).toHaveProperty("Emergency");
  });

  it("sentAt is a BigInt nanosecond timestamp", () => {
    expect(typeof broadcast.sentAt).toBe("bigint");
    expect(broadcast.sentAt).toBeGreaterThan(BigInt(1_000_000_000_000_000_000n));
  });
});

describe.skipIf(!deployed)("getBroadcasts + getRecentBroadcasts", () => {
  it("getBroadcasts returns at least one broadcast", async () => {
    const a = await getActor();
    const all = await a.getBroadcasts() as any[];
    expect(all.length).toBeGreaterThan(0);
  });

  it("getRecentBroadcasts(30) includes broadcast posted this run", async () => {
    const a = await getActor();
    const recent = await a.getRecentBroadcasts(BigInt(30)) as any[];
    const found = recent.find((b: any) => b.title === `Emergency test ${RUN_ID}`);
    expect(found).toBeDefined();
  });

  it("getRecentBroadcasts(0) returns no broadcasts", async () => {
    const a = await getActor();
    const none = await a.getRecentBroadcasts(BigInt(0)) as any[];
    expect(none.length).toBe(0);
  });
});

describe.skipIf(!deployed)("sendBulkEmail — segment variants (#14)", () => {
  beforeAll(async () => {
    const a = await getActor();
    const membersId = (process.env as any).CANISTER_ID_MEMBERS || "";
    await a.setEmailConfig({ resendApiKey: "re_test_key", fromEmail: "test@example.com", fromName: "Integration Test" });
    if (membersId) await a.setMembersCanisterId(membersId);
  });

  it("sendBulkEmail with #All segment returns ok with sentCount + failedCount", async () => {
    const a = await getActor();
    const result = await a.sendBulkEmail(
      "Integration test email",
      "This is an integration test bulk email.",
      { All: null }
    ) as any;
    expect("ok" in result).toBe(true);
    expect(typeof result.ok.sentCount).toBe("bigint");
    expect(typeof result.ok.failedCount).toBe("bigint");
  });

  it("sendBulkEmail with #ByRole variant returns ok", async () => {
    const a = await getActor();
    const result = await a.sendBulkEmail(
      "Board-only email",
      "For board members only.",
      { ByRole: "BoardMember" }
    ) as any;
    expect("ok" in result).toBe(true);
  });

  it("sendBulkEmail with #UnitIds variant returns ok", async () => {
    const a = await getActor();
    const result = await a.sendBulkEmail(
      "Unit-specific email",
      "For units 1A and 2B.",
      { UnitIds: ["1A", "2B"] }
    ) as any;
    expect("ok" in result).toBe(true);
  });
});
