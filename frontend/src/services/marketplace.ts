import { Actor } from "@icp-sdk/core/agent";
import { Principal } from "@dfinity/principal";
import { getAgent } from "@/services/actor";

const CANISTER_ID_MARKETPLACE = (process.env as any).CANISTER_ID_MARKETPLACE || "";

// ─── IDL Factory ─────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
export function idlFactory({ IDL }: { IDL: any }) {
  const ListingCategory = IDL.Variant({
    ForSale:  IDL.Null,
    Services: IDL.Null,
    Free:     IDL.Null,
    LostFound: IDL.Null,
  });

  const ListingStatus = IDL.Variant({
    Active:  IDL.Null,
    Sold:    IDL.Null,
    Removed: IDL.Null,
  });

  const Listing = IDL.Record({
    id:          IDL.Text,
    title:       IDL.Text,
    description: IDL.Text,
    category:    ListingCategory,
    priceCents:  IDL.Opt(IDL.Nat),
    photos:      IDL.Vec(IDL.Text),
    contactInfo: IDL.Text,
    postedBy:    IDL.Principal,
    unitId:      IDL.Text,
    status:      ListingStatus,
    isFlagged:   IDL.Bool,
    createdAt:   IDL.Int,
    expiresAt:   IDL.Int,
  });

  const ListingFlag = IDL.Record({
    id:        IDL.Text,
    listingId: IDL.Text,
    flaggedBy: IDL.Principal,
    reason:    IDL.Text,
    createdAt: IDL.Int,
  });

  const MarketplaceError = IDL.Variant({
    NotFound:      IDL.Null,
    NotAuthorized: IDL.Null,
    InvalidInput:  IDL.Text,
    TooManyPhotos: IDL.Null,
  });

  const MetricsResult = IDL.Record({
    activeListings: IDL.Nat,
    totalListings:  IDL.Nat,
    flaggedCount:   IDL.Nat,
  });

  const ResultNull     = IDL.Variant({ ok: IDL.Null,   err: MarketplaceError });
  const ResultListing  = IDL.Variant({ ok: Listing,    err: MarketplaceError });
  const ResultFlag     = IDL.Variant({ ok: ListingFlag, err: MarketplaceError });

  return IDL.Service({
    setAdmin:             IDL.Func([IDL.Principal],                                                                                     [ResultNull],    []),
    createListing:        IDL.Func([IDL.Text, IDL.Text, ListingCategory, IDL.Opt(IDL.Nat), IDL.Vec(IDL.Text), IDL.Text, IDL.Text, IDL.Int], [ResultListing], []),
    editListing:          IDL.Func([IDL.Text, IDL.Text, IDL.Text, IDL.Opt(IDL.Nat), IDL.Vec(IDL.Text), IDL.Text, IDL.Int],              [ResultListing], []),
    deleteListing:        IDL.Func([IDL.Text],                                                                                           [ResultNull],    []),
    markSold:             IDL.Func([IDL.Text],                                                                                           [ResultListing], []),
    removeListing:        IDL.Func([IDL.Text],                                                                                           [ResultListing], []),
    flagListing:          IDL.Func([IDL.Text, IDL.Text],                                                                                 [ResultFlag],    []),
    getListings:          IDL.Func([],                          [IDL.Vec(Listing)], ["query"]),
    getListingsByCategory: IDL.Func([ListingCategory],          [IDL.Vec(Listing)], ["query"]),
    getListing:           IDL.Func([IDL.Text],                  [IDL.Opt(Listing)], ["query"]),
    getMyListings:        IDL.Func([IDL.Principal],             [IDL.Vec(Listing)], ["query"]),
    getFlaggedListings:   IDL.Func([],                          [IDL.Vec(Listing)], ["query"]),
    metrics:              IDL.Func([],                          [MetricsResult],    ["query"]),
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ListingCategory =
  | { ForSale: null }
  | { Services: null }
  | { Free: null }
  | { LostFound: null };

export type ListingStatus =
  | { Active: null }
  | { Sold: null }
  | { Removed: null };

export interface Listing {
  id:          string;
  title:       string;
  description: string;
  category:    ListingCategory;
  priceCents:  [] | [bigint];
  photos:      string[];
  contactInfo: string;
  postedBy:    import("@dfinity/principal").Principal;
  unitId:      string;
  status:      ListingStatus;
  isFlagged:   boolean;
  createdAt:   bigint;
  expiresAt:   bigint;
}

export interface ListingFlag {
  id:        string;
  listingId: string;
  flaggedBy: import("@dfinity/principal").Principal;
  reason:    string;
  createdAt: bigint;
}

export type MarketplaceError =
  | { NotFound: null }
  | { NotAuthorized: null }
  | { InvalidInput: string }
  | { TooManyPhotos: null };

// ─── Actor ────────────────────────────────────────────────────────────────────

async function createActor() {
  if (!CANISTER_ID_MARKETPLACE) return null;
  const agent = await getAgent();
  return Actor.createActor(idlFactory, { agent, canisterId: CANISTER_ID_MARKETPLACE });
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function createListing(
  title:       string,
  description: string,
  category:    ListingCategory,
  priceCents:  [] | [number],
  photos:      string[],
  contactInfo: string,
  unitId:      string,
  expiresAt:   number
): Promise<{ ok: Listing } | { err: MarketplaceError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { InvalidInput: "canister not deployed" } };
  const price: [] | [bigint] = priceCents.length > 0 ? [BigInt(priceCents[0]!)] : [];
  return actor.createListing(
    title, description, category, price, photos,
    contactInfo, unitId, BigInt(expiresAt)
  );
}

export async function editListing(
  id:          string,
  title:       string,
  description: string,
  priceCents:  [] | [number],
  photos:      string[],
  contactInfo: string,
  expiresAt:   number
): Promise<{ ok: Listing } | { err: MarketplaceError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { InvalidInput: "canister not deployed" } };
  const price: [] | [bigint] = priceCents.length > 0 ? [BigInt(priceCents[0]!)] : [];
  return actor.editListing(id, title, description, price, photos, contactInfo, BigInt(expiresAt));
}

export async function deleteListing(
  id: string
): Promise<{ ok: null } | { err: MarketplaceError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.deleteListing(id);
}

export async function markSold(
  id: string
): Promise<{ ok: Listing } | { err: MarketplaceError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.markSold(id);
}

export async function removeListing(
  id: string
): Promise<{ ok: Listing } | { err: MarketplaceError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.removeListing(id);
}

export async function flagListing(
  listingId: string,
  reason:    string
): Promise<{ ok: ListingFlag } | { err: MarketplaceError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.flagListing(listingId, reason);
}

export async function getListings(): Promise<Listing[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getListings();
}

export async function getListingsByCategory(category: ListingCategory): Promise<Listing[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getListingsByCategory(category);
}

export async function getListing(id: string): Promise<Listing | null> {
  const actor = await createActor() as any;
  if (!actor) return null;
  const result: [] | [Listing] = await actor.getListing(id);
  return result[0] ?? null;
}

export async function getMyListings(principalText: string): Promise<Listing[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getMyListings(Principal.fromText(principalText));
}

export async function getFlaggedListings(): Promise<Listing[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getFlaggedListings();
}
