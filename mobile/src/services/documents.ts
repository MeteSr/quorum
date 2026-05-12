import { createActor } from "./actor";
import Constants from "expo-constants";

const canisterId: string =
  (Constants.expoConfig?.extra?.canisterIds?.documents as string | undefined) ?? "";

function idlFactory({ IDL }: { IDL: any }) {
  const DocCategory = IDL.Variant({
    GoverningDocuments: IDL.Null,
    MeetingMinutes:     IDL.Null,
    FinancialReports:   IDL.Null,
    Notices:            IDL.Null,
    Contracts:          IDL.Null,
    Other:              IDL.Null,
  });
  const Visibility = IDL.Variant({ AllMembers: IDL.Null, BoardOnly: IDL.Null });
  const Document = IDL.Record({
    id:         IDL.Text,
    title:      IDL.Text,
    category:   DocCategory,
    visibility: Visibility,
    mimeType:   IDL.Text,
    sizeBytes:  IDL.Nat,
    uploadedBy: IDL.Principal,
    uploadedAt: IDL.Int,
  });
  const DocumentWithContent = IDL.Record({
    id:         IDL.Text,
    title:      IDL.Text,
    category:   DocCategory,
    visibility: Visibility,
    content:    IDL.Vec(IDL.Nat8),
    mimeType:   IDL.Text,
    sizeBytes:  IDL.Nat,
    uploadedBy: IDL.Principal,
    uploadedAt: IDL.Int,
  });

  return IDL.Service({
    getAllDocuments:  IDL.Func([], [IDL.Vec(Document)],                  ["query"]),
    getDocument:     IDL.Func([IDL.Text], [IDL.Opt(DocumentWithContent)], ["query"]),
    acknowledgeDocument: IDL.Func([IDL.Text], [], []),
  });
}

async function actor() {
  return createActor<any>(idlFactory, canisterId);
}

export type DocCategory =
  | { GoverningDocuments: null }
  | { MeetingMinutes: null }
  | { FinancialReports: null }
  | { Notices: null }
  | { Contracts: null }
  | { Other: null };

export interface Document {
  id:         string;
  title:      string;
  category:   DocCategory;
  visibility: { AllMembers: null } | { BoardOnly: null };
  mimeType:   string;
  sizeBytes:  bigint;
  uploadedBy: { toText(): string };
  uploadedAt: bigint;
}

export interface DocumentWithContent extends Document {
  content: Uint8Array;
}

export async function getAllDocuments(): Promise<Document[]> {
  const a = await actor();
  if (!a) return [];
  return a.getAllDocuments();
}

export async function getDocument(id: string): Promise<DocumentWithContent | null> {
  const a = await actor();
  if (!a) return null;
  const result = await a.getDocument(id) as [] | [DocumentWithContent];
  return result[0] ?? null;
}

export async function acknowledgeDocument(id: string): Promise<void> {
  const a = await actor();
  if (!a) return;
  await a.acknowledgeDocument(id);
}
