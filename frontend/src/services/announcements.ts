import { Actor, HttpAgent } from "@dfinity/agent";

declare const CANISTER_ID_ANNOUNCEMENTS: string;

// ─── IDL Factory ─────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
export function idlFactory({ IDL }: { IDL: any }) {
  const Priority = IDL.Variant({
    Normal: IDL.Null,
    Urgent: IDL.Null,
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

  const Error = IDL.Variant({
    NotFound:      IDL.Null,
    NotAuthorized: IDL.Null,
    InvalidInput:  IDL.Text,
  });

  const ResultAnnouncement = IDL.Variant({ ok: Announcement, err: Error });
  const ResultUnit         = IDL.Variant({ ok: IDL.Null,     err: Error });

  return IDL.Service({
    post:            IDL.Func([IDL.Text, IDL.Text, Priority, IDL.Opt(IDL.Int)], [ResultAnnouncement], []),
    delete:          IDL.Func([IDL.Text],                                       [ResultUnit],         []),
    getAnnouncement: IDL.Func([IDL.Text],                                       [IDL.Opt(Announcement)], ["query"]),
    getActive:       IDL.Func([],                                               [IDL.Vec(Announcement)], ["query"]),
    getUrgent:       IDL.Func([],                                               [IDL.Vec(Announcement)], ["query"]),
    getAll:          IDL.Func([],                                               [IDL.Vec(Announcement)], ["query"]),
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type Priority = { Normal: null } | { Urgent: null };

export interface Announcement {
  id:        string;
  title:     string;
  body:      string;
  priority:  Priority;
  postedBy:  import("@dfinity/principal").Principal;
  postedAt:  bigint;
  expiresAt: [] | [bigint];
}

export type AnnouncementsError =
  | { NotFound: null }
  | { NotAuthorized: null }
  | { InvalidInput: string };

// ─── Actor ────────────────────────────────────────────────────────────────────

function createActor() {
  if (!CANISTER_ID_ANNOUNCEMENTS) return null;
  const agent = new HttpAgent();
  if (typeof window === "undefined" || window.location.hostname === "localhost") {
    agent.fetchRootKey().catch(() => {});
  }
  return Actor.createActor(idlFactory, { agent, canisterId: CANISTER_ID_ANNOUNCEMENTS });
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function getActive(): Promise<Announcement[]> {
  const actor = createActor() as any;
  if (!actor) return [];
  return actor.getActive();
}

export async function getUrgent(): Promise<Announcement[]> {
  const actor = createActor() as any;
  if (!actor) return [];
  return actor.getUrgent();
}

export async function getAll(): Promise<Announcement[]> {
  const actor = createActor() as any;
  if (!actor) return [];
  return actor.getAll();
}

export async function post(
  title: string, body: string, priority: Priority, expiresAt: [] | [bigint]
): Promise<{ ok: Announcement } | { err: AnnouncementsError }> {
  const actor = createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.post(title, body, priority, expiresAt);
}

export async function deleteAnnouncement(
  id: string
): Promise<{ ok: null } | { err: AnnouncementsError }> {
  const actor = createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.delete(id);
}
