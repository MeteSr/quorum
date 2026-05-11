import { useEffect, useState } from "react";
import {
  createPost, deletePost, addReply, pinPost, lockPost,
  getAllPosts, getRepliesForPost,
  type Post, type Reply, type PostCategory,
} from "@/services/discussions";

const styles = {
  ink:      "#0E0E0C",
  navy:     "#1B2D4F",
  rust:     "#C94C2E",
  rule:     "#C8C3B8",
  inkLight: "#7A7268",
  amber:    "#D4860A",
  sage:     "#4A7C59",
  mono:     "'IBM Plex Mono', monospace",
  sans:     "'IBM Plex Sans', system-ui, sans-serif",
  serif:    "'Playfair Display', Georgia, serif",
};

const CATEGORIES: { key: string; label: string; variant: PostCategory }[] = [
  { key: "General",            label: "General",           variant: { General: null } },
  { key: "MaintenanceRepairs", label: "Maintenance",       variant: { MaintenanceRepairs: null } },
  { key: "NeighborHelp",       label: "Neighbor Help",     variant: { NeighborHelp: null } },
  { key: "FeedbackToBoard",    label: "Board Feedback",    variant: { FeedbackToBoard: null } },
  { key: "ForYourInfo",        label: "For Your Info",     variant: { ForYourInfo: null } },
];

function categoryKey(cat: PostCategory): string {
  if ("General" in cat)            return "General";
  if ("MaintenanceRepairs" in cat) return "MaintenanceRepairs";
  if ("NeighborHelp" in cat)       return "NeighborHelp";
  if ("FeedbackToBoard" in cat)    return "FeedbackToBoard";
  return "ForYourInfo";
}

function categoryLabel(cat: PostCategory): string {
  return CATEGORIES.find((c) => c.key === categoryKey(cat))?.label ?? "";
}

export default function DiscussionsPage() {
  const [posts,         setPosts]         = useState<Post[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [filterCat,     setFilterCat]     = useState<string>("all");
  const [expandedPost,  setExpandedPost]  = useState<string | null>(null);
  const [repliesCache,  setRepliesCache]  = useState<Record<string, Reply[]>>({});
  const [replyBody,     setReplyBody]     = useState<Record<string, string>>({});

  // New post form
  const [showCreate,    setShowCreate]    = useState(false);
  const [newTitle,      setNewTitle]      = useState("");
  const [newBody,       setNewBody]       = useState("");
  const [newCategory,   setNewCategory]   = useState<PostCategory>({ General: null });
  const [creating,      setCreating]      = useState(false);
  const [createError,   setCreateError]   = useState<string | null>(null);

  useEffect(() => {
    getAllPosts()
      .then((p) => setPosts(p.sort((a, b) => Number(b.postedAt - a.postedAt))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const pinnedPosts = posts.filter((p) => p.isPinned);
  const unpinnedPosts = posts.filter((p) => !p.isPinned);
  const filteredUnpinned = filterCat === "all"
    ? unpinnedPosts
    : unpinnedPosts.filter((p) => categoryKey(p.category) === filterCat);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const result = await createPost(newTitle, newBody, newCategory);
      if ("ok" in result) {
        setPosts((prev) => [result.ok, ...prev]);
        setShowCreate(false);
        setNewTitle(""); setNewBody("");
      } else {
        const err = result.err;
        setCreateError("NotAuthorized" in err ? "Sign in to post." : "Create failed.");
      }
    } catch {
      setCreateError("Create failed.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    await deletePost(id);
    setPosts((prev) => prev.filter((p) => p.id !== id));
    if (expandedPost === id) setExpandedPost(null);
  }

  async function handleExpandReplies(postId: string) {
    if (expandedPost === postId) { setExpandedPost(null); return; }
    setExpandedPost(postId);
    if (!repliesCache[postId]) {
      const r = await getRepliesForPost(postId).catch(() => []);
      setRepliesCache((c) => ({ ...c, [postId]: r }));
    }
  }

  async function handleAddReply(postId: string) {
    const body = replyBody[postId]?.trim();
    if (!body) return;
    const result = await addReply(postId, body).catch(() => null);
    if (result && "ok" in result) {
      setRepliesCache((c) => ({ ...c, [postId]: [...(c[postId] ?? []), result.ok] }));
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, replyCount: p.replyCount + BigInt(1) } : p));
      setReplyBody((r) => ({ ...r, [postId]: "" }));
    }
  }

  async function handlePin(id: string) {
    const result = await pinPost(id).catch(() => null);
    if (result && "ok" in result) {
      setPosts((prev) => prev.map((p) => p.id === id ? result.ok : p));
    }
  }

  async function handleLock(id: string) {
    const result = await lockPost(id).catch(() => null);
    if (result && "ok" in result) {
      setPosts((prev) => prev.map((p) => p.id === id ? result.ok : p));
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "0.5rem 0.75rem",
    border: `1px solid ${styles.rule}`, fontFamily: styles.sans,
    fontSize: "0.875rem", outline: "none", boxSizing: "border-box",
  };

  const label: React.CSSProperties = {
    display: "block", fontFamily: styles.mono, fontSize: "0.6rem",
    letterSpacing: "0.1em", textTransform: "uppercase",
    color: styles.inkLight, marginBottom: "0.3rem",
  };

  function PostCard({ post }: { post: Post }) {
    const isExpanded = expandedPost === post.id;
    const replies = repliesCache[post.id] ?? [];
    const catLabel = categoryLabel(post.category);

    return (
      <div style={{ border: `1px solid ${post.isPinned ? styles.amber : styles.rule}`, background: "#fff", marginBottom: "0.75rem" }}>
        <div style={{ padding: "1.25rem 1.5rem" }}>
          {/* Post header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              {post.isPinned && (
                <span style={{ fontFamily: styles.mono, fontSize: "0.55rem", letterSpacing: "0.1em", color: styles.amber, textTransform: "uppercase", border: `1px solid ${styles.amber}`, padding: "0.1rem 0.4rem" }}>PINNED</span>
              )}
              {post.isLocked && (
                <span style={{ fontFamily: styles.mono, fontSize: "0.55rem", letterSpacing: "0.1em", color: styles.inkLight, textTransform: "uppercase", border: `1px solid ${styles.rule}`, padding: "0.1rem 0.4rem" }}>LOCKED</span>
              )}
              <span style={{ fontFamily: styles.mono, fontSize: "0.55rem", letterSpacing: "0.08em", color: styles.navy, textTransform: "uppercase", border: `1px solid ${styles.navy}`, padding: "0.1rem 0.4rem" }}>{catLabel}</span>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
              {!post.isPinned && (
                <button onClick={() => handlePin(post.id)} style={{ background: "none", border: "none", color: styles.inkLight, fontFamily: styles.mono, fontSize: "0.55rem", cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase" }}>PIN</button>
              )}
              {!post.isLocked && (
                <button onClick={() => handleLock(post.id)} style={{ background: "none", border: "none", color: styles.inkLight, fontFamily: styles.mono, fontSize: "0.55rem", cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase" }}>LOCK</button>
              )}
              <button onClick={() => handleDelete(post.id)} style={{ background: "none", border: "none", color: styles.rust, fontFamily: styles.mono, fontSize: "0.55rem", cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase" }}>DELETE</button>
            </div>
          </div>

          {/* Title + body */}
          <div style={{ fontFamily: styles.sans, fontWeight: 600, fontSize: "1rem", marginBottom: "0.4rem" }}>{post.title}</div>
          <div style={{ fontFamily: styles.sans, fontSize: "0.875rem", color: styles.inkLight, marginBottom: "0.75rem" }}>{post.body}</div>

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: styles.mono, fontSize: "0.58rem", color: styles.inkLight, letterSpacing: "0.06em" }}>
              {new Date(Number(post.postedAt) / 1_000_000).toLocaleDateString()}
            </span>
            <button
              onClick={() => handleExpandReplies(post.id)}
              style={{ background: "none", border: "none", color: styles.navy, fontFamily: styles.mono, fontSize: "0.6rem", cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase" }}
            >
              {isExpanded ? "Hide" : `${Number(post.replyCount)} Repl${Number(post.replyCount) === 1 ? "y" : "ies"}`}
            </button>
          </div>
        </div>

        {/* Replies drawer */}
        {isExpanded && (
          <div style={{ borderTop: `1px solid ${styles.rule}`, padding: "1rem 1.5rem", background: "#faf9f7" }}>
            {replies.length === 0 && (
              <p style={{ fontFamily: styles.sans, fontSize: "0.85rem", color: styles.inkLight, margin: "0 0 0.75rem" }}>No replies yet.</p>
            )}
            {replies.map((r) => (
              <div key={r.id} style={{ borderLeft: `2px solid ${styles.rule}`, paddingLeft: "0.75rem", marginBottom: "0.75rem" }}>
                <div style={{ fontFamily: styles.sans, fontSize: "0.875rem" }}>{r.body}</div>
                <div style={{ fontFamily: styles.mono, fontSize: "0.55rem", color: styles.inkLight, letterSpacing: "0.06em", marginTop: "0.25rem" }}>
                  {new Date(Number(r.postedAt) / 1_000_000).toLocaleDateString()}
                </div>
              </div>
            ))}

            {!post.isLocked && (
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  placeholder="Write a reply…"
                  value={replyBody[post.id] ?? ""}
                  onChange={(e) => setReplyBody((r) => ({ ...r, [post.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleAddReply(post.id)}
                />
                <button
                  onClick={() => handleAddReply(post.id)}
                  style={{ padding: "0.5rem 1rem", background: styles.navy, color: "#fff", border: "none", fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", flexShrink: 0 }}
                >
                  Reply
                </button>
              </div>
            )}
            {post.isLocked && (
              <p style={{ fontFamily: styles.mono, fontSize: "0.6rem", color: styles.inkLight, letterSpacing: "0.06em", textTransform: "uppercase" }}>THREAD LOCKED</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontFamily: styles.serif, fontWeight: 900, fontSize: "2rem", marginBottom: "0.25rem" }}>Discussions</h1>
          <p style={{ color: styles.inkLight, fontFamily: styles.sans, fontSize: "0.9rem" }}>Community discussion board</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          style={{ padding: "0.5rem 1rem", background: styles.navy, color: "#fff", border: "none", fontFamily: styles.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}
        >
          {showCreate ? "Cancel" : "New Post"}
        </button>
      </div>

      {/* Create post form */}
      {showCreate && (
        <form onSubmit={handleCreate} style={{ border: `1px solid ${styles.rule}`, padding: "1.5rem", background: "#fff", marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div><label style={label}>Title</label><input style={inputStyle} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required /></div>
          <div><label style={label}>Body</label><textarea style={{ ...inputStyle, minHeight: 100, resize: "vertical" }} value={newBody} onChange={(e) => setNewBody(e.target.value)} required /></div>
          <div>
            <label style={label}>Category</label>
            <select
              style={{ ...inputStyle, background: "#fff" }}
              value={categoryKey(newCategory)}
              onChange={(e) => {
                const found = CATEGORIES.find((c) => c.key === e.target.value);
                if (found) setNewCategory(found.variant);
              }}
            >
              {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          {createError && <p style={{ fontFamily: styles.sans, fontSize: "0.8rem", color: styles.rust, margin: 0 }}>{createError}</p>}
          <button type="submit" disabled={creating} style={{ padding: "0.75rem", background: styles.navy, color: "#fff", border: "none", fontFamily: styles.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>
            {creating ? "Posting…" : "Post"}
          </button>
        </form>
      )}

      {/* Category filter */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <button
          onClick={() => setFilterCat("all")}
          style={{ background: filterCat === "all" ? styles.navy : "none", color: filterCat === "all" ? "#fff" : styles.inkLight, border: `1px solid ${filterCat === "all" ? styles.navy : styles.rule}`, padding: "0.3rem 0.75rem", fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}
        >
          All
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilterCat(c.key)}
            style={{ background: filterCat === c.key ? styles.navy : "none", color: filterCat === c.key ? "#fff" : styles.inkLight, border: `1px solid ${filterCat === c.key ? styles.navy : styles.rule}`, padding: "0.3rem 0.75rem", fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading && <p style={{ fontFamily: styles.sans, color: styles.inkLight }}>Loading discussions…</p>}

      {!loading && (
        <>
          {/* Pinned posts */}
          {pinnedPosts.length > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <div style={{ fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.1em", color: styles.amber, textTransform: "uppercase", marginBottom: "0.75rem" }}>PINNED</div>
              {pinnedPosts.map((p) => <PostCard key={p.id} post={p} />)}
            </div>
          )}

          {/* Feed */}
          {filteredUnpinned.length === 0 && (
            <div style={{ padding: "3rem", border: `1px dashed ${styles.rule}`, textAlign: "center", color: styles.inkLight, fontFamily: styles.mono, fontSize: "0.75rem", letterSpacing: "0.08em" }}>
              NO POSTS
            </div>
          )}
          {filteredUnpinned.map((p) => <PostCard key={p.id} post={p} />)}
        </>
      )}
    </div>
  );
}
