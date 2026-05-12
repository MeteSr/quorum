import { createActor } from "./actor";
import Constants from "expo-constants";

const canisterId: string =
  (Constants.expoConfig?.extra?.canisterIds?.members as string | undefined) ?? "";

function idlFactory({ IDL }: { IDL: any }) {
  const Role = IDL.Variant({
    Homeowner:       IDL.Null,
    BoardMember:     IDL.Null,
    BoardPresident:  IDL.Null,
    Treasurer:       IDL.Null,
    Secretary:       IDL.Null,
    PropertyManager: IDL.Null,
  });
  const Member = IDL.Record({
    principal:   IDL.Principal,
    unitId:      IDL.Text,
    displayName: IDL.Text,
    email:       IDL.Text,
    role:        Role,
    joinedAt:    IDL.Int,
    isActive:    IDL.Bool,
  });
  const CommunityProfile = IDL.Record({
    name:        IDL.Text,
    address:     IDL.Text,
    totalUnits:  IDL.Nat,
    description: IDL.Text,
    createdAt:   IDL.Int,
  });
  const PageBlock = IDL.Variant({
    Text:             IDL.Text,
    Image:            IDL.Text,
    AnnouncementFeed: IDL.Null,
    ContactForm:      IDL.Null,
  });
  const WebsiteConfig = IDL.Record({
    slug:         IDL.Opt(IDL.Text),
    customDomain: IDL.Opt(IDL.Text),
    accentColor:  IDL.Text,
    pageBlocks:   IDL.Vec(PageBlock),
  });
  const PublicProfile = IDL.Record({
    name:         IDL.Text,
    address:      IDL.Text,
    totalUnits:   IDL.Nat,
    description:  IDL.Text,
    accentColor:  IDL.Text,
    pageBlocks:   IDL.Vec(PageBlock),
    memberCount:  IDL.Nat,
    slug:         IDL.Opt(IDL.Text),
    customDomain: IDL.Opt(IDL.Text),
  });
  const Error = IDL.Variant({
    NotFound:      IDL.Null,
    NotAuthorized: IDL.Null,
    AlreadyExists: IDL.Null,
    InvalidInput:  IDL.Text,
    InvalidCode:   IDL.Text,
  });
  const ResultMember   = IDL.Variant({ ok: Member, err: Error });
  const ResultTokens   = IDL.Variant({ ok: IDL.Vec(IDL.Text), err: Error });

  return IDL.Service({
    getMyProfile:        IDL.Func([], [IDL.Opt(Member)],          ["query"]),
    getCommunityProfile: IDL.Func([], [IDL.Opt(CommunityProfile)], ["query"]),
    getPublicProfile:    IDL.Func([], [IDL.Opt(PublicProfile)],    ["query"]),
    getWebsiteConfig:    IDL.Func([], [IDL.Variant({ ok: WebsiteConfig, err: Error })], ["query"]),
    registerMember:      IDL.Func([IDL.Text, IDL.Text, IDL.Text, IDL.Text], [ResultMember], []),
    registerPushToken:   IDL.Func([IDL.Text], [], []),
    removePushToken:     IDL.Func([], [], []),
    getPushTokens:       IDL.Func([], [ResultTokens], []),
  });
}

async function actor() {
  return createActor<any>(idlFactory, canisterId);
}

export interface Member {
  principal:   { toText(): string };
  unitId:      string;
  displayName: string;
  email:       string;
  role:        Record<string, null>;
  joinedAt:    bigint;
  isActive:    boolean;
}

export interface CommunityProfile {
  name: string; address: string; totalUnits: bigint;
  description: string; createdAt: bigint;
}

export interface PublicProfile {
  name: string; address: string; totalUnits: bigint; description: string;
  accentColor: string; pageBlocks: unknown[]; memberCount: bigint;
  slug: [] | [string]; customDomain: [] | [string];
}

export async function getMyProfile(): Promise<Member | null> {
  const a = await actor();
  if (!a) return null;
  const result = await a.getMyProfile() as [] | [Member];
  return result[0] ?? null;
}

export async function getCommunityProfile(): Promise<CommunityProfile | null> {
  const a = await actor();
  if (!a) return null;
  const result = await a.getCommunityProfile() as [] | [CommunityProfile];
  return result[0] ?? null;
}

export async function getPublicProfile(): Promise<PublicProfile | null> {
  const a = await actor();
  if (!a) return null;
  const result = await a.getPublicProfile() as [] | [PublicProfile];
  return result[0] ?? null;
}

export async function registerPushToken(token: string): Promise<void> {
  const a = await actor();
  if (!a) return;
  await a.registerPushToken(token);
}

export async function removePushToken(): Promise<void> {
  const a = await actor();
  if (!a) return;
  await a.removePushToken();
}
