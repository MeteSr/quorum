import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "@/services/actor";

const CANISTER_ID_DISCUSSIONS = (process.env as any).CANISTER_ID_DISCUSSIONS || "";

// ─── IDL Factory ─────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
export function idlFactory({ IDL }: { IDL: any }) {
  const PostCategory = IDL.Variant({
    General:            IDL.Null,
    MaintenanceRepairs: IDL.Null,
    NeighborHelp:       IDL.Null,
    FeedbackToBoard:    IDL.Null,
    ForYourInfo:        IDL.Null,
  });

  const Post = IDL.Record({
    id:         IDL.Text,
    title:      IDL.Text,
    body:       IDL.Text,
    category:   PostCategory,
    isPinned:   IDL.Bool,
    isLocked:   IDL.Bool,
    postedBy:   IDL.Principal,
    postedAt:   IDL.Int,
    replyCount: IDL.Nat,
  });

  const Reply = IDL.Record({
    id:       IDL.Text,
    postId:   IDL.Text,
    body:     IDL.Text,
    postedBy: IDL.Principal,
    postedAt: IDL.Int,
  });

  const Error = IDL.Variant({
    NotFound:      IDL.Null,
    NotAuthorized: IDL.Null,
    InvalidInput:  IDL.Text,
    Locked:        IDL.Null,
  });

  const ResultPost  = IDL.Variant({ ok: Post,      err: Error });
  const ResultReply = IDL.Variant({ ok: Reply,     err: Error });
  const ResultUnit  = IDL.Variant({ ok: IDL.Null,  err: Error });

  return IDL.Service({
    createPost:          IDL.Func([IDL.Text, IDL.Text, PostCategory], [ResultPost],  []),
    deletePost:          IDL.Func([IDL.Text],                          [ResultUnit],  []),
    addReply:            IDL.Func([IDL.Text, IDL.Text],                [ResultReply], []),
    pinPost:             IDL.Func([IDL.Text],                          [ResultPost],  []),
    lockPost:            IDL.Func([IDL.Text],                          [ResultPost],  []),
    getPost:             IDL.Func([IDL.Text],                          [IDL.Opt(Post)],   ["query"]),
    getAllPosts:          IDL.Func([],                                  [IDL.Vec(Post)],   ["query"]),
    getPostsByCategory:  IDL.Func([PostCategory],                      [IDL.Vec(Post)],   ["query"]),
    getRepliesForPost:   IDL.Func([IDL.Text],                          [IDL.Vec(Reply)],  ["query"]),
    getPinnedPosts:      IDL.Func([],                                  [IDL.Vec(Post)],   ["query"]),
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type PostCategory =
  | { General: null }
  | { MaintenanceRepairs: null }
  | { NeighborHelp: null }
  | { FeedbackToBoard: null }
  | { ForYourInfo: null };

export interface Post {
  id:         string;
  title:      string;
  body:       string;
  category:   PostCategory;
  isPinned:   boolean;
  isLocked:   boolean;
  postedBy:   import("@dfinity/principal").Principal;
  postedAt:   bigint;
  replyCount: bigint;
}

export interface Reply {
  id:       string;
  postId:   string;
  body:     string;
  postedBy: import("@dfinity/principal").Principal;
  postedAt: bigint;
}

export type DiscussionsError =
  | { NotFound: null }
  | { NotAuthorized: null }
  | { InvalidInput: string }
  | { Locked: null };

// ─── Actor ────────────────────────────────────────────────────────────────────

async function createActor() {
  if (!CANISTER_ID_DISCUSSIONS) return null;
  const agent = await getAgent();
  return Actor.createActor(idlFactory, { agent, canisterId: CANISTER_ID_DISCUSSIONS });
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function createPost(
  title: string, body: string, category: PostCategory
): Promise<{ ok: Post } | { err: DiscussionsError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.createPost(title, body, category);
}

export async function deletePost(
  id: string
): Promise<{ ok: null } | { err: DiscussionsError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.deletePost(id);
}

export async function addReply(
  postId: string, body: string
): Promise<{ ok: Reply } | { err: DiscussionsError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.addReply(postId, body);
}

export async function pinPost(
  id: string
): Promise<{ ok: Post } | { err: DiscussionsError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.pinPost(id);
}

export async function lockPost(
  id: string
): Promise<{ ok: Post } | { err: DiscussionsError }> {
  const actor = await createActor() as any;
  if (!actor) return { err: { NotFound: null } };
  return actor.lockPost(id);
}

export async function getPost(id: string): Promise<Post | null> {
  const actor = await createActor() as any;
  if (!actor) return null;
  const result = await actor.getPost(id);
  return result.length > 0 ? result[0] : null;
}

export async function getAllPosts(): Promise<Post[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getAllPosts();
}

export async function getPostsByCategory(category: PostCategory): Promise<Post[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getPostsByCategory(category);
}

export async function getRepliesForPost(postId: string): Promise<Reply[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getRepliesForPost(postId);
}

export async function getPinnedPosts(): Promise<Post[]> {
  const actor = await createActor() as any;
  if (!actor) return [];
  return actor.getPinnedPosts();
}
