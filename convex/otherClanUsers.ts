import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getEffectiveRole } from "./utils";

export const list = query({
  args: { organizationName: v.string() },
  handler: async (ctx, args) => {
    const role = await getEffectiveRole(ctx);
    if (role !== "superAdmin" && role !== "admin") return [];
    return await ctx.db
      .query("otherClanUsers")
      .withIndex("by_organization", (q) => q.eq("organizationName", args.organizationName))
      .take(200);
  },
});

export const create = mutation({
  args: {
    organizationName: v.string(),
    nickname: v.string(),
    name: v.optional(v.string()),
    previousNickname: v.optional(v.string()),
    skillTier: v.optional(
      v.union(v.literal("god"), v.literal("high"), v.literal("mid"), v.literal("low"))
    ),
    memo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");
    const role = await getEffectiveRole(ctx);
    if (role !== "superAdmin" && role !== "admin") throw new Error("권한이 없습니다.");

    const organizationName = args.organizationName.trim();
    if (!organizationName) throw new Error("클랜을 선택해주세요.");
    const nickname = args.nickname.trim();
    if (!nickname) throw new Error("닉네임을 입력해주세요.");

    return await ctx.db.insert("otherClanUsers", {
      organizationName,
      nickname,
      name: args.name?.trim() || undefined,
      previousNickname: args.previousNickname?.trim() || undefined,
      skillTier: args.skillTier,
      memo: args.memo?.trim() || undefined,
      createdBy: identity.tokenIdentifier,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("otherClanUsers") },
  handler: async (ctx, args) => {
    const role = await getEffectiveRole(ctx);
    if (role !== "superAdmin" && role !== "admin") throw new Error("권한이 없습니다.");
    await ctx.db.delete(args.id);
  },
});
