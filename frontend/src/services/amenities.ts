import { Actor } from "@icp-sdk/core/agent";
import { Principal } from "@dfinity/principal";
import { getAgent } from "@/services/actor";

const CANISTER_ID_AMENITIES = (process.env as any).CANISTER_ID_AMENITIES || "";

// ─── IDL Factory ─────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
export function idlFactory({ IDL }: { IDL: any }) {
  const ReservationStatus = IDL.Variant({
    Active:    IDL.Null,
    Cancelled: IDL.Null,
    Completed: IDL.Null,
  });

  const Amenity = IDL.Record({
    id:                 IDL.Text,
    name:               IDL.Text,
    description:        IDL.Text,
    capacity:           IDL.Nat,
    slotDurationMins:   IDL.Nat,
    advanceBookingDays: IDL.Nat,
    depositAmountCents: IDL.Opt(IDL.Nat),
    cancellationHours:  IDL.Nat,
    isActive:           IDL.Bool,
    createdAt:          IDL.Int,
  });

  const Reservation = IDL.Record({
    id:         IDL.Text,
    amenityId:  IDL.Text,
    date:       IDL.Text,
    startSlot:  IDL.Nat,
    guestCount: IDL.Nat,
    bookedBy:   IDL.Principal,
    unitId:     IDL.Text,
    status:     ReservationStatus,
    createdAt:  IDL.Int,
  });

  const WaitlistEntry = IDL.Record({
    id:        IDL.Text,
    amenityId: IDL.Text,
    date:      IDL.Text,
    startSlot: IDL.Nat,
    principal: IDL.Principal,
    unitId:    IDL.Text,
    position:  IDL.Nat,
    createdAt: IDL.Int,
  });

  const BlockedDate = IDL.Record({
    id:        IDL.Text,
    amenityId: IDL.Text,
    date:      IDL.Text,
    reason:    IDL.Text,
    blockedBy: IDL.Principal,
    createdAt: IDL.Int,
  });

  const SlotAvailability = IDL.Record({
    slot:      IDL.Nat,
    booked:    IDL.Nat,
    capacity:  IDL.Nat,
    available: IDL.Bool,
    blocked:   IDL.Bool,
  });

  const AmenitiesError = IDL.Variant({
    NotFound:         IDL.Null,
    NotAuthorized:    IDL.Null,
    InvalidInput:     IDL.Text,
    CapacityExceeded: IDL.Null,
    DateBlocked:      IDL.Null,
    AlreadyBooked:    IDL.Null,
  });

  const MetricsResult = IDL.Record({
    amenityCount:     IDL.Nat,
    reservationCount: IDL.Nat,
    waitlistCount:    IDL.Nat,
  });

  const ResultAmenity      = IDL.Variant({ ok: Amenity,       err: AmenitiesError });
  const ResultReservation  = IDL.Variant({ ok: Reservation,   err: AmenitiesError });
  const ResultWaitlist     = IDL.Variant({ ok: WaitlistEntry, err: AmenitiesError });
  const ResultBlockedDate  = IDL.Variant({ ok: BlockedDate,   err: AmenitiesError });
  const ResultNull         = IDL.Variant({ ok: IDL.Null,      err: AmenitiesError });

  return IDL.Service({
    setAdmin:            IDL.Func([IDL.Principal],                                                                         [ResultNull],        []),
    createAmenity:       IDL.Func([IDL.Text, IDL.Text, IDL.Nat, IDL.Nat, IDL.Nat, IDL.Opt(IDL.Nat), IDL.Nat],             [ResultAmenity],     []),
    updateAmenity:       IDL.Func([IDL.Text, IDL.Text, IDL.Text, IDL.Nat, IDL.Nat, IDL.Nat, IDL.Opt(IDL.Nat), IDL.Nat, IDL.Bool], [ResultAmenity], []),
    createReservation:   IDL.Func([IDL.Text, IDL.Text, IDL.Nat, IDL.Nat, IDL.Text],                                       [ResultReservation], []),
    cancelReservation:   IDL.Func([IDL.Text],                                                                              [ResultReservation], []),
    completeReservation: IDL.Func([IDL.Text],                                                                              [ResultReservation], []),
    blockDate:           IDL.Func([IDL.Text, IDL.Text, IDL.Text],                                                         [ResultBlockedDate], []),
    unblockDate:         IDL.Func([IDL.Text],                                                                              [ResultNull],        []),
    joinWaitlist:        IDL.Func([IDL.Text, IDL.Text, IDL.Nat, IDL.Text],                                                [ResultWaitlist],    []),
    leaveWaitlist:       IDL.Func([IDL.Text],                                                                              [ResultNull],        []),
    getAmenities:        IDL.Func([],                                                                                      [IDL.Vec(Amenity)],          ["query"]),
    getAmenity:          IDL.Func([IDL.Text],                                                                              [IDL.Opt(Amenity)],          ["query"]),
    getReservationsForAmenity: IDL.Func([IDL.Text, IDL.Text],                                                             [IDL.Vec(Reservation)],      ["query"]),
    getMyReservations:   IDL.Func([IDL.Principal],                                                                         [IDL.Vec(Reservation)],      ["query"]),
    getAvailability:     IDL.Func([IDL.Text, IDL.Text],                                                                   [IDL.Vec(SlotAvailability)], ["query"]),
    getBlockedDates:     IDL.Func([IDL.Text],                                                                              [IDL.Vec(BlockedDate)],      ["query"]),
    getWaitlistForSlot:  IDL.Func([IDL.Text, IDL.Text, IDL.Nat],                                                          [IDL.Vec(WaitlistEntry)],    ["query"]),
    getMyWaitlistEntries: IDL.Func([IDL.Principal],                                                                        [IDL.Vec(WaitlistEntry)],    ["query"]),
    metrics:             IDL.Func([],                                                                                      [MetricsResult],             ["query"]),
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReservationStatus =
  | { Active: null }
  | { Cancelled: null }
  | { Completed: null };

export interface Amenity {
  id:                 string;
  name:               string;
  description:        string;
  capacity:           bigint;
  slotDurationMins:   bigint;
  advanceBookingDays: bigint;
  depositAmountCents: [] | [bigint];
  cancellationHours:  bigint;
  isActive:           boolean;
  createdAt:          bigint;
}

export interface Reservation {
  id:         string;
  amenityId:  string;
  date:       string;
  startSlot:  bigint;
  guestCount: bigint;
  bookedBy:   import("@dfinity/principal").Principal;
  unitId:     string;
  status:     ReservationStatus;
  createdAt:  bigint;
}

export interface WaitlistEntry {
  id:        string;
  amenityId: string;
  date:      string;
  startSlot: bigint;
  principal: import("@dfinity/principal").Principal;
  unitId:    string;
  position:  bigint;
  createdAt: bigint;
}

export interface BlockedDate {
  id:        string;
  amenityId: string;
  date:      string;
  reason:    string;
  blockedBy: import("@dfinity/principal").Principal;
  createdAt: bigint;
}

export interface SlotAvailability {
  slot:      bigint;
  booked:    bigint;
  capacity:  bigint;
  available: boolean;
  blocked:   boolean;
}

export type AmenitiesError =
  | { NotFound: null }
  | { NotAuthorized: null }
  | { InvalidInput: string }
  | { CapacityExceeded: null }
  | { DateBlocked: null }
  | { AlreadyBooked: null };

// ─── Actor ────────────────────────────────────────────────────────────────────

async function createActor() {
  if (!CANISTER_ID_AMENITIES) return null;
  const agent = await getAgent();
  return Actor.createActor(idlFactory, { agent, canisterId: CANISTER_ID_AMENITIES });
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function createAmenity(
  name:               string,
  description:        string,
  capacity:           number,
  slotDurationMins:   number,
  advanceBookingDays: number,
  depositAmountCents: [] | [number],
  cancellationHours:  number
): Promise<{ ok: Amenity } | { err: AmenitiesError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { InvalidInput: "canister not deployed" } };
  const deposit: [] | [bigint] = depositAmountCents.length > 0
    ? [BigInt(depositAmountCents[0]!)]
    : [];
  return actor.createAmenity(
    name, description,
    BigInt(capacity), BigInt(slotDurationMins), BigInt(advanceBookingDays),
    deposit, BigInt(cancellationHours)
  );
}

export async function updateAmenity(
  amenityId:          string,
  name:               string,
  description:        string,
  capacity:           number,
  slotDurationMins:   number,
  advanceBookingDays: number,
  depositAmountCents: [] | [number],
  cancellationHours:  number,
  isActive:           boolean
): Promise<{ ok: Amenity } | { err: AmenitiesError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { InvalidInput: "canister not deployed" } };
  const deposit: [] | [bigint] = depositAmountCents.length > 0
    ? [BigInt(depositAmountCents[0]!)]
    : [];
  return actor.updateAmenity(
    amenityId, name, description,
    BigInt(capacity), BigInt(slotDurationMins), BigInt(advanceBookingDays),
    deposit, BigInt(cancellationHours), isActive
  );
}

export async function createReservation(
  amenityId:  string,
  date:       string,
  startSlot:  number,
  guestCount: number,
  unitId:     string
): Promise<{ ok: Reservation } | { err: AmenitiesError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { InvalidInput: "canister not deployed" } };
  return actor.createReservation(amenityId, date, BigInt(startSlot), BigInt(guestCount), unitId);
}

export async function cancelReservation(
  reservationId: string
): Promise<{ ok: Reservation } | { err: AmenitiesError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.cancelReservation(reservationId);
}

export async function completeReservation(
  reservationId: string
): Promise<{ ok: Reservation } | { err: AmenitiesError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.completeReservation(reservationId);
}

export async function blockDate(
  amenityId: string,
  date:      string,
  reason:    string
): Promise<{ ok: BlockedDate } | { err: AmenitiesError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { InvalidInput: "canister not deployed" } };
  return actor.blockDate(amenityId, date, reason);
}

export async function unblockDate(
  blockedDateId: string
): Promise<{ ok: null } | { err: AmenitiesError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.unblockDate(blockedDateId);
}

export async function joinWaitlist(
  amenityId: string,
  date:      string,
  startSlot: number,
  unitId:    string
): Promise<{ ok: WaitlistEntry } | { err: AmenitiesError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { InvalidInput: "canister not deployed" } };
  return actor.joinWaitlist(amenityId, date, BigInt(startSlot), unitId);
}

export async function leaveWaitlist(
  waitlistId: string
): Promise<{ ok: null } | { err: AmenitiesError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.leaveWaitlist(waitlistId);
}

export async function getAmenities(): Promise<Amenity[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getAmenities();
}

export async function getAmenity(amenityId: string): Promise<Amenity | null> {
  const actor = await createActor() as any;
  if (!actor) return null;
  const result: [] | [Amenity] = await actor.getAmenity(amenityId);
  return result[0] ?? null;
}

export async function getReservationsForAmenity(
  amenityId: string,
  date:      string
): Promise<Reservation[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getReservationsForAmenity(amenityId, date);
}

export async function getMyReservations(
  principalText: string
): Promise<Reservation[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getMyReservations(Principal.fromText(principalText));
}

export async function getAvailability(
  amenityId: string,
  date:      string
): Promise<SlotAvailability[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getAvailability(amenityId, date);
}

export async function getBlockedDates(amenityId: string): Promise<BlockedDate[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getBlockedDates(amenityId);
}

export async function getWaitlistForSlot(
  amenityId: string,
  date:      string,
  startSlot: number
): Promise<WaitlistEntry[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getWaitlistForSlot(amenityId, date, BigInt(startSlot));
}

export async function getMyWaitlistEntries(
  principalText: string
): Promise<WaitlistEntry[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getMyWaitlistEntries(Principal.fromText(principalText));
}
