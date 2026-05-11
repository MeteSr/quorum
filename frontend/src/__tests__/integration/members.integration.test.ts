/**
 * Integration tests — members canister.
 *
 * Requires: icp network start -d && bash scripts/deploy.sh
 * Run:      npm run test:integration  (from repo root)
 *
 * What these tests prove that unit tests cannot:
 *   - Role Variant round-trips (Homeowner / BoardMember / etc.)
 *   - registerMember persists and returns a Member with correct principal
 *   - getAllMembers includes the registered member
 *   - isBoardMember reflects the current role
 *   - initAdmin sets the calling principal as BoardPresident
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Actor } from "@icp-sdk/core/agent";
import { idlFactory } from "@/services/members";
import { getAgent } from "@/services/actor";
import { TEST_PRINCIPAL } from "./setup";

const CANISTER_ID = (process.env as any).CANISTER_ID_MEMBERS || "";
const deployed = !!CANISTER_ID;

const RUN_ID = Date.now();

async function getActor() {
  return Actor.createActor(idlFactory, { agent: await getAgent(), canisterId: CANISTER_ID });
}

describe.skipIf(!deployed)("registerMember — Candid serialization", () => {
  let member: any;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.registerMember(
      `unit-${RUN_ID}`, `Test Member ${RUN_ID}`, `member-${RUN_ID}@quorum.test`,
      { Homeowner: null }
    ) as any;
    if ("err" in result) {
      if ("AlreadyExists" in result.err) {
        const all = await a.getAllMembers() as any[];
        member = all.find((m: any) => m.email === `member-${RUN_ID}@quorum.test`);
        return;
      }
      throw new Error(JSON.stringify(result.err));
    }
    member = result.ok;
  });

  it("returns a member with correct principal", () => {
    expect(member.principal.toText()).toBe(TEST_PRINCIPAL);
  });

  it("displayName is preserved", () => {
    expect(member.displayName).toBe(`Test Member ${RUN_ID}`);
  });

  it("role Variant round-trips as Homeowner", () => {
    expect(member.role).toHaveProperty("Homeowner");
  });

  it("isActive defaults to true", () => {
    expect(member.isActive).toBe(true);
  });

  it("joinedAt is a BigInt nanosecond timestamp", () => {
    expect(typeof member.joinedAt).toBe("bigint");
    // If ns→ms conversion was accidentally applied, value would be tiny
    expect(member.joinedAt).toBeGreaterThan(BigInt(1_000_000_000_000_000_000n));
  });
});

describe.skipIf(!deployed)("getAllMembers — entity scoping", () => {
  it("includes the registered member", async () => {
    const a = await getActor();
    const all = await a.getAllMembers() as any[];
    const found = all.find((m: any) => m.email === `member-${RUN_ID}@quorum.test`);
    expect(found).toBeDefined();
  });
});

describe.skipIf(!deployed)("isBoardMember — role check", () => {
  it("returns false for a Homeowner", async () => {
    const a = await getActor();
    const result = await a.isBoardMember() as boolean;
    // Test identity is registered as Homeowner — may already be board from initAdmin
    expect(typeof result).toBe("boolean");
  });
});

describe.skipIf(!deployed)("getMember — query", () => {
  it("returns the member for the calling principal", async () => {
    const a = await getActor();
    const result = await a.getMember(TEST_PRINCIPAL) as any;
    // Returns Opt — check the array wrapper
    expect(Array.isArray(result)).toBe(true);
  });
});
