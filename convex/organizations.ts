import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getEffectiveRole } from "./utils";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db.query("organizations").take(100);
  },
});

export const add = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const role = await getEffectiveRole(ctx);
    if (role !== "superAdmin" && role !== "admin") throw new Error("권한이 없습니다.");
    const name = args.name.trim();
    if (!name) throw new Error("클랜명을 입력해주세요.");
    return await ctx.db.insert("organizations", { name });
  },
});

export const remove = mutation({
  args: { id: v.id("organizations") },
  handler: async (ctx, args) => {
    const role = await getEffectiveRole(ctx);
    if (role !== "superAdmin" && role !== "admin") throw new Error("권한이 없습니다.");
    await ctx.db.delete(args.id);
  },
});
