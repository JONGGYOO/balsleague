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

  innerwars: defineTable({
    year: v.number(),
    month: v.number(),
    day: v.number(),
    name: v.string(),
    createdBy: v.string(),
    deletedAt: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("teamAssigned"),
        v.literal("inProgress"),
        v.literal("done"),
      )
    ),
    winnerTeam: v.optional(v.union(v.literal("A"), v.literal("B"))),
    currentIndexA: v.optional(v.number()),
    currentIndexB: v.optional(v.number()),
    // 팀 배정/초기화 권한: "admin"=관리자만, "all"=모든 사용자
    teamAssignPermission: v.optional(v.union(v.literal("admin"), v.literal("all"))),
    betItem: v.optional(v.string()),
  }).index("by_year_month", ["year", "month"]),

  innerwarParticipants: defineTable({
    innerwarId: v.id("innerwars"),
    userId: v.id("users"),
    status: v.optional(v.union(v.literal("pending"), v.literal("approved"))),
    team: v.optional(v.union(v.literal("A"), v.literal("B"))),
    teamOrder: v.optional(v.number()),
    // 성적기반 배정 시점의 점수 스냅샷 (리그:내전 = 7:3 가중치, Grade.md 참고)
    // 랜덤/수동 배정 시에는 초기화되어 undefined가 됨
    assignScore: v.optional(v.number()),
    assignLeagueRate: v.optional(v.number()),
    assignInnerwarRate: v.optional(v.number()),
    assignRank: v.optional(v.number()),
    // 리그/내전 경기 기록이 전혀 없는 참가자인지 여부 — true면 배정 순위를 최하위로 고정
    assignHasHistory: v.optional(v.boolean()),
  })
    .index("by_innerwar", ["innerwarId"])
    .index("by_innerwar_and_user", ["innerwarId", "userId"])
    .index("by_user", ["userId"]),

  innerwarMatches: defineTable({
    innerwarId: v.id("innerwars"),
    playerAId: v.id("users"),
    playerBId: v.id("users"),
    scoreA: v.optional(v.number()),
    scoreB: v.optional(v.number()),
    winnerId: v.optional(v.id("users")),
    status: v.optional(v.union(v.literal("pending"), v.literal("scored"), v.literal("done"))),
    matchIndex: v.number(),
  })
    .index("by_innerwar", ["innerwarId"])
    .index("by_innerwar_and_index", ["innerwarId", "matchIndex"]),
});
