/**
 * Quorum — Documents Canister
 *
 * Community document storage: CC&Rs, bylaws, meeting minutes, budgets.
 * Content is stored on-chain as a Blob. When ICP blob storage matures
 * this canister will be migrated to reference asset IDs instead.
 * Access control: AllMembers or BoardOnly visibility per document.
 *
 * Document acknowledgment tracking (issue #39): residents confirm
 * they have read key HOA documents; board sees a live ack dashboard.
 */

import Array     "mo:core/Array";
import Blob      "mo:core/Blob";
import Iter      "mo:core/Iter";
import Map       "mo:core/Map";
import Nat       "mo:core/Nat";
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
    id:                      Text;
    title:                   Text;
    category:                DocCategory;
    visibility:              Visibility;
    content:                 Blob;
    mimeType:                Text;
    sizeBytes:               Nat;
    uploadedBy:              Principal;
    uploadedAt:              Time.Time;
    description:             Text;
    requiresAcknowledgment:  Bool;
  };

  public type DocumentMeta = {
    id:                      Text;
    title:                   Text;
    category:                DocCategory;
    visibility:              Visibility;
    mimeType:                Text;
    sizeBytes:               Nat;
    uploadedBy:              Principal;
    uploadedAt:              Time.Time;
    description:             Text;
    requiresAcknowledgment:  Bool;
  };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #InvalidInput: Text;
    #TooLarge: Text;
  };

  // ─── Stable State ─────────────────────────────────────────────────────────────

  private var counter   : Nat = 0;
  // 10 MB per document — prevents a single upload from exhausting canister memory
  private let MAX_BYTES : Nat = 10_485_760;
  private let documents = Map.empty<Text, Document>();
  // Acknowledgment store: key = "docId:principalText", value = timestamp
  private let acknowledgments = Map.empty<Text, Time.Time>();

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private func nextId() : Text {
    counter += 1;
    "DOC_" # Nat.toText(counter)
  };

  private func ackKey(docId : Text, who : Principal) : Text {
    docId # ":" # Principal.toText(who)
  };

  private func toMeta(doc : Document) : DocumentMeta {
    {
      id                     = doc.id;
      title                  = doc.title;
      category               = doc.category;
      visibility             = doc.visibility;
      mimeType               = doc.mimeType;
      sizeBytes              = doc.sizeBytes;
      uploadedBy             = doc.uploadedBy;
      uploadedAt             = doc.uploadedAt;
      description            = doc.description;
      requiresAcknowledgment = doc.requiresAcknowledgment;
    }
  };

  // ─── Upload ───────────────────────────────────────────────────────────────────

  public shared(msg) func uploadDocument(
    title:       Text,
    category:    DocCategory,
    visibility:  Visibility,
    content:     Blob,
    mimeType:    Text,
    description: Text
  ) : async Result.Result<DocumentMeta, Error> {
    if (Text.size(title)    == 0) return #err(#InvalidInput("title required"));
    if (Text.size(mimeType) == 0) return #err(#InvalidInput("mimeType required"));
    let size = Blob.size(content);
    if (size == 0)        return #err(#InvalidInput("content must not be empty"));
    if (size > MAX_BYTES) return #err(#TooLarge("document exceeds 10 MB limit"));

    let doc : Document = {
      id                     = nextId();
      title;
      category;
      visibility;
      content;
      mimeType;
      sizeBytes              = size;
      uploadedBy             = msg.caller;
      uploadedAt             = Time.now();
      description;
      requiresAcknowledgment = false;
    };
    Map.add(documents, Text.compare, doc.id, doc);
    #ok(toMeta(doc))
  };

  public shared(msg) func deleteDocument(id : Text) : async Result.Result<(), Error> {
    switch (Map.get(documents, Text.compare, id)) {
      case null  { #err(#NotFound) };
      case (?doc)  {
        if (doc.uploadedBy != msg.caller) return #err(#NotAuthorized);
        ignore Map.remove(documents, Text.compare, id);
        #ok(())
      };
    }
  };

  // ─── Acknowledgment ───────────────────────────────────────────────────────────

  public shared(msg) func setRequiresAcknowledgment(
    docId:    Text,
    required: Bool
  ) : async Result.Result<DocumentMeta, Error> {
    switch (Map.get(documents, Text.compare, docId)) {
      case null    { #err(#NotFound) };
      case (?doc)  {
        if (doc.uploadedBy != msg.caller) return #err(#NotAuthorized);
        let updated = { doc with requiresAcknowledgment = required };
        Map.add(documents, Text.compare, docId, updated);
        #ok(toMeta(updated))
      };
    }
  };

  // Idempotent — re-acknowledging updates the timestamp.
  public shared(msg) func acknowledgeDocument(docId : Text) : async Result.Result<(), Error> {
    switch (Map.get(documents, Text.compare, docId)) {
      case null  { #err(#NotFound) };
      case (?_)  {
        Map.add(acknowledgments, Text.compare, ackKey(docId, msg.caller), Time.now());
        #ok(())
      };
    }
  };

  // Returns [(principalText, timestamp)] for all members who acknowledged docId.
  public query func getAcknowledgmentStatus(docId : Text) : async [(Text, Time.Time)] {
    let prefix = docId # ":";
    let allKeys = Iter.toArray(Map.keys(acknowledgments));
    let matching = Array.filter<Text>(allKeys, func(key) {
      Text.startsWith(key, #text prefix)
    });
    Array.map<Text, (Text, Time.Time)>(matching, func(key) {
      let principalText = Text.replace(key, #text prefix, "");
      let timestamp = switch (Map.get(acknowledgments, Text.compare, key)) {
        case (?ts) { ts };
        case null  { 0  };
      };
      (principalText, timestamp)
    })
  };

  // Returns docIds the caller has acknowledged.
  public shared query(msg) func getMyAcknowledgedDocs() : async [Text] {
    let suffix = ":" # Principal.toText(msg.caller);
    let allKeys = Iter.toArray(Map.keys(acknowledgments));
    let matching = Array.filter<Text>(allKeys, func(key) {
      Text.endsWith(key, #text suffix)
    });
    Array.map<Text, Text>(matching, func(key) {
      Text.replace(key, #text suffix, "")
    })
  };

  // ─── Queries ─────────────────────────────────────────────────────────────────

  /// Returns the full document including content blob.
  public query func getDocument(id : Text) : async ?Document {
    Map.get(documents, Text.compare, id)
  };

  /// Returns metadata only (no content blob) — use for listing views.
  public query func getDocumentMeta(id : Text) : async ?DocumentMeta {
    switch (Map.get(documents, Text.compare, id)) {
      case null    { null };
      case (?doc)  { ?toMeta(doc) };
    }
  };

  public query func getDocumentsByCategory(category : DocCategory) : async [DocumentMeta] {
    Array.map<Document, DocumentMeta>(
      Array.filter<Document>(Iter.toArray(Map.values(documents)), func(doc) { doc.category == category }),
      toMeta
    )
  };

  public query func getAllPublicDocumentsMeta() : async [DocumentMeta] {
    Array.map<Document, DocumentMeta>(
      Array.filter<Document>(Iter.toArray(Map.values(documents)), func(doc) { doc.visibility == #AllMembers }),
      toMeta
    )
  };

  public query func getAllDocumentsMeta() : async [DocumentMeta] {
    Array.map<Document, DocumentMeta>(Iter.toArray(Map.values(documents)), toMeta)
  };
};
