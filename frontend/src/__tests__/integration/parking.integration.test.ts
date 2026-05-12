/**
 * Integration tests — parking canister.
 *
 * What these tests prove that unit tests cannot:
 *   - registerVehicle persists with correct licensePlate and plateState
 *   - getVehiclesForUnit scopes results to the unit
 *   - lookupVehicle finds the registered vehicle by plate
 *   - issuePermit returns a permit with expiresAt as BigInt
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Actor } from "@icp-sdk/core/agent";
import { idlFactory } from "@/services/parking";
import { getAgent } from "@/services/actor";

const CANISTER_ID = (process.env as any).CANISTER_ID_PARKING || "";
const deployed = !!CANISTER_ID;

const RUN_ID      = Date.now();
const UNIT_ID     = `unit-park-${RUN_ID}`;
const LICENSE     = `TST${RUN_ID.toString().slice(-4)}`;
const PLATE_STATE = "TX";
const EXPIRES_NS  = BigInt(Date.now() + 365 * 24 * 60 * 60 * 1000) * BigInt(1_000_000);

let vehicleId = "";

async function getActor() {
  return Actor.createActor(idlFactory, { agent: await getAgent(), canisterId: CANISTER_ID });
}

describe.skipIf(!deployed)("registerVehicle — Candid serialization", () => {
  let vehicle: any;

  beforeAll(async () => {
    const a = await getActor();
    // registerVehicle(unitId, make, model, year: Nat, color, licensePlate, plateState)
    const result = await a.registerVehicle(
      UNIT_ID, "Toyota", "Camry", 2020, "Silver", LICENSE, PLATE_STATE
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    vehicle = result.ok;
    vehicleId = vehicle.id;
  });

  it("licensePlate is preserved", () => {
    expect(vehicle.licensePlate).toBe(LICENSE);
  });

  it("plateState is preserved", () => {
    expect(vehicle.plateState).toBe(PLATE_STATE);
  });

  it("unitId is preserved", () => {
    expect(vehicle.unitId).toBe(UNIT_ID);
  });
});

describe.skipIf(!deployed)("getVehiclesForUnit — entity scoping", () => {
  it("returns the registered vehicle", async () => {
    const a = await getActor();
    const vehicles = await a.getVehiclesForUnit(UNIT_ID) as any[];
    const found = vehicles.find((v: any) => v.licensePlate === LICENSE);
    expect(found).toBeDefined();
  });

  it("does not return vehicles for a different unit", async () => {
    const a = await getActor();
    const other = await a.getVehiclesForUnit(`other-unit-${RUN_ID}`) as any[];
    expect(other.length).toBe(0);
  });
});

describe.skipIf(!deployed)("lookupVehicle — plate lookup", () => {
  it("finds the registered vehicle by plate and state", async () => {
    const a = await getActor();
    // Returns ?Vehicle — on wire as [] | [Vehicle]
    const result = await a.lookupVehicle(PLATE_STATE, LICENSE) as any[];
    expect(result.length).toBe(1);
    expect(result[0].unitId).toBe(UNIT_ID);
  });

  it("returns empty for an unknown plate", async () => {
    const a = await getActor();
    const result = await a.lookupVehicle("TX", "UNKNOWN999") as any[];
    expect(result.length).toBe(0);
  });
});

describe.skipIf(!deployed)("issuePermit — expiresAt as BigInt", () => {
  it("permit has a BigInt expiresAt", async () => {
    const a = await getActor();
    // issuePermit(vehicleId, permitType, expiresAt: ?Time.Time)
    const result = await a.issuePermit(vehicleId, { Resident: null }, [EXPIRES_NS]) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    // expiresAt is ?Time.Time — on wire as [] | [bigint]
    expect(result.ok.expiresAt.length).toBe(1);
    expect(typeof result.ok.expiresAt[0]).toBe("bigint");
  });
});
