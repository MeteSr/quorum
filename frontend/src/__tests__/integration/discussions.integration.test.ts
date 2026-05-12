/**
 * Integration tests — discussions canister.
 *
 * What these tests prove that unit tests cannot:
 *   - PostCategory Variant round-trips (5 variants)
 *   - createPost returns a Post with replyCount=0
 *   - addReply increments replyCount on the parent post
 *   - addReply to a locked post returns #Locked
 *   - pinPost sets isPinned=true
 *   - lockPost sets isLocked=true
 *   - getPostsByCategory filters correctly
 *   - getRepliesForPost returns only replies for that post
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Actor } from "@icp-sdk/core/agent";
import { idlFactory } from "@/services/discussions";
import { getAgent } from "@/services/actor";
import { TEST_PRINCIPAL } from "./setup";

const CANISTER_ID = (process.env as any).CANISTER_ID_DISCUSSIONS || "";
const deployed = !!CANISTER_ID;

const RUN_ID = Date.now();

async function getActor() {
  return Actor.createActor(idlFactory, { agent: await getAgent(), canisterId: CANISTER_ID });
}

describe.skipIf(!deployed)("createPost — Candid serialization", () => {
  let post: any;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.createPost(
      `Community BBQ ${RUN_ID}`, "Anyone interested in a summer BBQ?", { General: null }
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    post = result.ok;
  });

  it("returns a non-empty id", () => {
    expect(post.id).toBeTruthy();
  });

  it("title is preserved", () => {
    expect(post.title).toBe(`Community BBQ ${RUN_ID}`);
  });

  it("PostCategory Variant round-trips as General", () => {
    expect(post.category).toHaveProperty("General");
  });

  it("isPinned defaults to false", () => {
    expect(post.isPinned).toBe(false);
  });

  it("isLocked defaults to false", () => {
    expect(post.isLocked).toBe(false);
  });

  it("replyCount starts at 0", () => {
    expect(post.replyCount).toBe(BigInt(0));
  });

  it("postedBy matches test principal", () => {
    expect(post.postedBy.toText()).toBe(TEST_PRINCIPAL);
  });
});

describe.skipIf(!deployed)("addReply — replyCount increment", () => {
  let postId: string;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.createPost(
      `Reply test post ${RUN_ID}`, "Reply test body.", { NeighborHelp: null }
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    postId = result.ok.id;
  });

  it("first reply increments replyCount to 1", async () => {
    const a = await getActor();
    const result = await a.addReply(postId, "Happy to help!") as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    const post = await a.getPost(postId) as any[];
    expect(post[0].replyCount).toBe(BigInt(1));
  });

  it("second reply increments replyCount to 2", async () => {
    const a = await getActor();
    await a.addReply(postId, "Me too!");
    const post = await a.getPost(postId) as any[];
    expect(post[0].replyCount).toBe(BigInt(2));
  });

  it("getRepliesForPost returns 2 replies", async () => {
    const a = await getActor();
    const replies = await a.getRepliesForPost(postId) as any[];
    expect(replies.length).toBe(2);
    expect(replies.every((r: any) => r.postId === postId)).toBe(true);
  });
});

describe.skipIf(!deployed)("lockPost — blocks addReply", () => {
  let postId: string;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.createPost(
      `Lock test ${RUN_ID}`, "This post will be locked.", { FeedbackToBoard: null }
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    postId = result.ok.id;
    await a.lockPost(postId);
  });

  it("lockPost sets isLocked=true", async () => {
    const a = await getActor();
    const post = await a.getPost(postId) as any[];
    expect(post[0].isLocked).toBe(true);
  });

  it("addReply to locked post returns #Locked", async () => {
    const a = await getActor();
    const result = await a.addReply(postId, "Should fail.") as any;
    expect("err" in result).toBe(true);
    expect(result.err).toHaveProperty("Locked");
  });
});

describe.skipIf(!deployed)("pinPost — isPinned flag", () => {
  let postId: string;

  beforeAll(async () => {
    const a = await getActor();
    const result = await a.createPost(
      `Pin test ${RUN_ID}`, "This post will be pinned.", { ForYourInfo: null }
    ) as any;
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    postId = result.ok.id;
    await a.pinPost(postId);
  });

  it("pinPost sets isPinned=true", async () => {
    const a = await getActor();
    const post = await a.getPost(postId) as any[];
    expect(post[0].isPinned).toBe(true);
  });

  it("getPinnedPosts includes the pinned post", async () => {
    const a = await getActor();
    const pinned = await a.getPinnedPosts() as any[];
    const found = pinned.find((p: any) => p.id === postId);
    expect(found).toBeDefined();
  });
});

describe.skipIf(!deployed)("getPostsByCategory — filtering", () => {
  it("returns only MaintenanceRepairs posts", async () => {
    const a = await getActor();
    await a.createPost(`Maint post ${RUN_ID}`, "Need a plumber.", { MaintenanceRepairs: null });
    const filtered = await a.getPostsByCategory({ MaintenanceRepairs: null }) as any[];
    expect(filtered.every((p: any) => "MaintenanceRepairs" in p.category)).toBe(true);
  });
});
