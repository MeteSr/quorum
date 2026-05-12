/**
 * Quorum — Amenities Canister
 *
 * Board-configurable shared amenity booking: pool, clubhouse, courts, gym, BBQ areas.
 * Enforces per-slot capacity, cancellation policy, date blocking, and waitlists.
 *
 * Stripe deposit holds: on createReservation, if depositAmountCents > 0 and
 * stripeSecretKey is configured, a Stripe PaymentIntent is created with
 * capture_method=manual. The clientSecret is returned for frontend confirmation.
 * Deposits are captured on completeReservation, and cancelled or captured on
 * cancelReservation depending on whether the cancellation is within policy.
 *
 * Waitlist notifications: on cancelReservation, the first waitlist entry for the
 * freed slot is emailed via the announcements canister's sendBulkEmail.
 */

import Array     "mo:core/Array";
import Blob      "mo:core/Blob";
import Iter      "mo:core/Iter";
import Map       "mo:core/Map";
import Nat       "mo:core/Nat";
import Nat64     "mo:core/Nat64";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

persistent actor Amenities {

  // ─── HTTP outcall types (IC management canister) ──────────────────────────

  type HttpHeader  = { name : Text; value : Text };
  type HttpMethod  = { #get; #post; #head };
  type HttpResponse = { status : Nat; headers : [HttpHeader]; body : Blob };
  type TransformArgs = { response : HttpResponse; context : Blob };

  let ic : actor {
    http_request : shared ({
      url               : Text;
      max_response_bytes : ?Nat64;
      headers           : [HttpHeader];
      body              : ?Blob;
      method            : HttpMethod;
      transform         : ?{
        function : shared query (TransformArgs) -> async HttpResponse;
        context  : Blob;
      };
    }) -> async HttpResponse;
  } = actor "aaaaa-aa";

  // Strip non-deterministic headers for subnet consensus.
  public query func transform(args : TransformArgs) : async HttpResponse {
    { status = args.response.status; headers = []; body = args.response.body }
  };

  // ─── Types ────────────────────────────────────────────────────────────────

  public type ReservationStatus = { #Active; #Cancelled; #Completed };

  public type Amenity = {
    id:                 Text;
    name:               Text;
    description:        Text;
    capacity:           Nat;   // max concurrent guests per slot
    slotDurationMins:   Nat;   // e.g. 60 = 1-hour slots
    advanceBookingDays: Nat;   // how far ahead residents can book
    depositAmountCents: ?Nat;  // USD cents; null = no deposit required
    cancellationHours:  Nat;   // cancel before this many hours = full refund; after = forfeits deposit
    isActive:           Bool;
    createdAt:          Time.Time;
  };

  public type Reservation = {
    id:                     Text;
    amenityId:              Text;
    date:                   Text;          // "YYYY-MM-DD"
    startSlot:              Nat;           // 0-indexed slot within the day
    guestCount:             Nat;
    bookedBy:               Principal;
    unitId:                 Text;
    status:                 ReservationStatus;
    createdAt:              Time.Time;
    bookingStartNs:         Int;           // epoch-ns of the actual slot start (for cancellation timing)
    stripePaymentIntentId:  ?Text;         // set if deposit was created
    clientSecret:           ?Text;         // Stripe client_secret, set at creation for frontend confirmation
  };

  public type WaitlistEntry = {
    id:        Text;
    amenityId: Text;
    date:      Text;
    startSlot: Nat;
    principal: Principal;
    unitId:    Text;
    position:  Nat;
    createdAt: Time.Time;
  };

  public type BlockedDate = {
    id:        Text;
    amenityId: Text;
    date:      Text;
    reason:    Text;
    blockedBy: Principal;
    createdAt: Time.Time;
  };

  public type SlotAvailability = {
    slot:      Nat;
    booked:    Nat;   // total guestCount across active reservations
    capacity:  Nat;
    available: Bool;
    blocked:   Bool;
  };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #InvalidInput:    Text;
    #CapacityExceeded;
    #DateBlocked;
    #AlreadyBooked;   // caller already has an active reservation for this slot
  };

  // ─── Stable State ─────────────────────────────────────────────────────────

  private var adminPrincipal         : ?Principal = null;
  private var amenityCounter         : Nat        = 0;
  private var reservationCounter     : Nat        = 0;
  private var waitlistCounter        : Nat        = 0;
  private var blockedDateCounter     : Nat        = 0;
  private var stripeSecretKey        : ?Text      = null;
  private var announcementsCanisterId : Text      = "";

  private let amenities     = Map.empty<Text, Amenity>();
  private let reservations  = Map.empty<Text, Reservation>();
  private let waitlist      = Map.empty<Text, WaitlistEntry>();
  private let blockedDates  = Map.empty<Text, BlockedDate>();

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private func isAdmin(caller : Principal) : Bool {
    switch (adminPrincipal) {
      case null  { false };
      case (?a)  { a == caller };
    }
  };

  private func nextAmenityId() : Text {
    amenityCounter += 1;
    "AMN_" # Nat.toText(amenityCounter)
  };

  private func nextReservationId() : Text {
    reservationCounter += 1;
    "RSV_" # Nat.toText(reservationCounter)
  };

  private func nextWaitlistId() : Text {
    waitlistCounter += 1;
    "WLT_" # Nat.toText(waitlistCounter)
  };

  private func nextBlockedDateId() : Text {
    blockedDateCounter += 1;
    "BLK_" # Nat.toText(blockedDateCounter)
  };

  private func isDateBlocked(amenityId : Text, date : Text) : Bool {
    let blks = Iter.toArray(Map.values(blockedDates));
    switch (Array.find<BlockedDate>(blks, func(b) { b.amenityId == amenityId and b.date == date })) {
      case null  { false };
      case (?_)  { true  };
    }
  };

  // Returns total guestCount already booked for a given amenity/date/slot.
  private func bookedCountForSlot(amenityId : Text, date : Text, slot : Nat) : Nat {
    let all = Iter.toArray(Map.values(reservations));
    let active = Array.filter<Reservation>(all, func(r) {
      r.amenityId == amenityId and r.date == date and r.startSlot == slot and
      (switch (r.status) { case (#Active) { true }; case _ { false } })
    });
    Array.foldLeft<Reservation, Nat>(active, 0, func(acc, r) { acc + r.guestCount })
  };

  // Returns waitlist position count for a given slot.
  private func waitlistCountForSlot(amenityId : Text, date : Text, slot : Nat) : Nat {
    let all = Iter.toArray(Map.values(waitlist));
    Array.filter<WaitlistEntry>(all, func(w) {
      w.amenityId == amenityId and w.date == date and w.startSlot == slot
    }).size()
  };

  // Minimal JSON string-field extractor for Stripe responses.
  private func jsonExtract(json : Text, key : Text) : ?Text {
    let needle = "\"" # key # "\":\"";
    let parts  = Text.split(json, #text needle);
    ignore parts.next();
    switch (parts.next()) {
      case null    { null };
      case (?rest) { Text.split(rest, #text "\"").next() };
    }
  };

  // ─── Admin ────────────────────────────────────────────────────────────────

  public shared(msg) func setAdmin(principal : Principal) : async Result.Result<(), Error> {
    switch (adminPrincipal) {
      case null {
        adminPrincipal := ?principal;
        #ok(())
      };
      case (?_) {
        if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
        adminPrincipal := ?principal;
        #ok(())
      };
    }
  };

  public shared(msg) func setStripeKey(key : Text) : async () {
    if (not isAdmin(msg.caller)) return;
    stripeSecretKey := if (Text.size(key) == 0) null else ?key;
  };

  public shared(msg) func setAnnouncementsCanisterId(id : Text) : async () {
    if (not isAdmin(msg.caller)) return;
    announcementsCanisterId := id;
  };

  // ─── Amenity CRUD ─────────────────────────────────────────────────────────

  public shared(msg) func createAmenity(
    name:               Text,
    description:        Text,
    capacity:           Nat,
    slotDurationMins:   Nat,
    advanceBookingDays: Nat,
    depositAmountCents: ?Nat,
    cancellationHours:  Nat
  ) : async Result.Result<Amenity, Error> {
    if (not isAdmin(msg.caller))           return #err(#NotAuthorized);
    if (Text.size(name) == 0)              return #err(#InvalidInput("name required"));
    if (capacity == 0)                     return #err(#InvalidInput("capacity must be > 0"));
    if (slotDurationMins == 0)             return #err(#InvalidInput("slotDurationMins must be > 0"));
    let amenity : Amenity = {
      id = nextAmenityId();
      name; description; capacity; slotDurationMins;
      advanceBookingDays; depositAmountCents; cancellationHours;
      isActive  = true;
      createdAt = Time.now();
    };
    Map.add(amenities, Text.compare, amenity.id, amenity);
    #ok(amenity)
  };

  public shared(msg) func updateAmenity(
    amenityId:          Text,
    name:               Text,
    description:        Text,
    capacity:           Nat,
    slotDurationMins:   Nat,
    advanceBookingDays: Nat,
    depositAmountCents: ?Nat,
    cancellationHours:  Nat,
    isActive:           Bool
  ) : async Result.Result<Amenity, Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(amenities, Text.compare, amenityId)) {
      case null { #err(#NotFound) };
      case (?existing) {
        if (capacity == 0)         return #err(#InvalidInput("capacity must be > 0"));
        if (slotDurationMins == 0) return #err(#InvalidInput("slotDurationMins must be > 0"));
        let updated : Amenity = {
          existing with
          name; description; capacity; slotDurationMins;
          advanceBookingDays; depositAmountCents; cancellationHours; isActive;
        };
        Map.add(amenities, Text.compare, amenityId, updated);
        #ok(updated)
      };
    }
  };

  // ─── Reservations ─────────────────────────────────────────────────────────

  public shared(msg) func createReservation(
    amenityId:      Text,
    date:           Text,
    startSlot:      Nat,
    guestCount:     Nat,
    unitId:         Text,
    bookingStartNs: Int    // epoch-ns of the slot's wall-clock start; passed by the frontend
  ) : async Result.Result<Reservation, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    if (Text.size(date)  == 0)             return #err(#InvalidInput("date required (YYYY-MM-DD)"));
    if (Text.size(unitId) == 0)            return #err(#InvalidInput("unitId required"));
    if (guestCount == 0)                   return #err(#InvalidInput("guestCount must be > 0"));

    switch (Map.get(amenities, Text.compare, amenityId)) {
      case null { #err(#NotFound) };
      case (?amenity) {
        if (not amenity.isActive) return #err(#InvalidInput("amenity is not active"));
        if (isDateBlocked(amenityId, date)) return #err(#DateBlocked);

        // Check caller doesn't already have an active reservation for this slot.
        let allRes = Iter.toArray(Map.values(reservations));
        let callerConflict = Array.find<Reservation>(allRes, func(r) {
          r.amenityId == amenityId and r.date == date and r.startSlot == startSlot and
          r.bookedBy == msg.caller and
          (switch (r.status) { case (#Active) { true }; case _ { false } })
        });
        if (callerConflict != null) return #err(#AlreadyBooked);

        let alreadyBooked = bookedCountForSlot(amenityId, date, startSlot);
        if (alreadyBooked + guestCount > amenity.capacity) return #err(#CapacityExceeded);

        // Insert reservation before async Stripe call to avoid race with concurrent bookings.
        let rsv : Reservation = {
          id                    = nextReservationId();
          amenityId; date; startSlot; guestCount;
          bookedBy              = msg.caller;
          unitId;
          status                = #Active;
          createdAt             = Time.now();
          bookingStartNs;
          stripePaymentIntentId = null;
          clientSecret          = null;
        };
        Map.add(reservations, Text.compare, rsv.id, rsv);

        // Create Stripe PaymentIntent (capture_method=manual) if deposit required.
        switch (amenity.depositAmountCents, stripeSecretKey) {
          case (?amount, ?key) {
            let body = "amount=" # Nat.toText(amount) # "&currency=usd&capture_method=manual";
            try {
              let response = await (with cycles = 3_000_000_000) ic.http_request({
                url               = "https://api.stripe.com/v1/payment_intents";
                max_response_bytes = ?Nat64.fromNat(4_096);
                headers           = [
                  { name = "authorization"; value = "Bearer " # key },
                  { name = "content-type";  value = "application/x-www-form-urlencoded" },
                ];
                body      = ?Text.encodeUtf8(body);
                method    = #post;
                transform = ?{ function = transform; context = Blob.fromArray([]) };
              });
              switch (Text.decodeUtf8(response.body)) {
                case (?json) {
                  let piId = jsonExtract(json, "id");
                  let cs   = jsonExtract(json, "client_secret");
                  let withPi : Reservation = { rsv with stripePaymentIntentId = piId; clientSecret = cs };
                  Map.add(reservations, Text.compare, rsv.id, withPi);
                  return #ok(withPi);
                };
                case null {};
              };
            } catch (_) {};
          };
          case _ {};
        };

        #ok(rsv)
      };
    }
  };

  public shared(msg) func cancelReservation(reservationId : Text) : async Result.Result<Reservation, Error> {
    switch (Map.get(reservations, Text.compare, reservationId)) {
      case null { #err(#NotFound) };
      case (?rsv) {
        let isOwner = rsv.bookedBy == msg.caller;
        let isAdminCaller = isAdmin(msg.caller);
        if (not isOwner and not isAdminCaller) return #err(#NotAuthorized);
        switch (rsv.status) {
          case (#Cancelled)  { #err(#InvalidInput("reservation already cancelled")) };
          case (#Completed)  { #err(#InvalidInput("cannot cancel a completed reservation")) };
          case (#Active) {
            // Update status first to guard against reentrancy.
            let updated : Reservation = { rsv with status = #Cancelled };
            Map.add(reservations, Text.compare, reservationId, updated);

            // Stripe: capture (late cancel) or cancel (on-time) the deposit hold.
            switch (updated.stripePaymentIntentId, stripeSecretKey) {
              case (?piId, ?key) {
                let amenityOpt = Map.get(amenities, Text.compare, rsv.amenityId);
                let cancellationHours = switch (amenityOpt) { case (?a) a.cancellationHours; case null 0 };
                let cutoffNs : Int = cancellationHours * 3_600_000_000_000;
                let isLateCancellation = Time.now() > rsv.bookingStartNs - cutoffNs;
                let endpoint = if (isLateCancellation) {
                  "https://api.stripe.com/v1/payment_intents/" # piId # "/capture"
                } else {
                  "https://api.stripe.com/v1/payment_intents/" # piId # "/cancel"
                };
                try {
                  ignore await (with cycles = 2_000_000_000) ic.http_request({
                    url               = endpoint;
                    max_response_bytes = ?Nat64.fromNat(4_096);
                    headers           = [
                      { name = "authorization"; value = "Bearer " # key },
                      { name = "content-type";  value = "application/x-www-form-urlencoded" },
                    ];
                    body      = null;
                    method    = #post;
                    transform = ?{ function = transform; context = Blob.fromArray([]) };
                  });
                } catch (_) {};
              };
              case _ {};
            };

            // Waitlist notification: email the first person waiting for this slot.
            if (announcementsCanisterId != "") {
              let slotEntries = Array.filter<WaitlistEntry>(
                Iter.toArray(Map.values(waitlist)),
                func(w) { w.amenityId == rsv.amenityId and w.date == rsv.date and w.startSlot == rsv.startSlot }
              );
              let sorted = Array.sort<WaitlistEntry>(slotEntries, func(a, b) { Nat.compare(a.position, b.position) });
              if (sorted.size() > 0) {
                let first = sorted[0];
                let amenityName = switch (Map.get(amenities, Text.compare, rsv.amenityId)) {
                  case (?a) a.name;
                  case null rsv.amenityId;
                };
                type AnnouncementsActor = actor {
                  sendBulkEmail : shared (
                    Text, Text,
                    { #All; #ByRole : Text; #UnitIds : [Text] }
                  ) -> async Result.Result<{ sent : Nat; failed : Nat }, { #NotAuthorized; #NotFound; #InvalidInput : Text }>;
                };
                let ann : AnnouncementsActor = actor(announcementsCanisterId);
                ignore Map.delete(waitlist, Text.compare, first.id);
                try {
                  ignore await ann.sendBulkEmail(
                    "A spot opened for " # amenityName # " on " # rsv.date,
                    "Great news — a slot opened for " # amenityName # " on " # rsv.date # ". Log in to Quorum to book it before it fills up.",
                    #UnitIds([first.unitId])
                  );
                } catch (_) {};
              };
            };

            #ok(updated)
          };
        }
      };
    }
  };

  public shared(msg) func completeReservation(reservationId : Text) : async Result.Result<Reservation, Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(reservations, Text.compare, reservationId)) {
      case null { #err(#NotFound) };
      case (?rsv) {
        switch (rsv.status) {
          case (#Active) {
            let updated : Reservation = { rsv with status = #Completed };
            Map.add(reservations, Text.compare, reservationId, updated);

            // Capture the Stripe deposit hold on successful completion.
            switch (updated.stripePaymentIntentId, stripeSecretKey) {
              case (?piId, ?key) {
                try {
                  ignore await (with cycles = 2_000_000_000) ic.http_request({
                    url               = "https://api.stripe.com/v1/payment_intents/" # piId # "/capture";
                    max_response_bytes = ?Nat64.fromNat(4_096);
                    headers           = [
                      { name = "authorization"; value = "Bearer " # key },
                      { name = "content-type";  value = "application/x-www-form-urlencoded" },
                    ];
                    body      = null;
                    method    = #post;
                    transform = ?{ function = transform; context = Blob.fromArray([]) };
                  });
                } catch (_) {};
              };
              case _ {};
            };

            #ok(updated)
          };
          case _ { #err(#InvalidInput("only active reservations can be completed")) };
        }
      };
    }
  };

  // ─── Date Blocking ────────────────────────────────────────────────────────

  public shared(msg) func blockDate(
    amenityId : Text,
    date      : Text,
    reason    : Text
  ) : async Result.Result<BlockedDate, Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    if (Text.size(date) == 0)    return #err(#InvalidInput("date required"));
    switch (Map.get(amenities, Text.compare, amenityId)) {
      case null { #err(#NotFound) };
      case (?_) {
        let blk : BlockedDate = {
          id        = nextBlockedDateId();
          amenityId; date; reason;
          blockedBy = msg.caller;
          createdAt = Time.now();
        };
        Map.add(blockedDates, Text.compare, blk.id, blk);
        #ok(blk)
      };
    }
  };

  public shared(msg) func unblockDate(blockedDateId : Text) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(blockedDates, Text.compare, blockedDateId)) {
      case null { #err(#NotFound) };
      case (?_) {
        ignore Map.delete(blockedDates, Text.compare, blockedDateId);
        #ok(())
      };
    }
  };

  // ─── Waitlist ─────────────────────────────────────────────────────────────

  public shared(msg) func joinWaitlist(
    amenityId : Text,
    date      : Text,
    startSlot : Nat,
    unitId    : Text
  ) : async Result.Result<WaitlistEntry, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    if (Text.size(date)   == 0)            return #err(#InvalidInput("date required"));
    if (Text.size(unitId) == 0)            return #err(#InvalidInput("unitId required"));
    switch (Map.get(amenities, Text.compare, amenityId)) {
      case null { #err(#NotFound) };
      case (?_) {
        // Prevent duplicate waitlist entries for the same caller/slot.
        let allWl = Iter.toArray(Map.values(waitlist));
        let duplicate = Array.find<WaitlistEntry>(allWl, func(w) {
          w.amenityId == amenityId and w.date == date and
          w.startSlot == startSlot and w.principal == msg.caller
        });
        if (duplicate != null) return #err(#AlreadyBooked);
        let position = waitlistCountForSlot(amenityId, date, startSlot) + 1;
        let entry : WaitlistEntry = {
          id        = nextWaitlistId();
          amenityId; date; startSlot;
          principal = msg.caller;
          unitId;
          position;
          createdAt = Time.now();
        };
        Map.add(waitlist, Text.compare, entry.id, entry);
        #ok(entry)
      };
    }
  };

  public shared(msg) func leaveWaitlist(waitlistId : Text) : async Result.Result<(), Error> {
    switch (Map.get(waitlist, Text.compare, waitlistId)) {
      case null { #err(#NotFound) };
      case (?entry) {
        if (entry.principal != msg.caller and not isAdmin(msg.caller)) return #err(#NotAuthorized);
        ignore Map.delete(waitlist, Text.compare, waitlistId);
        #ok(())
      };
    }
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  public query func getAmenities() : async [Amenity] {
    Iter.toArray(Map.values(amenities))
  };

  public query func getAmenity(amenityId : Text) : async ?Amenity {
    Map.get(amenities, Text.compare, amenityId)
  };

  public query func getReservationsForAmenity(amenityId : Text, date : Text) : async [Reservation] {
    Array.filter<Reservation>(
      Iter.toArray(Map.values(reservations)),
      func(r) { r.amenityId == amenityId and r.date == date }
    )
  };

  public query func getMyReservations(caller : Principal) : async [Reservation] {
    Array.filter<Reservation>(
      Iter.toArray(Map.values(reservations)),
      func(r) { r.bookedBy == caller }
    )
  };

  public query func getAvailability(amenityId : Text, date : Text) : async [SlotAvailability] {
    switch (Map.get(amenities, Text.compare, amenityId)) {
      case null { [] };
      case (?amenity) {
        let blocked = isDateBlocked(amenityId, date);
        // 6 AM to 10 PM in slotDurationMins increments
        // 6 AM to 10 PM = 960 minutes
        let totalSlots = 960 / amenity.slotDurationMins;
        Array.tabulate<SlotAvailability>(totalSlots, func(i) {
          let booked = bookedCountForSlot(amenityId, date, i);
          {
            slot      = i;
            booked;
            capacity  = amenity.capacity;
            available = not blocked and booked < amenity.capacity;
            blocked;
          }
        })
      };
    }
  };

  public query func getBlockedDates(amenityId : Text) : async [BlockedDate] {
    Array.filter<BlockedDate>(
      Iter.toArray(Map.values(blockedDates)),
      func(b) { b.amenityId == amenityId }
    )
  };

  public query func getWaitlistForSlot(amenityId : Text, date : Text, startSlot : Nat) : async [WaitlistEntry] {
    let entries = Array.filter<WaitlistEntry>(
      Iter.toArray(Map.values(waitlist)),
      func(w) { w.amenityId == amenityId and w.date == date and w.startSlot == startSlot }
    );
    // Sort by position ascending.
    Array.sort<WaitlistEntry>(entries, func(a, b) { Nat.compare(a.position, b.position) })
  };

  public query func getMyWaitlistEntries(caller : Principal) : async [WaitlistEntry] {
    Array.filter<WaitlistEntry>(
      Iter.toArray(Map.values(waitlist)),
      func(w) { w.principal == caller }
    )
  };

  public query func metrics() : async {
    amenityCount:     Nat;
    reservationCount: Nat;
    waitlistCount:    Nat;
  } {
    {
      amenityCount     = Map.size(amenities);
      reservationCount = Map.size(reservations);
      waitlistCount    = Map.size(waitlist);
    }
  };
}
