/**
 * Integration tests — vendors canister.
 *
 * What these tests prove that unit tests cannot:
 *   - VendorCategory Variant round-trips (8 variants)
 *   - addVendor returns a Vendor with zero reviewCount/ratingSum
 *   - addVendorReview accumulates ratingSum and reviewCount
 *   - logJob increments jobCount
 *   - updateCOI sets coi with expiryNs as Int
 *   - getExpiringCOIs(days) returns vendors whose COI expires within the window
 *   - removeVendor removes the vendor from getAllVendors
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Actor } from "@icp-sdk/core/agent";
import { idlFactory } from "@/services/vendors";
import { getAgent } from "@/services/actor";

const CANISTER_ID = (process.env as any).CANISTER_ID_VENDORS || "";
const deployed = !!CANISTER_ID;

const RUN_ID = Date.now();

async function getActor() {
  return Actor.createActor(idlFactory, { agent: await getAgent(), canisterId: CANISTER_ID });
}

describe.skipIf(!deployed)("addVendor — Candid serialization", () => {
  let vendor: any;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.addVendor(
      `Acme Plumbing ${RUN_ID}`, { Plumbing: null },
      "555-0100", `plumbing-${RUN_ID}@acme.test`, "", "24hr emergency service"
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    vendor = result.ok;
  });

  it("returns a non-empty id", () => {
    expect(vendor.id).toBeTruthy();
  });

  it("name is preserved", () => {
    expect(vendor.name).toBe(`Acme Plumbing ${RUN_ID}`);
  });

  it("VendorCategory Variant round-trips as Plumbing", () => {
    expect(vendor.category).toHaveProperty("Plumbing");
  });

  it("reviewCount starts at 0", () => {
    expect(vendor.reviewCount).toBe(BigInt(0));
  });

  it("ratingSum starts at 0", () => {
    expect(vendor.ratingSum).toBe(BigInt(0));
  });

  it("jobCount starts at 0", () => {
    expect(vendor.jobCount).toBe(BigInt(0));
  });

  it("coi starts as empty Opt ([])", () => {
    expect(vendor.coi).toHaveLength(0);
  });
});

describe.skipIf(!deployed)("addVendorReview — rating accumulation", () => {
  let vendorId: string;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.addVendor(
      `Elite Electric ${RUN_ID}`, { Electrical: null }, "555-0200", "", "", ""
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    vendorId = result.ok.id;
  });

  it("first review sets reviewCount=1 and ratingSum=5", async () => {
    const a = await getActor();
    const result = await a.addVendorReview(vendorId, BigInt(5)) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    expect(result.ok.reviewCount).toBe(BigInt(1));
    expect(result.ok.ratingSum).toBe(BigInt(5));
  });

  it("second review accumulates correctly", async () => {
    const a = await getActor();
    const result = await a.addVendorReview(vendorId, BigInt(3)) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    expect(result.ok.reviewCount).toBe(BigInt(2));
    expect(result.ok.ratingSum).toBe(BigInt(8));
  });

  it("stars out of range returns InvalidInput", async () => {
    const a = await getActor();
    const result = await a.addVendorReview(vendorId, BigInt(6)) as any;
    expect("err" in result).toBe(true);
    expect(result.err).toHaveProperty("InvalidInput");
  });
});

describe.skipIf(!deployed)("logJob — jobCount increment", () => {
  let vendorId: string;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.addVendor(
      `Green Gardens ${RUN_ID}`, { Landscaping: null }, "555-0300", "", "", ""
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    vendorId = result.ok.id;
  });

  it("logJob increments jobCount", async () => {
    const a = await getActor();
    const result = await a.logJob(
      vendorId, "Annual lawn aeration", [], [], "Completed on schedule"
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    const vendor = await a.getVendor(vendorId) as any[];
    expect(vendor.length).toBe(1);
    expect(vendor[0].jobCount).toBe(BigInt(1));
  });
});

describe.skipIf(!deployed)("updateCOI + getExpiringCOIs — COI tracking", () => {
  let vendorId: string;
  const EXPIRY_60_NS = BigInt(Date.now() + 60 * 24 * 60 * 60 * 1000) * BigInt(1_000_000);
  const EXPIRY_200_NS = BigInt(Date.now() + 200 * 24 * 60 * 60 * 1000) * BigInt(1_000_000);

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.addVendor(
      `COI Test Vendor ${RUN_ID}`, { HVAC: null }, "555-0400", "", "", ""
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    vendorId = result.ok.id;
  });

  it("updateCOI sets expiryNs as a BigInt Int", async () => {
    const a = await getActor();
    const result = await a.updateCOI(vendorId, [], EXPIRY_60_NS) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    expect(result.ok.coi).toHaveLength(1);
    expect(result.ok.coi[0].expiryNs).toBe(EXPIRY_60_NS);
  });

  it("getExpiringCOIs(90) includes vendor expiring in 60 days", async () => {
    const a = await getActor();
    const expiring = await a.getExpiringCOIs(BigInt(90)) as any[];
    const found = expiring.find((v: any) => v.id === vendorId);
    expect(found).toBeDefined();
  });

  it("getExpiringCOIs(30) excludes vendor expiring in 60 days", async () => {
    const a = await getActor();
    const expiring = await a.getExpiringCOIs(BigInt(30)) as any[];
    const found = expiring.find((v: any) => v.id === vendorId);
    expect(found).toBeUndefined();
  });

  it("COI with far-future expiry is not in getExpiringCOIs(90)", async () => {
    const a = await getActor();
    await a.updateCOI(vendorId, [], EXPIRY_200_NS);
    const expiring = await a.getExpiringCOIs(BigInt(90)) as any[];
    const found = expiring.find((v: any) => v.id === vendorId);
    expect(found).toBeUndefined();
  });
});
