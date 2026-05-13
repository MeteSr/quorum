/**
 * Quorum — Vendors Canister
 *
 * Vendor directory with job history, star ratings, and certificate-of-insurance
 * (COI) tracking. Board members can flag expired or expiring-soon COIs and
 * block assignment of vendors whose coverage has lapsed.
 */

import Array     "mo:core/Array";
import Iter      "mo:core/Iter";
import Map       "mo:core/Map";
import Nat       "mo:core/Nat";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

persistent actor Vendors {

  // ─── Types ────────────────────────────────────────────────────────────────

  public type VendorCategory = {
    #Plumbing;
    #Electrical;
    #Landscaping;
    #HVAC;
    #Cleaning;
    #Roofing;
    #Painting;
    #Other;
  };

  public type COI = {
    documentId: ?Text;
    expiryNs:   Int;
    uploadedAt: Time.Time;
  };

  public type Vendor = {
    id:          Text;
    name:        Text;
    category:    VendorCategory;
    phone:       Text;
    email:       Text;
    website:     Text;
    notes:       Text;
    reviewCount: Nat;
    ratingSum:   Nat;
    jobCount:    Nat;
    coi:         ?COI;
    addedBy:     Principal;
    createdAt:   Time.Time;
  };

  public type VendorJob = {
    id:          Text;
    vendorId:    Text;
    description: Text;
    completedAt: ?Time.Time;
    costCents:   ?Nat;
    notes:       Text;
    loggedBy:    Principal;
    createdAt:   Time.Time;
  };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #InvalidInput: Text;
  };

  public type VendorImportRow = {
    name    : Text;
    trade   : VendorCategory;
    contact : Text;  // phone or email
  };

  public type VendorBulkResult = {
    succeeded : Nat;
    failed    : Nat;
    errors    : [Text];
  };

  // ─── Stable State ─────────────────────────────────────────────────────────

  private var vendorCounter    : Nat  = 0;
  private var jobCounter       : Nat  = 0;
  private var membersCanisterId : Text = "";

  private let vendors = Map.empty<Text, Vendor>();
  private let jobs    = Map.empty<Text, VendorJob>();

  // ─── Board auth helper ────────────────────────────────────────────────────

  type MembersActor = actor { isBoardMember : shared query (Principal) -> async Bool };

  private func checkBoard(caller : Principal) : async Bool {
    if (membersCanisterId == "") return false;
    let mem : MembersActor = actor(membersCanisterId);
    try { await mem.isBoardMember(caller) } catch _ { false }
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private func nextVendorId() : Text {
    vendorCounter += 1;
    "VND_" # Nat.toText(vendorCounter)
  };

  private func nextJobId() : Text {
    jobCounter += 1;
    "JOB_" # Nat.toText(jobCounter)
  };

  // ─── Wiring ───────────────────────────────────────────────────────────────

  // One-time init: settable only when not yet configured (deploy-time wiring).
  public shared(msg) func setMembersCanisterId(id : Text) : async Result.Result<(), Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    if (membersCanisterId != "") return #err(#NotAuthorized);
    membersCanisterId := id;
    #ok(())
  };

  // ─── Mutations ────────────────────────────────────────────────────────────

  public shared(msg) func addVendor(
    name:     Text,
    category: VendorCategory,
    phone:    Text,
    email:    Text,
    website:  Text,
    notes:    Text
  ) : async Result.Result<Vendor, Error> {
    if (not (await checkBoard(msg.caller))) return #err(#NotAuthorized);
    if (Text.size(name) == 0) return #err(#InvalidInput("name required"));
    let vendor : Vendor = {
      id = nextVendorId();
      name; category; phone; email; website; notes;
      reviewCount = 0;
      ratingSum   = 0;
      jobCount    = 0;
      coi         = null;
      addedBy     = msg.caller;
      createdAt   = Time.now();
    };
    Map.add(vendors, Text.compare, vendor.id, vendor);
    #ok(vendor)
  };

  public shared(msg) func updateVendor(
    id:      Text,
    name:    Text,
    phone:   Text,
    email:   Text,
    website: Text,
    notes:   Text
  ) : async Result.Result<Vendor, Error> {
    if (not (await checkBoard(msg.caller))) return #err(#NotAuthorized);
    switch (Map.get(vendors, Text.compare, id)) {
      case null      { #err(#NotFound) };
      case (?vendor) {
        if (Text.size(name) == 0) return #err(#InvalidInput("name required"));
        let updated = { vendor with name; phone; email; website; notes };
        Map.add(vendors, Text.compare, id, updated);
        #ok(updated)
      };
    }
  };

  public shared(msg) func removeVendor(id : Text) : async Result.Result<(), Error> {
    if (not (await checkBoard(msg.caller))) return #err(#NotAuthorized);
    switch (Map.get(vendors, Text.compare, id)) {
      case null { #err(#NotFound) };
      case (?_) {
        ignore Map.delete(vendors, Text.compare, id);
        #ok(())
      };
    }
  };

  public shared(msg) func addVendorReview(
    id:    Text,
    stars: Nat
  ) : async Result.Result<Vendor, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    if (stars < 1 or stars > 5) return #err(#InvalidInput("stars must be 1–5"));
    switch (Map.get(vendors, Text.compare, id)) {
      case null      { #err(#NotFound) };
      case (?vendor) {
        let updated = {
          vendor with
          reviewCount = vendor.reviewCount + 1;
          ratingSum   = vendor.ratingSum + stars;
        };
        Map.add(vendors, Text.compare, id, updated);
        #ok(updated)
      };
    }
  };

  public shared(msg) func logJob(
    vendorId:    Text,
    description: Text,
    completedAt: ?Time.Time,
    costCents:   ?Nat,
    notes:       Text
  ) : async Result.Result<VendorJob, Error> {
    if (not (await checkBoard(msg.caller))) return #err(#NotAuthorized);
    if (Text.size(description) == 0) return #err(#InvalidInput("description required"));
    switch (Map.get(vendors, Text.compare, vendorId)) {
      case null      { #err(#NotFound) };
      case (?vendor) {
        let job : VendorJob = {
          id = nextJobId();
          vendorId; description; completedAt; costCents; notes;
          loggedBy  = msg.caller;
          createdAt = Time.now();
        };
        Map.add(jobs, Text.compare, job.id, job);
        let updatedVendor = { vendor with jobCount = vendor.jobCount + 1 };
        Map.add(vendors, Text.compare, vendorId, updatedVendor);
        #ok(job)
      };
    }
  };

  public shared(msg) func updateCOI(
    vendorId:   Text,
    documentId: ?Text,
    expiryNs:   Int
  ) : async Result.Result<Vendor, Error> {
    if (not (await checkBoard(msg.caller))) return #err(#NotAuthorized);
    switch (Map.get(vendors, Text.compare, vendorId)) {
      case null      { #err(#NotFound) };
      case (?vendor) {
        let coi : COI = {
          documentId;
          expiryNs;
          uploadedAt = Time.now();
        };
        let updated = { vendor with coi = ?coi };
        Map.add(vendors, Text.compare, vendorId, updated);
        #ok(updated)
      };
    }
  };

  // Bulk-import vendor directory (e.g. from AppFolio). Capped at 500 rows.
  public shared(msg) func bulkImportVendors(rows : [VendorImportRow]) : async VendorBulkResult {
    if (not (await checkBoard(msg.caller))) {
      return { succeeded = 0; failed = rows.size(); errors = ["Not authorized"] };
    };
    let maxRows = 500;
    let rowsToProcess = Array.tabulate<VendorImportRow>(
      if (rows.size() < maxRows) rows.size() else maxRows, func(i) { rows[i] }
    );
    var succeeded = 0;
    var failed    = 0;
    var errors : [Text] = [];
    for (row in rowsToProcess.vals()) {
      if (Text.size(row.name) == 0) {
        failed += 1;
        errors := Array.concat(errors, ["Row missing name"]);
      } else {
        let vendor : Vendor = {
          id          = nextVendorId();
          name        = row.name;
          category    = row.trade;
          phone       = row.contact;
          email       = "";
          website     = "";
          notes       = "Imported via AppFolio migration";
          reviewCount = 0;
          ratingSum   = 0;
          jobCount    = 0;
          coi         = null;
          addedBy     = msg.caller;
          createdAt   = Time.now();
        };
        Map.add(vendors, Text.compare, vendor.id, vendor);
        succeeded += 1;
      };
    };
    { succeeded; failed; errors }
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public query func getVendor(id : Text) : async ?Vendor {
    Map.get(vendors, Text.compare, id)
  };

  public query func getAllVendors() : async [Vendor] {
    Iter.toArray(Map.values(vendors))
  };

  public query func getVendorsByCategory(category : VendorCategory) : async [Vendor] {
    Array.filter<Vendor>(
      Iter.toArray(Map.values(vendors)),
      func(vendor) {
        switch (vendor.category, category) {
          case (#Plumbing,    #Plumbing)    { true };
          case (#Electrical,  #Electrical)  { true };
          case (#Landscaping, #Landscaping) { true };
          case (#HVAC,        #HVAC)        { true };
          case (#Cleaning,    #Cleaning)    { true };
          case (#Roofing,     #Roofing)     { true };
          case (#Painting,    #Painting)    { true };
          case (#Other,       #Other)       { true };
          case _                            { false };
        }
      }
    )
  };

  public query func getJobsForVendor(vendorId : Text) : async [VendorJob] {
    Array.filter<VendorJob>(
      Iter.toArray(Map.values(jobs)),
      func(job) { job.vendorId == vendorId }
    )
  };

  // Returns vendors whose COI expires within withinDays days from now,
  // or whose COI has already expired. Vendors with no COI are excluded.
  public query func getExpiringCOIs(withinDays : Nat) : async [Vendor] {
    let now      = Time.now();
    let windowNs = withinDays * 86_400 * 1_000_000_000;
    let cutoffNs : Int = now + windowNs;
    Array.filter<Vendor>(
      Iter.toArray(Map.values(vendors)),
      func(vendor) {
        switch (vendor.coi) {
          case null      { false };
          case (?coi) { coi.expiryNs <= cutoffNs };
        }
      }
    )
  };
}
