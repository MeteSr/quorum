import { Actor, HttpAgent } from "@dfinity/agent";

declare const CANISTER_ID_DOCUMENTS: string;

// ─── IDL Factory ─────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
export function idlFactory({ IDL }: { IDL: any }) {
  const DocCategory = IDL.Variant({
    GoverningDocuments: IDL.Null,
    MeetingMinutes:     IDL.Null,
    FinancialReports:   IDL.Null,
    Notices:            IDL.Null,
    Contracts:          IDL.Null,
    Other:              IDL.Null,
  });

  const Visibility = IDL.Variant({
    AllMembers: IDL.Null,
    BoardOnly:  IDL.Null,
  });

  const DocumentMeta = IDL.Record({
    id:          IDL.Text,
    title:       IDL.Text,
    category:    DocCategory,
    visibility:  Visibility,
    mimeType:    IDL.Text,
    sizeBytes:   IDL.Nat,
    uploadedBy:  IDL.Principal,
    uploadedAt:  IDL.Int,
    description: IDL.Text,
  });

  const Document = IDL.Record({
    id:          IDL.Text,
    title:       IDL.Text,
    category:    DocCategory,
    visibility:  Visibility,
    content:     IDL.Vec(IDL.Nat8),
    mimeType:    IDL.Text,
    sizeBytes:   IDL.Nat,
    uploadedBy:  IDL.Principal,
    uploadedAt:  IDL.Int,
    description: IDL.Text,
  });

  const Error = IDL.Variant({
    NotFound:      IDL.Null,
    NotAuthorized: IDL.Null,
    InvalidInput:  IDL.Text,
    TooLarge:      IDL.Text,
  });

  const ResultMeta = IDL.Variant({ ok: DocumentMeta, err: Error });
  const ResultUnit = IDL.Variant({ ok: IDL.Null,     err: Error });

  return IDL.Service({
    uploadDocument:          IDL.Func([IDL.Text, DocCategory, Visibility, IDL.Vec(IDL.Nat8), IDL.Text, IDL.Text], [ResultMeta], []),
    deleteDocument:          IDL.Func([IDL.Text],                         [ResultUnit],                  []),
    getDocument:             IDL.Func([IDL.Text],                         [IDL.Opt(Document)],            ["query"]),
    getDocumentMeta:         IDL.Func([IDL.Text],                         [IDL.Opt(DocumentMeta)],        ["query"]),
    getDocumentsByCategory:  IDL.Func([DocCategory],                      [IDL.Vec(DocumentMeta)],        ["query"]),
    getAllPublicDocumentsMeta:IDL.Func([],                                 [IDL.Vec(DocumentMeta)],        ["query"]),
    getAllDocumentsMeta:      IDL.Func([],                                 [IDL.Vec(DocumentMeta)],        ["query"]),
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocCategory =
  | { GoverningDocuments: null }
  | { MeetingMinutes: null }
  | { FinancialReports: null }
  | { Notices: null }
  | { Contracts: null }
  | { Other: null };

export type Visibility = { AllMembers: null } | { BoardOnly: null };

export interface DocumentMeta {
  id:          string;
  title:       string;
  category:    DocCategory;
  visibility:  Visibility;
  mimeType:    string;
  sizeBytes:   bigint;
  uploadedBy:  import("@dfinity/principal").Principal;
  uploadedAt:  bigint;
  description: string;
}

export type DocumentsError =
  | { NotFound: null }
  | { NotAuthorized: null }
  | { InvalidInput: string }
  | { TooLarge: string };

// ─── Actor ────────────────────────────────────────────────────────────────────

function createActor() {
  if (!CANISTER_ID_DOCUMENTS) return null;
  const agent = new HttpAgent();
  if (typeof window === "undefined" || window.location.hostname === "localhost") {
    agent.fetchRootKey().catch(() => {});
  }
  return Actor.createActor(idlFactory, { agent, canisterId: CANISTER_ID_DOCUMENTS });
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function getAllPublicDocumentsMeta(): Promise<DocumentMeta[]> {
  const actor = createActor() as any;
  if (!actor) return [];
  return actor.getAllPublicDocumentsMeta();
}

export async function getAllDocumentsMeta(): Promise<DocumentMeta[]> {
  const actor = createActor() as any;
  if (!actor) return [];
  return actor.getAllDocumentsMeta();
}

export async function getDocumentsByCategory(category: DocCategory): Promise<DocumentMeta[]> {
  const actor = createActor() as any;
  if (!actor) return [];
  return actor.getDocumentsByCategory(category);
}

export async function deleteDocument(id: string): Promise<{ ok: null } | { err: DocumentsError }> {
  const actor = createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.deleteDocument(id);
}
