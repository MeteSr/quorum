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

  public type EmailConfig = {
    resendApiKey: Text;
    fromEmail:    Text;
    fromName:     Text;
  };

  public type CheckoutSession = { id: Text; url: Text };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #InvalidInput: Text;
    #PaymentFailed: Text;
  };

  public type AgingBucket = { unitId : Text; amountCents : Nat };

  public type AgingReport = {
    current:               [AgingBucket];
    days31_60:             [AgingBucket];
    days61_90:             [AgingBucket];
    days90plus:            [AgingBucket];
    totalOutstandingCents: Nat;
  };

  public type BudgetLine = {
    year:          Nat;
    category:      Text;
    budgetedCents: Nat;
  };

  public type BudgetVsActual = {
    category:      Text;
    budgetedCents: Nat;
    actualCents:   Nat;
    varianceCents: Int;
  };

  public type ReserveFundReport = {
    currentBalanceCents:     Nat;
    annualIncomeCents:       Nat;
    recommendedBalanceCents: Nat;
    fundingGapCents:         Int;
  };

  public type IncomeStatement = {
    startDate:               Time.Time;
    endDate:                 Time.Time;
    totalIncomeCents:        Nat;
    netOperatingIncomeCents: Int;
  };

  public type AnnualStatement = {
    unitId:           Text;
    year:             Nat;
    payments:         [DuesPayment];
    totalBilledCents: Nat;
    totalPaidCents:   Nat;
    outstandingCents: Nat;
    generatedAt:      Time.Time;
  };

  public type CollectionStage = {
    #GracePeriod;
    #FirstNotice;
    #SecondNotice;
    #PreLien;
    #Lien;
    #Resolved;
  };

  // Stored shape (minimal — computed fields derived at query time)
  type CollectionCase = {
    unitId:        Text;
    stage:         CollectionStage;
    openedAt:      Time.Time;
    lastUpdatedAt: Time.Time;
  };

  public type DelinquencyRecord = {
    unitId:            Text;
    stage:             CollectionStage;
    totalOverdueCents: Nat;
    oldestDueDateNs:   Time.Time;
    openedAt:          Time.Time;
    lastUpdatedAt:     Time.Time;
  };

  public type CollectionEvent = {
    id:        Text;
    unitId:    Text;
    fromStage: CollectionStage;
    toStage:   CollectionStage;
    note:      Text;
    createdAt: Time.Time;
    createdBy: Principal;
  };

  // ─── QuickBooks Types (#19) ───────────────────────────────────────────────────

  public type QBOConfig = {
    realmId:      Text;   // QuickBooks company ID
    accessToken:  Text;
    refreshToken: Text;
    tokenExpiry:  Time.Time;
  };

  public type QBOSyncStatus = { #Pending; #Synced; #Failed };

  public type QBOSyncEntry = {
    id:           Text;
    paymentId:    Text;
    assessmentId: Text;
    unitId:       Text;
    amountCents:  Nat;
    status:       QBOSyncStatus;
    qboPaymentId: ?Text;
    syncedAt:     ?Time.Time;
    errorMsg:     ?Text;
    createdAt:    Time.Time;
  };

  public type QBOStatus = {
    configured:  Bool;
    realmId:     Text;
    tokenExpiry: Time.Time;
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
  private var emailConfig    : ?EmailConfig    = null;

  private let budgetLines        = Map.empty<Text, BudgetLine>();  // key: year#category
  private var reserveFundBalance : Nat = 0;

  private let collectionCases  = Map.empty<Text, CollectionCase>();   // keyed by unitId
  private let collectionEvents = Map.empty<Text, CollectionEvent>();  // keyed by event id
  private var collEvtCounter   : Nat = 0;

  private var qboConfig      : ?QBOConfig = null;
  private let qboSyncLog     = Map.empty<Text, QBOSyncEntry>();
  private var qboSyncCounter : Nat = 0;

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

  private func nextEvtId() : Text {
    collEvtCounter += 1;
    "EVT_" # Nat.toText(collEvtCounter)
  };

  private func nextQboId() : Text {
    qboSyncCounter += 1;
    "QBO_" # Nat.toText(qboSyncCounter)
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

  // ─── QBO helpers (#19) ───────────────────────────────────────────────────────

  // Formats cents as a decimal dollar string (e.g. 9999 → "99.99").
  private func centsToDecimal(cents : Nat) : Text {
    let c = cents % 100;
    Nat.toText(cents / 100) # "." # (if (c < 10) "0" # Nat.toText(c) else Nat.toText(c))
  };

  // POST one payment to QBO and update the sync entry in-place.
  private func sendToQbo(entryId : Text, payment : DuesPayment, cfg : QBOConfig) : async () {
    let body =
      "{\"TotalAmt\":" # centsToDecimal(payment.amountCents) #
      ",\"CustomerRef\":{\"value\":\"" # payment.unitId # "\"}}";
    try {
      let response = await (with cycles = 3_000_000_000) ic.http_request({
        url               = "https://quickbooks.api.intuit.com/v3/company/" # cfg.realmId # "/payment";
        max_response_bytes = ?Nat64.fromNat(8_192);
        headers           = [
          { name = "authorization"; value = "Bearer " # cfg.accessToken },
          { name = "content-type";  value = "application/json" },
          { name = "accept";        value = "application/json" },
        ];
        body              = ?Text.encodeUtf8(body);
        method            = #post;
        transform         = ?{ function = transform; context = Blob.fromArray([]) };
      });
      let now = Time.now();
      switch (Map.get(qboSyncLog, Text.compare, entryId)) {
        case null {};
        case (?e) {
          switch (Text.decodeUtf8(response.body)) {
            case null {
              Map.add(qboSyncLog, Text.compare, entryId, {
                e with status = #Failed; errorMsg = ?"Failed to decode QBO response"; syncedAt = ?now
              });
            };
            case (?json) {
              if (response.status >= 200 and response.status < 300) {
                let qboId = switch (jsonExtract(json, "Id")) { case (?v) ?v; case null null };
                Map.add(qboSyncLog, Text.compare, entryId, {
                  e with status = #Synced; qboPaymentId = qboId; syncedAt = ?now; errorMsg = null
                });
              } else {
                Map.add(qboSyncLog, Text.compare, entryId, {
                  e with status = #Failed;
                  errorMsg = ?("QBO error " # Nat.toText(response.status));
                  syncedAt = ?now
                });
              };
            };
          };
        };
      };
    } catch (_e) {
      switch (Map.get(qboSyncLog, Text.compare, entryId)) {
        case null {};
        case (?e) {
          Map.add(qboSyncLog, Text.compare, entryId, {
            e with status = #Failed; errorMsg = ?"QBO HTTP request failed"; syncedAt = ?Time.now()
          });
        };
      };
    };
  };

  // Create a #Pending sync entry and fire the QBO call.
  private func doQboSync(payment : DuesPayment) : async () {
    let cfg = switch (qboConfig) { case null return; case (?c) c };
    let entryId = nextQboId();
    let entry : QBOSyncEntry = {
      id           = entryId;
      paymentId    = payment.id;
      assessmentId = payment.assessmentId;
      unitId       = payment.unitId;
      amountCents  = payment.amountCents;
      status       = #Pending;
      qboPaymentId = null;
      syncedAt     = null;
      errorMsg     = null;
      createdAt    = Time.now();
    };
    Map.add(qboSyncLog, Text.compare, entryId, entry);
    await sendToQbo(entryId, payment, cfg);
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

  public shared func setEmailConfig(config: EmailConfig) : async () {
    emailConfig := ?config;
  };

  public shared func setReserveFundBalance(balance : Nat) : async () {
    reserveFundBalance := balance;
  };

  public shared func setQBOConfig(config : QBOConfig) : async () {
    qboConfig := ?config;
  };

  public query func getQBOStatus() : async QBOStatus {
    switch (qboConfig) {
      case null  { { configured = false; realmId = ""; tokenExpiry = 0 } };
      case (?c)  { { configured = true;  realmId = c.realmId; tokenExpiry = c.tokenExpiry } };
    }
  };

  public shared func setBudgetLine(year : Nat, category : Text, budgetedCents : Nat) : async () {
    let key = Nat.toText(year) # "#" # category;
    Map.add(budgetLines, Text.compare, key, { year; category; budgetedCents });
  };

  // ─── Year helper ──────────────────────────────────────────────────────────────

  private func yearStartNs(year : Nat) : Int {
    switch (year) {
      case 2020 { 1_577_836_800_000_000_000 };
      case 2021 { 1_609_459_200_000_000_000 };
      case 2022 { 1_640_995_200_000_000_000 };
      case 2023 { 1_672_531_200_000_000_000 };
      case 2024 { 1_704_067_200_000_000_000 };
      case 2025 { 1_735_689_600_000_000_000 };
      case 2026 { 1_767_225_600_000_000_000 };
      case 2027 { 1_798_761_600_000_000_000 };
      case 2028 { 1_830_384_000_000_000_000 };
      case 2029 { 1_861_920_000_000_000_000 };
      case 2030 { 1_893_456_000_000_000_000 };
      case _    { (year - 1970) * 365 * 86_400_000_000_000 };
    }
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
          try { await doQboSync(payment) } catch (_e) {};
          #ok(updated)
        };
      }
    } catch (_e) {
      #err(#PaymentFailed("Stripe verification request failed"))
    }
  };

  // ─── Reporting queries (#15 + #41) ───────────────────────────────────────────

  public query func getAgingReport() : async AgingReport {
    let now   = Time.now();
    let day30 : Int = 30 * DAY_NS;
    let day60 : Int = 60 * DAY_NS;
    let day90 : Int = 90 * DAY_NS;
    let os = Array.filter(
      Array.fromIter(Map.values(assessments)),
      func(a : Assessment) : Bool { a.status == #Outstanding }
    );
    var total : Nat = 0;
    for (a in os.vals()) { total += a.amountCents };
    let toBucket = func(a : Assessment) : AgingBucket = { unitId = a.unitId; amountCents = a.amountCents };
    {
      current    = Array.map(Array.filter(os, func(a : Assessment) : Bool {
                     now - a.dueDate < day30 }), toBucket);
      days31_60  = Array.map(Array.filter(os, func(a : Assessment) : Bool {
                     let od = now - a.dueDate; od >= day30 and od < day60 }), toBucket);
      days61_90  = Array.map(Array.filter(os, func(a : Assessment) : Bool {
                     let od = now - a.dueDate; od >= day60 and od < day90 }), toBucket);
      days90plus = Array.map(Array.filter(os, func(a : Assessment) : Bool {
                     now - a.dueDate >= day90 }), toBucket);
      totalOutstandingCents = total;
    }
  };

  public query func getReserveFundReport() : async ReserveFundReport {
    let now     = Time.now();
    let yearAgo : Int = now - 365 * DAY_NS;
    var annualIncome : Nat = 0;
    for (p in Map.values(duesPayments)) {
      if (p.paidAt >= yearAgo) { annualIncome += p.amountCents };
    };
    let recommended : Nat = annualIncome * 30 / 100;
    {
      currentBalanceCents     = reserveFundBalance;
      annualIncomeCents       = annualIncome;
      recommendedBalanceCents = recommended;
      fundingGapCents         = (reserveFundBalance : Int) - (recommended : Int);
    }
  };

  public query func getBudgetVsActual(year : Nat) : async [BudgetVsActual] {
    let startNs = yearStartNs(year);
    let endNs   = yearStartNs(year + 1);
    var monthlyActual  : Nat = 0;
    var specialActual  : Nat = 0;
    var fineActual     : Nat = 0;
    var amenityActual  : Nat = 0;
    var lateFeeActual  : Nat = 0;
    for (p in Map.values(duesPayments)) {
      if (p.paidAt >= startNs and p.paidAt < endNs) {
        switch (Map.get(assessments, Text.compare, p.assessmentId)) {
          case null {};
          case (?a) {
            switch (a.kind) {
              case (#MonthlyDues)       { monthlyActual  += p.amountCents };
              case (#SpecialAssessment) { specialActual  += p.amountCents };
              case (#Fine)              { fineActual     += p.amountCents };
              case (#Amenity)           { amenityActual  += p.amountCents };
              case (#LateFee)           { lateFeeActual  += p.amountCents };
            };
          };
        };
      };
    };
    let budgeted = func(cat : Text) : Nat {
      switch (Map.get(budgetLines, Text.compare, Nat.toText(year) # "#" # cat)) {
        case null  { 0 };
        case (?bl) { bl.budgetedCents };
      }
    };
    let cats : [(Text, Nat)] = [
      ("MonthlyDues",       monthlyActual),
      ("SpecialAssessment", specialActual),
      ("Fine",              fineActual),
      ("Amenity",           amenityActual),
      ("LateFee",           lateFeeActual),
    ];
    Array.tabulate<BudgetVsActual>(cats.size(), func(i) {
      let (cat, actual) = cats[i];
      let b = budgeted(cat);
      { category = cat; budgetedCents = b; actualCents = actual; varianceCents = (actual : Int) - (b : Int) }
    })
  };

  public query func getIncomeStatement(startDate : Int, endDate : Int) : async IncomeStatement {
    var totalIncome : Nat = 0;
    for (p in Map.values(duesPayments)) {
      if (p.paidAt >= startDate and p.paidAt < endDate) { totalIncome += p.amountCents };
    };
    { startDate; endDate; totalIncomeCents = totalIncome; netOperatingIncomeCents = totalIncome }
  };

  public query func getAnnualStatement(unitId : Text, year : Nat) : async AnnualStatement {
    let startNs = yearStartNs(year);
    let endNs   = yearStartNs(year + 1);
    let unitPays = Array.filter<DuesPayment>(
      Iter.toArray(Map.values(duesPayments)),
      func(p) { p.unitId == unitId and p.paidAt >= startNs and p.paidAt < endNs }
    );
    let unitAsmt = Array.filter<Assessment>(
      Iter.toArray(Map.values(assessments)),
      func(a) { a.unitId == unitId and a.createdAt >= startNs and a.createdAt < endNs }
    );
    let totalPaid    = Array.foldLeft<DuesPayment,  Nat>(unitPays, 0, func(acc, p) { acc + p.amountCents });
    let totalBilled  = Array.foldLeft<Assessment,   Nat>(unitAsmt, 0, func(acc, a) { acc + a.amountCents });
    let outstandingC = Array.foldLeft<Assessment,   Nat>(
      Array.filter<Assessment>(unitAsmt, func(a) { a.status == #Outstanding }),
      0, func(acc, a) { acc + a.amountCents }
    );
    { unitId; year; payments = unitPays; totalBilledCents = totalBilled; totalPaidCents = totalPaid; outstandingCents = outstandingC; generatedAt = Time.now() }
  };

  // ─── Collections (#28) ───────────────────────────────────────────────────────

  private func computeDelinquency(c : CollectionCase) : DelinquencyRecord {
    var totalOverdue : Nat = 0;
    var oldest : Time.Time = 0;
    var found = false;
    for (a in Map.values(assessments)) {
      if (a.unitId == c.unitId and a.status == #Outstanding) {
        totalOverdue += a.amountCents;
        if (not found or a.dueDate < oldest) {
          oldest := a.dueDate;
          found := true;
        };
      };
    };
    {
      unitId            = c.unitId;
      stage             = c.stage;
      totalOverdueCents = totalOverdue;
      oldestDueDateNs   = if (found) oldest else Time.now();
      openedAt          = c.openedAt;
      lastUpdatedAt     = c.lastUpdatedAt;
    }
  };

  public shared(msg) func openCollectionCase(unitId : Text, note : Text) : async Result.Result<DelinquencyRecord, Error> {
    let now = Time.now();
    switch (Map.get(collectionCases, Text.compare, unitId)) {
      case (?c) {
        if (c.stage != #Resolved) return #err(#InvalidInput("Collection case already open"));
      };
      case null {};
    };
    let c : CollectionCase = {
      unitId;
      stage         = #GracePeriod;
      openedAt      = now;
      lastUpdatedAt = now;
    };
    let evt : CollectionEvent = {
      id        = nextEvtId();
      unitId;
      fromStage = #GracePeriod;
      toStage   = #GracePeriod;
      note;
      createdAt = now;
      createdBy = msg.caller;
    };
    Map.add(collectionCases,  Text.compare, unitId, c);
    Map.add(collectionEvents, Text.compare, evt.id, evt);
    #ok(computeDelinquency(c))
  };

  public shared(msg) func escalateCollection(unitId : Text, newStage : CollectionStage, note : Text) : async Result.Result<DelinquencyRecord, Error> {
    switch (Map.get(collectionCases, Text.compare, unitId)) {
      case null  { #err(#NotFound) };
      case (?c)  {
        if (c.stage == #Resolved) return #err(#InvalidInput("Collection case is already resolved"));
        let now = Time.now();
        let evt : CollectionEvent = {
          id        = nextEvtId();
          unitId;
          fromStage = c.stage;
          toStage   = newStage;
          note;
          createdAt = now;
          createdBy = msg.caller;
        };
        let updated : CollectionCase = { c with stage = newStage; lastUpdatedAt = now };
        Map.add(collectionCases,  Text.compare, unitId, updated);
        Map.add(collectionEvents, Text.compare, evt.id, evt);
        #ok(computeDelinquency(updated))
      };
    }
  };

  public shared(msg) func resolveCollection(unitId : Text, note : Text) : async Result.Result<(), Error> {
    switch (Map.get(collectionCases, Text.compare, unitId)) {
      case null  { #err(#NotFound) };
      case (?c)  {
        let now = Time.now();
        let evt : CollectionEvent = {
          id        = nextEvtId();
          unitId;
          fromStage = c.stage;
          toStage   = #Resolved;
          note;
          createdAt = now;
          createdBy = msg.caller;
        };
        let resolved : CollectionCase = { c with stage = #Resolved; lastUpdatedAt = now };
        Map.add(collectionCases,  Text.compare, unitId, resolved);
        Map.add(collectionEvents, Text.compare, evt.id, evt);
        #ok(())
      };
    }
  };

  // Board: retry a failed QBO sync entry.
  public shared func retrySync(entryId : Text) : async Result.Result<QBOSyncEntry, Error> {
    let cfg = switch (qboConfig) {
      case null  { return #err(#InvalidInput("QBO not configured")) };
      case (?c)  { c };
    };
    switch (Map.get(qboSyncLog, Text.compare, entryId)) {
      case null  { #err(#NotFound) };
      case (?e)  {
        switch (e.status) {
          case (#Synced) { return #err(#InvalidInput("Already synced")) };
          case _ {};
        };
        switch (Map.get(duesPayments, Text.compare, e.paymentId)) {
          case null  { #err(#InvalidInput("Original payment not found")) };
          case (?payment) {
            Map.add(qboSyncLog, Text.compare, entryId, {
              e with status = #Pending; errorMsg = null; syncedAt = null
            });
            try { await sendToQbo(entryId, payment, cfg) } catch (_e) {};
            switch (Map.get(qboSyncLog, Text.compare, entryId)) {
              case null  { #err(#NotFound) };
              case (?updated) { #ok(updated) };
            }
          };
        };
      };
    }
  };

  public query func getDelinquentUnits() : async [DelinquencyRecord] {
    let active = Array.filter<CollectionCase>(
      Array.fromIter(Map.values(collectionCases)),
      func(c : CollectionCase) : Bool { c.stage != #Resolved }
    );
    Array.map<CollectionCase, DelinquencyRecord>(active, func(c : CollectionCase) : DelinquencyRecord { computeDelinquency(c) })
  };

  public query func getCollectionRecord(unitId : Text) : async ?DelinquencyRecord {
    switch (Map.get(collectionCases, Text.compare, unitId)) {
      case null  { null };
      case (?c)  { ?computeDelinquency(c) };
    }
  };

  public query func getCollectionHistory(unitId : Text) : async [CollectionEvent] {
    Array.filter<CollectionEvent>(
      Array.fromIter(Map.values(collectionEvents)),
      func(e : CollectionEvent) : Bool { e.unitId == unitId }
    )
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

  public query func getQBOSyncLog() : async [QBOSyncEntry] {
    Iter.toArray(Map.values(qboSyncLog))
  };

  public query func metrics() : async {
    totalAssessments: Nat;
    outstandingCount: Nat;
    outstandingCents: Nat;
    totalPaidCents:   Nat;
    platformFeeCents: Nat;
    lateFeeCount:     Nat;
    remindersSent:    Nat;
    delinquentCount:  Nat;
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
    var totalPaid        = 0;
    var platformFee      = 0;
    for (p in Map.values(duesPayments)) {
      totalPaid   += p.amountCents;
      platformFee += p.platformFeeCents;
    };
    var delinquentCount  = 0;
    for (c in Map.values(collectionCases)) {
      if (c.stage != #Resolved) { delinquentCount += 1 };
    };
    {
      totalAssessments = Map.size(assessments);
      outstandingCount;
      outstandingCents;
      totalPaidCents   = totalPaid;
      platformFeeCents = platformFee;
      lateFeeCount;
      remindersSent    = Map.size(reminderLog);
      delinquentCount;
    }
  };

  // ─── Email delivery helper (#32) ─────────────────────────────────────────────

  private func sendEmail(unitId : Text, subject : Text, htmlBody : Text) : async () {
    let cfg = switch (emailConfig) { case null { return }; case (?c) c };
    if (membersCanisterId == "") return;
    let mActor : actor { getMemberByUnit : shared query (Text) -> async ?{ email : Text } } = actor(membersCanisterId);
    try {
      switch (await mActor.getMemberByUnit(unitId)) {
        case null {};
        case (?m) {
          if (m.email == "") return;
          let json = "{\"from\":\"" # cfg.fromName # " <" # cfg.fromEmail # ">\",\"to\":[\"" # m.email # "\"],\"subject\":\"" # subject # "\",\"html\":\"" # htmlBody # "\"}";
          try {
            ignore await (with cycles = 3_000_000_000) ic.http_request({
              url               = "https://api.resend.com/emails";
              max_response_bytes = ?Nat64.fromNat(4_096);
              headers           = [
                { name = "authorization"; value = "Bearer " # cfg.resendApiKey },
                { name = "content-type";  value = "application/json" },
              ];
              body              = ?Text.encodeUtf8(json);
              method            = #post;
              transform         = ?{ function = transform; context = Blob.fromArray([]) };
            });
          } catch (_) {};
        };
      };
    } catch (_) {};
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

    // ── Collections (#28) — auto-open GracePeriod records ────────────────────
    switch (lateFeePolicy) {
      case (?policy) {
        let graceNs     : Nat = policy.gracePeriodDays * DAY_NS;
        let graceCutoff : Int = now - graceNs;
        for (a in outstanding.vals()) {
          if (a.dueDate < graceCutoff and
              Option.isNull(Map.get(collectionCases, Text.compare, a.unitId))) {
            Map.add(collectionCases, Text.compare, a.unitId, {
              unitId        = a.unitId;
              stage         = #GracePeriod;
              openedAt      = now;
              lastUpdatedAt = now;
            });
          };
        };
      };
      case null {};
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
              let amt = "$" # Nat.toText(a.amountCents / 100);
              await sendEmail(a.unitId, "Upcoming Payment Due — HOA Assessment",
                "<p>Your HOA assessment of " # amt # " is due in " # Nat.toText(days) # " day(s). Please log in to pay online.</p>");
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
              let amt = "$" # Nat.toText(a.amountCents / 100);
              await sendEmail(a.unitId, "Payment Past Due — HOA Assessment",
                "<p>Your HOA assessment of " # amt # " is now " # Nat.toText(days) # " day(s) past due. Please log in to pay immediately.</p>");
            };
          };
        };
      };
    };
  };
};
