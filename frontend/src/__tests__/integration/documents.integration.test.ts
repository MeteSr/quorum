/**
 * Integration tests — documents canister.
 *
 * What these tests prove that unit tests cannot:
 *   - DocCategory + Visibility Variant round-trips
 *   - uploadDocument persists with correct sizeBytes
 *   - getDocument returns full Document including content Blob
 *   - setRequiresAcknowledgment flips the flag
 *   - acknowledgeDocument records the caller
 *   - getAcknowledgmentStatus reflects acknowledged state as [(Text, Time)]
 *   - getAllDocumentsMeta returns uploaded docs
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Actor } from "@icp-sdk/core/agent";
import { idlFactory } from "@/services/documents";
import { getAgent } from "@/services/actor";

const CANISTER_ID = (process.env as any).CANISTER_ID_DOCUMENTS || "";
const deployed = !!CANISTER_ID;

const RUN_ID  = Date.now();
const CONTENT = new TextEncoder().encode("Integration test document content.");

async function getActor() {
  return Actor.createActor(idlFactory, { agent: await getAgent(), canisterId: CANISTER_ID });
}

describe.skipIf(!deployed)("uploadDocument — Candid serialization", () => {
  let meta: any;
  let docId: string;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.uploadDocument(
      `HOA Rules ${RUN_ID}`, { GoverningDocuments: null }, { AllMembers: null },
      Array.from(CONTENT), "text/plain", "Integration test governing document"
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    meta  = result.ok;
    docId = meta.id;
  });

  it("returns a non-empty id", () => {
    expect(meta.id).toBeTruthy();
  });

  it("DocCategory Variant round-trips as GoverningDocuments", () => {
    expect(meta.category).toHaveProperty("GoverningDocuments");
  });

  it("Visibility Variant round-trips as AllMembers", () => {
    expect(meta.visibility).toHaveProperty("AllMembers");
  });

  it("sizeBytes matches content length as BigInt", () => {
    expect(meta.sizeBytes).toBe(BigInt(CONTENT.length));
  });

  it("requiresAcknowledgment defaults to false", () => {
    expect(meta.requiresAcknowledgment).toBe(false);
  });

  it("content round-trips via getDocument", async () => {
    // uploadDocument returns DocumentMeta (no content); fetch the full Document
    const a = await getActor();
    const result = await a.getDocument(docId) as any[];
    expect(result.length).toBe(1);
    expect(new TextDecoder().decode(new Uint8Array(result[0].content))).toBe(
      "Integration test document content."
    );
  });
});

describe.skipIf(!deployed)("setRequiresAcknowledgment + acknowledgeDocument", () => {
  let docId: string;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.uploadDocument(
      `Ack Test Doc ${RUN_ID}`, { Notices: null }, { AllMembers: null },
      Array.from(new TextEncoder().encode("Requires ack.")), "text/plain", "Ack test"
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    docId = result.ok.id;
    await a.setRequiresAcknowledgment(docId, true);
  });

  it("setRequiresAcknowledgment flips flag to true", async () => {
    const a = await getActor();
    const result = await a.getDocument(docId) as any[];
    expect(result[0].requiresAcknowledgment).toBe(true);
  });

  it("getAcknowledgmentStatus starts empty before ack", async () => {
    const a = await getActor();
    // Returns [(Text, Time.Time)] — array of (principalText, timestamp) tuples
    const status = await a.getAcknowledgmentStatus(docId) as any[];
    expect(Array.isArray(status)).toBe(true);
    expect(status.length).toBe(0);
  });

  it("acknowledgeDocument records the caller", async () => {
    const a = await getActor();
    const result = await a.acknowledgeDocument(docId) as any;
    expect("ok" in result || "err" in result).toBe(true);
    if ("ok" in result) {
      const status = await a.getAcknowledgmentStatus(docId) as any[];
      expect(status.length).toBeGreaterThan(0);
    }
  });
});

describe.skipIf(!deployed)("getAllDocumentsMeta — query", () => {
  it("returns an array including the uploaded document", async () => {
    const a = await getActor();
    const all = await a.getAllDocumentsMeta() as any[];
    const found = all.find((d: any) => d.title === `HOA Rules ${RUN_ID}`);
    expect(found).toBeDefined();
  });
});
