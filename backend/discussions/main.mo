import Array     "mo:core/Array";
import Iter      "mo:core/Iter";
import Map       "mo:core/Map";
import Nat       "mo:core/Nat";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

persistent actor Discussions {

  // ─── Types ───────────────────────────────────────────────────────────────────

  public type PostCategory = {
    #General;
    #MaintenanceRepairs;
    #NeighborHelp;
    #FeedbackToBoard;
    #ForYourInfo;
  };

  public type Post = {
    id:         Text;
    title:      Text;
    body:       Text;
    category:   PostCategory;
    isPinned:   Bool;
    isLocked:   Bool;
    postedBy:   Principal;
    postedAt:   Time.Time;
    replyCount: Nat;
  };

  public type Reply = {
    id:       Text;
    postId:   Text;
    body:     Text;
    postedBy: Principal;
    postedAt: Time.Time;
  };

  public type Error = {
    #NotFound;
    #NotAuthorized;
    #InvalidInput: Text;
    #Locked;
  };

  // ─── Stable State ─────────────────────────────────────────────────────────────

  private var postCounter  : Nat = 0;
  private var replyCounter : Nat = 0;
  private let posts   = Map.empty<Text, Post>();
  private let replies = Map.empty<Text, Reply>();

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private func nextPostId() : Text {
    postCounter += 1;
    "POST_" # Nat.toText(postCounter)
  };

  private func nextReplyId() : Text {
    replyCounter += 1;
    "REPLY_" # Nat.toText(replyCounter)
  };

  // ─── Post CRUD ───────────────────────────────────────────────────────────────

  public shared(msg) func createPost(
    title    : Text,
    body     : Text,
    category : PostCategory
  ) : async Result.Result<Post, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    if (Text.size(title) == 0) return #err(#InvalidInput("title required"));
    if (Text.size(body)  == 0) return #err(#InvalidInput("body required"));
    let p : Post = {
      id         = nextPostId();
      title;
      body;
      category;
      isPinned   = false;
      isLocked   = false;
      postedBy   = msg.caller;
      postedAt   = Time.now();
      replyCount = 0;
    };
    Map.add(posts, Text.compare, p.id, p);
    #ok(p)
  };

  public shared(msg) func deletePost(id : Text) : async Result.Result<(), Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(posts, Text.compare, id)) {
      case null   { #err(#NotFound) };
      case (?p) {
        if (p.postedBy != msg.caller) return #err(#NotAuthorized);
        for (r in Iter.fromArray(Iter.toArray(Map.values(replies)))) {
          if (r.postId == id) ignore Map.delete(replies, Text.compare, r.id);
        };
        ignore Map.delete(posts, Text.compare, id);
        #ok(())
      };
    }
  };

  // ─── Replies ─────────────────────────────────────────────────────────────────

  public shared(msg) func addReply(
    postId : Text,
    body   : Text
  ) : async Result.Result<Reply, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    if (Text.size(body) == 0) return #err(#InvalidInput("body required"));
    switch (Map.get(posts, Text.compare, postId)) {
      case null  { #err(#NotFound) };
      case (?p) {
        if (p.isLocked) return #err(#Locked);
        let r : Reply = {
          id       = nextReplyId();
          postId;
          body;
          postedBy = msg.caller;
          postedAt = Time.now();
        };
        Map.add(replies, Text.compare, r.id, r);
        let updated : Post = {
          id         = p.id;
          title      = p.title;
          body       = p.body;
          category   = p.category;
          isPinned   = p.isPinned;
          isLocked   = p.isLocked;
          postedBy   = p.postedBy;
          postedAt   = p.postedAt;
          replyCount = p.replyCount + 1;
        };
        ignore Map.delete(posts, Text.compare, p.id);
        Map.add(posts, Text.compare, p.id, updated);
        #ok(r)
      };
    }
  };

  // ─── Moderation ──────────────────────────────────────────────────────────────

  public shared(msg) func pinPost(id : Text) : async Result.Result<Post, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(posts, Text.compare, id)) {
      case null  { #err(#NotFound) };
      case (?p) {
        let updated : Post = {
          id         = p.id;
          title      = p.title;
          body       = p.body;
          category   = p.category;
          isPinned   = true;
          isLocked   = p.isLocked;
          postedBy   = p.postedBy;
          postedAt   = p.postedAt;
          replyCount = p.replyCount;
        };
        ignore Map.delete(posts, Text.compare, p.id);
        Map.add(posts, Text.compare, p.id, updated);
        #ok(updated)
      };
    }
  };

  public shared(msg) func lockPost(id : Text) : async Result.Result<Post, Error> {
    if (Principal.isAnonymous(msg.caller)) return #err(#NotAuthorized);
    switch (Map.get(posts, Text.compare, id)) {
      case null  { #err(#NotFound) };
      case (?p) {
        let updated : Post = {
          id         = p.id;
          title      = p.title;
          body       = p.body;
          category   = p.category;
          isPinned   = p.isPinned;
          isLocked   = true;
          postedBy   = p.postedBy;
          postedAt   = p.postedAt;
          replyCount = p.replyCount;
        };
        ignore Map.delete(posts, Text.compare, p.id);
        Map.add(posts, Text.compare, p.id, updated);
        #ok(updated)
      };
    }
  };

  // ─── Queries ─────────────────────────────────────────────────────────────────

  public query func getPost(id : Text) : async ?Post {
    Map.get(posts, Text.compare, id)
  };

  public query func getAllPosts() : async [Post] {
    Iter.toArray(Map.values(posts))
  };

  public query func getPostsByCategory(category : PostCategory) : async [Post] {
    Array.filter<Post>(Iter.toArray(Map.values(posts)), func(p) {
      switch (p.category, category) {
        case (#General,            #General)            { true };
        case (#MaintenanceRepairs, #MaintenanceRepairs) { true };
        case (#NeighborHelp,       #NeighborHelp)       { true };
        case (#FeedbackToBoard,    #FeedbackToBoard)    { true };
        case (#ForYourInfo,        #ForYourInfo)        { true };
        case _                                          { false };
      }
    })
  };

  public query func getRepliesForPost(postId : Text) : async [Reply] {
    Array.filter<Reply>(Iter.toArray(Map.values(replies)), func(r) {
      r.postId == postId
    })
  };

  public query func getPinnedPosts() : async [Post] {
    Array.filter<Post>(Iter.toArray(Map.values(posts)), func(p) {
      p.isPinned
    })
  };
};
