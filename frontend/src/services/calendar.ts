import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "@/services/actor";

const CANISTER_ID_CALENDAR = (process.env as any).CANISTER_ID_CALENDAR || "";

// ─── IDL Factory ─────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
export function idlFactory({ IDL }: { IDL: any }) {
  const EventType = IDL.Variant({
    Meeting:           IDL.Null,
    CommunityEvent:    IDL.Null,
    MaintenanceWindow: IDL.Null,
    Holiday:           IDL.Null,
  });
  const EventVisibility = IDL.Variant({
    All:   IDL.Null,
    Board: IDL.Null,
  });
  const CalendarEvent = IDL.Record({
    id:         IDL.Text,
    title:      IDL.Text,
    startAt:    IDL.Int,
    endAt:      IDL.Int,
    eventType:  EventType,
    visibility: EventVisibility,
    location:   IDL.Opt(IDL.Text),
    createdBy:  IDL.Principal,
    createdAt:  IDL.Int,
  });
  const HttpRequest = IDL.Record({
    method:  IDL.Text,
    url:     IDL.Text,
    headers: IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text)),
    body:    IDL.Vec(IDL.Nat8),
  });
  const HttpResponse = IDL.Record({
    status_code: IDL.Nat16,
    headers:     IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text)),
    body:        IDL.Vec(IDL.Nat8),
  });
  const Error = IDL.Variant({
    NotFound:      IDL.Null,
    NotAuthorized: IDL.Null,
    InvalidInput:  IDL.Text,
  });
  const ResultEvent = IDL.Variant({ ok: CalendarEvent, err: Error });
  const ResultNull  = IDL.Variant({ ok: IDL.Null,        err: Error });
  return IDL.Service({
    setMeetingsCanisterId: IDL.Func([IDL.Text], [], []),
    createEvent:     IDL.Func([IDL.Text, IDL.Int, IDL.Int, EventType, EventVisibility, IDL.Opt(IDL.Text)], [ResultEvent], []),
    deleteEvent:     IDL.Func([IDL.Text],                                                                   [ResultNull],  []),
    getEvent:        IDL.Func([IDL.Text],                            [IDL.Opt(CalendarEvent)], ["query"]),
    listEvents:      IDL.Func([IDL.Int, IDL.Int],                   [IDL.Vec(CalendarEvent)], ["query"]),
    getUpcomingEvents: IDL.Func([IDL.Nat],                          [IDL.Vec(CalendarEvent)], ["query"]),
    http_request:    IDL.Func([HttpRequest],                        [HttpResponse],            ["query"]),
  });
}

// ─── TypeScript Types ─────────────────────────────────────────────────────────

export type EventType =
  | { Meeting: null }
  | { CommunityEvent: null }
  | { MaintenanceWindow: null }
  | { Holiday: null };

export type EventVisibility =
  | { All: null }
  | { Board: null };

export type CalendarEvent = {
  id: string;
  title: string;
  startAt: bigint;
  endAt: bigint;
  eventType: EventType;
  visibility: EventVisibility;
  location: [] | [string];
  createdBy: any;
  createdAt: bigint;
};

// ─── Actor ───────────────────────────────────────────────────────────────────

function getActor() {
  if (!CANISTER_ID_CALENDAR) return null;
  return Actor.createActor(idlFactory, {
    agent:     getAgent() as any,
    canisterId: CANISTER_ID_CALENDAR,
  }) as any;
}

// ─── Service Functions ────────────────────────────────────────────────────────

export async function createEvent(
  title: string,
  startAt: bigint,
  endAt: bigint,
  eventType: EventType,
  visibility: EventVisibility,
  location?: string
): Promise<CalendarEvent> {
  const actor = getActor();
  if (!actor) return {} as CalendarEvent;
  const result = await actor.createEvent(
    title, startAt, endAt, eventType, visibility,
    location ? [location] : []
  );
  if ("err" in result) throw new Error(JSON.stringify(result.err));
  return result.ok;
}

export async function deleteEvent(id: string): Promise<void> {
  const actor = getActor();
  if (!actor) return;
  const result = await actor.deleteEvent(id);
  if ("err" in result) throw new Error(JSON.stringify(result.err));
}

export async function getEvent(id: string): Promise<CalendarEvent | null> {
  const actor = getActor();
  if (!actor) return null;
  const result = await actor.getEvent(id);
  return result.length > 0 ? (result[0] ?? null) : null;
}

export async function listEvents(startAt: bigint, endAt: bigint): Promise<CalendarEvent[]> {
  const actor = getActor();
  if (!actor) return [];
  return actor.listEvents(startAt, endAt);
}

export async function getUpcomingEvents(limit: number): Promise<CalendarEvent[]> {
  const actor = getActor();
  if (!actor) return [];
  return actor.getUpcomingEvents(BigInt(limit));
}
