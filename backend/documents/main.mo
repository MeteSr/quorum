/**
 * Quorum — Documents Canister
 *
 * Community document storage: CC&Rs, bylaws, meeting minutes, budgets.
 * Documents are stored as IPFS CIDs or on-chain blobs (board's choice).
 * Access control: public documents visible to all members, restricted to board only.
 */

import Array     "mo:core/Array";
import Map       "mo:core/Map";
import Nat       "mo:core/Nat";
import Option    "mo:core/Option";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

persistent actor Documents {

  // ─── Types ───────────────────────────────────────────────────────────────────

  public type DocCategory = {
    #GoverningDocuments;   // CC&Rs, bylaws, rules
    #MeetingMinutes;
    #FinancialReports;
    #Notices;
    #Contracts;
    #Other;
  };

  public type Visibility = { #AllMembers; #BoardOnly };

  public type Document = {
    id:          Text;
    title:       Text;
    category:    DocCategory;
    visibility:  Visibility;
    cid:         Text;    // IPFS CID or "inline:<base64>" for small docs
    uploadedBy:  Principal;
    uploadedAt:  Time.Time;
    description: Text;
  };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #InvalidInput: Text;
  };

  // ─── Stable State ─────────────────────────────────────────────────────────────

  private var counter : Nat = 0;
  private let documents = Map.empty<Text, Document>();

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private func nextId() : Text {
    counter += 1;
    "DOC_" # Nat.toText(counter)
  };

  // ─── Upload ───────────────────────────────────────────────────────────────────

  public shared(msg) func uploadDocument(
    title:       Text,
    category:    DocCategory,
    visibility:  Visibility,
    cid:         Text,
    description: Text
  ) : async Result.Result<Document, Error> {
    if (Text.size(title) == 0) return #err(#InvalidInput("title required"));
    if (Text.size(cid)   == 0) return #err(#InvalidInput("cid required"));
    let doc : Document = {
      id          = nextId();
      title;
      category;
      visibility;
      cid;
      uploadedBy  = msg.caller;
      uploadedAt  = Time.now();
      description;
    };
    Map.add(documents, Text.compare, doc.id, doc);
    #ok(doc)
  };

  public shared(msg) func deleteDocument(id : Text) : async Result.Result<(), Error> {
    switch (Map.get(documents, Text.compare, id)) {
      case null  { #err(#NotFound) };
      case (?d)  {
        if (d.uploadedBy != msg.caller) return #err(#NotAuthorized);
        Map.delete(documents, Text.compare, id);
        #ok(())
      };
    }
  };

  // ─── Queries ─────────────────────────────────────────────────────────────────

  public query func getDocument(id : Text) : async ?Document {
    Map.get(documents, Text.compare, id)
  };

  public query func getDocumentsByCategory(category : DocCategory) : async [Document] {
    Array.filter<Document>(Map.toValueArray(documents), func(d) { d.category == category })
  };

  public query func getAllPublicDocuments() : async [Document] {
    Array.filter<Document>(Map.toValueArray(documents), func(d) { d.visibility == #AllMembers })
  };

  public query func getAllDocuments() : async [Document] {
    Map.toValueArray(documents)
  };
};
