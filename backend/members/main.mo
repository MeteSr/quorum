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
    #PropertyManager;  // external management company
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
  private let pushTokens  = Map.empty<Principal, Text>();    // FCM/APNs tokens (#42)

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

  // ─── Push Tokens (#42) ───────────────────────────────────────────────────────

  // Any registered member may store their device push token.
  public shared(msg) func registerPushToken(token : Text) : async () {
    switch (Map.get(members, Principal.compare, msg.caller)) {
      case null  {};
      case (?_)  { Map.add(pushTokens, Principal.compare, msg.caller, token) };
    }
  };

  public shared(msg) func removePushToken() : async () {
    ignore Map.remove(pushTokens, Principal.compare, msg.caller);
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

  public query func metrics() : async { memberCount : Nat; shareLinkCount : Nat } {
    {
      memberCount    = Map.size(members);
      shareLinkCount = Map.size(shareLinks);
    }
  };
};
