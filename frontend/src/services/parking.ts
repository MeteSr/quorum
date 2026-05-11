import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "@/services/actor";

const CANISTER_ID_PARKING = (process.env as any).CANISTER_ID_PARKING || "";

// ─── IDL Factory ─────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
export function idlFactory({ IDL }: { IDL: any }) {
  const PermitType = IDL.Variant({
    Resident:  IDL.Null,
    Guest:     IDL.Null,
    Temporary: IDL.Null,
  });

  const NoticeType = IDL.Variant({
    Warning: IDL.Null,
    Tow:     IDL.Null,
  });

  const Vehicle = IDL.Record({
    id:           IDL.Text,
    unitId:       IDL.Text,
    make:         IDL.Text,
    model:        IDL.Text,
    year:         IDL.Nat,
    color:        IDL.Text,
    licensePlate: IDL.Text,
    plateState:   IDL.Text,
    registeredBy: IDL.Principal,
    createdAt:    IDL.Int,
  });

  const Permit = IDL.Record({
    id:           IDL.Text,
    vehicleId:    IDL.Text,
    permitNumber: IDL.Text,
    permitType:   PermitType,
    expiresAt:    IDL.Opt(IDL.Int),
    issuedBy:     IDL.Principal,
    createdAt:    IDL.Int,
  });

  const ParkingViolation = IDL.Record({
    id:           IDL.Text,
    licensePlate: IDL.Text,
    plateState:   IDL.Text,
    location:     IDL.Text,
    description:  IDL.Text,
    photoHash:    IDL.Opt(IDL.Text),
    noticeType:   NoticeType,
    towAuthorized: IDL.Bool,
    loggedBy:     IDL.Principal,
    createdAt:    IDL.Int,
  });

  const ParkingError = IDL.Variant({
    NotFound:      IDL.Null,
    NotAuthorized: IDL.Null,
    InvalidInput:  IDL.Text,
  });

  const ResultVehicle         = IDL.Variant({ ok: Vehicle,          err: ParkingError });
  const ResultPermit          = IDL.Variant({ ok: Permit,           err: ParkingError });
  const ResultParkingViolation = IDL.Variant({ ok: ParkingViolation, err: ParkingError });
  const ResultNull            = IDL.Variant({ ok: IDL.Null,         err: ParkingError });

  return IDL.Service({
    registerVehicle:        IDL.Func([IDL.Text, IDL.Text, IDL.Text, IDL.Nat, IDL.Text, IDL.Text, IDL.Text], [ResultVehicle],          []),
    issuePermit:            IDL.Func([IDL.Text, PermitType, IDL.Opt(IDL.Int)],                               [ResultPermit],           []),
    logViolation:           IDL.Func([IDL.Text, IDL.Text, IDL.Text, IDL.Text, IDL.Opt(IDL.Text), NoticeType],[ResultParkingViolation], []),
    authorizeTow:           IDL.Func([IDL.Text],                                                              [ResultParkingViolation], []),
    lookupVehicle:          IDL.Func([IDL.Text, IDL.Text],                                                    [IDL.Opt(Vehicle)],       ["query"]),
    getVehiclesForUnit:     IDL.Func([IDL.Text],                                                              [IDL.Vec(Vehicle)],       ["query"]),
    getPermitsForVehicle:   IDL.Func([IDL.Text],                                                              [IDL.Vec(Permit)],        ["query"]),
    getAllParkingViolations: IDL.Func([],                                                                      [IDL.Vec(ParkingViolation)], ["query"]),
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type PermitType =
  | { Resident: null }
  | { Guest: null }
  | { Temporary: null };

export type NoticeType =
  | { Warning: null }
  | { Tow: null };

export interface Vehicle {
  id:           string;
  unitId:       string;
  make:         string;
  model:        string;
  year:         bigint;
  color:        string;
  licensePlate: string;
  plateState:   string;
  registeredBy: import("@dfinity/principal").Principal;
  createdAt:    bigint;
}

export interface Permit {
  id:           string;
  vehicleId:    string;
  permitNumber: string;
  permitType:   PermitType;
  expiresAt:    [] | [bigint];
  issuedBy:     import("@dfinity/principal").Principal;
  createdAt:    bigint;
}

export interface ParkingViolation {
  id:            string;
  licensePlate:  string;
  plateState:    string;
  location:      string;
  description:   string;
  photoHash:     [] | [string];
  noticeType:    NoticeType;
  towAuthorized: boolean;
  loggedBy:      import("@dfinity/principal").Principal;
  createdAt:     bigint;
}

export type ParkingError =
  | { NotFound: null }
  | { NotAuthorized: null }
  | { InvalidInput: string };

// ─── Actor ────────────────────────────────────────────────────────────────────

async function createActor() {
  if (!CANISTER_ID_PARKING) return null;
  const agent = await getAgent();
  return Actor.createActor(idlFactory, { agent, canisterId: CANISTER_ID_PARKING });
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function registerVehicle(
  unitId:       string,
  make:         string,
  model:        string,
  year:         number,
  color:        string,
  licensePlate: string,
  plateState:   string
): Promise<{ ok: Vehicle } | { err: ParkingError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { InvalidInput: "canister not deployed" } };
  return actor.registerVehicle(unitId, make, model, BigInt(year), color, licensePlate, plateState);
}

export async function issuePermit(
  vehicleId:  string,
  permitType: PermitType,
  expiresAt:  [] | [bigint]
): Promise<{ ok: Permit } | { err: ParkingError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.issuePermit(vehicleId, permitType, expiresAt);
}

export async function logViolation(
  licensePlate: string,
  plateState:   string,
  location:     string,
  description:  string,
  photoHash:    [] | [string],
  noticeType:   NoticeType
): Promise<{ ok: ParkingViolation } | { err: ParkingError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { InvalidInput: "canister not deployed" } };
  return actor.logViolation(licensePlate, plateState, location, description, photoHash, noticeType);
}

export async function authorizeTow(
  violationId: string
): Promise<{ ok: ParkingViolation } | { err: ParkingError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.authorizeTow(violationId);
}

export async function lookupVehicle(plateState: string, licensePlate: string): Promise<Vehicle | null> {
  const actor = await createActor() as any;
  if (!actor) return null;
  const result: [] | [Vehicle] = await actor.lookupVehicle(plateState, licensePlate);
  return result.length > 0 ? (result[0] ?? null) : null;
}

export async function getVehiclesForUnit(unitId: string): Promise<Vehicle[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getVehiclesForUnit(unitId);
}

export async function getPermitsForVehicle(vehicleId: string): Promise<Permit[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getPermitsForVehicle(vehicleId);
}

export async function getAllParkingViolations(): Promise<ParkingViolation[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getAllParkingViolations();
}
