import Array     "mo:core/Array";
import Iter      "mo:core/Iter";
import Map       "mo:core/Map";
import Nat       "mo:core/Nat";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

persistent actor Marketplace {

  // ─── Types ───────────────────────────────────────────────────────────────────

  public type ListingCategory = { #ForSale; #Services; #Free; #LostFound };
  public type ListingStatus   = { #Active; #Sold; #Removed };

  public type Listing = {
    id:          Text;
    title:       Text;
    description: Text;
    category:    ListingCategory;
    priceCents:  ?Nat;      // null = free / price on request
    photos:      [Text];    // up to 5 URLs or IPFS CIDs
    contactInfo: Text;
    postedBy:    Principal;
    unitId:      Text;
    status:      ListingStatus;
    isFlagged:   Bool;
    createdAt:   Time.Time;
    expiresAt:   Time.Time;
  };

  public type ListingFlag = {
    id:        Text;
    listingId: Text;
    flaggedBy: Principal;
    reason:    Text;
    createdAt: Time.Time;
  };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #InvalidInput: Text;
    #TooManyPhotos;
  };

  public type MetricsResult = {
    activeListings: Nat;
    totalListings:  Nat;
    flaggedCount:   Nat;
  };

  // ─── Stable State ─────────────────────────────────────────────────────────────

  private var admin          : ?Principal = null;
  private var listingCounter : Nat        = 0;
  private var flagCounter    : Nat        = 0;
  private let listings = Map.empty<Text, Listing>();
  private let flags    = Map.empty<Text, ListingFlag>();

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private func nextListingId() : Text {
    listingCounter += 1;
    "LST_" # Nat.toText(listingCounter)
  };

  private func nextFlagId() : Text {
    flagCounter += 1;
    "FLG_" # Nat.toText(flagCounter)
  };

  private func isAdmin(p : Principal) : Bool {
    switch admin { case (?a) { p == a }; case null { false } }
  };

  // ─── Admin ───────────────────────────────────────────────────────────────────

  public shared(msg) func setAdmin(p : Principal) : async Result.Result<(), Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    switch admin {
      case null    { admin := ?p; #ok(()) };
      case (?curr) {
        if (msg.caller != curr) return #err(#NotAuthorized);
        admin := ?p;
        #ok(())
      };
    }
  };

  // ─── Listings ─────────────────────────────────────────────────────────────────

  public shared(msg) func createListing(
    title:       Text,
    description: Text,
    category:    ListingCategory,
    priceCents:  ?Nat,
    photos:      [Text],
    contactInfo: Text,
    unitId:      Text,
    expiresAt:   Time.Time
  ) : async Result.Result<Listing, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    if (Text.size(title) == 0)       return #err(#InvalidInput("title required"));
    if (Text.size(description) == 0) return #err(#InvalidInput("description required"));
    if (Text.size(contactInfo) == 0) return #err(#InvalidInput("contactInfo required"));
    if (Array.size(photos) > 5)      return #err(#TooManyPhotos);
    let l : Listing = {
      id          = nextListingId();
      title;
      description;
      category;
      priceCents;
      photos;
      contactInfo;
      postedBy    = msg.caller;
      unitId;
      status      = #Active;
      isFlagged   = false;
      createdAt   = Time.now();
      expiresAt;
    };
    Map.add(listings, Text.compare, l.id, l);
    #ok(l)
  };

  public shared(msg) func editListing(
    id:          Text,
    title:       Text,
    description: Text,
    priceCents:  ?Nat,
    photos:      [Text],
    contactInfo: Text,
    expiresAt:   Time.Time
  ) : async Result.Result<Listing, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(listings, Text.compare, id)) {
      case null    { #err(#NotFound) };
      case (?l) {
        if (l.postedBy != msg.caller) return #err(#NotAuthorized);
        switch l.status {
          case (#Active) {};
          case _         { return #err(#InvalidInput("only active listings can be edited")) };
        };
        if (Text.size(title) == 0)  return #err(#InvalidInput("title required"));
        if (Array.size(photos) > 5) return #err(#TooManyPhotos);
        let updated : Listing = {
          id          = l.id;
          title;
          description;
          category    = l.category;
          priceCents;
          photos;
          contactInfo;
          postedBy    = l.postedBy;
          unitId      = l.unitId;
          status      = l.status;
          isFlagged   = l.isFlagged;
          createdAt   = l.createdAt;
          expiresAt;
        };
        ignore Map.delete(listings, Text.compare, id);
        Map.add(listings, Text.compare, id, updated);
        #ok(updated)
      };
    }
  };

  public shared(msg) func deleteListing(id : Text) : async Result.Result<(), Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(listings, Text.compare, id)) {
      case null  { #err(#NotFound) };
      case (?l) {
        if (l.postedBy != msg.caller and not isAdmin(msg.caller)) return #err(#NotAuthorized);
        ignore Map.delete(listings, Text.compare, id);
        #ok(())
      };
    }
  };

  public shared(msg) func markSold(id : Text) : async Result.Result<Listing, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(listings, Text.compare, id)) {
      case null  { #err(#NotFound) };
      case (?l) {
        if (l.postedBy != msg.caller) return #err(#NotAuthorized);
        switch l.status {
          case (#Active) {};
          case _         { return #err(#InvalidInput("listing is not active")) };
        };
        let updated : Listing = {
          id          = l.id;
          title       = l.title;
          description = l.description;
          category    = l.category;
          priceCents  = l.priceCents;
          photos      = l.photos;
          contactInfo = l.contactInfo;
          postedBy    = l.postedBy;
          unitId      = l.unitId;
          status      = #Sold;
          isFlagged   = l.isFlagged;
          createdAt   = l.createdAt;
          expiresAt   = l.expiresAt;
        };
        ignore Map.delete(listings, Text.compare, id);
        Map.add(listings, Text.compare, id, updated);
        #ok(updated)
      };
    }
  };

  public shared(msg) func removeListing(id : Text) : async Result.Result<Listing, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    if (not isAdmin(msg.caller))           return #err(#NotAuthorized);
    switch (Map.get(listings, Text.compare, id)) {
      case null  { #err(#NotFound) };
      case (?l) {
        let updated : Listing = {
          id          = l.id;
          title       = l.title;
          description = l.description;
          category    = l.category;
          priceCents  = l.priceCents;
          photos      = l.photos;
          contactInfo = l.contactInfo;
          postedBy    = l.postedBy;
          unitId      = l.unitId;
          status      = #Removed;
          isFlagged   = l.isFlagged;
          createdAt   = l.createdAt;
          expiresAt   = l.expiresAt;
        };
        ignore Map.delete(listings, Text.compare, id);
        Map.add(listings, Text.compare, id, updated);
        #ok(updated)
      };
    }
  };

  // ─── Flagging ─────────────────────────────────────────────────────────────────

  public shared(msg) func flagListing(
    listingId : Text,
    reason    : Text
  ) : async Result.Result<ListingFlag, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(listings, Text.compare, listingId)) {
      case null  { #err(#NotFound) };
      case (?l) {
        // Mark listing as flagged
        let updated : Listing = {
          id          = l.id;
          title       = l.title;
          description = l.description;
          category    = l.category;
          priceCents  = l.priceCents;
          photos      = l.photos;
          contactInfo = l.contactInfo;
          postedBy    = l.postedBy;
          unitId      = l.unitId;
          status      = l.status;
          isFlagged   = true;
          createdAt   = l.createdAt;
          expiresAt   = l.expiresAt;
        };
        ignore Map.delete(listings, Text.compare, listingId);
        Map.add(listings, Text.compare, listingId, updated);
        let f : ListingFlag = {
          id        = nextFlagId();
          listingId;
          flaggedBy = msg.caller;
          reason;
          createdAt = Time.now();
        };
        Map.add(flags, Text.compare, f.id, f);
        #ok(f)
      };
    }
  };

  // ─── Queries ─────────────────────────────────────────────────────────────────

  public query func getListings() : async [Listing] {
    Array.filter<Listing>(Iter.toArray(Map.values(listings)), func(l) {
      switch l.status { case (#Active) { true }; case _ { false } }
    })
  };

  public query func getListingsByCategory(category : ListingCategory) : async [Listing] {
    Array.filter<Listing>(Iter.toArray(Map.values(listings)), func(l) {
      let active = switch l.status { case (#Active) { true }; case _ { false } };
      if (not active) return false;
      switch (l.category, category) {
        case (#ForSale,  #ForSale)  { true };
        case (#Services, #Services) { true };
        case (#Free,     #Free)     { true };
        case (#LostFound,#LostFound){ true };
        case _                      { false };
      }
    })
  };

  public query func getListing(id : Text) : async ?Listing {
    Map.get(listings, Text.compare, id)
  };

  public query func getMyListings(seller : Principal) : async [Listing] {
    Array.filter<Listing>(Iter.toArray(Map.values(listings)), func(l) {
      l.postedBy == seller
    })
  };

  public query func getFlaggedListings() : async [Listing] {
    Array.filter<Listing>(Iter.toArray(Map.values(listings)), func(l) {
      l.isFlagged
    })
  };

  public query func metrics() : async MetricsResult {
    let all = Iter.toArray(Map.values(listings));
    let active  = Array.filter<Listing>(all, func(l) { switch l.status { case (#Active) { true }; case _ { false } } });
    let flagged = Array.filter<Listing>(all, func(l) { l.isFlagged });
    {
      activeListings = Array.size(active);
      totalListings  = Array.size(all);
      flaggedCount   = Array.size(flagged);
    }
  };
};
