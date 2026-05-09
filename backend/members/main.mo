/**
 * Quorum — Members Canister
 *
 * Registry of HOA members, units, and board roles.
 * Manages onboarding, role assignment, and unit ownership records.
 */

import Map       "mo:core/Map";
import Option    "mo:core/Option";
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

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #AlreadyExists;
    #InvalidInput: Text;
  };

  // ─── Stable State ─────────────────────────────────────────────────────────────

  private var adminPrincipal : ?Principal = null;
  private let members = Map.empty<Principal, Member>();

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private func isAdmin(caller : Principal) : Bool {
    switch (adminPrincipal) {
      case null    { false };
      case (?a)    { a == caller };
    }
  };

  private func isBoard(caller : Principal) : Bool {
    switch (Map.get(members, Principal.compare, caller)) {
      case null    { false };
      case (?m)    {
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

  // ─── Member Management ────────────────────────────────────────────────────────

  public shared(msg) func registerMember(
    unitId:      Text,
    displayName: Text,
    email:       Text
  ) : async Result.Result<Member, Error> {
    if (Map.contains(members, Principal.compare, msg.caller)) {
      return #err(#AlreadyExists);
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
    Map.toValueArray(members)
  };

  public query func getActiveMembers() : async [Member] {
    let all = Map.toValueArray(members);
    Array.filter<Member>(all, func(m) { m.isActive })
  };

  public query(msg) func getMyProfile() : async ?Member {
    Map.get(members, Principal.compare, msg.caller)
  };

  public query func isBoardMember(p : Principal) : async Bool {
    isBoard(p)
  };
};

import Array "mo:core/Array";
