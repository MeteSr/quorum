import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "@/services/actor";

const CANISTER_ID_TREASURY = (process.env as any).CANISTER_ID_TREASURY || "";

// ─── IDL Factory ─────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
export function idlFactory({ IDL }: { IDL: any }) {
  const AssessmentType = IDL.Variant({
    MonthlyDues:       IDL.Null,
    SpecialAssessment: IDL.Null,
    Fine:              IDL.Null,
    Amenity:           IDL.Null,
  });

  const PaymentStatus = IDL.Variant({
    Outstanding: IDL.Null,
    Paid:        IDL.Null,
    Waived:      IDL.Null,
    Disputed:    IDL.Null,
  });

  const Assessment = IDL.Record({
    id:          IDL.Text,
    unitId:      IDL.Text,
    amountCents: IDL.Nat,
    kind:        AssessmentType,
    description: IDL.Text,
    dueDate:     IDL.Int,
    status:      PaymentStatus,
    paidAt:      IDL.Opt(IDL.Int),
    createdAt:   IDL.Int,
    createdBy:   IDL.Principal,
  });

  const Error = IDL.Variant({
    NotFound:      IDL.Null,
    NotAuthorized: IDL.Null,
    InvalidInput:  IDL.Text,
  });

  const ResultAssessment = IDL.Variant({ ok: Assessment, err: Error });

  return IDL.Service({
    setMembersCanisterId:      IDL.Func([IDL.Text],                                           [],                    []),
    postAssessment:            IDL.Func([IDL.Text, IDL.Nat, AssessmentType, IDL.Text, IDL.Int], [ResultAssessment],   []),
    markPaid:                  IDL.Func([IDL.Text],                                           [ResultAssessment],    []),
    waiveAssessment:           IDL.Func([IDL.Text],                                           [ResultAssessment],    []),
    getAssessment:             IDL.Func([IDL.Text],                                           [IDL.Opt(Assessment)], ["query"]),
    getAssessmentsForUnit:     IDL.Func([IDL.Text],                                           [IDL.Vec(Assessment)], ["query"]),
    getOutstandingAssessments: IDL.Func([],                                                   [IDL.Vec(Assessment)], ["query"]),
    getTotalOutstandingCents:  IDL.Func([],                                                   [IDL.Nat],             ["query"]),
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type AssessmentType = { MonthlyDues: null } | { SpecialAssessment: null } | { Fine: null } | { Amenity: null };
export type PaymentStatus  = { Outstanding: null } | { Paid: null } | { Waived: null } | { Disputed: null };

export interface Assessment {
  id:          string;
  unitId:      string;
  amountCents: bigint;
  kind:        AssessmentType;
  description: string;
  dueDate:     bigint;
  status:      PaymentStatus;
  paidAt:      [] | [bigint];
  createdAt:   bigint;
  createdBy:   import("@dfinity/principal").Principal;
}

export type TreasuryError = { NotFound: null } | { NotAuthorized: null } | { InvalidInput: string };

// ─── Actor ────────────────────────────────────────────────────────────────────

async function createActor() {
  if (!CANISTER_ID_TREASURY) return null;
  const agent = await getAgent();
  return Actor.createActor(idlFactory, { agent, canisterId: CANISTER_ID_TREASURY });
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function getOutstandingAssessments(): Promise<Assessment[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getOutstandingAssessments();
}

export async function getAssessmentsForUnit(unitId: string): Promise<Assessment[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getAssessmentsForUnit(unitId);
}

export async function getTotalOutstandingCents(): Promise<bigint> {
  const actor = await createActor() as any;
  if (!actor) return BigInt(0);
  return actor.getTotalOutstandingCents();
}

export async function markPaid(id: string): Promise<{ ok: Assessment } | { err: TreasuryError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.markPaid(id);
}
