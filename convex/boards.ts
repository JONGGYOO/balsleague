import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getEffectiveRole, getOrCreateUser } from "./utils";

async function assertManager(ctx: Parameters<typeof getEffectiveRole>[0]) {
  const role = await getEffectiveRole(ctx);
  if (role !== "superAdmin" && role !== "admin") throw new Error("권한이 없습니다.");
}

// 내전관리자는 게시판 글쓰기 권한 판단 시 일반사용자로 취급한다.
function writeTier(effectiveRole: "superAdmin" | "admin" | "innerwarAdmin" | "user"): "superAdmin" | "admin" | "user" {
  return effectiveRole === "innerwarAdmin" ? "user" : effectiveRole;
}

function canWrite(
  effectiveRole: "superAdmin" | "admin" | "innerwarAdmin" | "user",
  writePermission: "superAdmin" | "admin" | "user"
): boolean {
  const tier = writeTier(effectiveRole);
  if (writePermission === "user") return true;
  if (writePermission === "admin") return tier === "admin" || tier === "superAdmin";
  return tier === "superAdmin";
}

export const listBoards = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const role = await getEffectiveRole(ctx);

    const all = await ctx.db.query("boards").take(200);
    const boards = all.filter((b) => !b.deletedAt);

    const allPosts = await ctx.db.query("boardPosts").take(5000);
    const postCountMap = new Map<string, number>();
    for (const p of allPosts) {
      if (p.deletedAt) continue;
      postCountMap.set(p.boardId, (postCountMap.get(p.boardId) ?? 0) + 1);
    }

    return {
      effectiveRole: role,
      boards: boards.map((b) => ({
        ...b,
        postCount: postCountMap.get(b._id) ?? 0,
        canWrite: canWrite(role, b.writePermission),
      })),
    };
  },
});

export const getBoardDetail = query({
  args: { boardId: v.id("boards") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const board = await ctx.db.get(args.boardId);
    if (!board || board.deletedAt) return null;

    const role = await getEffectiveRole(ctx);
    const isManager = role === "superAdmin" || role === "admin";

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    const allPosts = await ctx.db
      .query("boardPosts")
      .withIndex("by_board", (q) => q.eq("boardId", args.boardId))
      .take(500);
    const posts = allPosts.filter((p) => !p.deletedAt);

    const postsWithAuthor = await Promise.all(
      posts.map(async (p) => {
        const author = await ctx.db.get(p.authorId);
        return { ...p, author };
      })
    );
    postsWithAuthor.sort((a, b) => b._creationTime - a._creationTime);

    return {
      board,
      posts: postsWithAuthor,
      effectiveRole: role,
      isManager,
      canWrite: canWrite(role, board.writePermission),
      currentUserId: currentUser?._id ?? null,
    };
  },
});

export const getPost = query({
  args: { postId: v.id("boardPosts") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const post = await ctx.db.get(args.postId);
    if (!post || post.deletedAt) return null;

    const board = await ctx.db.get(post.boardId);
    if (!board || board.deletedAt) return null;

    const author = await ctx.db.get(post.authorId);

    const role = await getEffectiveRole(ctx);
    const isManager = role === "superAdmin" || role === "admin";

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    const isAuthor = !!currentUser && currentUser._id === post.authorId;

    return {
      post,
      board,
      author,
      canEdit: isManager || isAuthor,
    };
  },
});

export const createBoard = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    writePermission: v.union(v.literal("superAdmin"), v.literal("admin"), v.literal("user")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");
    await assertManager(ctx);

    const name = args.name.trim();
    if (!name) throw new Error("게시판 이름을 입력해주세요.");

    return await ctx.db.insert("boards", {
      name,
      description: args.description?.trim() || undefined,
      writePermission: args.writePermission,
      createdBy: identity.tokenIdentifier,
    });
  },
});

export const updateBoard = mutation({
  args: {
    id: v.id("boards"),
    name: v.string(),
    description: v.optional(v.string()),
    writePermission: v.union(v.literal("superAdmin"), v.literal("admin"), v.literal("user")),
  },
  handler: async (ctx, args) => {
    await assertManager(ctx);

    const name = args.name.trim();
    if (!name) throw new Error("게시판 이름을 입력해주세요.");

    await ctx.db.patch(args.id, {
      name,
      description: args.description?.trim() || undefined,
      writePermission: args.writePermission,
    });
  },
});

export const removeBoard = mutation({
  args: { id: v.id("boards") },
  handler: async (ctx, args) => {
    await assertManager(ctx);
    await ctx.db.patch(args.id, { deletedAt: Date.now() });
  },
});

export const createPost = mutation({
  args: {
    boardId: v.id("boards"),
    title: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);

    const board = await ctx.db.get(args.boardId);
    if (!board || board.deletedAt) throw new Error("게시판을 찾을 수 없습니다.");

    const role = await getEffectiveRole(ctx);
    if (!canWrite(role, board.writePermission)) {
      throw new Error("이 게시판에 글을 작성할 권한이 없습니다.");
    }

    const title = args.title.trim();
    const content = args.content.trim();
    if (!title) throw new Error("제목을 입력해주세요.");
    if (!content) throw new Error("내용을 입력해주세요.");

    return await ctx.db.insert("boardPosts", {
      boardId: args.boardId,
      authorId: user._id,
      title,
      content,
    });
  },
});

export const updatePost = mutation({
  args: {
    id: v.id("boardPosts"),
    title: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");

    const post = await ctx.db.get(args.id);
    if (!post || post.deletedAt) throw new Error("게시글을 찾을 수 없습니다.");

    const role = await getEffectiveRole(ctx);
    const isManager = role === "superAdmin" || role === "admin";
    if (!isManager) {
      const me = await ctx.db
        .query("users")
        .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
        .unique();
      if (!me || me._id !== post.authorId) {
        throw new Error("작성자 또는 관리자만 수정할 수 있습니다.");
      }
    }

    const title = args.title.trim();
    const content = args.content.trim();
    if (!title) throw new Error("제목을 입력해주세요.");
    if (!content) throw new Error("내용을 입력해주세요.");

    await ctx.db.patch(args.id, { title, content });
  },
});

export const removePost = mutation({
  args: { id: v.id("boardPosts") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");

    const post = await ctx.db.get(args.id);
    if (!post || post.deletedAt) throw new Error("게시글을 찾을 수 없습니다.");

    const role = await getEffectiveRole(ctx);
    const isManager = role === "superAdmin" || role === "admin";
    if (!isManager) {
      const me = await ctx.db
        .query("users")
        .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
        .unique();
      if (!me || me._id !== post.authorId) {
        throw new Error("작성자 또는 관리자만 삭제할 수 있습니다.");
      }
    }

    await ctx.db.patch(args.id, { deletedAt: Date.now() });
  },
});
