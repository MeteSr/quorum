import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "@/services/actor";

const CANISTER_ID_ARC = (process.env as any).CANISTER_ID_ARC || "";

// ─── IDL Factory ─────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
export function idlFactory({ IDL }: { IDL: any }) {
  const RequestType = IDL.Variant({
    Fence:       IDL.Null,
    Addition:    IDL.Null,
    Roof:        IDL.Null,
    Landscaping: IDL.Null,
    Deck:        IDL.Null,
    Siding:      IDL.Null,
    Window:      IDL.Null,
    Other:       IDL.Null,
  });

  const RequestStatus = IDL.Variant({
    Pending:     IDL.Null,
    UnderReview: IDL.Null,
    Approved:    IDL.Null,
    Rejected:    IDL.Null,
  });

  const ArcRequest = IDL.Record({
    id:          IDL.Text,
    unitId:      IDL.Text,
    requestType: RequestType,
    description: IDL.Text,
    photoHash:   IDL.Opt(IDL.Text),
    status:      RequestStatus,
    reviewNotes: IDL.Opt(IDL.Text),
    submittedBy: IDL.Principal,
    reviewedBy:  IDL.Opt(IDL.Principal),
    createdAt:   IDL.Int,
    updatedAt:   IDL.Int,
  });

  const ArcError = IDL.Variant({
    NotFound:      IDL.Null,
    NotAuthorized: IDL.Null,
    InvalidInput:  IDL.Text,
  });

  const ResultArc = IDL.Variant({ ok: ArcRequest, err: ArcError });

  return IDL.Service({
    submitRequest:      IDL.Func([IDL.Text, RequestType, IDL.Text, IDL.Opt(IDL.Text)], [ResultArc],              []),
    updateStatus:       IDL.Func([IDL.Text, RequestStatus, IDL.Opt(IDL.Text)],          [ResultArc],              []),
    getRequest:         IDL.Func([IDL.Text],                                             [IDL.Opt(ArcRequest)],    ["query"]),
    getRequestsForUnit: IDL.Func([IDL.Text],                                             [IDL.Vec(ArcRequest)],    ["query"]),
    getMyRequests:      IDL.Func([],                                                     [IDL.Vec(ArcRequest)],    ["query"]),
    getAllRequests:      IDL.Func([],                                                     [IDL.Vec(ArcRequest)],    ["query"]),
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type RequestType =
  | { Fence: null }
  | { Addition: null }
  | { Roof: null }
  | { Landscaping: null }
  | { Deck: null }
  | { Siding: null }
  | { Window: null }
  | { Other: null };

export type RequestStatus =
  | { Pending: null }
  | { UnderReview: null }
  | { Approved: null }
  | { Rejected: null };

export interface ArcRequest {
  id:          string;
  unitId:      string;
  requestType: RequestType;
  description: string;
  photoHash:   [] | [string];
  status:      RequestStatus;
  reviewNotes: [] | [string];
  submittedBy: import("@dfinity/principal").Principal;
  reviewedBy:  [] | [import("@dfinity/principal").Principal];
  createdAt:   bigint;
  updatedAt:   bigint;
}

export type ArcError =
  | { NotFound: null }
  | { NotAuthorized: null }
  | { InvalidInput: string };

// ─── Actor ────────────────────────────────────────────────────────────────────

async function createActor() {
  if (!CANISTER_ID_ARC) return null;
  const agent = await getAgent();
  return Actor.createActor(idlFactory, { agent, canisterId: CANISTER_ID_ARC });
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function submitRequest(
  unitId:      string,
  requestType: RequestType,
  description: string,
  photoHash:   [] | [string]
): Promise<{ ok: ArcRequest } | { err: ArcError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { InvalidInput: "canister not deployed" } };
  return actor.submitRequest(unitId, requestType, description, photoHash);
}

export async function updateStatus(
  requestId:   string,
  status:      RequestStatus,
  reviewNotes: [] | [string]
): Promise<{ ok: ArcRequest } | { err: ArcError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.updateStatus(requestId, status, reviewNotes);
}

export async function getRequest(requestId: string): Promise<ArcRequest | null> {
  const actor = await createActor() as any;
  if (!actor) return null;
  const result: [] | [ArcRequest] = await actor.getRequest(requestId);
  return result.length > 0 ? (result[0] ?? null) : null;
}

export async function getRequestsForUnit(unitId: string): Promise<ArcRequest[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getRequestsForUnit(unitId);
}

export async function getMyRequests(): Promise<ArcRequest[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getMyRequests();
}

export async function getAllRequests(): Promise<ArcRequest[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getAllRequests();
}
