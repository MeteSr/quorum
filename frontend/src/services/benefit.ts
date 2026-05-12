import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "@/services/actor";

const CANISTER_ID_BENEFIT = (process.env as any).CANISTER_ID_BENEFIT || "";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function idlFactory({ IDL }: { IDL: any }) {
  const CouponRecord = IDL.Record({
    code:     IDL.Text,
    issuedAt: IDL.Int,
  });

  const Error = IDL.Variant({ NotAuthorized: IDL.Null });

  const ResultCoupon = IDL.Variant({ ok: CouponRecord, err: Error });

  const MetricsResult = IDL.Record({ totalIssued: IDL.Nat });

  return IDL.Service({
    generateCoupon: IDL.Func([], [ResultCoupon],          []),
    getCoupon:      IDL.Func([], [IDL.Opt(CouponRecord)], []),
    metrics:        IDL.Func([], [MetricsResult],         ["query"]),
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CouponRecord {
  code:     string;
  issuedAt: bigint;
}

export type BenefitError = { NotAuthorized: null };

export interface MetricsResult {
  totalIssued: bigint;
}

// ─── Actor ────────────────────────────────────────────────────────────────────

async function createActor() {
  if (!CANISTER_ID_BENEFIT) return null;
  const agent = await getAgent();
  return Actor.createActor(idlFactory, { agent, canisterId: CANISTER_ID_BENEFIT });
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function generateCoupon(): Promise<{ ok: CouponRecord } | { err: BenefitError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotAuthorized: null } };
  return actor.generateCoupon();
}

export async function getCoupon(): Promise<CouponRecord | null> {
  const actor = await createActor() as any;
  if (!actor) return null;
  const result: [] | [CouponRecord] = await actor.getCoupon();
  return result.length > 0 ? result[0]! : null;
}

export async function getMetrics(): Promise<MetricsResult | null> {
  const actor = await createActor() as any;
  if (!actor) return null;
  return actor.metrics();
}
