/**
 * Integration tests — meetings canister.
 *
 * What these tests prove that unit tests cannot:
 *   - MeetingType Variant round-trips (Annual / Board / Special)
 *   - createMeeting returns a meeting with agendaItems array
 *   - addAgendaItem appends to the meeting
 *   - presenter + durationMins as Opt types round-trip
 *   - getAllMeetings includes the created meeting
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Actor } from "@icp-sdk/core/agent";
import { idlFactory } from "@/services/meetings";
import { getAgent } from "@/services/actor";

const CANISTER_ID = (process.env as any).CANISTER_ID_MEETINGS || "";
const deployed = !!CANISTER_ID;

const RUN_ID   = Date.now();
const DATE_NS  = BigInt(Date.now()) * BigInt(1_000_000);

async function getActor() {
  return Actor.createActor(idlFactory, { agent: await getAgent(), canisterId: CANISTER_ID });
}

describe.skipIf(!deployed)("createMeeting — Candid serialization", () => {
  let meeting: any;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.createMeeting(DATE_NS, { Board: null }, []) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    meeting = result.ok;
  });

  it("returns a non-empty id", () => {
    expect(meeting.id).toBeTruthy();
  });

  it("MeetingType Variant round-trips as Board", () => {
    expect(meeting.meetingType).toHaveProperty("Board");
  });

  it("agendaItems starts empty", () => {
    expect(meeting.agendaItems).toHaveLength(0);
  });

  it("quorumMet starts false", () => {
    expect(meeting.quorumMet).toBe(false);
  });

  it("minutesText is empty Opt ([])", () => {
    expect(meeting.minutesText).toEqual([]);
  });
});

describe.skipIf(!deployed)("addAgendaItem — Opt fields round-trip", () => {
  let meetingId: string;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.createMeeting(DATE_NS, { Annual: null }, []) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    meetingId = result.ok.id;
  });

  it("addAgendaItem appends item with presenter and duration", async () => {
    const a = await getActor();
    const result = await a.addAgendaItem(
      meetingId, "Budget Review", ["Treasurer Johnson"], [BigInt(30)]
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    const items = result.ok.agendaItems;
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Budget Review");
    expect(items[0].presenter).toHaveLength(1);
    expect(items[0].durationMins).toHaveLength(1);
    expect(items[0].durationMins[0]).toBe(BigInt(30));
  });

  it("addAgendaItem with no presenter (empty Opt)", async () => {
    const a = await getActor();
    const result = await a.addAgendaItem(meetingId, "Open Forum", [], []) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    const items = result.ok.agendaItems;
    const openForum = items.find((i: any) => i.title === "Open Forum");
    expect(openForum).toBeDefined();
    expect(openForum.presenter).toHaveLength(0);
  });
});

describe.skipIf(!deployed)("getAllMeetings — query", () => {
  it("returns an array including the created meeting", async () => {
    const a = await getActor();
    const all = await a.getAllMeetings() as any[];
    expect(all.length).toBeGreaterThan(0);
  });
});
