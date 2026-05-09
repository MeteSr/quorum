/**
 * Quorum — Members Canister
 *
 * Registry of HOA members, units, and board roles.
 * Manages onboarding via invite codes, role assignment, and unit ownership records.
 */

import Array     "mo:core/Array";
import Iter      "mo:core/Iter";
import Map       "mo:core/Map";
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

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #AlreadyExists;
    #InvalidInput: Text;
    #InvalidCode:  Text;
  };

  // ─── Stable State ─────────────────────────────────────────────────────────────

  private var adminPrincipal  : ?Principal        = null;
  private var communityProfile: ?CommunityProfile = null;
  private let members         = Map.empty<Principal, Member>();
  private let inviteCodes     = Map.empty<Text, InviteCode>();

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
        if (inv.isRevoked)             return #err(#InvalidCode("invite code revoked"));
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
    #ok(m)
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
};
