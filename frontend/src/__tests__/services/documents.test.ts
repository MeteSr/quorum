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
  acknowledgeDocument,
  getAcknowledgmentStatus,
  setRequiresAcknowledgment,
  getMyAcknowledgedDocs,
  setDocumentCompliance,
  clearDocumentCompliance,
  logDocumentAccess,
  getAccessLog,
  getComplianceStatus,
} from "@/services/documents";
import type { DocCategory } from "@/services/documents";

const MOCK_DOC_META: any = {
  id:                      "doc-1",
  title:                   "2024 CC&Rs",
  category:                { GoverningDocuments: null },
  visibility:              { AllMembers: null },
  mimeType:                "application/pdf",
  sizeBytes:               BigInt(102400),
  uploadedBy:              { toText: () => "board-principal" } as any,
  uploadedAt:              BigInt(1_700_000_000_000_000_000),
  description:             "Community CC&Rs updated 2024",
  requiresAcknowledgment:  false,
  statute:                 [] as [],
};

const MOCK_ACCESS_LOG_ENTRY = {
  docId:      "doc-1",
  accessor:   { toText: () => "member-principal" } as any,
  accessedAt: BigInt(1_700_000_000_000_000_000),
};

const MOCK_COMPLIANCE: any = {
  covered: [{ FLhb1203_Declaration: null }],
  missing: [
    { FLhb1203_Bylaws:    null },
    { FLhb1203_Rules:     null },
    { FLhb1203_Budget:    null },
    { FLhb1203_Minutes:   null },
    { FLhb1203_Financial: null },
  ],
};

function makeMockActor(overrides: Record<string, any> = {}) {
  return {
    getAllPublicDocumentsMeta:   vi.fn().mockResolvedValue([MOCK_DOC_META]),
    getAllDocumentsMeta:         vi.fn().mockResolvedValue([MOCK_DOC_META]),
    getDocumentsByCategory:     vi.fn().mockResolvedValue([MOCK_DOC_META]),
    uploadDocument:             vi.fn().mockResolvedValue({ ok: MOCK_DOC_META }),
    deleteDocument:             vi.fn().mockResolvedValue({ ok: null }),
    setRequiresAcknowledgment:  vi.fn().mockResolvedValue({ ok: { ...MOCK_DOC_META, requiresAcknowledgment: true } }),
    acknowledgeDocument:        vi.fn().mockResolvedValue({ ok: null }),
    getAcknowledgmentStatus:    vi.fn().mockResolvedValue([["aaaaa-bbbbb-cai", BigInt(1_700_000_000_000_000_000)]]),
    getMyAcknowledgedDocs:      vi.fn().mockResolvedValue(["doc-1"]),
    setDocumentCompliance:      vi.fn().mockResolvedValue({ ok: { ...MOCK_DOC_META, statute: [{ FLhb1203_Declaration: null }] } }),
    clearDocumentCompliance:    vi.fn().mockResolvedValue({ ok: MOCK_DOC_META }),
    logDocumentAccess:          vi.fn().mockResolvedValue({ ok: null }),
    getAccessLog:               vi.fn().mockResolvedValue([MOCK_ACCESS_LOG_ENTRY]),
    getComplianceStatus:        vi.fn().mockResolvedValue(MOCK_COMPLIANCE),
    ...overrides,
  };
}

// ─── Existing document tests ─────────────────────────────────────────────────

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

  it("includes requiresAcknowledgment field", async () => {
    const docs = await getAllDocumentsMeta();
    expect(docs[0]).toHaveProperty("requiresAcknowledgment");
    expect(docs[0].requiresAcknowledgment).toBe(false);
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

// ─── Acknowledgment tests ─────────────────────────────────────────────────────

describe("documents service — setRequiresAcknowledgment", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with updated document meta (requiresAcknowledgment = true)", async () => {
    const result = await setRequiresAcknowledgment("doc-1", true);
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.requiresAcknowledgment).toBe(true);
  });

  it("returns err when caller is not the uploader", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ setRequiresAcknowledgment: vi.fn().mockResolvedValue({ err: { NotAuthorized: null } }) }) as any
    );
    const result = await setRequiresAcknowledgment("doc-1", true);
    expect((result as any).err).toHaveProperty("NotAuthorized");
  });

  it("returns err when document does not exist", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ setRequiresAcknowledgment: vi.fn().mockResolvedValue({ err: { NotFound: null } }) }) as any
    );
    const result = await setRequiresAcknowledgment("doc-9999", true);
    expect((result as any).err).toHaveProperty("NotFound");
  });
});

describe("documents service — acknowledgeDocument", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok on successful acknowledgment", async () => {
    const result = await acknowledgeDocument("doc-1");
    expect(result).toHaveProperty("ok");
  });

  it("returns err when document does not exist", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ acknowledgeDocument: vi.fn().mockResolvedValue({ err: { NotFound: null } }) }) as any
    );
    const result = await acknowledgeDocument("doc-9999");
    expect((result as any).err).toHaveProperty("NotFound");
  });
});

describe("documents service — getAcknowledgmentStatus", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns list of (principalText, timestamp) tuples", async () => {
    const status = await getAcknowledgmentStatus("doc-1");
    expect(status).toHaveLength(1);
    expect(status[0][0]).toBe("aaaaa-bbbbb-cai");
    expect(typeof status[0][1]).toBe("bigint");
  });

  it("returns empty array for document with no acknowledgments", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getAcknowledgmentStatus: vi.fn().mockResolvedValue([]) }) as any
    );
    const status = await getAcknowledgmentStatus("doc-1");
    expect(status).toEqual([]);
  });
});

describe("documents service — getMyAcknowledgedDocs", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns list of docIds the caller has acknowledged", async () => {
    const docIds = await getMyAcknowledgedDocs();
    expect(docIds).toHaveLength(1);
    expect(docIds[0]).toBe("doc-1");
  });

  it("returns empty array when caller has not acknowledged any docs", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getMyAcknowledgedDocs: vi.fn().mockResolvedValue([]) }) as any
    );
    const docIds = await getMyAcknowledgedDocs();
    expect(docIds).toEqual([]);
  });
});

// ─── FL HB 1203 compliance tests ─────────────────────────────────────────────

describe("documents service — setDocumentCompliance", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with updated meta containing the statute", async () => {
    const result = await setDocumentCompliance("doc-1", { FLhb1203_Declaration: null });
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.statute).toEqual([{ FLhb1203_Declaration: null }]);
  });

  it("returns err when document not found", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ setDocumentCompliance: vi.fn().mockResolvedValue({ err: { NotFound: null } }) }) as any
    );
    const result = await setDocumentCompliance("bad-id", { FLhb1203_Bylaws: null });
    expect(result).toHaveProperty("err");
  });

  it("returns err when caller is not the uploader", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ setDocumentCompliance: vi.fn().mockResolvedValue({ err: { NotAuthorized: null } }) }) as any
    );
    const result = await setDocumentCompliance("doc-1", { FLhb1203_Rules: null });
    expect((result as any).err).toHaveProperty("NotAuthorized");
  });
});

describe("documents service — clearDocumentCompliance", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns ok with meta with statute cleared", async () => {
    const result = await clearDocumentCompliance("doc-1");
    expect(result).toHaveProperty("ok");
    expect((result as any).ok.statute).toEqual([]);
  });
});

describe("documents service — logDocumentAccess", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("calls actor.logDocumentAccess with the docId", async () => {
    const spy = vi.fn().mockResolvedValue({ ok: null });
    vi.mocked(Actor.createActor).mockReturnValue(makeMockActor({ logDocumentAccess: spy }) as any);
    await logDocumentAccess("doc-1");
    expect(spy).toHaveBeenCalledWith("doc-1");
  });

});

describe("documents service — getAccessLog", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns access log entries for a document", async () => {
    const log = await getAccessLog("doc-1");
    expect(log).toHaveLength(1);
    expect(log[0].docId).toBe("doc-1");
    expect(typeof log[0].accessedAt).toBe("bigint");
  });

  it("returns empty array when no accesses recorded", async () => {
    vi.mocked(Actor.createActor).mockReturnValue(
      makeMockActor({ getAccessLog: vi.fn().mockResolvedValue([]) }) as any
    );
    expect(await getAccessLog("doc-1")).toEqual([]);
  });
});

describe("documents service — getComplianceStatus", () => {
  beforeEach(() => vi.mocked(Actor.createActor).mockReturnValue(makeMockActor() as any));

  it("returns covered and missing statute arrays", async () => {
    const status = await getComplianceStatus();
    expect(status.covered).toHaveLength(1);
    expect(status.missing).toHaveLength(5);
    expect(status.covered[0]).toEqual({ FLhb1203_Declaration: null });
  });

});
