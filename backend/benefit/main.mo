import Array     "mo:core/Array";
import Iter      "mo:core/Iter";
import Map       "mo:core/Map";
import Nat       "mo:core/Nat";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

persistent actor Benefit {

  // ─── Types ───────────────────────────────────────────────────────────────────

  public type CouponRecord = {
    code:        Text;
    issuedAt:    Time.Time;
    redeemedAt:  ?Time.Time;   // null until HomeGentic calls redeemCoupon
  };

  public type Error = {
    #NotAuthorized;
    #NotFound;
    #AlreadyRedeemed;
  };

  public type MetricsResult = {
    totalIssued:   Nat;
    totalRedeemed: Nat;
  };

  // ─── Stable State ─────────────────────────────────────────────────────────────

  private var couponCounter : Nat = 0;
  private let coupons = Map.empty<Text, CouponRecord>(); // key: Principal.toText

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private func padNat(n : Nat, width : Nat) : Text {
    let s   = Nat.toText(n);
    let len = Text.size(s);
    if (len >= width) { s }
    else {
      var prefix = "";
      var i = 0;
      while (i < width - len) {
        prefix := prefix # "0";
        i += 1;
      };
      prefix # s
    }
  };

  // ─── Coupon ───────────────────────────────────────────────────────────────────

  // Idempotent: returns existing code on repeated calls from the same principal.
  public shared(msg) func generateCoupon() : async Result.Result<CouponRecord, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    let key = Principal.toText(msg.caller);
    switch (Map.get(coupons, Text.compare, key)) {
      case (?existing) { #ok(existing) };
      case null {
        couponCounter += 1;
        let record = { code = "QUORUM-" # padNat(couponCounter, 6); issuedAt = Time.now(); redeemedAt = null };
        Map.add(coupons, Text.compare, key, record);
        #ok(record)
      };
    }
  };

  public shared(msg) func getCoupon() : async ?CouponRecord {
    if (Principal.isAnonymous(msg.caller)) return null;
    Map.get(coupons, Text.compare, Principal.toText(msg.caller))
  };

  // Called by HomeGentic after a successful checkout. Marks the code as one-use.
  // Returns #AlreadyRedeemed if the code was already used, #NotFound if unknown.
  public shared(msg) func redeemCoupon(code : Text) : async Result.Result<CouponRecord, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    let allRecords = Iter.toArray(Map.values(coupons));
    let matches = Array.filter<CouponRecord>(allRecords, func(r) { r.code == code });
    if (matches.size() == 0) return #err(#NotFound);
    let record = matches[0];
    switch (record.redeemedAt) {
      case (?_) { #err(#AlreadyRedeemed) };
      case null {
        let redeemed = { record with redeemedAt = ?Time.now() };
        // Update by principal key — scan to find it
        let principalKey = Array.filter<(Text, CouponRecord)>(
          Iter.toArray(Map.entries(coupons)),
          func((_, r)) { r.code == code }
        );
        if (principalKey.size() > 0) {
          Map.add(coupons, Text.compare, principalKey[0].0, redeemed);
        };
        #ok(redeemed)
      };
    }
  };

  public query func metrics() : async MetricsResult {
    let all = Iter.toArray(Map.values(coupons));
    let redeemed = Array.filter<CouponRecord>(all, func(r) { r.redeemedAt != null });
    { totalIssued = couponCounter; totalRedeemed = redeemed.size() }
  };
};
