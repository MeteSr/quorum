import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "@/services/actor";

const CANISTER_ID_DOCUMENTS = (process.env as any).CANISTER_ID_DOCUMENTS || "";

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

  const DocumentStatute = IDL.Variant({
    FLhb1203_Declaration: IDL.Null,
    FLhb1203_Bylaws:      IDL.Null,
    FLhb1203_Rules:       IDL.Null,
    FLhb1203_Budget:      IDL.Null,
    FLhb1203_Minutes:     IDL.Null,
    FLhb1203_Financial:   IDL.Null,
  });

  const DocumentMeta = IDL.Record({
    id:                      IDL.Text,
    title:                   IDL.Text,
    category:                DocCategory,
    visibility:              Visibility,
    mimeType:                IDL.Text,
    sizeBytes:               IDL.Nat,
    uploadedBy:              IDL.Principal,
    uploadedAt:              IDL.Int,
    description:             IDL.Text,
    requiresAcknowledgment:  IDL.Bool,
    statute:                 IDL.Opt(DocumentStatute),
  });

  const Document = IDL.Record({
    id:                      IDL.Text,
    title:                   IDL.Text,
    category:                DocCategory,
    visibility:              Visibility,
    content:                 IDL.Vec(IDL.Nat8),
    mimeType:                IDL.Text,
    sizeBytes:               IDL.Nat,
    uploadedBy:              IDL.Principal,
    uploadedAt:              IDL.Int,
    description:             IDL.Text,
    requiresAcknowledgment:  IDL.Bool,
    statute:                 IDL.Opt(DocumentStatute),
  });

  const AccessLogEntry = IDL.Record({
    docId:      IDL.Text,
    accessor:   IDL.Principal,
    accessedAt: IDL.Int,
  });

  const ComplianceStatus = IDL.Record({
    covered: IDL.Vec(DocumentStatute),
    missing: IDL.Vec(DocumentStatute),
  });

  const Error = IDL.Variant({
    NotFound:      IDL.Null,
    NotAuthorized: IDL.Null,
    InvalidInput:  IDL.Text,
    TooLarge:      IDL.Text,
  });

  const ResultMeta = IDL.Variant({ ok: DocumentMeta, err: Error });
  const ResultUnit = IDL.Variant({ ok: IDL.Null,     err: Error });
  const AckRecord  = IDL.Tuple(IDL.Text, IDL.Int);

  return IDL.Service({
    uploadDocument:            IDL.Func([IDL.Text, DocCategory, Visibility, IDL.Vec(IDL.Nat8), IDL.Text, IDL.Text], [ResultMeta],                     []),
    deleteDocument:            IDL.Func([IDL.Text],                          [ResultUnit],                           []),
    setRequiresAcknowledgment: IDL.Func([IDL.Text, IDL.Bool],                [ResultMeta],                           []),
    acknowledgeDocument:       IDL.Func([IDL.Text],                          [ResultUnit],                           []),
    setDocumentCompliance:     IDL.Func([IDL.Text, DocumentStatute],         [ResultMeta],                           []),
    clearDocumentCompliance:   IDL.Func([IDL.Text],                          [ResultMeta],                           []),
    logDocumentAccess:         IDL.Func([IDL.Text],                          [ResultUnit],                           []),
    getDocument:               IDL.Func([IDL.Text],                          [IDL.Opt(Document)],                    ["query"]),
    getDocumentMeta:           IDL.Func([IDL.Text],                          [IDL.Opt(DocumentMeta)],                ["query"]),
    getDocumentsByCategory:    IDL.Func([DocCategory],                       [IDL.Vec(DocumentMeta)],                ["query"]),
    getAllPublicDocumentsMeta:  IDL.Func([],                                  [IDL.Vec(DocumentMeta)],                ["query"]),
    getAllDocumentsMeta:        IDL.Func([],                                  [IDL.Vec(DocumentMeta)],                ["query"]),
    getAcknowledgmentStatus:   IDL.Func([IDL.Text],                          [IDL.Vec(AckRecord)],                   ["query"]),
    getMyAcknowledgedDocs:     IDL.Func([],                                  [IDL.Vec(IDL.Text)],                    ["query"]),
    getAccessLog:              IDL.Func([IDL.Text],                          [IDL.Vec(AccessLogEntry)],              ["query"]),
    getComplianceStatus:       IDL.Func([],                                  [ComplianceStatus],                     ["query"]),
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

export type DocumentStatute =
  | { FLhb1203_Declaration: null }
  | { FLhb1203_Bylaws: null }
  | { FLhb1203_Rules: null }
  | { FLhb1203_Budget: null }
  | { FLhb1203_Minutes: null }
  | { FLhb1203_Financial: null };

export interface DocumentMeta {
  id:                      string;
  title:                   string;
  category:                DocCategory;
  visibility:              Visibility;
  mimeType:                string;
  sizeBytes:               bigint;
  uploadedBy:              import("@dfinity/principal").Principal;
  uploadedAt:              bigint;
  description:             string;
  requiresAcknowledgment:  boolean;
  statute:                 [] | [DocumentStatute];
}

export interface AccessLogEntry {
  docId:      string;
  accessor:   import("@dfinity/principal").Principal;
  accessedAt: bigint;
}

export interface ComplianceStatus {
  covered: DocumentStatute[];
  missing: DocumentStatute[];
}

export type DocumentsError =
  | { NotFound: null }
  | { NotAuthorized: null }
  | { InvalidInput: string }
  | { TooLarge: string };

// ─── Actor ────────────────────────────────────────────────────────────────────

async function createActor() {
  if (!CANISTER_ID_DOCUMENTS) return null;
  const agent = await getAgent();
  return Actor.createActor(idlFactory, { agent, canisterId: CANISTER_ID_DOCUMENTS });
}

// ─── Document service ─────────────────────────────────────────────────────────

export async function getAllPublicDocumentsMeta(): Promise<DocumentMeta[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getAllPublicDocumentsMeta();
}

export async function getAllDocumentsMeta(): Promise<DocumentMeta[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getAllDocumentsMeta();
}

export async function getDocumentsByCategory(category: DocCategory): Promise<DocumentMeta[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getDocumentsByCategory(category);
}

export async function uploadDocument(
  title:       string,
  category:    DocCategory,
  visibility:  Visibility,
  content:     Uint8Array,
  mimeType:    string,
  description: string
): Promise<{ ok: DocumentMeta } | { err: DocumentsError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotAuthorized: null } };
  return actor.uploadDocument(title, category, visibility, content, mimeType, description);
}

export async function deleteDocument(id: string): Promise<{ ok: null } | { err: DocumentsError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.deleteDocument(id);
}

// ─── FL HB 1203 Compliance service ───────────────────────────────────────────

export async function setDocumentCompliance(
  docId:   string,
  statute: DocumentStatute
): Promise<{ ok: DocumentMeta } | { err: DocumentsError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotAuthorized: null } };
  return actor.setDocumentCompliance(docId, statute);
}

export async function clearDocumentCompliance(
  docId: string
): Promise<{ ok: DocumentMeta } | { err: DocumentsError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.clearDocumentCompliance(docId);
}

export async function logDocumentAccess(docId: string): Promise<void> {
  const actor = await createActor() as any;
  if (!actor) return;
  await actor.logDocumentAccess(docId);
}

export async function getAccessLog(docId: string): Promise<AccessLogEntry[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getAccessLog(docId);
}

export async function getComplianceStatus(): Promise<ComplianceStatus> {
  const actor = await createActor() as any;
  if (!actor) return { covered: [], missing: [] };
  return actor.getComplianceStatus();
}

// ─── Acknowledgment service ───────────────────────────────────────────────────

export async function setRequiresAcknowledgment(
  docId:    string,
  required: boolean
): Promise<{ ok: DocumentMeta } | { err: DocumentsError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.setRequiresAcknowledgment(docId, required);
}

export async function acknowledgeDocument(
  docId: string
): Promise<{ ok: null } | { err: DocumentsError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.acknowledgeDocument(docId);
}

export async function getAcknowledgmentStatus(
  docId: string
): Promise<[string, bigint][]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getAcknowledgmentStatus(docId);
}

export async function getMyAcknowledgedDocs(): Promise<string[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getMyAcknowledgedDocs();
}
