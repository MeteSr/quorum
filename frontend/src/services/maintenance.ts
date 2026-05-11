import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "@/services/actor";

const CANISTER_ID_MAINTENANCE = (process.env as any).CANISTER_ID_MAINTENANCE || "";

// ─── IDL Factory ─────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
export function idlFactory({ IDL }: { IDL: any }) {
  const RequestCategory = IDL.Variant({
    Plumbing:    IDL.Null,
    Electrical:  IDL.Null,
    HVAC:        IDL.Null,
    Structural:  IDL.Null,
    Landscaping: IDL.Null,
    Appliance:   IDL.Null,
    Other:       IDL.Null,
  });
  const RequestStatus = IDL.Variant({
    Open:       IDL.Null,
    Assigned:   IDL.Null,
    InProgress: IDL.Null,
    Resolved:   IDL.Null,
    Closed:     IDL.Null,
  });
  const AuditEntry = IDL.Record({
    status:    RequestStatus,
    note:      IDL.Text,
    updatedBy: IDL.Principal,
    updatedAt: IDL.Int,
  });
  const MaintenanceRequest = IDL.Record({
    id:               IDL.Text,
    unitId:           IDL.Text,
    category:         RequestCategory,
    description:      IDL.Text,
    photoHashes:      IDL.Vec(IDL.Text),
    submittedBy:      IDL.Principal,
    assignedVendorId: IDL.Opt(IDL.Text),
    scheduledDate:    IDL.Opt(IDL.Int),
    status:           RequestStatus,
    slaWarning:       IDL.Bool,
    history:          IDL.Vec(AuditEntry),
    createdAt:        IDL.Int,
    updatedAt:        IDL.Int,
  });
  const Error = IDL.Variant({
    NotFound:      IDL.Null,
    NotAuthorized: IDL.Null,
    InvalidInput:  IDL.Text,
  });
  const Result = IDL.Variant({ ok: MaintenanceRequest, err: Error });
  return IDL.Service({
    setMembersCanisterId: IDL.Func([IDL.Text], [], []),
    submitRequest:        IDL.Func([IDL.Text, RequestCategory, IDL.Text, IDL.Vec(IDL.Text)], [Result], []),
    assignRequest:        IDL.Func([IDL.Text, IDL.Text, IDL.Opt(IDL.Int)], [Result], []),
    updateStatus:         IDL.Func([IDL.Text, RequestStatus, IDL.Text], [Result], []),
    getRequest:           IDL.Func([IDL.Text], [IDL.Opt(MaintenanceRequest)], ["query"]),
    getMyRequests:        IDL.Func([], [IDL.Vec(MaintenanceRequest)], ["query"]),
    getRequestsForUnit:   IDL.Func([IDL.Text], [IDL.Vec(MaintenanceRequest)], ["query"]),
    getAllRequests:        IDL.Func([], [IDL.Vec(MaintenanceRequest)], ["query"]),
    getOpenRequests:      IDL.Func([], [IDL.Vec(MaintenanceRequest)], ["query"]),
  });
}

// ─── TypeScript Types ─────────────────────────────────────────────────────────

export type RequestCategory =
  | { Plumbing: null }
  | { Electrical: null }
  | { HVAC: null }
  | { Structural: null }
  | { Landscaping: null }
  | { Appliance: null }
  | { Other: null };

export type RequestStatus =
  | { Open: null }
  | { Assigned: null }
  | { InProgress: null }
  | { Resolved: null }
  | { Closed: null };

export type AuditEntry = {
  status:    RequestStatus;
  note:      string;
  updatedBy: { toText: () => string };
  updatedAt: bigint;
};

export type MaintenanceRequest = {
  id:               string;
  unitId:           string;
  category:         RequestCategory;
  description:      string;
  photoHashes:      string[];
  submittedBy:      { toText: () => string };
  assignedVendorId: [] | [string];
  scheduledDate:    [] | [bigint];
  status:           RequestStatus;
  slaWarning:       boolean;
  history:          AuditEntry[];
  createdAt:        bigint;
  updatedAt:        bigint;
};

export type MaintenanceError =
  | { NotFound: null }
  | { NotAuthorized: null }
  | { InvalidInput: string };

// ─── Actor ────────────────────────────────────────────────────────────────────

async function createActor() {
  if (!CANISTER_ID_MAINTENANCE) return null;
  const agent = await getAgent();
  return Actor.createActor(idlFactory, { agent, canisterId: CANISTER_ID_MAINTENANCE }) as any;
}

// ─── Service Functions ────────────────────────────────────────────────────────

export async function getMyRequests(): Promise<MaintenanceRequest[]> {
  const actor = await createActor();
  if (!actor) return [];
  return actor.getMyRequests();
}

export async function getAllRequests(): Promise<MaintenanceRequest[]> {
  const actor = await createActor();
  if (!actor) return [];
  return actor.getAllRequests();
}

export async function getOpenRequests(): Promise<MaintenanceRequest[]> {
  const actor = await createActor();
  if (!actor) return [];
  return actor.getOpenRequests();
}

export async function getRequestsForUnit(unitId: string): Promise<MaintenanceRequest[]> {
  const actor = await createActor();
  if (!actor) return [];
  return actor.getRequestsForUnit(unitId);
}

export async function submitRequest(
  unitId:      string,
  category:    RequestCategory,
  description: string,
  photoHashes: string[]
): Promise<{ ok: MaintenanceRequest } | { err: MaintenanceError }> {
  const actor = await createActor();
  if (!actor) return { err: { NotAuthorized: null } };
  return actor.submitRequest(unitId, category, description, photoHashes);
}

export async function assignRequest(
  requestId:     string,
  vendorId:      string,
  scheduledDate: bigint | null
): Promise<{ ok: MaintenanceRequest } | { err: MaintenanceError }> {
  const actor = await createActor();
  if (!actor) return { err: { NotAuthorized: null } };
  return actor.assignRequest(requestId, vendorId, scheduledDate === null ? [] : [scheduledDate]);
}

export async function updateStatus(
  requestId: string,
  status:    RequestStatus,
  note:      string
): Promise<{ ok: MaintenanceRequest } | { err: MaintenanceError }> {
  const actor = await createActor();
  if (!actor) return { err: { NotAuthorized: null } };
  return actor.updateStatus(requestId, status, note);
}
