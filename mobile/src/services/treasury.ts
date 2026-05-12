import { createActor } from "./actor";
import Constants from "expo-constants";

const canisterId: string =
  (Constants.expoConfig?.extra?.canisterIds?.treasury as string | undefined) ?? "";

function idlFactory({ IDL }: { IDL: any }) {
  const AssessmentType = IDL.Variant({
    MonthlyDues:       IDL.Null,
    SpecialAssessment: IDL.Null,
    Fine:              IDL.Null,
    Amenity:           IDL.Null,
    LateFee:           IDL.Null,
  });
  const PaymentStatus = IDL.Variant({
    Outstanding: IDL.Null,
    Paid:        IDL.Null,
    Waived:      IDL.Null,
    Disputed:    IDL.Null,
  });
  const Assessment = IDL.Record({
    id:           IDL.Text,
    unitId:       IDL.Text,
    amountCents:  IDL.Nat,
    kind:         AssessmentType,
    description:  IDL.Text,
    dueDate:      IDL.Int,
    status:       PaymentStatus,
    paidAt:       IDL.Opt(IDL.Int),
    createdAt:    IDL.Int,
  });
  const ResultCheckout = IDL.Variant({
    ok: IDL.Record({ sessionId: IDL.Text, url: IDL.Text }),
    err: IDL.Variant({ NotFound: IDL.Null, NotAuthorized: IDL.Null, InvalidInput: IDL.Text }),
  });

  return IDL.Service({
    getAssessmentsForUnit:     IDL.Func([IDL.Text], [IDL.Vec(Assessment)],  ["query"]),
    getOutstandingAssessments: IDL.Func([],          [IDL.Vec(Assessment)],  ["query"]),
    createDuesCheckoutSession: IDL.Func([IDL.Text],  [ResultCheckout],       []),
  });
}

async function actor() {
  return createActor<any>(idlFactory, canisterId);
}

export type PaymentStatus =
  | { Outstanding: null }
  | { Paid: null }
  | { Waived: null }
  | { Disputed: null };

export interface Assessment {
  id:          string;
  unitId:      string;
  amountCents: bigint;
  kind:        Record<string, null>;
  description: string;
  dueDate:     bigint;
  status:      PaymentStatus;
  paidAt:      [] | [bigint];
  createdAt:   bigint;
}

export async function getAssessmentsForUnit(unitId: string): Promise<Assessment[]> {
  const a = await actor();
  if (!a) return [];
  return a.getAssessmentsForUnit(unitId);
}

export async function getOutstandingAssessments(): Promise<Assessment[]> {
  const a = await actor();
  if (!a) return [];
  return a.getOutstandingAssessments();
}

export async function createDuesCheckoutSession(
  assessmentId: string
): Promise<{ ok: { sessionId: string; url: string } } | { err: unknown }> {
  const a = await actor();
  if (!a) return { err: { NotFound: null } };
  return a.createDuesCheckoutSession(assessmentId);
}
