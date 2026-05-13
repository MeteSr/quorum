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

  const EmailConfig = IDL.Record({
    resendApiKey: IDL.Text,
    fromEmail:    IDL.Text,
    fromName:     IDL.Text,
  });

  const QBOConfig = IDL.Record({
    realmId:      IDL.Text,
    accessToken:  IDL.Text,
    refreshToken: IDL.Text,
    tokenExpiry:  IDL.Int,
  });

  const QBOSyncStatus = IDL.Variant({
    Pending: IDL.Null,
    Synced:  IDL.Null,
    Failed:  IDL.Null,
  });

  const QBOSyncEntry = IDL.Record({
    id:           IDL.Text,
    paymentId:    IDL.Text,
    assessmentId: IDL.Text,
    unitId:       IDL.Text,
    amountCents:  IDL.Nat,
    status:       QBOSyncStatus,
    qboPaymentId: IDL.Opt(IDL.Text),
    syncedAt:     IDL.Opt(IDL.Int),
    errorMsg:     IDL.Opt(IDL.Text),
    createdAt:    IDL.Int,
  });

  const QBOStatus = IDL.Record({
    configured:  IDL.Bool,
    realmId:     IDL.Text,
    tokenExpiry: IDL.Int,
  });

  const ResultQBOEntry = IDL.Variant({ ok: QBOSyncEntry, err: Error });

  const TxImportRow = IDL.Record({
    unitId:      IDL.Text,
    dateNs:      IDL.Int,
    amountCents: IDL.Nat,
    category:    AssessmentType,
    description: IDL.Text,
  });

  const TxBulkResult = IDL.Record({
    succeeded: IDL.Nat,
    failed:    IDL.Nat,
    errors:    IDL.Vec(IDL.Text),
  });

  const CkUSDCConfig = IDL.Record({
    enabled:           IDL.Bool,
    treasuryPrincipal: IDL.Text,
    usdcRateCents:     IDL.Nat,
    platformFeeBps:    IDL.Nat,
  });

  const CkUSDCPayment = IDL.Record({
    id:          IDL.Text,
    unitId:      IDL.Text,
    amountUsdc:  IDL.Nat,
    amountCents: IDL.Nat,
    blockIndex:  IDL.Nat,
    memo:        IDL.Text,
    confirmedAt: IDL.Int,
    confirmedBy: IDL.Principal,
  });

  const CkUSDCStatus = IDL.Record({
    enabled:           IDL.Bool,
    treasuryPrincipal: IDL.Text,
    usdcRateCents:     IDL.Nat,
    platformFeeBps:    IDL.Nat,
    paymentCount:      IDL.Nat,
  });

  const ResultCkPayment = IDL.Variant({ ok: CkUSDCPayment, err: Error });
  const ResultCkStatus  = IDL.Variant({ ok: CkUSDCStatus,  err: Error });
  const ResultUnit2     = IDL.Variant({ ok: IDL.Null,       err: Error });

  return IDL.Service({
    // wiring (all board-gated, return Result)
    setMembersCanisterId:       IDL.Func([IDL.Text],                     [ResultUnit],                  []),
    setEmailConfig:             IDL.Func([EmailConfig],                   [ResultUnit],                  []),
    configureStripe:            IDL.Func([StripeConfig],                  [ResultUnit],                  []),
    setLateFeePolicy:           IDL.Func([LateFeePolicy],                 [ResultUnit],                  []),
    setReminderPolicy:          IDL.Func([ReminderPolicy],                [ResultUnit],                  []),
    setReserveFundBalance:      IDL.Func([IDL.Nat],                       [ResultUnit],                  []),
    setBudgetLine:              IDL.Func([IDL.Nat, IDL.Text, IDL.Nat],    [ResultUnit],                  []),
    setQBOConfig:               IDL.Func([QBOConfig],                     [ResultUnit],                  []),
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
    // annual statement (#41)
    getAnnualStatement:         IDL.Func([IDL.Text, IDL.Nat],             [AnnualStatement],             ["query"]),
    // collections (#28)
    openCollectionCase:         IDL.Func([IDL.Text, IDL.Text],            [ResultDelinquency],           []),
    escalateCollection:         IDL.Func([IDL.Text, CollectionStage, IDL.Text], [ResultDelinquency],     []),
    resolveCollection:          IDL.Func([IDL.Text, IDL.Text],            [ResultUnit],                  []),
    getDelinquentUnits:         IDL.Func([],                              [IDL.Vec(DelinquencyRecord)],  ["query"]),
    getCollectionRecord:        IDL.Func([IDL.Text],                      [IDL.Opt(DelinquencyRecord)],  ["query"]),
    getCollectionHistory:       IDL.Func([IDL.Text],                      [IDL.Vec(CollectionEvent)],    ["query"]),
    // QuickBooks (#19)
    getQBOStatus:               IDL.Func([],                              [QBOStatus],                   ["query"]),
    retrySync:                  IDL.Func([IDL.Text],                      [ResultQBOEntry],              []),
    getQBOSyncLog:              IDL.Func([],                              [IDL.Vec(QBOSyncEntry)],       ["query"]),
    // bulk import (#22)
    bulkImportTransactions:     IDL.Func([IDL.Vec(TxImportRow)],          [TxBulkResult],                []),
    // ckUSDC (#23)
    enableCkUSDC:               IDL.Func([IDL.Text, IDL.Nat, IDL.Nat],    [ResultCkStatus],              []),
    disableCkUSDC:              IDL.Func([],                              [ResultUnit2],                 []),
    setUsdcRate:                IDL.Func([IDL.Nat],                       [ResultUnit2],                 []),
    confirmCkUSDCPayment:       IDL.Func([IDL.Nat, IDL.Text, IDL.Nat, IDL.Text], [ResultCkPayment],     []),
    getCkUSDCStatus:            IDL.Func([],                              [CkUSDCStatus],                ["query"]),
    getCkUSDCPayments:          IDL.Func([],                              [IDL.Vec(CkUSDCPayment)],      ["query"]),
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

export interface EmailConfig {
  resendApiKey: string;
  fromEmail:    string;
  fromName:     string;
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

export async function setLateFeePolicy(policy: LateFeePolicy): Promise<{ ok: null } | { err: TreasuryError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotAuthorized: null } };
  return actor.setLateFeePolicy(policy);
}

export async function setReminderPolicy(policy: ReminderPolicy): Promise<{ ok: null } | { err: TreasuryError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotAuthorized: null } };
  return actor.setReminderPolicy(policy);
}

export async function setEmailConfig(config: EmailConfig): Promise<{ ok: null } | { err: TreasuryError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotAuthorized: null } };
  return actor.setEmailConfig(config);
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

export async function setReserveFundBalance(balance: bigint): Promise<{ ok: null } | { err: TreasuryError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotAuthorized: null } };
  return actor.setReserveFundBalance(balance);
}

export async function setBudgetLine(
  year:          number,
  category:      string,
  budgetedCents: bigint,
): Promise<{ ok: null } | { err: TreasuryError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotAuthorized: null } };
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

// ─── QuickBooks types (#19) ───────────────────────────────────────────────────

export interface QBOConfig {
  realmId:      string;
  accessToken:  string;
  refreshToken: string;
  tokenExpiry:  bigint;
}

export type QBOSyncStatus = { Pending: null } | { Synced: null } | { Failed: null };

export interface QBOSyncEntry {
  id:           string;
  paymentId:    string;
  assessmentId: string;
  unitId:       string;
  amountCents:  bigint;
  status:       QBOSyncStatus;
  qboPaymentId: [] | [string];
  syncedAt:     [] | [bigint];
  errorMsg:     [] | [string];
  createdAt:    bigint;
}

export interface QBOStatus {
  configured:  boolean;
  realmId:     string;
  tokenExpiry: bigint;
}

export interface TxImportRow {
  unitId:      string;
  dateNs:      bigint;
  amountCents: bigint;
  category:    AssessmentType;
  description: string;
}

export interface TxBulkResult {
  succeeded: bigint;
  failed:    bigint;
  errors:    string[];
}

export interface CkUSDCPayment {
  id:          string;
  unitId:      string;
  amountUsdc:  bigint;
  amountCents: bigint;
  blockIndex:  bigint;
  memo:        string;
  confirmedAt: bigint;
  confirmedBy: import("@dfinity/principal").Principal;
}

export interface CkUSDCStatus {
  enabled:           boolean;
  treasuryPrincipal: string;
  usdcRateCents:     bigint;
  platformFeeBps:    bigint;
  paymentCount:      bigint;
}

// ─── QuickBooks service functions (#19) ──────────────────────────────────────

export async function setQBOConfig(config: QBOConfig): Promise<{ ok: null } | { err: TreasuryError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotAuthorized: null } };
  return actor.setQBOConfig(config);
}

export async function setMembersCanisterId(id: string): Promise<{ ok: null } | { err: TreasuryError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotAuthorized: null } };
  return actor.setMembersCanisterId(id);
}

export async function getQBOStatus(): Promise<QBOStatus> {
  const actor = await createActor() as any;
  if (!actor) return { configured: false, realmId: "", tokenExpiry: BigInt(0) };
  return actor.getQBOStatus();
}

export async function getQBOSyncLog(): Promise<QBOSyncEntry[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getQBOSyncLog();
}

export async function retrySync(
  entryId: string,
): Promise<{ ok: QBOSyncEntry } | { err: TreasuryError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.retrySync(entryId);
}

// ─── Bulk import (#22) ────────────────────────────────────────────────────────

export async function bulkImportTransactions(
  rows: TxImportRow[]
): Promise<TxBulkResult> {
  const actor = await createActor() as any;
  if (!actor) return { succeeded: BigInt(0), failed: BigInt(rows.length), errors: ["canister not deployed"] };
  return actor.bulkImportTransactions(rows);
}

// ─── ckUSDC (#23) ────────────────────────────────────────────────────────────

export async function getCkUSDCStatus(): Promise<CkUSDCStatus> {
  const actor = await createActor() as any;
  if (!actor) return { enabled: false, treasuryPrincipal: "", usdcRateCents: BigInt(100), platformFeeBps: BigInt(10), paymentCount: BigInt(0) };
  return actor.getCkUSDCStatus();
}

export async function getCkUSDCPayments(): Promise<CkUSDCPayment[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getCkUSDCPayments();
}

export async function enableCkUSDC(
  treasuryPrincipal: string,
  usdcRateCents: bigint,
  platformFeeBps: bigint,
): Promise<{ ok: CkUSDCStatus } | { err: TreasuryError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotAuthorized: null } };
  return actor.enableCkUSDC(treasuryPrincipal, usdcRateCents, platformFeeBps);
}

export async function disableCkUSDC(): Promise<{ ok: null } | { err: TreasuryError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotAuthorized: null } };
  return actor.disableCkUSDC();
}

export async function setUsdcRate(
  rateCents: bigint,
): Promise<{ ok: null } | { err: TreasuryError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotAuthorized: null } };
  return actor.setUsdcRate(rateCents);
}

export async function confirmCkUSDCPayment(
  blockIndex: bigint,
  unitId: string,
  amountUsdc: bigint,
  memo: string,
): Promise<{ ok: CkUSDCPayment } | { err: TreasuryError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotAuthorized: null } };
  return actor.confirmCkUSDCPayment(blockIndex, unitId, amountUsdc, memo);
}
