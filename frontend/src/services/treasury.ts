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
    LateFee:           IDL.Null,
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

  const EscalationTier = IDL.Record({
    daysOverdue:     IDL.Nat,
    additionalCents: IDL.Nat,
  });

  const LateFeePolicy = IDL.Record({
    gracePeriodDays: IDL.Nat,
    flatAmountCents: IDL.Nat,
    percentBps:      IDL.Nat,
    escalation:      IDL.Vec(EscalationTier),
  });

  const ReminderPolicy = IDL.Record({
    preDueDays:  IDL.Vec(IDL.Nat),
    postDueDays: IDL.Vec(IDL.Nat),
  });

  const DuesPayment = IDL.Record({
    id:               IDL.Text,
    assessmentId:     IDL.Text,
    unitId:           IDL.Text,
    amountCents:      IDL.Nat,
    platformFeeCents: IDL.Nat,
    stripePaymentId:  IDL.Text,
    paidAt:           IDL.Int,
  });

  const ReminderLog = IDL.Record({
    id:           IDL.Text,
    assessmentId: IDL.Text,
    unitId:       IDL.Text,
    reminderType: IDL.Text,
    sentAt:       IDL.Int,
  });

  const CheckoutSession = IDL.Record({ id: IDL.Text, url: IDL.Text });

  const StripeConfig = IDL.Record({
    secretKey:         IDL.Text,
    stripeAccountId:   IDL.Text,
    webhookSecret:     IDL.Text,
    successUrl:        IDL.Text,
    cancelUrl:         IDL.Text,
    platformFeeBps:    IDL.Nat,
    achPlatformFeeBps: IDL.Nat,
  });

  const Metrics = IDL.Record({
    totalAssessments: IDL.Nat,
    outstandingCount: IDL.Nat,
    outstandingCents: IDL.Nat,
    totalPaidCents:   IDL.Nat,
    platformFeeCents: IDL.Nat,
    lateFeeCount:     IDL.Nat,
    remindersSent:    IDL.Nat,
  });

  const Error = IDL.Variant({
    NotFound:      IDL.Null,
    NotAuthorized: IDL.Null,
    InvalidInput:  IDL.Text,
    PaymentFailed: IDL.Text,
  });

  const ResultAssessment    = IDL.Variant({ ok: Assessment,      err: Error });
  const ResultCheckout      = IDL.Variant({ ok: CheckoutSession, err: Error });

  return IDL.Service({
    // wiring
    setMembersCanisterId:       IDL.Func([IDL.Text],                     [],                            []),
    configureStripe:            IDL.Func([StripeConfig],                  [],                            []),
    setLateFeePolicy:           IDL.Func([LateFeePolicy],                 [],                            []),
    setReminderPolicy:          IDL.Func([ReminderPolicy],                [],                            []),
    // board actions
    postAssessment:             IDL.Func([IDL.Text, IDL.Nat, AssessmentType, IDL.Text, IDL.Int], [ResultAssessment], []),
    markPaid:                   IDL.Func([IDL.Text],                      [ResultAssessment],            []),
    waiveAssessment:            IDL.Func([IDL.Text],                      [ResultAssessment],            []),
    waiveLateFee:               IDL.Func([IDL.Text, IDL.Text],            [ResultAssessment],            []),
    // stripe checkout
    createDuesCheckoutSession:  IDL.Func([IDL.Text],                      [ResultCheckout],              []),
    verifyDuesSession:          IDL.Func([IDL.Text, IDL.Text],            [ResultAssessment],            []),
    // queries
    getAssessment:              IDL.Func([IDL.Text],                      [IDL.Opt(Assessment)],         ["query"]),
    getAssessmentsForUnit:      IDL.Func([IDL.Text],                      [IDL.Vec(Assessment)],         ["query"]),
    getOutstandingAssessments:  IDL.Func([],                              [IDL.Vec(Assessment)],         ["query"]),
    getTotalOutstandingCents:   IDL.Func([],                              [IDL.Nat],                     ["query"]),
    getPaymentHistory:          IDL.Func([IDL.Text],                      [IDL.Vec(DuesPayment)],        ["query"]),
    getReminderLog:             IDL.Func([IDL.Text],                      [IDL.Vec(ReminderLog)],        ["query"]),
    getLateFeePolicy:           IDL.Func([],                              [IDL.Opt(LateFeePolicy)],      ["query"]),
    getReminderPolicy:          IDL.Func([],                              [IDL.Opt(ReminderPolicy)],     ["query"]),
    metrics:                    IDL.Func([],                              [Metrics],                     ["query"]),
    // transform (required by outcall library)
    transform:                  IDL.Func([IDL.Record({ context: IDL.Vec(IDL.Nat8), response: IDL.Record({ status: IDL.Nat, headers: IDL.Vec(IDL.Record({ name: IDL.Text, value: IDL.Text })), body: IDL.Vec(IDL.Nat8) }) })], [IDL.Record({ status: IDL.Nat, headers: IDL.Vec(IDL.Record({ name: IDL.Text, value: IDL.Text })), body: IDL.Vec(IDL.Nat8) })], ["query"]),
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type AssessmentType =
  | { MonthlyDues: null }
  | { SpecialAssessment: null }
  | { Fine: null }
  | { Amenity: null }
  | { LateFee: null };

export type PaymentStatus =
  | { Outstanding: null }
  | { Paid: null }
  | { Waived: null }
  | { Disputed: null };

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

export interface EscalationTier {
  daysOverdue:     bigint;
  additionalCents: bigint;
}

export interface LateFeePolicy {
  gracePeriodDays: bigint;
  flatAmountCents: bigint;
  percentBps:      bigint;
  escalation:      EscalationTier[];
}

export interface ReminderPolicy {
  preDueDays:  bigint[];
  postDueDays: bigint[];
}

export interface DuesPayment {
  id:               string;
  assessmentId:     string;
  unitId:           string;
  amountCents:      bigint;
  platformFeeCents: bigint;
  stripePaymentId:  string;
  paidAt:           bigint;
}

export interface ReminderLog {
  id:           string;
  assessmentId: string;
  unitId:       string;
  reminderType: string;
  sentAt:       bigint;
}

export interface CheckoutSession { id: string; url: string; }

export interface TreasuryMetrics {
  totalAssessments: bigint;
  outstandingCount: bigint;
  outstandingCents: bigint;
  totalPaidCents:   bigint;
  platformFeeCents: bigint;
  lateFeeCount:     bigint;
  remindersSent:    bigint;
}

export type TreasuryError =
  | { NotFound: null }
  | { NotAuthorized: null }
  | { InvalidInput: string }
  | { PaymentFailed: string };

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

export async function postAssessment(
  unitId:      string,
  amountCents: bigint,
  kind:        AssessmentType,
  description: string,
  dueDate:     bigint,
): Promise<{ ok: Assessment } | { err: TreasuryError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.postAssessment(unitId, amountCents, kind, description, dueDate);
}

export async function markPaid(id: string): Promise<{ ok: Assessment } | { err: TreasuryError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.markPaid(id);
}

export async function waiveAssessment(id: string): Promise<{ ok: Assessment } | { err: TreasuryError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.waiveAssessment(id);
}

export async function waiveLateFee(
  assessmentId: string,
  reason: string,
): Promise<{ ok: Assessment } | { err: TreasuryError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.waiveLateFee(assessmentId, reason);
}

export async function createDuesCheckoutSession(
  assessmentId: string,
): Promise<{ ok: CheckoutSession } | { err: TreasuryError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { PaymentFailed: "canister not deployed" } };
  return actor.createDuesCheckoutSession(assessmentId);
}

export async function verifyDuesSession(
  sessionId:    string,
  assessmentId: string,
): Promise<{ ok: Assessment } | { err: TreasuryError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { PaymentFailed: "canister not deployed" } };
  return actor.verifyDuesSession(sessionId, assessmentId);
}

export async function getPaymentHistory(unitId: string): Promise<DuesPayment[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getPaymentHistory(unitId);
}

export async function getReminderLog(unitId: string): Promise<ReminderLog[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getReminderLog(unitId);
}

export async function getLateFeePolicy(): Promise<LateFeePolicy | null> {
  const actor = await createActor() as any;
  if (!actor) return null;
  const result = await actor.getLateFeePolicy() as [] | [LateFeePolicy];
  return result[0] ?? null;
}

export async function getReminderPolicy(): Promise<ReminderPolicy | null> {
  const actor = await createActor() as any;
  if (!actor) return null;
  const result = await actor.getReminderPolicy() as [] | [ReminderPolicy];
  return result[0] ?? null;
}

export async function setLateFeePolicy(policy: LateFeePolicy): Promise<void> {
  const actor = await createActor() as any;
  if (!actor) return;
  return actor.setLateFeePolicy(policy);
}

export async function setReminderPolicy(policy: ReminderPolicy): Promise<void> {
  const actor = await createActor() as any;
  if (!actor) return;
  return actor.setReminderPolicy(policy);
}

export async function getMetrics(): Promise<TreasuryMetrics | null> {
  const actor = await createActor() as any;
  if (!actor) return null;
  return actor.metrics();
}
