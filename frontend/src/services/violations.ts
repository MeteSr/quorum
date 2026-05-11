import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "@/services/actor";

const CANISTER_ID_VIOLATIONS = (process.env as any).CANISTER_ID_VIOLATIONS || "";

// ─── IDL Factory ─────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
export function idlFactory({ IDL }: { IDL: any }) {
  const ViolationCategory = IDL.Variant({
    Parking:    IDL.Null,
    Noise:      IDL.Null,
    Landscaping:IDL.Null,
    Pet:        IDL.Null,
    Other:      IDL.Null,
  });

  const ViolationStatus = IDL.Variant({
    Open:        IDL.Null,
    UnderReview: IDL.Null,
    Resolved:    IDL.Null,
  });

  const Reply = IDL.Record({
    author:    IDL.Principal,
    text:      IDL.Text,
    createdAt: IDL.Int,
  });

  const Violation = IDL.Record({
    id:          IDL.Text,
    unitId:      IDL.Text,
    category:    ViolationCategory,
    description: IDL.Text,
    photoHash:   IDL.Opt(IDL.Text),
    status:      ViolationStatus,
    replies:     IDL.Vec(Reply),
    submittedBy: IDL.Principal,
    createdAt:   IDL.Int,
    updatedAt:   IDL.Int,
  });

  const ViolationError = IDL.Variant({
    NotFound:      IDL.Null,
    NotAuthorized: IDL.Null,
    InvalidInput:  IDL.Text,
  });

  const ResultViolation = IDL.Variant({ ok: Violation, err: ViolationError });

  return IDL.Service({
    createViolation:      IDL.Func([IDL.Text, ViolationCategory, IDL.Text, IDL.Opt(IDL.Text)], [ResultViolation], []),
    addReply:             IDL.Func([IDL.Text, IDL.Text],                                        [ResultViolation], []),
    updateStatus:         IDL.Func([IDL.Text, ViolationStatus],                                 [ResultViolation], []),
    getViolation:         IDL.Func([IDL.Text],                                                  [IDL.Opt(Violation)], ["query"]),
    getMyViolations:      IDL.Func([],                                                           [IDL.Vec(Violation)], ["query"]),
    getViolationsForUnit: IDL.Func([IDL.Text],                                                  [IDL.Vec(Violation)], ["query"]),
    getAllViolations:      IDL.Func([],                                                           [IDL.Vec(Violation)], ["query"]),
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ViolationCategory =
  | { Parking: null }
  | { Noise: null }
  | { Landscaping: null }
  | { Pet: null }
  | { Other: null };

export type ViolationStatus =
  | { Open: null }
  | { UnderReview: null }
  | { Resolved: null };

export interface Reply {
  author:    import("@dfinity/principal").Principal;
  text:      string;
  createdAt: bigint;
}

export interface Violation {
  id:          string;
  unitId:      string;
  category:    ViolationCategory;
  description: string;
  photoHash:   [] | [string];
  status:      ViolationStatus;
  replies:     Reply[];
  submittedBy: import("@dfinity/principal").Principal;
  createdAt:   bigint;
  updatedAt:   bigint;
}

export type ViolationError =
  | { NotFound: null }
  | { NotAuthorized: null }
  | { InvalidInput: string };

// ─── Actor ────────────────────────────────────────────────────────────────────

async function createActor() {
  if (!CANISTER_ID_VIOLATIONS) return null;
  const agent = await getAgent();
  return Actor.createActor(idlFactory, { agent, canisterId: CANISTER_ID_VIOLATIONS });
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function createViolation(
  unitId: string,
  category: ViolationCategory,
  description: string,
  photoHash: [] | [string]
): Promise<{ ok: Violation } | { err: ViolationError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { InvalidInput: "canister not deployed" } };
  return actor.createViolation(unitId, category, description, photoHash);
}

export async function addReply(
  violationId: string,
  text: string
): Promise<{ ok: Violation } | { err: ViolationError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.addReply(violationId, text);
}

export async function updateStatus(
  violationId: string,
  status: ViolationStatus
): Promise<{ ok: Violation } | { err: ViolationError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.updateStatus(violationId, status);
}

export async function getViolation(id: string): Promise<Violation | null> {
  const actor = await createActor() as any;
  if (!actor) return null;
  const result: [] | [Violation] = await actor.getViolation(id);
  return result.length > 0 ? (result[0] ?? null) : null;
}

export async function getMyViolations(): Promise<Violation[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getMyViolations();
}

export async function getViolationsForUnit(unitId: string): Promise<Violation[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getViolationsForUnit(unitId);
}

export async function getAllViolations(): Promise<Violation[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getAllViolations();
}
