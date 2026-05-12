import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "@/services/actor";

const CANISTER_ID_MEMBERS = (process.env as any).CANISTER_ID_MEMBERS || "";

// ─── IDL Factory ─────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
export function idlFactory({ IDL }: { IDL: any }) {
  const Role = IDL.Variant({
    Homeowner:              IDL.Null,
    BoardMember:            IDL.Null,
    BoardPresident:         IDL.Null,
    Treasurer:              IDL.Null,
    Secretary:              IDL.Null,
    PropertyManager:        IDL.Null,
    AssistantManager:       IDL.Null,
    MaintenanceSupervisor:  IDL.Null,
    Staff:                  IDL.Null,
  });

  const StaffAssignment = IDL.Record({
    principal:        IDL.Principal,
    role:             Role,
    maxApprovalCents: IDL.Opt(IDL.Nat),
    assignedBy:       IDL.Principal,
    assignedAt:       IDL.Int,
  });

  const ApprovalLog = IDL.Record({
    id:        IDL.Text,
    requestId: IDL.Text,
    action:    IDL.Variant({ Approved: IDL.Null, Rejected: IDL.Null }),
    by:        IDL.Principal,
    reason:    IDL.Text,
    timestamp: IDL.Int,
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

  const InviteCode = IDL.Record({
    code:      IDL.Text,
    maxUses:   IDL.Nat,
    usedCount: IDL.Nat,
    expiresAt: IDL.Opt(IDL.Int),
    createdBy: IDL.Principal,
    createdAt: IDL.Int,
    isRevoked: IDL.Bool,
  });

  const ShareScope = IDL.Variant({ Demo: IDL.Null, AuditReadOnly: IDL.Null });

  const ShareLink = IDL.Record({
    token:     IDL.Text,
    scope:     ShareScope,
    createdBy: IDL.Principal,
    expiresAt: IDL.Opt(IDL.Int),
    isRevoked: IDL.Bool,
    viewCount: IDL.Nat,
    createdAt: IDL.Int,
  });

  const ShareViewLog = IDL.Record({
    token:    IDL.Text,
    viewedAt: IDL.Int,
  });

  const Error = IDL.Variant({
    NotFound:      IDL.Null,
    NotAuthorized: IDL.Null,
    AlreadyExists: IDL.Null,
    InvalidInput:  IDL.Text,
    InvalidCode:   IDL.Text,
  });

  const ResultUnit         = IDL.Variant({ ok: IDL.Null,           err: Error });
  const ResultMember       = IDL.Variant({ ok: Member,             err: Error });
  const ResultProfile      = IDL.Variant({ ok: CommunityProfile,   err: Error });
  const ResultInvite       = IDL.Variant({ ok: InviteCode,         err: Error });
  const ResultShareLink    = IDL.Variant({ ok: ShareLink,          err: Error });
  const ResultShareLinks   = IDL.Variant({ ok: IDL.Vec(ShareLink), err: Error });
  const ResultShareViews   = IDL.Variant({ ok: IDL.Vec(ShareViewLog), err: Error });
  const ResultWebsite      = IDL.Variant({ ok: WebsiteConfig,      err: Error });
  const ResultTokens       = IDL.Variant({ ok: IDL.Vec(IDL.Text),   err: Error });
  const ResultStaffList    = IDL.Variant({ ok: IDL.Vec(StaffAssignment), err: Error });
  const ResultApprovalLogs = IDL.Variant({ ok: IDL.Vec(ApprovalLog),    err: Error });
  const ResultStaff        = IDL.Variant({ ok: StaffAssignment,         err: Error });

  return IDL.Service({
    initAdmin:                  IDL.Func([],                                        [ResultUnit],                    []),
    setAnnouncementsCanisterId: IDL.Func([IDL.Text],                                [],                              []),
    setCommunityProfile:        IDL.Func([IDL.Text, IDL.Text, IDL.Nat, IDL.Text],  [ResultProfile],                 []),
    getCommunityProfile:        IDL.Func([],                                        [IDL.Opt(CommunityProfile)],     ["query"]),
    setCommunitySlug:           IDL.Func([IDL.Text],                                [ResultWebsite],                 []),
    setCustomDomain:            IDL.Func([IDL.Text],                                [ResultWebsite],                 []),
    setAccentColor:             IDL.Func([IDL.Text],                                [ResultWebsite],                 []),
    setPageBlocks:              IDL.Func([IDL.Vec(PageBlock)],                      [ResultWebsite],                 []),
    getWebsiteConfig:           IDL.Func([],                                        [ResultWebsite],                 ["query"]),
    getPublicProfile:           IDL.Func([],                                        [IDL.Opt(PublicProfile)],        ["query"]),
    generateInviteCode:         IDL.Func([IDL.Text, IDL.Nat, IDL.Opt(IDL.Int)],    [ResultInvite],                  []),
    revokeInviteCode:           IDL.Func([IDL.Text],                                [ResultUnit],                    []),
    getInviteCode:              IDL.Func([IDL.Text],                                [IDL.Opt(InviteCode)],           ["query"]),
    registerMember:             IDL.Func([IDL.Text, IDL.Text, IDL.Text, IDL.Text], [ResultMember],                  []),
    resendWelcomePacket:        IDL.Func([IDL.Principal],                           [ResultUnit],                    []),
    assignRole:                 IDL.Func([IDL.Principal, Role],                     [ResultUnit],                    []),
    deactivateMember:           IDL.Func([IDL.Principal],                           [ResultUnit],                    []),
    getMember:                  IDL.Func([IDL.Principal],                           [IDL.Opt(Member)],               ["query"]),
    getMemberByUnit:            IDL.Func([IDL.Text],                                [IDL.Opt(Member)],               ["query"]),
    getAllMembers:               IDL.Func([],                                        [IDL.Vec(Member)],               ["query"]),
    getActiveMembers:           IDL.Func([],                                        [IDL.Vec(Member)],               ["query"]),
    getMyProfile:               IDL.Func([],                                        [IDL.Opt(Member)],               ["query"]),
    isBoardMember:              IDL.Func([IDL.Principal],                           [IDL.Bool],                      ["query"]),
    createShareLink:            IDL.Func([ShareScope, IDL.Opt(IDL.Int)],            [ResultShareLink],               []),
    getShareLink:               IDL.Func([IDL.Text],                                [ResultShareLink],               []),
    revokeShareLink:            IDL.Func([IDL.Text],                                [ResultUnit],                    []),
    getMyShareLinks:            IDL.Func([],                                        [ResultShareLinks],              []),
    getShareLinkViews:          IDL.Func([IDL.Text],                                [ResultShareViews],              []),
    metrics:                    IDL.Func([],                                        [IDL.Record({ memberCount: IDL.Nat, shareLinkCount: IDL.Nat })], ["query"]),
    registerPushToken:          IDL.Func([IDL.Text],                                [],                              []),
    removePushToken:            IDL.Func([],                                        [],                              []),
    getPushTokens:              IDL.Func([],                                        [ResultTokens],                  []),
    assignStaffRole:            IDL.Func([IDL.Principal, Role, IDL.Opt(IDL.Nat)],  [ResultStaff],                   []),
    revokeStaffRole:            IDL.Func([IDL.Principal],                           [ResultUnit],                    []),
    getStaffAssignments:        IDL.Func([],                                        [ResultStaffList],               ["query"]),
    canApprove:                 IDL.Func([IDL.Principal, IDL.Nat],                  [IDL.Bool],                      ["query"]),
    logApprovalAction:          IDL.Func([IDL.Text, IDL.Variant({ Approved: IDL.Null, Rejected: IDL.Null }), IDL.Text], [], []),
    getApprovalLog:             IDL.Func([],                                        [ResultApprovalLogs],            ["query"]),
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type Role =
  | { Homeowner: null }
  | { BoardMember: null }
  | { BoardPresident: null }
  | { Treasurer: null }
  | { Secretary: null }
  | { PropertyManager: null }
  | { AssistantManager: null }
  | { MaintenanceSupervisor: null }
  | { Staff: null };

export interface StaffAssignment {
  principal:        import("@dfinity/principal").Principal;
  role:             Role;
  maxApprovalCents: [] | [bigint];
  assignedBy:       import("@dfinity/principal").Principal;
  assignedAt:       bigint;
}

export interface ApprovalLog {
  id:        string;
  requestId: string;
  action:    { Approved: null } | { Rejected: null };
  by:        import("@dfinity/principal").Principal;
  reason:    string;
  timestamp: bigint;
}

export interface Member {
  principal:   import("@dfinity/principal").Principal;
  unitId:      string;
  displayName: string;
  email:       string;
  role:        Role;
  joinedAt:    bigint;
  isActive:    boolean;
}

export interface CommunityProfile {
  name:        string;
  address:     string;
  totalUnits:  bigint;
  description: string;
  createdAt:   bigint;
}

export interface InviteCode {
  code:      string;
  maxUses:   bigint;
  usedCount: bigint;
  expiresAt: [] | [bigint];
  createdBy: import("@dfinity/principal").Principal;
  createdAt: bigint;
  isRevoked: boolean;
}

export type ShareScope = { Demo: null } | { AuditReadOnly: null };

export interface ShareLink {
  token:     string;
  scope:     ShareScope;
  createdBy: import("@dfinity/principal").Principal;
  expiresAt: [] | [bigint];
  isRevoked: boolean;
  viewCount: bigint;
  createdAt: bigint;
}

export interface ShareViewLog {
  token:    string;
  viewedAt: bigint;
}

export type PageBlock =
  | { Text: string }
  | { Image: string }
  | { AnnouncementFeed: null }
  | { ContactForm: null };

export interface WebsiteConfig {
  slug:         [] | [string];
  customDomain: [] | [string];
  accentColor:  string;
  pageBlocks:   PageBlock[];
}

export interface PublicProfile {
  name:         string;
  address:      string;
  totalUnits:   bigint;
  description:  string;
  accentColor:  string;
  pageBlocks:   PageBlock[];
  memberCount:  bigint;
  slug:         [] | [string];
  customDomain: [] | [string];
}

export type MembersError =
  | { NotFound: null }
  | { NotAuthorized: null }
  | { AlreadyExists: null }
  | { InvalidInput: string }
  | { InvalidCode: string };

// ─── Actor ────────────────────────────────────────────────────────────────────

async function createActor() {
  if (!CANISTER_ID_MEMBERS) return null;
  const agent = await getAgent();
  return Actor.createActor(idlFactory, { agent, canisterId: CANISTER_ID_MEMBERS });
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function getCommunityProfile(): Promise<CommunityProfile | null> {
  const actor = await createActor() as any;
  if (!actor) return null;
  const result = await actor.getCommunityProfile();
  return result.length ? result[0] : null;
}

export async function getMyProfile(): Promise<Member | null> {
  const actor = await createActor() as any;
  if (!actor) return null;
  const result = await actor.getMyProfile();
  return result.length ? result[0] : null;
}

export async function getAllMembers(): Promise<Member[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getAllMembers();
}

export async function getActiveMembers(): Promise<Member[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getActiveMembers();
}

export async function registerMember(
  unitId: string, displayName: string, email: string, inviteCode: string
): Promise<{ ok: Member } | { err: MembersError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.registerMember(unitId, displayName, email, inviteCode);
}

export async function generateInviteCode(
  code: string, maxUses: bigint, expiresAt: [] | [bigint]
): Promise<{ ok: InviteCode } | { err: MembersError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.generateInviteCode(code, maxUses, expiresAt);
}

export async function getMemberByUnit(unitId: string): Promise<Member | null> {
  const actor = await createActor() as any;
  if (!actor) return null;
  const result = await actor.getMemberByUnit(unitId) as [] | [Member];
  return result[0] ?? null;
}

export async function resendWelcomePacket(
  principal: import("@dfinity/principal").Principal
): Promise<{ ok: null } | { err: MembersError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.resendWelcomePacket(principal);
}

export async function createShareLink(
  scope: ShareScope,
  expiresAt: [] | [bigint]
): Promise<{ ok: ShareLink } | { err: MembersError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotAuthorized: null } };
  return actor.createShareLink(scope, expiresAt);
}

export async function getShareLink(
  token: string
): Promise<{ ok: ShareLink } | { err: MembersError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.getShareLink(token);
}

export async function revokeShareLink(
  token: string
): Promise<{ ok: null } | { err: MembersError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.revokeShareLink(token);
}

export async function getMyShareLinks(): Promise<{ ok: ShareLink[] } | { err: MembersError }> {
  const actor = await createActor() as any;
  if (!actor) return { ok: [] };
  return actor.getMyShareLinks();
}

export async function getShareLinkViews(
  token: string
): Promise<{ ok: ShareViewLog[] } | { err: MembersError }> {
  const actor = await createActor() as any;
  if (!actor) return { ok: [] };
  return actor.getShareLinkViews(token);
}

// ─── Website Config (#24) ─────────────────────────────────────────────────────

export async function setCommunitySlug(
  slug: string
): Promise<{ ok: WebsiteConfig } | { err: MembersError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotAuthorized: null } };
  return actor.setCommunitySlug(slug);
}

export async function setCustomDomain(
  domain: string
): Promise<{ ok: WebsiteConfig } | { err: MembersError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotAuthorized: null } };
  return actor.setCustomDomain(domain);
}

export async function setAccentColor(
  color: string
): Promise<{ ok: WebsiteConfig } | { err: MembersError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotAuthorized: null } };
  return actor.setAccentColor(color);
}

export async function setPageBlocks(
  blocks: PageBlock[]
): Promise<{ ok: WebsiteConfig } | { err: MembersError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotAuthorized: null } };
  return actor.setPageBlocks(blocks);
}

export async function getWebsiteConfig(): Promise<{ ok: WebsiteConfig } | { err: MembersError }> {
  const actor = await createActor() as any;
  if (!actor) return { ok: { slug: [], customDomain: [], accentColor: "#1B2D4F", pageBlocks: [] } };
  return actor.getWebsiteConfig();
}

export async function getPublicProfile(): Promise<PublicProfile | null> {
  const actor = await createActor() as any;
  if (!actor) return null;
  const result = await actor.getPublicProfile() as [] | [PublicProfile];
  return result[0] ?? null;
}

// ─── Push Tokens (#42) ───────────────────────────────────────────────────────

export async function registerPushToken(
  token: string
): Promise<void> {
  const actor = await createActor() as any;
  if (!actor) return;
  await actor.registerPushToken(token);
}

export async function removePushToken(): Promise<void> {
  const actor = await createActor() as any;
  if (!actor) return;
  await actor.removePushToken();
}

export async function getPushTokens(): Promise<{ ok: string[] } | { err: MembersError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotAuthorized: null } };
  return actor.getPushTokens();
}

// ─── Staff Role Hierarchy (#16) ───────────────────────────────────────────────

export async function assignStaffRole(
  principal: import("@dfinity/principal").Principal,
  role: Role,
  maxApprovalCents: [] | [bigint]
): Promise<{ ok: StaffAssignment } | { err: MembersError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotAuthorized: null } };
  return actor.assignStaffRole(principal, role, maxApprovalCents);
}

export async function revokeStaffRole(
  principal: import("@dfinity/principal").Principal
): Promise<{ ok: null } | { err: MembersError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotAuthorized: null } };
  return actor.revokeStaffRole(principal);
}

export async function getStaffAssignments(): Promise<{ ok: StaffAssignment[] } | { err: MembersError }> {
  const actor = await createActor() as any;
  if (!actor) return { ok: [] };
  return actor.getStaffAssignments();
}

export async function canApprove(
  principal: import("@dfinity/principal").Principal,
  amountCents: bigint
): Promise<boolean> {
  const actor = await createActor() as any;
  if (!actor) return false;
  return actor.canApprove(principal, amountCents);
}

export async function getApprovalLog(): Promise<{ ok: ApprovalLog[] } | { err: MembersError }> {
  const actor = await createActor() as any;
  if (!actor) return { ok: [] };
  return actor.getApprovalLog();
}
