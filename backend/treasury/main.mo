/**
 * Quorum — Treasury Canister
 *
 * HOA dues, special assessments, Stripe Connect checkout, automated late fees,
 * and payment reminders. Issues #12, #27, #32.
 */

import Array     "mo:core/Array";
import Blob      "mo:core/Blob";
import Iter      "mo:core/Iter";
import Map       "mo:core/Map";
import Nat       "mo:core/Nat";
import Nat64     "mo:core/Nat64";
import Option    "mo:core/Option";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

persistent actor Treasury {

  // ─── Types ───────────────────────────────────────────────────────────────────

  public type AssessmentType = {
    #MonthlyDues;
    #SpecialAssessment;
    #Fine;
    #Amenity;
    #LateFee;
  };

  public type PaymentStatus = { #Outstanding; #Paid; #Waived; #Disputed };

  public type Assessment = {
    id:          Text;
    unitId:      Text;
    amountCents: Nat;
    kind:        AssessmentType;
    description: Text;
    dueDate:     Time.Time;
    status:      PaymentStatus;
    paidAt:      ?Time.Time;
    createdAt:   Time.Time;
    createdBy:   Principal;
  };

  public type StripeConfig = {
    secretKey:         Text;
    stripeAccountId:   Text;  // Connect Express account ID (acct_...)
    webhookSecret:     Text;
    successUrl:        Text;
    cancelUrl:         Text;
    platformFeeBps:    Nat;   // card: 50 = 0.5%
    achPlatformFeeBps: Nat;   // ACH: 10 = 0.1%
  };

  public type DuesPayment = {
    id:               Text;
    assessmentId:     Text;
    unitId:           Text;
    amountCents:      Nat;
    platformFeeCents: Nat;
    stripePaymentId:  Text;  // session ID — idempotency key
    paidAt:           Time.Time;
  };

  public type EscalationTier = {
    daysOverdue:     Nat;
    additionalCents: Nat;
  };

  public type LateFeePolicy = {
    gracePeriodDays: Nat;
    flatAmountCents: Nat;   // 0 = use percentBps
    percentBps:      Nat;   // basis points, 0 = use flat
    escalation:      [EscalationTier];
  };

  public type ReminderPolicy = {
    preDueDays:  [Nat];   // e.g. [7, 3, 1]
    postDueDays: [Nat];   // e.g. [1, 7, 14]
  };

  public type ReminderLog = {
    id:           Text;
    assessmentId: Text;
    unitId:       Text;
    reminderType: Text;   // "pre_7d", "post_1d", etc.
    sentAt:       Time.Time;
  };

  public type CheckoutSession = { id: Text; url: Text };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #InvalidInput: Text;
    #PaymentFailed: Text;
  };

  // ─── IC HTTP Outcall interface ────────────────────────────────────────────────

  public type HttpHeader   = { name : Text; value : Text };
  public type HttpMethod   = { #get; #head; #post };
  public type HttpResponse = { status : Nat; headers : [HttpHeader]; body : Blob };
  public type TransformArgs = { response : HttpResponse; context : Blob };

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

  // ─── Stable State ─────────────────────────────────────────────────────────────

  private var counter         : Nat = 0;
  private var payCounter      : Nat = 0;
  private var remCounter      : Nat = 0;
  private var membersCanisterId : Text = "";

  private let assessments    = Map.empty<Text, Assessment>();
  private let duesPayments   = Map.empty<Text, DuesPayment>();
  private let stripePayIds   = Map.empty<Text, Text>();   // sessionId → assessmentId (dedup)
  private let lateFeeKeyed   = Map.empty<Text, Bool>();   // assessmentId#tier → idempotency
  private let reminderKeyed  = Map.empty<Text, Bool>();   // assessmentId#type → idempotency
  private let reminderLog    = Map.empty<Text, ReminderLog>();

  private var stripeConfig   : ?StripeConfig   = null;
  private var lateFeePolicy  : ?LateFeePolicy  = null;
  private var reminderPolicy : ?ReminderPolicy = null;

  // Resets on upgrade — safe, idempotency keys prevent double-work
  transient var lastScanDayNs : Int = 0;

  // ─── Constants ───────────────────────────────────────────────────────────────

  private let DAY_NS : Nat = 86_400_000_000_000;

  // ─── ID helpers ──────────────────────────────────────────────────────────────

  private func nextId() : Text {
    counter += 1;
    "ASSESS_" # Nat.toText(counter)
  };

  private func nextPayId() : Text {
    payCounter += 1;
    "PAY_" # Nat.toText(payCounter)
  };

  private func nextRemId() : Text {
    remCounter += 1;
    "REM_" # Nat.toText(remCounter)
  };

  // ─── Stripe helpers ──────────────────────────────────────────────────────────

  private func jsonExtract(json: Text, key: Text) : ?Text {
    let needle = "\"" # key # "\":\"";
    let parts  = Text.split(json, #text needle);
    ignore parts.next();
    switch (parts.next()) {
      case null    { null };
      case (?rest) { Text.split(rest, #text "\"").next() };
    }
  };

  private func urlEncode(s: Text) : Text {
    var result = "";
    for (c in s.chars()) {
      result #= switch (c) {
        case ' '  { "+" };
        case ':'  { "%3A" };
        case '/'  { "%2F" };
        case '?'  { "%3F" };
        case '='  { "%3D" };
        case '&'  { "%26" };
        case '{'  { "%7B" };
        case '}'  { "%7D" };
        case '@'  { "%40" };
        case '+'  { "%2B" };
        case '#'  { "%23" };
        case _    { Text.fromChar(c) };
      };
    };
    result
  };

  // ─── Wiring ───────────────────────────────────────────────────────────────────

  public shared func setMembersCanisterId(id : Text) : async () {
    membersCanisterId := id;
  };

  public shared func configureStripe(config: StripeConfig) : async () {
    stripeConfig := ?config;
  };

  public shared func setLateFeePolicy(policy: LateFeePolicy) : async () {
    lateFeePolicy := ?policy;
  };

  public shared func setReminderPolicy(policy: ReminderPolicy) : async () {
    reminderPolicy := ?policy;
  };

  // ─── Board Actions ────────────────────────────────────────────────────────────

  public shared(msg) func postAssessment(
    unitId:      Text,
    amountCents: Nat,
    kind:        AssessmentType,
    description: Text,
    dueDate:     Time.Time
  ) : async Result.Result<Assessment, Error> {
    if (amountCents == 0) return #err(#InvalidInput("amountCents must be > 0"));
    let a : Assessment = {
      id          = nextId();
      unitId;
      amountCents;
      kind;
      description;
      dueDate;
      status      = #Outstanding;
      paidAt      = null;
      createdAt   = Time.now();
      createdBy   = msg.caller;
    };
    Map.add(assessments, Text.compare, a.id, a);
    #ok(a)
  };

  public shared(msg) func markPaid(id : Text) : async Result.Result<Assessment, Error> {
    switch (Map.get(assessments, Text.compare, id)) {
      case null  { #err(#NotFound) };
      case (?a)  {
        let updated = { a with status = #Paid; paidAt = ?Time.now() };
        Map.add(assessments, Text.compare, id, updated);
        #ok(updated)
      };
    }
  };

  public shared(msg) func waiveAssessment(id : Text) : async Result.Result<Assessment, Error> {
    switch (Map.get(assessments, Text.compare, id)) {
      case null  { #err(#NotFound) };
      case (?a)  {
        let updated = { a with status = #Waived };
        Map.add(assessments, Text.compare, id, updated);
        #ok(updated)
      };
    }
  };

  public shared(msg) func waiveLateFee(assessmentId : Text, reason : Text) : async Result.Result<Assessment, Error> {
    switch (Map.get(assessments, Text.compare, assessmentId)) {
      case null  { #err(#NotFound) };
      case (?a)  {
        switch (a.kind) {
          case (#LateFee) {
            let updated = { a with status = #Waived; description = a.description # " [waived: " # reason # "]" };
            Map.add(assessments, Text.compare, assessmentId, updated);
            #ok(updated)
          };
          case _ { #err(#InvalidInput("Not a late fee assessment")) };
        };
      };
    }
  };

  // ─── Stripe Checkout (#12) ───────────────────────────────────────────────────

  public shared(msg) func createDuesCheckoutSession(
    assessmentId : Text
  ) : async Result.Result<CheckoutSession, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    let cfg = switch (stripeConfig) {
      case null  { return #err(#PaymentFailed("Stripe not configured")) };
      case (?c)  { c };
    };
    let assessment = switch (Map.get(assessments, Text.compare, assessmentId)) {
      case null  { return #err(#NotFound) };
      case (?a)  { a };
    };
    if (assessment.status != #Outstanding) return #err(#InvalidInput("Assessment is not outstanding"));

    let feeCents    = assessment.amountCents * cfg.platformFeeBps / 10_000;
    let successUrl  = cfg.successUrl # (if (Text.contains(cfg.successUrl, #char '?')) "&" else "?") # "session_id={CHECKOUT_SESSION_ID}";

    let body =
      "mode=payment" #
      "&payment_method_types[]=card" #
      "&payment_method_types[]=us_bank_account" #
      "&line_items[0][price_data][currency]=usd" #
      "&line_items[0][price_data][product_data][name]=" # urlEncode(assessment.description) #
      "&line_items[0][price_data][unit_amount]=" # Nat.toText(assessment.amountCents) #
      "&line_items[0][quantity]=1" #
      "&payment_intent_data[application_fee_amount]=" # Nat.toText(feeCents) #
      "&success_url=" # urlEncode(successUrl) #
      "&cancel_url="  # urlEncode(cfg.cancelUrl) #
      "&metadata[assessment_id]=" # urlEncode(assessmentId) #
      "&metadata[unit_id]="       # urlEncode(assessment.unitId);

    try {
      let response = await (with cycles = 3_000_000_000) ic.http_request({
        url               = "https://api.stripe.com/v1/checkout/sessions";
        max_response_bytes = ?Nat64.fromNat(16_384);
        headers           = [
          { name = "content-type";   value = "application/x-www-form-urlencoded" },
          { name = "authorization";  value = "Bearer " # cfg.secretKey },
          { name = "stripe-account"; value = cfg.stripeAccountId },
        ];
        body              = ?Text.encodeUtf8(body);
        method            = #post;
        transform         = ?{ function = transform; context = Blob.fromArray([]) };
      });
      switch (Text.decodeUtf8(response.body)) {
        case null    { #err(#PaymentFailed("Failed to decode Stripe response")) };
        case (?json) {
          let id  = switch (jsonExtract(json, "id"))  { case (?v) v; case null return #err(#PaymentFailed("No session id in Stripe response")) };
          let url = switch (jsonExtract(json, "url")) { case (?v) v; case null return #err(#PaymentFailed("No url in Stripe response")) };
          #ok({ id; url })
        };
      }
    } catch (_e) {
      #err(#PaymentFailed("Stripe checkout request failed"))
    }
  };

  public shared(msg) func verifyDuesSession(
    sessionId    : Text,
    assessmentId : Text
  ) : async Result.Result<Assessment, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    let cfg = switch (stripeConfig) {
      case null  { return #err(#PaymentFailed("Stripe not configured")) };
      case (?c)  { c };
    };

    // Idempotency: already recorded
    switch (Map.get(stripePayIds, Text.compare, sessionId)) {
      case (?_) {
        return switch (Map.get(assessments, Text.compare, assessmentId)) {
          case null  { #err(#NotFound) };
          case (?a)  { #ok(a) };
        };
      };
      case null {};
    };

    try {
      let response = await (with cycles = 2_000_000_000) ic.http_request({
        url               = "https://api.stripe.com/v1/checkout/sessions/" # sessionId;
        max_response_bytes = ?Nat64.fromNat(16_384);
        headers           = [
          { name = "authorization";  value = "Bearer " # cfg.secretKey },
          { name = "stripe-account"; value = cfg.stripeAccountId },
        ];
        body              = null;
        method            = #get;
        transform         = ?{ function = transform; context = Blob.fromArray([]) };
      });

      switch (Text.decodeUtf8(response.body)) {
        case null    { return #err(#PaymentFailed("Failed to decode Stripe response")) };
        case (?json) {
          let payStatus = switch (jsonExtract(json, "payment_status")) {
            case (?s) s;
            case null return #err(#PaymentFailed("Missing payment_status in session"));
          };
          if (payStatus != "paid") return #err(#PaymentFailed("Payment not complete: " # payStatus));

          let metaId = Option.get(jsonExtract(json, "assessment_id"), "");
          if (metaId != assessmentId) return #err(#InvalidInput("Session/assessment mismatch"));

          let assessment = switch (Map.get(assessments, Text.compare, assessmentId)) {
            case null  { return #err(#NotFound) };
            case (?a)  { a };
          };

          let now      = Time.now();
          let feeCents = assessment.amountCents * cfg.platformFeeBps / 10_000;

          let payment : DuesPayment = {
            id               = nextPayId();
            assessmentId;
            unitId           = assessment.unitId;
            amountCents      = assessment.amountCents;
            platformFeeCents = feeCents;
            stripePaymentId  = sessionId;
            paidAt           = now;
          };
          Map.add(duesPayments, Text.compare, payment.id, payment);
          Map.add(stripePayIds, Text.compare, sessionId, assessmentId);

          let updated = { assessment with status = #Paid; paidAt = ?now };
          Map.add(assessments, Text.compare, assessmentId, updated);
          #ok(updated)
        };
      }
    } catch (_e) {
      #err(#PaymentFailed("Stripe verification request failed"))
    }
  };

  // ─── Queries ─────────────────────────────────────────────────────────────────

  public query func getAssessment(id : Text) : async ?Assessment {
    Map.get(assessments, Text.compare, id)
  };

  public query func getAssessmentsForUnit(unitId : Text) : async [Assessment] {
    Array.filter<Assessment>(Iter.toArray(Map.values(assessments)), func(a) { a.unitId == unitId })
  };

  public query func getOutstandingAssessments() : async [Assessment] {
    Array.filter<Assessment>(Iter.toArray(Map.values(assessments)), func(a) { a.status == #Outstanding })
  };

  public query func getTotalOutstandingCents() : async Nat {
    let outstanding = Array.filter<Assessment>(Iter.toArray(Map.values(assessments)), func(a) { a.status == #Outstanding });
    Array.foldLeft<Assessment, Nat>(outstanding, 0, func(acc, a) { acc + a.amountCents })
  };

  public query func getPaymentHistory(unitId : Text) : async [DuesPayment] {
    Array.filter<DuesPayment>(Iter.toArray(Map.values(duesPayments)), func(p) { p.unitId == unitId })
  };

  public query func getReminderLog(unitId : Text) : async [ReminderLog] {
    Array.filter<ReminderLog>(Iter.toArray(Map.values(reminderLog)), func(r) { r.unitId == unitId })
  };

  public query func getLateFeePolicy()  : async ?LateFeePolicy  { lateFeePolicy  };
  public query func getReminderPolicy() : async ?ReminderPolicy { reminderPolicy };

  public query func metrics() : async {
    totalAssessments: Nat;
    outstandingCount: Nat;
    outstandingCents: Nat;
    totalPaidCents:   Nat;
    platformFeeCents: Nat;
    lateFeeCount:     Nat;
    remindersSent:    Nat;
  } {
    var outstandingCount = 0;
    var outstandingCents = 0;
    var lateFeeCount     = 0;
    for (a in Map.values(assessments)) {
      if (a.status == #Outstanding) {
        outstandingCount += 1;
        outstandingCents += a.amountCents;
      };
      switch (a.kind) { case (#LateFee) { lateFeeCount += 1 }; case _ {} };
    };
    var totalPaid   = 0;
    var platformFee = 0;
    for (p in Map.values(duesPayments)) {
      totalPaid   += p.amountCents;
      platformFee += p.platformFeeCents;
    };
    {
      totalAssessments = Map.size(assessments);
      outstandingCount;
      outstandingCents;
      totalPaidCents   = totalPaid;
      platformFeeCents = platformFee;
      lateFeeCount;
      remindersSent    = Map.size(reminderLog);
    }
  };

  // ─── Heartbeat: Late Fees (#27) + Reminders (#32) ────────────────────────────
  // Fires every ~2 seconds; skips until 24 h have elapsed since last scan.
  // lateFeeKeyed / reminderKeyed provide idempotency across restarts.

  system func heartbeat() : async () {
    let now = Time.now();
    if (now - lastScanDayNs < DAY_NS) return;
    lastScanDayNs := now;

    let outstanding = Array.filter<Assessment>(
      Iter.toArray(Map.values(assessments)),
      func(a) { a.status == #Outstanding }
    );

    // ── Late fees (#27) ───────────────────────────────────────────────────────
    switch (lateFeePolicy) {
      case null {};
      case (?policy) {
        let graceNs    : Nat = policy.gracePeriodDays * DAY_NS;
        let graceCutoff : Int = now - graceNs;

        for (a in outstanding.vals()) {
          if (a.dueDate < graceCutoff) {

            // Base fee
            let baseFee : Nat = if (policy.flatAmountCents > 0) {
              policy.flatAmountCents
            } else {
              a.amountCents * policy.percentBps / 10_000
            };
            let baseKey = a.id # "_base";
            if (Option.isNull(Map.get(lateFeeKeyed, Text.compare, baseKey)) and baseFee > 0) {
              let fee : Assessment = {
                id          = nextId();
                unitId      = a.unitId;
                amountCents = baseFee;
                kind        = #LateFee;
                description = "Late fee for " # a.id;
                dueDate     = now;
                status      = #Outstanding;
                paidAt      = null;
                createdAt   = now;
                createdBy   = Principal.fromActor(Treasury);
              };
              Map.add(assessments,  Text.compare, fee.id, fee);
              Map.add(lateFeeKeyed, Text.compare, baseKey, true);
            };

            // Escalation tiers
            for (tier in policy.escalation.vals()) {
              let tierNs  : Nat  = tier.daysOverdue * DAY_NS;
              let tierCut : Int  = now - tierNs;
              let tierKey        = a.id # "_esc_" # Nat.toText(tier.daysOverdue);
              if (a.dueDate < tierCut and
                  Option.isNull(Map.get(lateFeeKeyed, Text.compare, tierKey)) and
                  tier.additionalCents > 0) {
                let esc : Assessment = {
                  id          = nextId();
                  unitId      = a.unitId;
                  amountCents = tier.additionalCents;
                  kind        = #LateFee;
                  description = "Escalated late fee (" # Nat.toText(tier.daysOverdue) # "d) for " # a.id;
                  dueDate     = now;
                  status      = #Outstanding;
                  paidAt      = null;
                  createdAt   = now;
                  createdBy   = Principal.fromActor(Treasury);
                };
                Map.add(assessments,  Text.compare, esc.id, esc);
                Map.add(lateFeeKeyed, Text.compare, tierKey, true);
              };
            };
          };
        };
      };
    };

    // ── Reminders (#32) ───────────────────────────────────────────────────────
    switch (reminderPolicy) {
      case null {};
      case (?policy) {
        for (a in outstanding.vals()) {

          // Pre-due reminders
          for (days in policy.preDueDays.vals()) {
            let offsetNs  : Nat  = days * DAY_NS;
            let targetNs  : Int  = a.dueDate - offsetNs;
            let remKey           = a.id # "_pre_" # Nat.toText(days);
            if (targetNs <= now and now < targetNs + DAY_NS and
                Option.isNull(Map.get(reminderKeyed, Text.compare, remKey))) {
              let r : ReminderLog = {
                id           = nextRemId();
                assessmentId = a.id;
                unitId       = a.unitId;
                reminderType = "pre_" # Nat.toText(days) # "d";
                sentAt       = now;
              };
              Map.add(reminderLog,   Text.compare, r.id,   r);
              Map.add(reminderKeyed, Text.compare, remKey, true);
            };
          };

          // Post-due reminders
          for (days in policy.postDueDays.vals()) {
            let offsetNs : Nat = days * DAY_NS;
            let targetNs : Int = a.dueDate + offsetNs;
            let remKey         = a.id # "_post_" # Nat.toText(days);
            if (now >= targetNs and
                Option.isNull(Map.get(reminderKeyed, Text.compare, remKey))) {
              let r : ReminderLog = {
                id           = nextRemId();
                assessmentId = a.id;
                unitId       = a.unitId;
                reminderType = "post_" # Nat.toText(days) # "d";
                sentAt       = now;
              };
              Map.add(reminderLog,   Text.compare, r.id,   r);
              Map.add(reminderKeyed, Text.compare, remKey, true);
            };
          };
        };
      };
    };
  };
};
