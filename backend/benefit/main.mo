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
    code:     Text;
    issuedAt: Time.Time;
  };

  public type Error = { #NotAuthorized };

  public type MetricsResult = {
    totalIssued: Nat;
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
        let code   = "QUORUM-" # padNat(couponCounter, 6);
        let record = { code; issuedAt = Time.now() };
        Map.add(coupons, Text.compare, key, record);
        #ok(record)
      };
    }
  };

  public shared(msg) func getCoupon() : async ?CouponRecord {
    if (Principal.isAnonymous(msg.caller)) return null;
    Map.get(coupons, Text.compare, Principal.toText(msg.caller))
  };

  public query func metrics() : async MetricsResult {
    { totalIssued = couponCounter }
  };
};
