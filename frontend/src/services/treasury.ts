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
    delinquentCount:  IDL.Nat,
  });

  const CollectionStage = IDL.Variant({
    GracePeriod:  IDL.Null,
    FirstNotice:  IDL.Null,
    SecondNotice: IDL.Null,
    PreLien:      IDL.Null,
    Lien:         IDL.Null,
    Resolved:     IDL.Null,
  });

  const CollectionEvent = IDL.Record({
    id:        IDL.Text,
    unitId:    IDL.Text,
    fromStage: CollectionStage,
    toStage:   CollectionStage,
    note:      IDL.Text,
    createdAt: IDL.Int,
    createdBy: IDL.Principal,
  });

  const DelinquencyRecord = IDL.Record({
    unitId:            IDL.Text,
    stage:             CollectionStage,
    totalOverdueCents: IDL.Nat,
    oldestDueDateNs:   IDL.Int,
    openedAt:          IDL.Int,
    lastUpdatedAt:     IDL.Int,
  });

  const Error = IDL.Variant({
    NotFound:      IDL.Null,
    NotAuthorized: IDL.Null,
    InvalidInput:  IDL.Text,
    PaymentFailed: IDL.Text,
  });

  const ResultAssessment    = IDL.Variant({ ok: Assessment,       err: Error });
  const ResultCheckout      = IDL.Variant({ ok: CheckoutSession,  err: Error });
  const ResultDelinquency   = IDL.Variant({ ok: DelinquencyRecord, err: Error });
  const ResultUnit          = IDL.Variant({ ok: IDL.Null,          err: Error });

  const AgingBucket = IDL.Record({ unitId: IDL.Text, amountCents: IDL.Nat });
  const AgingReport = IDL.Record({
    current:               IDL.Vec(AgingBucket),
    days31_60:             IDL.Vec(AgingBucket),
    days61_90:             IDL.Vec(AgingBucket),
    days90plus:            IDL.Vec(AgingBucket),
    totalOutstandingCents: IDL.Nat,
  });

  const BudgetVsActual = IDL.Record({
    category:      IDL.Text,
    budgetedCents: IDL.Nat,
    actualCents:   IDL.Nat,
    varianceCents: IDL.Int,
  });

  const ReserveFundReport = IDL.Record({
    currentBalanceCents:     IDL.Nat,
    annualIncomeCents:       IDL.Nat,
    recommendedBalanceCents: IDL.Nat,
    fundingGapCents:         IDL.Int,
  });

  const IncomeStatement = IDL.Record({
    startDate:               IDL.Int,
    endDate:                 IDL.Int,
    totalIncomeCents:        IDL.Nat,
    netOperatingIncomeCents: IDL.Int,
  });

  const AnnualStatement = IDL.Record({
    unitId:           IDL.Text,
    year:             IDL.Nat,
    payments:         IDL.Vec(DuesPayment),
    totalBilledCents: IDL.Nat,
    totalPaidCents:   IDL.Nat,
    outstandingCents: IDL.Nat,
    generatedAt:      IDL.Int,
  });

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
    // transform (IC HTTP outcall consensus)
    transform:                  IDL.Func([IDL.Record({ context: IDL.Vec(IDL.Nat8), response: IDL.Record({ status: IDL.Nat, headers: IDL.Vec(IDL.Record({ name: IDL.Text, value: IDL.Text })), body: IDL.Vec(IDL.Nat8) }) })], [IDL.Record({ status: IDL.Nat, headers: IDL.Vec(IDL.Record({ name: IDL.Text, value: IDL.Text })), body: IDL.Vec(IDL.Nat8) })], ["query"]),
    // reporting (#15)
    getAgingReport:             IDL.Func([],                              [AgingReport],                 ["query"]),
    getReserveFundReport:       IDL.Func([],                              [ReserveFundReport],           ["query"]),
    getBudgetVsActual:          IDL.Func([IDL.Nat],                       [IDL.Vec(BudgetVsActual)],     ["query"]),
    getIncomeStatement:         IDL.Func([IDL.Int, IDL.Int],              [IncomeStatement],             ["query"]),
    setReserveFundBalance:      IDL.Func([IDL.Nat],                       [],                            []),
    setBudgetLine:              IDL.Func([IDL.Nat, IDL.Text, IDL.Nat],    [],                            []),
    // annual statement (#41)
    getAnnualStatement:         IDL.Func([IDL.Text, IDL.Nat],             [AnnualStatement],             ["query"]),
    // collections (#28)
    openCollectionCase:         IDL.Func([IDL.Text, IDL.Text],            [ResultDelinquency],           []),
    escalateCollection:         IDL.Func([IDL.Text, CollectionStage, IDL.Text], [ResultDelinquency],     []),
    resolveCollection:          IDL.Func([IDL.Text, IDL.Text],            [ResultUnit],                  []),
    getDelinquentUnits:         IDL.Func([],                              [IDL.Vec(DelinquencyRecord)],  ["query"]),
    getCollectionRecord:        IDL.Func([IDL.Text],                      [IDL.Opt(DelinquencyRecord)],  ["query"]),
    getCollectionHistory:       IDL.Func([IDL.Text],                      [IDL.Vec(CollectionEvent)],    ["query"]),
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
  delinquentCount:  bigint;
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

// ─── Reporting types (#15 + #41) ─────────────────────────────────────────────

export interface AgingBucket { unitId: string; amountCents: bigint; }

export interface AgingReport {
  current:               AgingBucket[];
  days31_60:             AgingBucket[];
  days61_90:             AgingBucket[];
  days90plus:            AgingBucket[];
  totalOutstandingCents: bigint;
}

export interface BudgetVsActual {
  category:      string;
  budgetedCents: bigint;
  actualCents:   bigint;
  varianceCents: bigint;
}

export interface ReserveFundReport {
  currentBalanceCents:     bigint;
  annualIncomeCents:       bigint;
  recommendedBalanceCents: bigint;
  fundingGapCents:         bigint;
}

export interface IncomeStatement {
  startDate:               bigint;
  endDate:                 bigint;
  totalIncomeCents:        bigint;
  netOperatingIncomeCents: bigint;
}

export interface AnnualStatement {
  unitId:           string;
  year:             bigint;
  payments:         DuesPayment[];
  totalBilledCents: bigint;
  totalPaidCents:   bigint;
  outstandingCents: bigint;
  generatedAt:      bigint;
}

// ─── Reporting service functions ──────────────────────────────────────────────

export async function getAgingReport(): Promise<AgingReport | null> {
  const actor = await createActor() as any;
  if (!actor) return null;
  return actor.getAgingReport();
}

export async function getReserveFundReport(): Promise<ReserveFundReport | null> {
  const actor = await createActor() as any;
  if (!actor) return null;
  return actor.getReserveFundReport();
}

export async function getBudgetVsActual(year: number): Promise<BudgetVsActual[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getBudgetVsActual(BigInt(year));
}

export async function getIncomeStatement(
  startDate: bigint,
  endDate:   bigint,
): Promise<IncomeStatement | null> {
  const actor = await createActor() as any;
  if (!actor) return null;
  return actor.getIncomeStatement(startDate, endDate);
}

export async function getAnnualStatement(
  unitId: string,
  year:   number,
): Promise<AnnualStatement | null> {
  const actor = await createActor() as any;
  if (!actor) return null;
  return actor.getAnnualStatement(unitId, BigInt(year));
}

export async function setReserveFundBalance(balance: bigint): Promise<void> {
  const actor = await createActor() as any;
  if (!actor) return;
  return actor.setReserveFundBalance(balance);
}

export async function setBudgetLine(
  year:          number,
  category:      string,
  budgetedCents: bigint,
): Promise<void> {
  const actor = await createActor() as any;
  if (!actor) return;
  return actor.setBudgetLine(BigInt(year), category, budgetedCents);
}

// ─── Collections (#28) ────────────────────────────────────────────────────────

export type CollectionStage =
  | { GracePeriod: null }
  | { FirstNotice: null }
  | { SecondNotice: null }
  | { PreLien: null }
  | { Lien: null }
  | { Resolved: null };

export interface CollectionEvent {
  id:        string;
  unitId:    string;
  fromStage: CollectionStage;
  toStage:   CollectionStage;
  note:      string;
  createdAt: bigint;
  createdBy: import("@dfinity/principal").Principal;
}

export interface DelinquencyRecord {
  unitId:            string;
  stage:             CollectionStage;
  totalOverdueCents: bigint;
  oldestDueDateNs:   bigint;
  openedAt:          bigint;
  lastUpdatedAt:     bigint;
}

export async function getDelinquentUnits(): Promise<DelinquencyRecord[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getDelinquentUnits();
}

export async function getCollectionRecord(unitId: string): Promise<DelinquencyRecord | null> {
  const actor = await createActor() as any;
  if (!actor) return null;
  const result = await actor.getCollectionRecord(unitId) as [] | [DelinquencyRecord];
  return result[0] ?? null;
}

export async function getCollectionHistory(unitId: string): Promise<CollectionEvent[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getCollectionHistory(unitId);
}

export async function openCollectionCase(
  unitId: string,
  note:   string,
): Promise<{ ok: DelinquencyRecord } | { err: TreasuryError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.openCollectionCase(unitId, note);
}

export async function escalateCollection(
  unitId:   string,
  newStage: CollectionStage,
  note:     string,
): Promise<{ ok: DelinquencyRecord } | { err: TreasuryError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.escalateCollection(unitId, newStage, note);
}

export async function resolveCollection(
  unitId: string,
  note:   string,
): Promise<{ ok: null } | { err: TreasuryError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.resolveCollection(unitId, note);
}
