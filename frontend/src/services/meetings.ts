import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "@/services/actor";

const CANISTER_ID_MEETINGS = (process.env as any).CANISTER_ID_MEETINGS || "";

// ─── IDL Factory ─────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
export function idlFactory({ IDL }: { IDL: any }) {
  const MeetingType = IDL.Variant({
    Annual:  IDL.Null,
    Board:   IDL.Null,
    Special: IDL.Null,
  });
  const MotionOutcome = IDL.Variant({
    Passed: IDL.Null,
    Failed: IDL.Null,
    Tabled: IDL.Null,
  });
  const MotionVotes = IDL.Record({
    forVotes:      IDL.Nat,
    againstVotes:  IDL.Nat,
    abstainVotes:  IDL.Nat,
  });
  const Motion = IDL.Record({
    id:           IDL.Text,
    text:         IDL.Text,
    movedBy:      IDL.Text,
    secondedBy:   IDL.Text,
    outcome:      MotionOutcome,
    votes:        MotionVotes,
  });
  const AgendaItem = IDL.Record({
    id:           IDL.Text,
    title:        IDL.Text,
    presenter:    IDL.Opt(IDL.Text),
    durationMins: IDL.Opt(IDL.Nat),
    motions:      IDL.Vec(Motion),
  });
  const Meeting = IDL.Record({
    id:           IDL.Text,
    date:         IDL.Int,
    meetingType:  MeetingType,
    agendaItems:  IDL.Vec(AgendaItem),
    attendees:    IDL.Vec(IDL.Principal),
    quorumMet:    IDL.Bool,
    minutesText:  IDL.Opt(IDL.Text),
    createdBy:    IDL.Principal,
    createdAt:    IDL.Int,
    updatedAt:    IDL.Int,
  });
  const Error = IDL.Variant({
    NotFound:      IDL.Null,
    NotAuthorized: IDL.Null,
    InvalidInput:  IDL.Text,
  });
  const ResultMeeting  = IDL.Variant({ ok: Meeting,   err: Error });
  const ResultText     = IDL.Variant({ ok: IDL.Text,  err: Error });
  return IDL.Service({
    setCalendarCanisterId:  IDL.Func([IDL.Text], [], []),
    setDocumentsCanisterId: IDL.Func([IDL.Text], [], []),
    createMeeting:    IDL.Func([IDL.Int, MeetingType, IDL.Vec(IDL.Text)],               [ResultMeeting], []),
    addAgendaItem:    IDL.Func([IDL.Text, IDL.Text, IDL.Opt(IDL.Text), IDL.Opt(IDL.Nat)], [ResultMeeting], []),
    recordAttendance: IDL.Func([IDL.Text, IDL.Vec(IDL.Principal)],                       [ResultMeeting], []),
    addMotion:        IDL.Func([IDL.Text, IDL.Text, IDL.Text, IDL.Text, IDL.Text, MotionOutcome, MotionVotes], [ResultMeeting], []),
    generateMinutes:  IDL.Func([IDL.Text],                                               [ResultText],    []),
    getMeeting:       IDL.Func([IDL.Text],                                               [IDL.Opt(Meeting)], ["query"]),
    getAllMeetings:    IDL.Func([],                                                       [IDL.Vec(Meeting)], ["query"]),
  });
}

// ─── TypeScript Types ─────────────────────────────────────────────────────────

export type MeetingType =
  | { Annual: null }
  | { Board: null }
  | { Special: null };

export type MotionOutcome =
  | { Passed: null }
  | { Failed: null }
  | { Tabled: null };

export type MotionVotes = {
  forVotes: bigint;
  againstVotes: bigint;
  abstainVotes: bigint;
};

export type Motion = {
  id: string;
  text: string;
  movedBy: string;
  secondedBy: string;
  outcome: MotionOutcome;
  votes: MotionVotes;
};

export type AgendaItem = {
  id: string;
  title: string;
  presenter: [] | [string];
  durationMins: [] | [bigint];
  motions: Motion[];
};

export type Meeting = {
  id: string;
  date: bigint;
  meetingType: MeetingType;
  agendaItems: AgendaItem[];
  attendees: any[];
  quorumMet: boolean;
  minutesText: [] | [string];
  createdBy: any;
  createdAt: bigint;
  updatedAt: bigint;
};

// ─── Actor ───────────────────────────────────────────────────────────────────

function getActor() {
  if (!CANISTER_ID_MEETINGS) return null;
  return Actor.createActor(idlFactory, {
    agent:     getAgent() as any,
    canisterId: CANISTER_ID_MEETINGS,
  }) as any;
}

// ─── Service Functions ────────────────────────────────────────────────────────

export async function createMeeting(
  date: bigint,
  meetingType: MeetingType,
  agendaItemTitles: string[]
): Promise<Meeting> {
  const actor = getActor();
  if (!actor) return {} as Meeting;
  const result = await actor.createMeeting(date, meetingType, agendaItemTitles);
  if ("err" in result) throw new Error(JSON.stringify(result.err));
  return result.ok;
}

export async function addAgendaItem(
  meetingId: string,
  title: string,
  presenter?: string,
  durationMins?: number
): Promise<Meeting> {
  const actor = getActor();
  if (!actor) return {} as Meeting;
  const result = await actor.addAgendaItem(
    meetingId,
    title,
    presenter ? [presenter] : [],
    durationMins !== undefined ? [BigInt(durationMins)] : []
  );
  if ("err" in result) throw new Error(JSON.stringify(result.err));
  return result.ok;
}

export async function recordAttendance(
  meetingId: string,
  attendees: any[]
): Promise<Meeting> {
  const actor = getActor();
  if (!actor) return {} as Meeting;
  const result = await actor.recordAttendance(meetingId, attendees);
  if ("err" in result) throw new Error(JSON.stringify(result.err));
  return result.ok;
}

export async function addMotion(
  meetingId: string,
  agendaItemId: string,
  text: string,
  movedBy: string,
  secondedBy: string,
  outcome: MotionOutcome,
  votes: MotionVotes
): Promise<Meeting> {
  const actor = getActor();
  if (!actor) return {} as Meeting;
  const result = await actor.addMotion(
    meetingId, agendaItemId, text, movedBy, secondedBy, outcome, votes
  );
  if ("err" in result) throw new Error(JSON.stringify(result.err));
  return result.ok;
}

export async function generateMinutes(meetingId: string): Promise<string> {
  const actor = getActor();
  if (!actor) return "";
  const result = await actor.generateMinutes(meetingId);
  if ("err" in result) throw new Error(JSON.stringify(result.err));
  return result.ok;
}

export async function getMeeting(id: string): Promise<Meeting | null> {
  const actor = getActor();
  if (!actor) return null;
  const result = await actor.getMeeting(id);
  return result.length > 0 ? (result[0] ?? null) : null;
}

export async function getAllMeetings(): Promise<Meeting[]> {
  const actor = getActor();
  if (!actor) return [];
  return actor.getAllMeetings();
}
