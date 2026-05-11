import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "@/services/actor";

const CANISTER_ID_VENDORS = (process.env as any).CANISTER_ID_VENDORS || "";

// ─── IDL Factory ─────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
export function idlFactory({ IDL }: { IDL: any }) {
  const VendorCategory = IDL.Variant({
    Plumbing:    IDL.Null,
    Electrical:  IDL.Null,
    Landscaping: IDL.Null,
    HVAC:        IDL.Null,
    Cleaning:    IDL.Null,
    Roofing:     IDL.Null,
    Painting:    IDL.Null,
    Other:       IDL.Null,
  });

  const COI = IDL.Record({
    documentId: IDL.Opt(IDL.Text),
    expiryNs:   IDL.Int,
    uploadedAt: IDL.Int,
  });

  const Vendor = IDL.Record({
    id:          IDL.Text,
    name:        IDL.Text,
    category:    VendorCategory,
    phone:       IDL.Text,
    email:       IDL.Text,
    website:     IDL.Text,
    notes:       IDL.Text,
    reviewCount: IDL.Nat,
    ratingSum:   IDL.Nat,
    jobCount:    IDL.Nat,
    coi:         IDL.Opt(COI),
    addedBy:     IDL.Principal,
    createdAt:   IDL.Int,
  });

  const VendorJob = IDL.Record({
    id:          IDL.Text,
    vendorId:    IDL.Text,
    description: IDL.Text,
    completedAt: IDL.Opt(IDL.Int),
    costCents:   IDL.Opt(IDL.Nat),
    notes:       IDL.Text,
    loggedBy:    IDL.Principal,
    createdAt:   IDL.Int,
  });

  const VendorError = IDL.Variant({
    NotFound:      IDL.Null,
    NotAuthorized: IDL.Null,
    InvalidInput:  IDL.Text,
  });

  const ResultVendor    = IDL.Variant({ ok: Vendor,    err: VendorError });
  const ResultVendorJob = IDL.Variant({ ok: VendorJob, err: VendorError });
  const ResultNull      = IDL.Variant({ ok: IDL.Null,  err: VendorError });

  return IDL.Service({
    addVendor:           IDL.Func([IDL.Text, VendorCategory, IDL.Text, IDL.Text, IDL.Text, IDL.Text], [ResultVendor],    []),
    updateVendor:        IDL.Func([IDL.Text, IDL.Text, IDL.Text, IDL.Text, IDL.Text, IDL.Text],        [ResultVendor],    []),
    removeVendor:        IDL.Func([IDL.Text],                                                           [ResultNull],      []),
    addVendorReview:     IDL.Func([IDL.Text, IDL.Nat],                                                 [ResultVendor],    []),
    logJob:              IDL.Func([IDL.Text, IDL.Text, IDL.Opt(IDL.Int), IDL.Opt(IDL.Nat), IDL.Text],  [ResultVendorJob], []),
    updateCOI:           IDL.Func([IDL.Text, IDL.Opt(IDL.Text), IDL.Int],                              [ResultVendor],    []),
    getVendor:           IDL.Func([IDL.Text],                                                           [IDL.Opt(Vendor)], ["query"]),
    getAllVendors:        IDL.Func([],                                                                   [IDL.Vec(Vendor)], ["query"]),
    getVendorsByCategory: IDL.Func([VendorCategory],                                                   [IDL.Vec(Vendor)], ["query"]),
    getJobsForVendor:    IDL.Func([IDL.Text],                                                           [IDL.Vec(VendorJob)], ["query"]),
    getExpiringCOIs:     IDL.Func([IDL.Nat],                                                            [IDL.Vec(Vendor)], ["query"]),
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type VendorCategory =
  | { Plumbing: null }
  | { Electrical: null }
  | { Landscaping: null }
  | { HVAC: null }
  | { Cleaning: null }
  | { Roofing: null }
  | { Painting: null }
  | { Other: null };

export interface COI {
  documentId: [] | [string];
  expiryNs:   bigint;
  uploadedAt: bigint;
}

export interface Vendor {
  id:          string;
  name:        string;
  category:    VendorCategory;
  phone:       string;
  email:       string;
  website:     string;
  notes:       string;
  reviewCount: bigint;
  ratingSum:   bigint;
  jobCount:    bigint;
  coi:         [] | [COI];
  addedBy:     import("@dfinity/principal").Principal;
  createdAt:   bigint;
}

export interface VendorJob {
  id:          string;
  vendorId:    string;
  description: string;
  completedAt: [] | [bigint];
  costCents:   [] | [bigint];
  notes:       string;
  loggedBy:    import("@dfinity/principal").Principal;
  createdAt:   bigint;
}

export type VendorError =
  | { NotFound: null }
  | { NotAuthorized: null }
  | { InvalidInput: string };

// ─── Actor ────────────────────────────────────────────────────────────────────

async function createActor() {
  if (!CANISTER_ID_VENDORS) return null;
  const agent = await getAgent();
  return Actor.createActor(idlFactory, { agent, canisterId: CANISTER_ID_VENDORS });
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function addVendor(
  name:     string,
  category: VendorCategory,
  phone:    string,
  email:    string,
  website:  string,
  notes:    string
): Promise<{ ok: Vendor } | { err: VendorError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { InvalidInput: "canister not deployed" } };
  return actor.addVendor(name, category, phone, email, website, notes);
}

export async function updateVendor(
  id:      string,
  name:    string,
  phone:   string,
  email:   string,
  website: string,
  notes:   string
): Promise<{ ok: Vendor } | { err: VendorError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.updateVendor(id, name, phone, email, website, notes);
}

export async function removeVendor(
  id: string
): Promise<{ ok: null } | { err: VendorError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.removeVendor(id);
}

export async function addVendorReview(
  id:    string,
  stars: number
): Promise<{ ok: Vendor } | { err: VendorError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.addVendorReview(id, BigInt(stars));
}

export async function logJob(
  vendorId:    string,
  description: string,
  completedAt: [] | [bigint],
  costCents:   [] | [bigint],
  notes:       string
): Promise<{ ok: VendorJob } | { err: VendorError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { InvalidInput: "canister not deployed" } };
  return actor.logJob(vendorId, description, completedAt, costCents, notes);
}

export async function updateCOI(
  vendorId:   string,
  documentId: [] | [string],
  expiryNs:   bigint
): Promise<{ ok: Vendor } | { err: VendorError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.updateCOI(vendorId, documentId, expiryNs);
}

export async function getVendor(id: string): Promise<Vendor | null> {
  const actor = await createActor() as any;
  if (!actor) return null;
  const result: [] | [Vendor] = await actor.getVendor(id);
  return result.length > 0 ? (result[0] ?? null) : null;
}

export async function getAllVendors(): Promise<Vendor[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getAllVendors();
}

export async function getVendorsByCategory(category: VendorCategory): Promise<Vendor[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getVendorsByCategory(category);
}

export async function getJobsForVendor(vendorId: string): Promise<VendorJob[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getJobsForVendor(vendorId);
}

export async function getExpiringCOIs(withinDays: number): Promise<Vendor[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getExpiringCOIs(BigInt(withinDays));
}
