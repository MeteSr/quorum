import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "@/services/actor";

const CANISTER_ID_ANNOUNCEMENTS = (process.env as any).CANISTER_ID_ANNOUNCEMENTS || "";

// ─── IDL Factory ─────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
export function idlFactory({ IDL }: { IDL: any }) {
  const Priority = IDL.Variant({
    Normal: IDL.Null,
    Urgent: IDL.Null,
  });

  const Severity = IDL.Variant({
    Info:      IDL.Null,
    Warning:   IDL.Null,
    Emergency: IDL.Null,
  });

  const Announcement = IDL.Record({
    id:        IDL.Text,
    title:     IDL.Text,
    body:      IDL.Text,
    priority:  Priority,
    postedBy:  IDL.Principal,
    postedAt:  IDL.Int,
    expiresAt: IDL.Opt(IDL.Int),
  });

  const Broadcast = IDL.Record({
    id:       IDL.Text,
    title:    IDL.Text,
    body:     IDL.Text,
    severity: Severity,
    sentBy:   IDL.Principal,
    sentAt:   IDL.Int,
  });

  const Error = IDL.Variant({
    NotFound:      IDL.Null,
    NotAuthorized: IDL.Null,
    InvalidInput:  IDL.Text,
  });

  const ResultAnnouncement = IDL.Variant({ ok: Announcement, err: Error });
  const ResultBroadcast    = IDL.Variant({ ok: Broadcast,    err: Error });
  const ResultUnit         = IDL.Variant({ ok: IDL.Null,     err: Error });

  return IDL.Service({
    post:                 IDL.Func([IDL.Text, IDL.Text, Priority, IDL.Opt(IDL.Int)], [ResultAnnouncement], []),
    delete:               IDL.Func([IDL.Text],                                        [ResultUnit],         []),
    getAnnouncement:      IDL.Func([IDL.Text],                                        [IDL.Opt(Announcement)], ["query"]),
    getActive:            IDL.Func([],                                                [IDL.Vec(Announcement)], ["query"]),
    getUrgent:            IDL.Func([],                                                [IDL.Vec(Announcement)], ["query"]),
    getAll:               IDL.Func([],                                                [IDL.Vec(Announcement)], ["query"]),
    broadcastEmergency:   IDL.Func([IDL.Text, IDL.Text, Severity],                   [ResultBroadcast],    []),
    getBroadcasts:        IDL.Func([],                                                [IDL.Vec(Broadcast)], ["query"]),
    getRecentBroadcasts:  IDL.Func([IDL.Nat],                                         [IDL.Vec(Broadcast)], ["query"]),
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type Priority = { Normal: null } | { Urgent: null };
export type Severity = { Info: null } | { Warning: null } | { Emergency: null };

export interface Announcement {
  id:        string;
  title:     string;
  body:      string;
  priority:  Priority;
  postedBy:  import("@dfinity/principal").Principal;
  postedAt:  bigint;
  expiresAt: [] | [bigint];
}

export interface Broadcast {
  id:       string;
  title:    string;
  body:     string;
  severity: Severity;
  sentBy:   import("@dfinity/principal").Principal;
  sentAt:   bigint;
}

export type AnnouncementsError =
  | { NotFound: null }
  | { NotAuthorized: null }
  | { InvalidInput: string };

// ─── Actor ────────────────────────────────────────────────────────────────────

async function createActor() {
  if (!CANISTER_ID_ANNOUNCEMENTS) return null;
  const agent = await getAgent();
  return Actor.createActor(idlFactory, { agent, canisterId: CANISTER_ID_ANNOUNCEMENTS });
}

// ─── Announcement Service ─────────────────────────────────────────────────────

export async function getActive(): Promise<Announcement[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getActive();
}

export async function getUrgent(): Promise<Announcement[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getUrgent();
}

export async function getAll(): Promise<Announcement[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getAll();
}

export async function post(
  title: string, body: string, priority: Priority, expiresAt: [] | [bigint]
): Promise<{ ok: Announcement } | { err: AnnouncementsError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.post(title, body, priority, expiresAt);
}

export async function deleteAnnouncement(
  id: string
): Promise<{ ok: null } | { err: AnnouncementsError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.delete(id);
}

// ─── Broadcast Service ────────────────────────────────────────────────────────

export async function broadcastEmergency(
  title: string, body: string, severity: Severity
): Promise<{ ok: Broadcast } | { err: AnnouncementsError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.broadcastEmergency(title, body, severity);
}

export async function getBroadcasts(): Promise<Broadcast[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getBroadcasts();
}

export async function getRecentBroadcasts(days: number): Promise<Broadcast[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getRecentBroadcasts(BigInt(days));
}
