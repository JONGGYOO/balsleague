import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    nickname: v.optional(v.string()),
    organization: v.optional(v.string()),
    role: v.optional(v.literal("admin")), // superAdmin은 이메일로 판단
    profileSaved: v.optional(v.boolean()),
    birthYear: v.optional(v.number()),
    birthMonth: v.optional(v.number()),
    birthDay: v.optional(v.number()),
    phone: v.optional(v.string()),
  }).index("by_token", ["tokenIdentifier"]),

  organizations: defineTable({
    name: v.string(),
  }).index("by_name", ["name"]),

  leagues: defineTable({
    year: v.number(),
    month: v.number(),
    name: v.string(),
    createdBy: v.string(),
    deletedAt: v.optional(v.number()), // 소프트 삭제용 타임스탬프
  }).index("by_year_month", ["year", "month"]),

  leagueParticipants: defineTable({
    leagueId: v.id("leagues"),
    userId: v.id("users"),
    status: v.optional(v.union(v.literal("pending"), v.literal("approved"))),
  })
    .index("by_league", ["leagueId"])
    .index("by_league_and_user", ["leagueId", "userId"])
    .index("by_user", ["userId"]),

  scores: defineTable({
    leagueId: v.id("leagues"),
    homeUserId: v.id("users"),
    homeScore: v.number(),
    awayUserId: v.id("users"),
    awayScore: v.number(),
  }).index("by_league", ["leagueId"]),
});
