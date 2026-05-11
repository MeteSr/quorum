/**
 * Quorum — Parking Canister
 *
 * Vehicle registry, permit issuance, and parking violation log.
 * Security staff can look up any plate and see permit status instantly.
 * Violation records are append-only; tow authorization is the only field
 * that can be updated post-creation.
 */

import Array     "mo:core/Array";
import Iter      "mo:core/Iter";
import Map       "mo:core/Map";
import Nat       "mo:core/Nat";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

persistent actor Parking {

  // ─── Types ────────────────────────────────────────────────────────────────

  public type PermitType = { #Resident; #Guest; #Temporary };

  public type NoticeType = { #Warning; #Tow };

  public type Vehicle = {
    id:           Text;
    unitId:       Text;
    make:         Text;
    model:        Text;
    year:         Nat;
    color:        Text;
    licensePlate: Text;
    plateState:   Text;
    registeredBy: Principal;
    createdAt:    Time.Time;
  };

  public type Permit = {
    id:           Text;
    vehicleId:    Text;
    permitNumber: Text;
    permitType:   PermitType;
    expiresAt:    ?Time.Time;
    issuedBy:     Principal;
    createdAt:    Time.Time;
  };

  public type ParkingViolation = {
    id:            Text;
    licensePlate:  Text;
    plateState:    Text;
    location:      Text;
    description:   Text;
    photoHash:     ?Text;
    noticeType:    NoticeType;
    towAuthorized: Bool;
    loggedBy:      Principal;
    createdAt:     Time.Time;
  };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #InvalidInput: Text;
  };

  // ─── Stable State ─────────────────────────────────────────────────────────

  private var vehicleCounter   : Nat = 0;
  private var permitCounter    : Nat = 0;
  private var violationCounter : Nat = 0;

  private let vehicles   = Map.empty<Text, Vehicle>();
  private let permits    = Map.empty<Text, Permit>();
  private let violations = Map.empty<Text, ParkingViolation>();

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private func nextVehicleId() : Text {
    vehicleCounter += 1;
    "VEH_" # Nat.toText(vehicleCounter)
  };

  private func nextPermitId() : Text {
    permitCounter += 1;
    "PRM_" # Nat.toText(permitCounter)
  };

  // Zero-padded 5-digit sequential permit number: PRK-00001
  private func formatPermitNumber(num : Nat) : Text {
    let numStr = Nat.toText(num);
    "PRK-" # (if      (num < 10)    "0000" # numStr
              else if (num < 100)   "000"  # numStr
              else if (num < 1000)  "00"   # numStr
              else if (num < 10000) "0"    # numStr
              else                          numStr)
  };

  private func nextViolationId() : Text {
    violationCounter += 1;
    "PKV_" # Nat.toText(violationCounter)
  };

  // ─── Mutations ────────────────────────────────────────────────────────────

  public shared(msg) func registerVehicle(
    unitId:       Text,
    make:         Text,
    model:        Text,
    year:         Nat,
    color:        Text,
    licensePlate: Text,
    plateState:   Text
  ) : async Result.Result<Vehicle, Error> {
    if (Text.size(unitId)       == 0) return #err(#InvalidInput("unitId required"));
    if (Text.size(licensePlate) == 0) return #err(#InvalidInput("licensePlate required"));
    if (Text.size(plateState)   == 0) return #err(#InvalidInput("plateState required"));
    let vehicle : Vehicle = {
      id = nextVehicleId();
      unitId; make; model; year; color; licensePlate; plateState;
      registeredBy = msg.caller;
      createdAt    = Time.now();
    };
    Map.add(vehicles, Text.compare, vehicle.id, vehicle);
    #ok(vehicle)
  };

  public shared(msg) func issuePermit(
    vehicleId:  Text,
    permitType: PermitType,
    expiresAt:  ?Time.Time
  ) : async Result.Result<Permit, Error> {
    switch (Map.get(vehicles, Text.compare, vehicleId)) {
      case null { #err(#NotFound) };
      case (?_) {
        let permitId = nextPermitId();
        let permit : Permit = {
          id           = permitId;
          vehicleId;
          permitNumber = formatPermitNumber(permitCounter);
          permitType;
          expiresAt;
          issuedBy     = msg.caller;
          createdAt    = Time.now();
        };
        Map.add(permits, Text.compare, permit.id, permit);
        #ok(permit)
      };
    }
  };

  public shared(msg) func logViolation(
    licensePlate: Text,
    plateState:   Text,
    location:     Text,
    description:  Text,
    photoHash:    ?Text,
    noticeType:   NoticeType
  ) : async Result.Result<ParkingViolation, Error> {
    if (Text.size(licensePlate) == 0) return #err(#InvalidInput("licensePlate required"));
    if (Text.size(location)     == 0) return #err(#InvalidInput("location required"));
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    let pkv : ParkingViolation = {
      id = nextViolationId();
      licensePlate; plateState; location; description; photoHash;
      noticeType;
      towAuthorized = false;
      loggedBy      = msg.caller;
      createdAt     = Time.now();
    };
    Map.add(violations, Text.compare, pkv.id, pkv);
    #ok(pkv)
  };

  public shared(msg) func authorizeTow(violationId : Text) : async Result.Result<ParkingViolation, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(violations, Text.compare, violationId)) {
      case null { #err(#NotFound) };
      case (?pkv) {
        let updated = { pkv with towAuthorized = true };
        Map.add(violations, Text.compare, violationId, updated);
        #ok(updated)
      };
    }
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public query func lookupVehicle(plateState : Text, licensePlate : Text) : async ?Vehicle {
    Array.find<Vehicle>(
      Iter.toArray(Map.values(vehicles)),
      func(vehicle) { vehicle.plateState == plateState and vehicle.licensePlate == licensePlate }
    )
  };

  public query func getVehiclesForUnit(unitId : Text) : async [Vehicle] {
    Array.filter<Vehicle>(
      Iter.toArray(Map.values(vehicles)),
      func(vehicle) { vehicle.unitId == unitId }
    )
  };

  public query func getPermitsForVehicle(vehicleId : Text) : async [Permit] {
    Array.filter<Permit>(
      Iter.toArray(Map.values(permits)),
      func(permit) { permit.vehicleId == vehicleId }
    )
  };

  public query func getAllParkingViolations() : async [ParkingViolation] {
    Iter.toArray(Map.values(violations))
  };
}
