/**
 * Quorum — Documents Canister
 *
 * Community document storage: CC&Rs, bylaws, meeting minutes, budgets.
 * Content is stored on-chain as a Blob. When ICP blob storage matures
 * this canister will be migrated to reference asset IDs instead.
 * Access control: AllMembers or BoardOnly visibility per document.
 */

import Array     "mo:core/Array";
import Blob      "mo:core/Blob";
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
    id:          Text;
    title:       Text;
    category:    DocCategory;
    visibility:  Visibility;
    content:     Blob;     // stored on-chain; migrate to ICP blob storage when available
    mimeType:    Text;     // e.g. "application/pdf", "text/plain"
    sizeBytes:   Nat;
    uploadedBy:  Principal;
    uploadedAt:  Time.Time;
    description: Text;
  };

  public type DocumentMeta = {
    id:          Text;
    title:       Text;
    category:    DocCategory;
    visibility:  Visibility;
    mimeType:    Text;
    sizeBytes:   Nat;
    uploadedBy:  Principal;
    uploadedAt:  Time.Time;
    description: Text;
  };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #InvalidInput: Text;
    #TooLarge: Text;
  };

  // ─── Stable State ─────────────────────────────────────────────────────────────

  private var counter : Nat = 0;
  // 10 MB per document — prevents a single upload from exhausting canister memory
  private let MAX_BYTES : Nat = 10_485_760;
  private let documents = Map.empty<Text, Document>();

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private func nextId() : Text {
    counter += 1;
    "DOC_" # Nat.toText(counter)
  };

  private func toMeta(d : Document) : DocumentMeta {
    {
      id          = d.id;
      title       = d.title;
      category    = d.category;
      visibility  = d.visibility;
      mimeType    = d.mimeType;
      sizeBytes   = d.sizeBytes;
      uploadedBy  = d.uploadedBy;
      uploadedAt  = d.uploadedAt;
      description = d.description;
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
      id          = nextId();
      title;
      category;
      visibility;
      content;
      mimeType;
      sizeBytes   = size;
      uploadedBy  = msg.caller;
      uploadedAt  = Time.now();
      description;
    };
    Map.add(documents, Text.compare, doc.id, doc);
    #ok(toMeta(doc))
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

  /// Returns the full document including content blob.
  public query func getDocument(id : Text) : async ?Document {
    Map.get(documents, Text.compare, id)
  };

  /// Returns metadata only (no content blob) — use for listing views.
  public query func getDocumentMeta(id : Text) : async ?DocumentMeta {
    switch (Map.get(documents, Text.compare, id)) {
      case null  { null };
      case (?d)  { ?toMeta(d) };
    }
  };

  public query func getDocumentsByCategory(category : DocCategory) : async [DocumentMeta] {
    Array.map<Document, DocumentMeta>(
      Array.filter<Document>(Map.toValueArray(documents), func(d) { d.category == category }),
      toMeta
    )
  };

  public query func getAllPublicDocumentsMeta() : async [DocumentMeta] {
    Array.map<Document, DocumentMeta>(
      Array.filter<Document>(Map.toValueArray(documents), func(d) { d.visibility == #AllMembers }),
      toMeta
    )
  };

  public query func getAllDocumentsMeta() : async [DocumentMeta] {
    Array.map<Document, DocumentMeta>(Map.toValueArray(documents), toMeta)
  };
};
