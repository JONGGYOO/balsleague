import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { SUPER_ADMIN_EMAIL, getEffectiveRole } from "./utils";

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (!user) return null;

    const email = identity.email ?? user.email ?? "";
    const effectiveRole: "superAdmin" | "admin" | "user" =
      email === SUPER_ADMIN_EMAIL
        ? "superAdmin"
        : user.role === "admin"
          ? "admin"
          : "user";

    return { ...user, effectiveRole, email };
  },
});

export const upsertUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (existing) {
      if (identity.email && existing.email !== identity.email) {
        await ctx.db.patch(existing._id, { email: identity.email });
      }
      return existing._id;
    }

    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name: identity.name ?? undefined,
      email: identity.email ?? undefined,
    });
  },
});

export const updateProfile = mutation({
  args: {
    name: v.string(),
    nickname: v.string(),
    organization: v.string(),
    birthYear: v.optional(v.number()),
    birthMonth: v.optional(v.number()),
    birthDay: v.optional(v.number()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (!user) throw new Error("사용자를 찾을 수 없습니다.");

    await ctx.db.patch(user._id, {
      name: args.name,
      nickname: args.nickname,
      organization: args.organization,
      birthYear: args.birthYear,
      birthMonth: args.birthMonth,
      birthDay: args.birthDay,
      phone: args.phone,
      profileSaved: true,
    });
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const role = await getEffectiveRole(ctx);
    if (role !== "superAdmin") return [];
    return await ctx.db.query("users").take(200);
  },
});

export const setRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.optional(v.literal("admin")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");

    const caller = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    const email = identity.email ?? caller?.email ?? "";
    if (email !== SUPER_ADMIN_EMAIL) {
      throw new Error("슈퍼관리자만 역할을 설정할 수 있습니다.");
    }

    await ctx.db.patch(args.userId, { role: args.role });
  },
});

// 클라이언트(Clerk useUser)에서 받은 이메일을 DB에 동기화
// JWT에 email 클레임이 없는 Clerk 설정을 보완
export const syncEmail = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !args.email) return;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (existing) {
      if (existing.email !== args.email) {
        await ctx.db.patch(existing._id, { email: args.email });
      }
    } else {
      await ctx.db.insert("users", {
        tokenIdentifier: identity.tokenIdentifier,
        name: identity.name ?? undefined,
        email: args.email,
      });
    }
  },
});
