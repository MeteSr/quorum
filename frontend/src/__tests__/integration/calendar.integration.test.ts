/**
 * Integration tests — calendar canister.
 *
 * What these tests prove that unit tests cannot:
 *   - EventType + EventVisibility Variant round-trips
 *   - location Opt(Text) serializes as [] and [string] correctly
 *   - createEvent returns a CalendarEvent with BigInt startAt/endAt
 *   - listEvents returns events within the time window
 *   - getUpcomingEvents returns upcoming events up to limit
 *   - getEvent returns the event by id
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Actor } from "@icp-sdk/core/agent";
import { idlFactory } from "@/services/calendar";
import { getAgent } from "@/services/actor";

const CANISTER_ID = (process.env as any).CANISTER_ID_CALENDAR || "";
const deployed = !!CANISTER_ID;

const RUN_ID    = Date.now();
const NOW_NS    = BigInt(Date.now()) * BigInt(1_000_000);
const HOUR_NS   = BigInt(60 * 60 * 1000) * BigInt(1_000_000);
const START_NS  = NOW_NS + HOUR_NS;
const END_NS    = START_NS + HOUR_NS * BigInt(2);

async function getActor() {
  return Actor.createActor(idlFactory, { agent: await getAgent(), canisterId: CANISTER_ID });
}

describe.skipIf(!deployed)("createEvent — Candid serialization", () => {
  let event: any;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.createEvent(
      `HOA Annual Meeting ${RUN_ID}`,
      START_NS,
      END_NS,
      { Meeting: null },
      { All: null },
      ["Community Room B"]
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    event = result.ok;
  });

  it("returns a non-empty id", () => {
    expect(event.id).toBeTruthy();
  });

  it("title is preserved", () => {
    expect(event.title).toBe(`HOA Annual Meeting ${RUN_ID}`);
  });

  it("EventType Variant round-trips as Meeting", () => {
    expect(event.eventType).toHaveProperty("Meeting");
  });

  it("EventVisibility Variant round-trips as All", () => {
    expect(event.visibility).toHaveProperty("All");
  });

  it("startAt round-trips as BigInt", () => {
    expect(event.startAt).toBe(START_NS);
  });

  it("endAt round-trips as BigInt", () => {
    expect(event.endAt).toBe(END_NS);
  });

  it("location round-trips as populated Opt (length 1)", () => {
    expect(event.location).toHaveLength(1);
    expect(event.location[0]).toBe("Community Room B");
  });

  it("createdAt is a BigInt", () => {
    expect(typeof event.createdAt).toBe("bigint");
  });
});

describe.skipIf(!deployed)("createEvent — location Opt empty", () => {
  it("location Opt serializes as [] when omitted", async () => {
    const a = await getActor();
    const result = await a.createEvent(
      `No-location event ${RUN_ID}`,
      START_NS + HOUR_NS * BigInt(3),
      END_NS + HOUR_NS * BigInt(3),
      { CommunityEvent: null },
      { Board: null },
      []
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    expect(result.ok.location).toHaveLength(0);
    expect(result.ok.eventType).toHaveProperty("CommunityEvent");
    expect(result.ok.visibility).toHaveProperty("Board");
  });
});

describe.skipIf(!deployed)("listEvents — time-range query", () => {
  let eventId: string;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.createEvent(
      `Maintenance window ${RUN_ID}`,
      START_NS + HOUR_NS * BigInt(6),
      END_NS + HOUR_NS * BigInt(6),
      { MaintenanceWindow: null },
      { All: null },
      []
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    eventId = result.ok.id;
  });

  it("returns events within the queried range", async () => {
    const a = await getActor();
    const rangeStart = NOW_NS;
    const rangeEnd   = NOW_NS + HOUR_NS * BigInt(20);
    const events = await a.listEvents(rangeStart, rangeEnd) as any[];
    const found = events.find((e: any) => e.id === eventId);
    expect(found).toBeDefined();
  });

  it("does not return events outside the range", async () => {
    const a = await getActor();
    // Range ends before our event starts
    const events = await a.listEvents(NOW_NS, NOW_NS + HOUR_NS) as any[];
    // The query may return our START_NS event (1hr from now) if within range —
    // only assert all returned events respect the range bounds
    for (const e of events) {
      expect(e.startAt).toBeGreaterThanOrEqual(NOW_NS);
      expect(e.startAt).toBeLessThan(NOW_NS + HOUR_NS * BigInt(2));
    }
  });
});

describe.skipIf(!deployed)("getUpcomingEvents — limit", () => {
  it("returns at most limit events", async () => {
    const a = await getActor();
    const events = await a.getUpcomingEvents(BigInt(2)) as any[];
    expect(events.length).toBeLessThanOrEqual(2);
  });

  it("returns an array (may be empty if none upcoming)", async () => {
    const a = await getActor();
    const events = await a.getUpcomingEvents(BigInt(50)) as any[];
    expect(Array.isArray(events)).toBe(true);
  });
});

describe.skipIf(!deployed)("getEvent — by id", () => {
  let eventId: string;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.createEvent(
      `Holiday closure ${RUN_ID}`,
      START_NS + HOUR_NS * BigInt(10),
      END_NS + HOUR_NS * BigInt(10),
      { Holiday: null },
      { All: null },
      ["Pool area"]
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    eventId = result.ok.id;
  });

  it("getEvent returns the event by id", async () => {
    const a = await getActor();
    const result = await a.getEvent(eventId) as any[];
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(eventId);
    expect(result[0].eventType).toHaveProperty("Holiday");
  });

  it("getEvent returns empty Opt for unknown id", async () => {
    const a = await getActor();
    const result = await a.getEvent("nonexistent-id-xyz") as any[];
    expect(result.length).toBe(0);
  });
});
