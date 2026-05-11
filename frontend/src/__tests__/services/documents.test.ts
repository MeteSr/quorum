import { describe, it, expect, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  (process.env as any).CANISTER_ID_DOCUMENTS = "rdmx6-jaaaa-aaaah-test-cai";
});

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn() },
}));

import { Actor } from "@icp-sdk/core/agent";
import {
  getAllPublicDocumentsMeta,
  getAllDocumentsMeta,
  getDocumentsByCategory,
  uploadDocument,
} from "@/services/documents";
import type { DocCategory } from "@/services/documents";

const MOCK_DOC_META: any = {
  id:          "doc-1",
  title:       "2024 CC&Rs",
  category:    { GoverningDocuments: null },
  visibility:  { AllMembers: null },
  mimeType:    "application/pdf",
  sizeBytes:   BigInt(102400),
  uploadedBy:  { toText: () => "board-principal" } as any,
  uploadedAt:  BigInt(1_700_000_000_000_000_000),
  description: "Community CC&Rs updated 2024",
};

function makeMockActor(overrides: Record<string, any> = {}) {
  return {
    getAllPublicDocumentsMeta: vi.fn().mockResolvedValue([MOCK_DOC_META]),
    getAllDocumentsMeta:       vi.fn().mockResolvedValue([MOCK_DOC_META]),
    getDocumentsByCategory:   vi.fn().mockResolvedValue([MOCK_DOC_META]),
    uploadDocument:           vi.fn().mockResolvedValue({ ok: MOCK_DOC_META }),
    deleteDocument:           vi.fn().mockResolvedValue({ ok: null }),
    ...overrides,
  };
}

describe("documents service — getAllPublicDocumentsMeta", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns all public document metadata", async () => {
    const docs = await getAllPublicDocumentsMeta();
    expect(docs).toHaveLength(1);
    expect(docs[0].title).toBe("2024 CC&Rs");
  });

  it("returns empty array when no public documents", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getAllPublicDocumentsMeta: vi.fn().mockResolvedValue([]) }) as any
    );
    expect(await getAllPublicDocumentsMeta()).toEqual([]);
  });
});

describe("documents service — getAllDocumentsMeta", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns metadata for all documents including board-only", async () => {
    const docs = await getAllDocumentsMeta();
    expect(docs).toHaveLength(1);
    expect(docs[0].category).toEqual({ GoverningDocuments: null });
  });
});

describe("documents service — getDocumentsByCategory", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("passes category argument to the actor", async () => {
    const spy = vi.fn().mockResolvedValue([MOCK_DOC_META]);
    vi.mocked(Actor.createActor).mockReturnValue(makeMockActor({ getDocumentsByCategory: spy }) as any);
    const category: DocCategory = { GoverningDocuments: null };
    await getDocumentsByCategory(category);
    expect(spy).toHaveBeenCalledWith(category);
  });

  it("returns docs matching the requested category", async () => {
    const docs = await getDocumentsByCategory({ MeetingMinutes: null });
    expect(docs).toHaveLength(1); // mock always returns MOCK_DOC_META
  });
});

describe("documents service — uploadDocument", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with uploaded document metadata", async () => {
    const content = new Uint8Array([1, 2, 3]);
    const result = await uploadDocument(
      "2024 CC&Rs",
      { GoverningDocuments: null },
      { AllMembers: null },
      content,
      "application/pdf",
      "CC&Rs updated 2024"
    );
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.title).toBe("2024 CC&Rs");
  });

  it("returns err when caller is not authorized", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ uploadDocument: vi.fn().mockResolvedValue({ err: { NotAuthorized: null } }) }) as any
    );
    const result = await uploadDocument("Title", { Other: null }, { AllMembers: null }, new Uint8Array(), "text/plain", "");
    expect((result as any).err).toHaveProperty("NotAuthorized");
  });
});
