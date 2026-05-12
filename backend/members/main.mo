/**
 * Quorum — Members Canister
 *
 * Registry of HOA members, units, and board roles.
 * Manages onboarding via invite codes, role assignment, and unit ownership records.
 *
 * Share Links (#21): board can create read-only shareable links (Demo or AuditReadOnly)
 * for prospective boards or auditors. Each view is logged with a timestamp.
 *
 * Welcome Email (#40): on registerMember, fires a welcome email via the announcements
 * canister's sendBulkEmail. Board configures the packet in the governance canister;
 * members canister only needs the announcements canister ID wired in.
 */

import Array     "mo:core/Array";
import Int       "mo:core/Int";
import Iter      "mo:core/Iter";
import Map       "mo:core/Map";
import Nat       "mo:core/Nat";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

persistent actor Members {

  // ─── Types ───────────────────────────────────────────────────────────────────

  public type Role = {
    #Homeowner;
    #BoardMember;
    #BoardPresident;
    #Treasurer;
    #Secretary;
    #PropertyManager;        // external management company
    #AssistantManager;       // reports to PropertyManager (#16)
    #MaintenanceSupervisor;  // manages maintenance staff (#16)
    #Staff;                  // general staff, lowest privilege (#16)
  };

  // Maximum expenditure this principal may approve without escalation.
  // null = no approval authority.
  public type StaffScope = { maxApprovalCents : ?Nat };

  public type StaffAssignment = {
    principal:        Principal;
    role:             Role;
    maxApprovalCents: ?Nat;
    assignedBy:       Principal;
    assignedAt:       Time.Time;
  };

  public type ApprovalLog = {
    id:         Text;
    requestId:  Text;       // ID in the requesting canister (maintenance, treasury, …)
    action:     { #Approved; #Rejected };
    by:         Principal;
    reason:     Text;       // empty for approvals
    timestamp:  Time.Time;
  };

  public type Member = {
    principal:   Principal;
    unitId:      Text;      // e.g. "42B"
    displayName: Text;
    email:       Text;
    role:        Role;
    joinedAt:    Time.Time;
    isActive:    Bool;
  };

  public type CommunityProfile = {
    name:        Text;
    address:     Text;
    totalUnits:  Nat;
    description: Text;
    createdAt:   Time.Time;
  };

  public type InviteCode = {
    code:      Text;
    maxUses:   Nat;
    usedCount: Nat;
    expiresAt: ?Time.Time;
    createdBy: Principal;
    createdAt: Time.Time;
    isRevoked: Bool;
  };

  public type ShareScope = { #Demo; #AuditReadOnly };

  public type ShareLink = {
    token:     Text;
    scope:     ShareScope;
    createdBy: Principal;
    expiresAt: ?Time.Time;   // null = 7-day default enforced at read time
    isRevoked: Bool;
    viewCount: Nat;
    createdAt: Time.Time;
  };

  public type ShareViewLog = {
    token:    Text;
    viewedAt: Time.Time;
  };

  public type PageBlock = {
    #Text:             Text;   // plain-text or markdown content
    #Image:            Text;   // SHA-256 hash stored in photo canister
    #AnnouncementFeed;         // renders live public announcements
    #ContactForm;              // shows board contact form
  };

  public type WebsiteConfig = {
    slug:        ?Text;
    customDomain: ?Text;
    accentColor:  Text;        // hex, e.g. "#1B2D4F"
    pageBlocks:  [PageBlock];
  };

  public type PublicProfile = {
    name:        Text;
    address:     Text;
    totalUnits:  Nat;
    description: Text;
    accentColor: Text;
    pageBlocks:  [PageBlock];
    memberCount: Nat;
    slug:        ?Text;
    customDomain: ?Text;
  };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #AlreadyExists;
    #InvalidInput: Text;
    #InvalidCode:  Text;
  };

  public type UnitImportRow = {
    unitId:    Text;
    ownerName: Text;
    email:     Text;
  };

  public type UnitBulkResult = {
    succeeded : Nat;
    failed    : Nat;
    codes     : [(Text, Text)];   // (unitId, inviteCode) for each created invite
    errors    : [Text];
  };

  // ─── Stable State ─────────────────────────────────────────────────────────────

  private var adminPrincipal          : ?Principal        = null;
  private var communityProfile        : ?CommunityProfile = null;
  private var websiteConfig           : ?WebsiteConfig    = null;
  private var shareLinkCounter        : Nat               = 0;
  private var shareViewCounter        : Nat               = 0;
  private var announcementsCanisterId : Text              = "";

  private let members    = Map.empty<Principal, Member>();
  private let inviteCodes = Map.empty<Text, InviteCode>();
  private let shareLinks  = Map.empty<Text, ShareLink>();
  private let shareViews  = Map.empty<Text, ShareViewLog>(); // key: "SV_{counter}"
  private let pushTokens      = Map.empty<Principal, Text>();          // FCM/APNs tokens (#42)
  private let staffScopes     = Map.empty<Principal, StaffScope>();    // approval limits (#16)
  private let approvalLogs    = Map.empty<Text, ApprovalLog>();        // audit trail (#16)
  private var approvalCounter : Nat = 0;

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private func isAdmin(caller : Principal) : Bool {
    switch (adminPrincipal) {
      case null  { false };
      case (?a)  { a == caller };
    }
  };

  private func isBoard(caller : Principal) : Bool {
    switch (Map.get(members, Principal.compare, caller)) {
      case null  { false };
      case (?m)  {
        m.isActive and (
          m.role == #BoardMember    or
          m.role == #BoardPresident or
          m.role == #Treasurer      or
          m.role == #Secretary
        )
      };
    }
  };

  // True for board + management-tier roles (PropertyManager and below).
  private func isManagement(caller : Principal) : Bool {
    switch (Map.get(members, Principal.compare, caller)) {
      case null  { false };
      case (?m)  {
        m.isActive and (
          m.role == #BoardMember        or
          m.role == #BoardPresident     or
          m.role == #Treasurer          or
          m.role == #Secretary          or
          m.role == #PropertyManager    or
          m.role == #AssistantManager   or
          m.role == #MaintenanceSupervisor
        )
      };
    }
  };

  private func nextShareToken() : Text {
    shareLinkCounter += 1;
    // Counter + nanosecond timestamp = unique and hard to enumerate.
    "SHL-" # Nat.toText(shareLinkCounter) # "-" # Int.toText(Time.now())
  };

  private func isLinkExpired(link : ShareLink) : Bool {
    let expiry = switch (link.expiresAt) {
      case (?t)  { t };
      case null  { link.createdAt + 7 * 24 * 3_600_000_000_000 }; // 7-day default
    };
    Time.now() > expiry
  };

  // ─── Admin Bootstrap ──────────────────────────────────────────────────────────

  public shared(msg) func initAdmin() : async Result.Result<(), Error> {
    switch (adminPrincipal) {
      case (?_) { #err(#NotAuthorized) };
      case null {
        adminPrincipal := ?msg.caller;
        #ok(())
      };
    }
  };

  public shared(msg) func setAnnouncementsCanisterId(id : Text) : async () {
    if (not isAdmin(msg.caller)) return;
    announcementsCanisterId := id;
  };

  // ─── Community Profile ────────────────────────────────────────────────────────

  public shared(msg) func setCommunityProfile(
    name:        Text,
    address:     Text,
    totalUnits:  Nat,
    description: Text
  ) : async Result.Result<CommunityProfile, Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (Text.size(name) == 0)    return #err(#InvalidInput("name required"));
    let profile : CommunityProfile = { name; address; totalUnits; description; createdAt = Time.now() };
    communityProfile := ?profile;
    #ok(profile)
  };

  public query func getCommunityProfile() : async ?CommunityProfile {
    communityProfile
  };

  // ─── Website Config (#24) ─────────────────────────────────────────────────────

  public shared(msg) func setCommunitySlug(slug : Text) : async Result.Result<WebsiteConfig, Error> {
    if (not isAdmin(msg.caller) and not isBoard(msg.caller)) return #err(#NotAuthorized);
    if (Text.size(slug) < 3 or Text.size(slug) > 40) return #err(#InvalidInput("slug must be 3-40 characters"));
    // Allow only lowercase alphanumeric and hyphens.
    for (c in slug.chars()) {
      let ok = (c >= 'a' and c <= 'z') or (c >= '0' and c <= '9') or c == '-';
      if (not ok) return #err(#InvalidInput("slug may only contain a-z, 0-9, and hyphens"));
    };
    let cfg : WebsiteConfig = switch (websiteConfig) {
      case (?existing) { { existing with slug = ?slug } };
      case null        { { slug = ?slug; customDomain = null; accentColor = "#1B2D4F"; pageBlocks = [] } };
    };
    websiteConfig := ?cfg;
    #ok(cfg)
  };

  public shared(msg) func setCustomDomain(domain : Text) : async Result.Result<WebsiteConfig, Error> {
    if (not isAdmin(msg.caller) and not isBoard(msg.caller)) return #err(#NotAuthorized);
    if (Text.size(domain) == 0) return #err(#InvalidInput("domain required"));
    let cfg : WebsiteConfig = switch (websiteConfig) {
      case (?existing) { { existing with customDomain = ?domain } };
      case null        { { slug = null; customDomain = ?domain; accentColor = "#1B2D4F"; pageBlocks = [] } };
    };
    websiteConfig := ?cfg;
    #ok(cfg)
  };

  public shared(msg) func setAccentColor(color : Text) : async Result.Result<WebsiteConfig, Error> {
    if (not isAdmin(msg.caller) and not isBoard(msg.caller)) return #err(#NotAuthorized);
    if (Text.size(color) == 0) return #err(#InvalidInput("color required"));
    let cfg : WebsiteConfig = switch (websiteConfig) {
      case (?existing) { { existing with accentColor = color } };
      case null        { { slug = null; customDomain = null; accentColor = color; pageBlocks = [] } };
    };
    websiteConfig := ?cfg;
    #ok(cfg)
  };

  public shared(msg) func setPageBlocks(blocks : [PageBlock]) : async Result.Result<WebsiteConfig, Error> {
    if (not isAdmin(msg.caller) and not isBoard(msg.caller)) return #err(#NotAuthorized);
    let cfg : WebsiteConfig = switch (websiteConfig) {
      case (?existing) { { existing with pageBlocks = blocks } };
      case null        { { slug = null; customDomain = null; accentColor = "#1B2D4F"; pageBlocks = blocks } };
    };
    websiteConfig := ?cfg;
    #ok(cfg)
  };

  public query(msg) func getWebsiteConfig() : async Result.Result<WebsiteConfig, Error> {
    if (not isAdmin(msg.caller) and not isBoard(msg.caller)) return #err(#NotAuthorized);
    switch (websiteConfig) {
      case (?cfg) { #ok(cfg) };
      case null   { #ok({ slug = null; customDomain = null; accentColor = "#1B2D4F"; pageBlocks = [] }) };
    }
  };

  // Public — no auth required. Used by the public community portal.
  public query func getPublicProfile() : async ?PublicProfile {
    switch (communityProfile) {
      case null { null };
      case (?p) {
        let cfg = switch (websiteConfig) {
          case (?c) { c };
          case null { { slug = null; customDomain = null; accentColor = "#1B2D4F"; pageBlocks = [] } };
        };
        ?{
          name        = p.name;
          address     = p.address;
          totalUnits  = p.totalUnits;
          description = p.description;
          accentColor = cfg.accentColor;
          pageBlocks  = cfg.pageBlocks;
          memberCount = Map.size(members);
          slug        = cfg.slug;
          customDomain = cfg.customDomain;
        }
      };
    }
  };

  // ─── Invite Codes ─────────────────────────────────────────────────────────────

  public shared(msg) func generateInviteCode(
    code:      Text,
    maxUses:   Nat,
    expiresAt: ?Time.Time
  ) : async Result.Result<InviteCode, Error> {
    if (not isAdmin(msg.caller) and not isBoard(msg.caller)) return #err(#NotAuthorized);
    if (Text.size(code) == 0) return #err(#InvalidInput("code required"));
    if (maxUses == 0)         return #err(#InvalidInput("maxUses must be > 0"));
    if (Map.get(inviteCodes, Text.compare, code) != null) return #err(#AlreadyExists);
    let inv : InviteCode = {
      code;
      maxUses;
      usedCount = 0;
      expiresAt;
      createdBy = msg.caller;
      createdAt = Time.now();
      isRevoked = false;
    };
    Map.add(inviteCodes, Text.compare, code, inv);
    #ok(inv)
  };

  public shared(msg) func revokeInviteCode(code : Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller) and not isBoard(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(inviteCodes, Text.compare, code)) {
      case null    { #err(#NotFound) };
      case (?inv)  {
        Map.add(inviteCodes, Text.compare, code, { inv with isRevoked = true });
        #ok(())
      };
    }
  };

  public query func getInviteCode(code : Text) : async ?InviteCode {
    Map.get(inviteCodes, Text.compare, code)
  };

  // ─── Member Management ────────────────────────────────────────────────────────

  public shared(msg) func registerMember(
    unitId:      Text,
    displayName: Text,
    email:       Text,
    inviteCode:  Text
  ) : async Result.Result<Member, Error> {
    if (Map.get(members, Principal.compare, msg.caller) != null) {
      return #err(#AlreadyExists);
    };
    switch (Map.get(inviteCodes, Text.compare, inviteCode)) {
      case null    { return #err(#InvalidCode("invite code not found")) };
      case (?inv)  {
        if (inv.isRevoked)                return #err(#InvalidCode("invite code revoked"));
        if (inv.usedCount >= inv.maxUses) return #err(#InvalidCode("invite code exhausted"));
        switch (inv.expiresAt) {
          case (?expiry) { if (Time.now() > expiry) return #err(#InvalidCode("invite code expired")) };
          case null      {};
        };
        Map.add(inviteCodes, Text.compare, inviteCode, { inv with usedCount = inv.usedCount + 1 });
      };
    };
    let m : Member = {
      principal   = msg.caller;
      unitId;
      displayName;
      email;
      role        = #Homeowner;
      joinedAt    = Time.now();
      isActive    = true;
    };
    Map.add(members, Principal.compare, msg.caller, m);

    // Fire-and-forget welcome email via announcements canister.
    if (announcementsCanisterId != "") {
      let communityName = switch (communityProfile) { case (?p) p.name; case null "your HOA" };
      type Ann = actor {
        sendBulkEmail : shared (
          Text, Text, { #All; #ByRole : Text; #UnitIds : [Text] }
        ) -> async Result.Result<{ sent : Nat; failed : Nat }, { #NotAuthorized; #NotFound; #InvalidInput : Text }>;
      };
      let ann : Ann = actor(announcementsCanisterId);
      try {
        ignore await ann.sendBulkEmail(
          "Welcome to " # communityName # "!",
          "Hi " # displayName # ",\n\nWelcome to " # communityName # " on Quorum — your community's HOA platform.\n\n" #
          "You can access proposals, documents, announcements, and more from your dashboard.\n\n" #
          "If you have any questions, reply to this email or contact your board directly.\n\n" #
          "— The " # communityName # " Board",
          #UnitIds([unitId])
        );
      } catch (_) {};
    };

    #ok(m)
  };

  public shared(msg) func resendWelcomePacket(target : Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller) and not isBoard(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(members, Principal.compare, target)) {
      case null  { #err(#NotFound) };
      case (?m)  {
        if (announcementsCanisterId == "") return #err(#InvalidInput("announcements canister not configured"));
        let communityName = switch (communityProfile) { case (?p) p.name; case null "your HOA" };
        type Ann = actor {
          sendBulkEmail : shared (
            Text, Text, { #All; #ByRole : Text; #UnitIds : [Text] }
          ) -> async Result.Result<{ sent : Nat; failed : Nat }, { #NotAuthorized; #NotFound; #InvalidInput : Text }>;
        };
        let ann : Ann = actor(announcementsCanisterId);
        try {
          ignore await ann.sendBulkEmail(
            "Welcome to " # communityName # "! (resent)",
            "Hi " # m.displayName # ",\n\nHere is a resent copy of your welcome packet for " # communityName # ".\n\n" #
            "Access your dashboard at any time to view proposals, documents, announcements, and community updates.\n\n" #
            "— The " # communityName # " Board",
            #UnitIds([m.unitId])
          );
          #ok(())
        } catch (_) {
          #err(#InvalidInput("email delivery failed"))
        }
      };
    }
  };

  public shared(msg) func assignRole(
    target : Principal,
    role   : Role
  ) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller) and not isBoard(msg.caller)) {
      return #err(#NotAuthorized);
    };
    switch (Map.get(members, Principal.compare, target)) {
      case null  { #err(#NotFound) };
      case (?m)  {
        Map.add(members, Principal.compare, target, { m with role });
        #ok(())
      };
    }
  };

  public shared(msg) func deactivateMember(target : Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(members, Principal.compare, target)) {
      case null  { #err(#NotFound) };
      case (?m)  {
        Map.add(members, Principal.compare, target, { m with isActive = false });
        #ok(())
      };
    }
  };

  // ─── Share Links (#21) ────────────────────────────────────────────────────────

  public shared(msg) func createShareLink(
    scope:     ShareScope,
    expiresAt: ?Time.Time
  ) : async Result.Result<ShareLink, Error> {
    if (not isAdmin(msg.caller) and not isBoard(msg.caller)) return #err(#NotAuthorized);
    let link : ShareLink = {
      token     = nextShareToken();
      scope;
      createdBy = msg.caller;
      expiresAt;
      isRevoked = false;
      viewCount = 0;
      createdAt = Time.now();
    };
    Map.add(shareLinks, Text.compare, link.token, link);
    #ok(link)
  };

  // Public — called by ShareView page. Increments view count and logs the visit.
  public shared func getShareLink(token : Text) : async Result.Result<ShareLink, Error> {
    switch (Map.get(shareLinks, Text.compare, token)) {
      case null      { #err(#NotFound) };
      case (?link)   {
        if (link.isRevoked)      return #err(#NotAuthorized);
        if (isLinkExpired(link)) return #err(#NotAuthorized);
        let updated = { link with viewCount = link.viewCount + 1 };
        Map.add(shareLinks, Text.compare, token, updated);
        shareViewCounter += 1;
        let logKey = "SV_" # Nat.toText(shareViewCounter);
        Map.add(shareViews, Text.compare, logKey, { token; viewedAt = Time.now() });
        #ok(updated)
      };
    }
  };

  public shared(msg) func revokeShareLink(token : Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller) and not isBoard(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(shareLinks, Text.compare, token)) {
      case null     { #err(#NotFound) };
      case (?link)  {
        Map.add(shareLinks, Text.compare, token, { link with isRevoked = true });
        #ok(())
      };
    }
  };

  public shared(msg) func getMyShareLinks() : async Result.Result<[ShareLink], Error> {
    if (not isAdmin(msg.caller) and not isBoard(msg.caller)) return #err(#NotAuthorized);
    let all = Iter.toArray(Map.values(shareLinks));
    #ok(Array.filter<ShareLink>(all, func(l) { l.createdBy == msg.caller }))
  };

  public shared(msg) func getShareLinkViews(token : Text) : async Result.Result<[ShareViewLog], Error> {
    if (not isAdmin(msg.caller) and not isBoard(msg.caller)) return #err(#NotAuthorized);
    let all = Iter.toArray(Map.values(shareViews));
    #ok(Array.filter<ShareViewLog>(all, func(v) { v.token == token }))
  };

  // ─── Staff Role Hierarchy (#16) ──────────────────────────────────────────────

  // Board-only: assign or update a staff role with an optional approval ceiling.
  public shared(msg) func assignStaffRole(
    target           : Principal,
    role             : Role,
    maxApprovalCents : ?Nat
  ) : async Result.Result<StaffAssignment, Error> {
    if (not isAdmin(msg.caller) and not isBoard(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(members, Principal.compare, target)) {
      case null  { #err(#NotFound) };
      case (?m)  {
        Map.add(members, Principal.compare, target, { m with role });
        let scope : StaffScope = { maxApprovalCents };
        Map.add(staffScopes, Principal.compare, target, scope);
        let assignment : StaffAssignment = {
          principal        = target;
          role;
          maxApprovalCents;
          assignedBy       = msg.caller;
          assignedAt       = Time.now();
        };
        #ok(assignment)
      };
    }
  };

  // Board-only: revoke a staff role, reverting to Homeowner.
  public shared(msg) func revokeStaffRole(target : Principal) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller) and not isBoard(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(members, Principal.compare, target)) {
      case null  { #err(#NotFound) };
      case (?m)  {
        Map.add(members, Principal.compare, target, { m with role = #Homeowner });
        Map.remove(staffScopes, Principal.compare, target);
        #ok(())
      };
    }
  };

  // Board-only: list all staff assignments.
  public query(msg) func getStaffAssignments() : async Result.Result<[StaffAssignment], Error> {
    if (not isAdmin(msg.caller) and not isBoard(msg.caller)) return #err(#NotAuthorized);
    var acc : [StaffAssignment] = [];
    for ((p, scope) in Map.entries(staffScopes)) {
      switch (Map.get(members, Principal.compare, p)) {
        case (?m) {
          let entry : StaffAssignment = {
            principal        = p;
            role             = m.role;
            maxApprovalCents = scope.maxApprovalCents;
            assignedBy       = p;
            assignedAt       = m.joinedAt;
          };
          acc := Array.tabulate<StaffAssignment>(acc.size() + 1, func(i) {
            if (i < acc.size()) acc[i] else entry
          });
        };
        case null {};
      };
    };
    #ok(acc)
  };

  // Inter-canister query: can this principal approve an action up to amountCents?
  // Returns true for board members (unlimited) and staff with sufficient ceiling.
  public query func canApprove(p : Principal, amountCents : Nat) : async Bool {
    switch (Map.get(members, Principal.compare, p)) {
      case null  { false };
      case (?m)  {
        if (not m.isActive) return false;
        // Board roles have unlimited approval authority.
        if (m.role == #BoardMember or m.role == #BoardPresident or
            m.role == #Treasurer   or m.role == #Secretary)
          return true;
        // Management roles check their ceiling.
        switch (Map.get(staffScopes, Principal.compare, p)) {
          case null        { false };
          case (?scope)    {
            switch (scope.maxApprovalCents) {
              case null      { false };
              case (?ceiling){ amountCents <= ceiling };
            }
          };
        }
      };
    }
  };

  // Log an approval/rejection action (called from other canisters or internally).
  public shared(msg) func logApprovalAction(
    requestId : Text,
    action    : { #Approved; #Rejected },
    reason    : Text
  ) : async () {
    if (not isManagement(msg.caller) and not isAdmin(msg.caller)) return;
    approvalCounter += 1;
    let entry : ApprovalLog = {
      id        = "APR_" # Nat.toText(approvalCounter);
      requestId;
      action;
      by        = msg.caller;
      reason;
      timestamp = Time.now();
    };
    Map.add(approvalLogs, Text.compare, entry.id, entry);
  };

  // Board-only: view full approval audit trail.
  public query(msg) func getApprovalLog() : async Result.Result<[ApprovalLog], Error> {
    if (not isAdmin(msg.caller) and not isBoard(msg.caller)) return #err(#NotAuthorized);
    #ok(Iter.toArray(Map.values(approvalLogs)))
  };

  // ─── Push Tokens (#42) ───────────────────────────────────────────────────────

  // Any registered member may store their device push token.
  public shared(msg) func registerPushToken(token : Text) : async () {
    switch (Map.get(members, Principal.compare, msg.caller)) {
      case null  {};
      case (?_)  { Map.add(pushTokens, Principal.compare, msg.caller, token) };
    }
  };

  public shared(msg) func removePushToken() : async () {
    Map.remove(pushTokens, Principal.compare, msg.caller);
  };

  // Board-only: retrieve all device tokens to fan out push notifications.
  public shared(msg) func getPushTokens() : async Result.Result<[Text], Error> {
    if (not isAdmin(msg.caller) and not isBoard(msg.caller)) return #err(#NotAuthorized);
    #ok(Iter.toArray(Map.values(pushTokens)))
  };

  // ─── Queries ─────────────────────────────────────────────────────────────────

  public query func getMember(p : Principal) : async ?Member {
    Map.get(members, Principal.compare, p)
  };

  public query func getAllMembers() : async [Member] {
    Iter.toArray(Map.values(members))
  };

  public query func getActiveMembers() : async [Member] {
    Array.filter<Member>(Iter.toArray(Map.values(members)), func(m) { m.isActive })
  };

  public query(msg) func getMyProfile() : async ?Member {
    Map.get(members, Principal.compare, msg.caller)
  };

  public query func isBoardMember(p : Principal) : async Bool {
    isBoard(p)
  };

  public query func getMemberByUnit(unitId : Text) : async ?Member {
    for (m in Map.values(members)) {
      if (m.unitId == unitId and m.isActive) return ?m;
    };
    null
  };

  // Board-only: bulk-import unit roster from CSV export. Creates one-use invite codes per unit.
  // Rows capped at 500; units already registered are skipped (not an error).
  public shared(msg) func bulkImportUnits(rows : [UnitImportRow]) : async UnitBulkResult {
    if (not isAdmin(msg.caller) and not isBoard(msg.caller)) {
      return { succeeded = 0; failed = rows.size(); codes = []; errors = ["Not authorized"] };
    };
    let maxRows = 500;
    let rowsToProcess = Array.tabulate<UnitImportRow>(
      if (rows.size() < maxRows) rows.size() else maxRows, func(i) { rows[i] }
    );
    var succeeded = 0;
    var failed    = 0;
    var codes : [(Text, Text)] = [];
    var errors : [Text] = [];
    for (row in rowsToProcess.vals()) {
      if (Text.size(row.unitId) == 0) {
        failed += 1;
        errors := Array.append(errors, ["Row missing unitId"]);
      } else {
        // Skip if unit already has an active member
        var alreadyRegistered = false;
        for (m in Map.values(members)) {
          if (m.unitId == row.unitId and m.isActive) { alreadyRegistered := true };
        };
        if (alreadyRegistered) {
          failed += 1;
          errors := Array.append(errors, ["Unit " # row.unitId # " already registered"]);
        } else {
          let code = "IMPORT-" # row.unitId # "-" # Int.toText(Time.now());
          let inv : InviteCode = {
            code;
            maxUses   = 1;
            usedCount = 0;
            expiresAt = ?(Time.now() + 30 * 24 * 3_600_000_000_000); // 30 days
            createdBy = msg.caller;
            createdAt = Time.now();
            isRevoked = false;
          };
          Map.add(inviteCodes, Text.compare, code, inv);
          succeeded += 1;
          codes := Array.append(codes, [(row.unitId, code)]);
        };
      };
    };
    { succeeded; failed; codes; errors }
  };

  public query func metrics() : async { memberCount : Nat; shareLinkCount : Nat } {
    {
      memberCount    = Map.size(members);
      shareLinkCount = Map.size(shareLinks);
    }
  };
};
